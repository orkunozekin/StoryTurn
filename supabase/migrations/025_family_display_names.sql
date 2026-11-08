-- Show readers by first name; fall back to the full name only when another
-- member of the same family shares that first name. Used for the note written
-- when a parent approves a request to read.
create or replace function public.family_display_name(target_member_id uuid)
returns text
language sql stable set search_path = public as $$
  select case
    when exists (
      select 1 from public.family_members other
      where other.family_id = m.family_id and other.id <> m.id
        and lower((regexp_split_to_array(btrim(other.display_name), '\s+'))[1])
          = lower((regexp_split_to_array(btrim(m.display_name), '\s+'))[1])
    ) then btrim(m.display_name)
    else coalesce(nullif((regexp_split_to_array(btrim(m.display_name), '\s+'))[1], ''), m.display_name)
  end
  from public.family_members m where m.id = target_member_id;
$$;

-- Internal helper for decide_session_reader_request (which runs as definer).
revoke all on function public.family_display_name(uuid) from public, anon, authenticated;

create or replace function public.decide_session_reader_request(request_id uuid, approve boolean)
returns table(session_id uuid, changed boolean, removed_member_ids uuid[])
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare me public.family_members%rowtype; req public.session_reader_requests%rowtype; night public.reading_sessions%rowtype;
  previous uuid[]; titles text[]; requester_name text; snapshot jsonb;
begin
  select * into me from public.family_members where user_id = auth.uid() limit 1;
  if me.id is null or not public.is_family_owner(me.family_id) then
    raise exception 'Only parents can approve or decline requests';
  end if;
  select * into req from public.session_reader_requests r where r.id = request_id and r.family_id = me.family_id;
  if req.id is null then raise exception 'Request not found'; end if;
  -- Lock the night first so concurrent approvals for it serialize.
  select * into night from public.reading_sessions s where s.id = req.session_id for update;
  perform public.expire_stale_reader_requests(me.family_id);
  select * into req from public.session_reader_requests r where r.id = request_id for update;
  if req.status = 'expired' then raise exception 'This night can no longer be requested; the request has expired'; end if;
  if req.status <> 'pending' then raise exception 'This request was already closed'; end if;

  if not approve then
    update public.session_reader_requests r set status = 'declined', decided_at = now(), decided_by_member_id = me.id where r.id = req.id;
    session_id := night.id; changed := false; removed_member_ids := '{}'; return next; return;
  end if;

  select coalesce(array_agg(a.member_id order by a.member_id), '{}') into previous
    from public.session_assignments a where a.session_id = night.id and a.is_current;
  update public.session_reader_requests r set status = 'approved', decided_at = now(), decided_by_member_id = me.id where r.id = req.id;
  update public.session_reader_requests r set status = 'declined', decided_at = now(), decided_by_member_id = me.id
    where r.session_id = night.id and r.status = 'pending';

  if previous = array[req.member_id] then
    session_id := night.id; changed := false; removed_member_ids := '{}'; return next; return;
  end if;

  update public.session_assignments a set is_current = false where a.session_id = night.id and a.is_current;
  -- Reactivate one existing row (the original, else the newest) so a reader
  -- reassigned more than once never ends up with duplicate current rows.
  update public.session_assignments a set is_current = true
    where a.id = (
      select x.id from public.session_assignments x
      where x.session_id = night.id and x.member_id = req.member_id
      order by x.is_original desc, x.created_at desc, x.id desc limit 1
    );
  if not found then
    insert into public.session_assignments(session_id, member_id, is_original, is_current) values (night.id, req.member_id, false, true);
  end if;

  select coalesce(array_agg(coalesce(sb.title_freeform, b.title, 'Unknown') order by sb.created_at, sb.id), '{}') into titles
    from public.session_books sb left join public.books b on b.id = sb.book_id where sb.session_id = night.id;
  requester_name := public.family_display_name(req.member_id);
  snapshot := jsonb_build_object('status', night.status, 'bookTitles', to_jsonb(titles), 'notes', night.notes);
  insert into public.session_corrections(session_id, corrected_by_member_id, reason, before, after) values (
    night.id, me.id,
    case when req.note is null then format('Approved %s''s request to read', requester_name)
      else format('Approved %s''s request to read: “%s”', requester_name, req.note) end,
    snapshot || jsonb_build_object('currentMemberIds', to_jsonb(previous)),
    snapshot || jsonb_build_object('currentMemberIds', to_jsonb(array[req.member_id]))
  );
  -- Touching the night advances its calendar sequence for the new invites.
  update public.reading_sessions s set updated_at = now() where s.id = night.id;
  session_id := night.id;
  changed := true;
  removed_member_ids := array(select unnest(previous) except select req.member_id);
  return next;
end;
$$;
