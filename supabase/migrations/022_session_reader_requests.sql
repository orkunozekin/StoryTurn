-- Family members can ask to read a specific upcoming night; parents decide.
create table public.session_reader_requests (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.reading_sessions(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  member_id uuid not null references public.family_members(id) on delete cascade,
  note text check (note is null or char_length(note) between 1 and 200),
  status text not null default 'pending'
    check (status in ('pending','approved','declined','withdrawn','expired')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by_member_id uuid references public.family_members(id) on delete set null
);

create index session_reader_requests_family_idx
  on public.session_reader_requests(family_id, status);
create index session_reader_requests_session_idx
  on public.session_reader_requests(session_id);
-- One open request per member per night.
create unique index session_reader_requests_one_pending
  on public.session_reader_requests(session_id, member_id) where status = 'pending';

alter table public.session_reader_requests enable row level security;

-- Is this night still open for requests? Same family-local "today" as the
-- schedule tools: the session's wall-clock date against now in the family zone.
create or replace function public.reader_request_night_open(target public.reading_sessions)
returns boolean
language sql stable security definer set search_path = public as $$
  select target.status = 'scheduled'
    and (target.scheduled_for at time zone 'UTC')::date >= (now() at time zone coalesce(
      (select timezone from public.schedules where family_id = target.family_id and active order by created_at desc limit 1),
      'America/Los_Angeles'))::date;
$$;
revoke all on function public.reader_request_night_open(public.reading_sessions) from public, anon;
grant execute on function public.reader_request_night_open(public.reading_sessions) to authenticated;

create policy "members read reader requests" on public.session_reader_requests
  for select using (public.is_family_member(family_id));

-- Members create their own pending request for an open night they are not reading.
create policy "members request nights" on public.session_reader_requests
  for insert with check (
    status = 'pending' and decided_at is null and decided_by_member_id is null
    and exists (
      select 1 from public.family_members m
      where m.id = member_id and m.family_id = session_reader_requests.family_id
        and m.user_id = auth.uid()
    )
    and exists (
      select 1 from public.reading_sessions s
      where s.id = session_id and s.family_id = session_reader_requests.family_id
        and public.reader_request_night_open(s)
    )
    and not exists (
      select 1 from public.session_assignments a
      where a.session_id = session_reader_requests.session_id
        and a.member_id = session_reader_requests.member_id and a.is_current
    )
  );

-- Requesters may only withdraw their own open request. Approving or declining
-- goes through decide_session_reader_request, which checks the owner role.
create policy "members withdraw own requests" on public.session_reader_requests
  for update using (
    status = 'pending' and exists (
      select 1 from public.family_members m
      where m.id = member_id and m.user_id = auth.uid()
    )
  )
  with check (
    status = 'withdrawn' and decided_by_member_id is null and exists (
      select 1 from public.family_members m
      where m.id = member_id and m.user_id = auth.uid()
    )
  );

-- Closed requests are final, and identifying columns never change.
create or replace function public.guard_session_reader_request()
returns trigger
language plpgsql set search_path = public as $$
begin
  if new.session_id <> old.session_id or new.family_id <> old.family_id
     or new.member_id <> old.member_id or new.created_at <> old.created_at
     or new.note is distinct from old.note then
    raise exception 'Reader requests cannot be edited';
  end if;
  if old.status <> 'pending' and new.status is distinct from old.status then
    raise exception 'This request was already closed';
  end if;
  return new;
end;
$$;
create trigger guard_session_reader_request
before update on public.session_reader_requests
for each row execute function public.guard_session_reader_request();

-- Canceling or completing a night closes its open requests.
create or replace function public.expire_reader_requests_for_night()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status <> 'scheduled' and old.status = 'scheduled' then
    update public.session_reader_requests
      set status = 'expired', decided_at = now()
      where session_id = new.id and status = 'pending';
  end if;
  return new;
end;
$$;
create trigger expire_reader_requests_for_night
after update of status on public.reading_sessions
for each row execute function public.expire_reader_requests_for_night();

-- Past nights are swept whenever a family touches its requests.
create or replace function public.expire_stale_reader_requests(fid uuid)
returns void
language sql security definer set search_path = public as $$
  update public.session_reader_requests r
    set status = 'expired', decided_at = now()
    from public.reading_sessions s
    where r.family_id = fid and r.status = 'pending' and s.id = r.session_id
      and not public.reader_request_night_open(s);
$$;
revoke all on function public.expire_stale_reader_requests(uuid) from public, anon;

create or replace function public.request_session_reader(target_session_id uuid, request_note text default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare me public.family_members%rowtype; night public.reading_sessions%rowtype; clean_note text; new_id uuid;
begin
  select * into me from public.family_members where user_id = auth.uid() limit 1;
  if me.id is null then raise exception 'Join a family first'; end if;
  select * into night from public.reading_sessions where id = target_session_id and family_id = me.family_id for update;
  if night.id is null then raise exception 'Night not found'; end if;
  perform public.expire_stale_reader_requests(me.family_id);
  if night.status = 'cancelled' then raise exception 'This night was canceled'; end if;
  if night.status = 'completed' then raise exception 'This night is already done'; end if;
  if not public.reader_request_night_open(night) then raise exception 'This night has passed'; end if;
  if exists(select 1 from public.session_assignments where session_id = night.id and member_id = me.id and is_current) then
    raise exception 'You''re already reading this night';
  end if;
  if exists(select 1 from public.session_reader_requests where session_id = night.id and member_id = me.id and status = 'pending') then
    raise exception 'You already asked for this night';
  end if;
  clean_note := nullif(btrim(regexp_replace(coalesce(request_note, ''), '\s+', ' ', 'g')), '');
  if char_length(clean_note) > 200 then raise exception 'Keep the note under 200 characters'; end if;
  insert into public.session_reader_requests(session_id, family_id, member_id, note)
    values (night.id, me.family_id, me.id, clean_note) returning id into new_id;
  return new_id;
end;
$$;

create or replace function public.withdraw_session_reader_request(request_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare me public.family_members%rowtype; req public.session_reader_requests%rowtype;
begin
  select * into me from public.family_members where user_id = auth.uid() limit 1;
  if me.id is null then raise exception 'Join a family first'; end if;
  perform public.expire_stale_reader_requests(me.family_id);
  select * into req from public.session_reader_requests where id = request_id and family_id = me.family_id and member_id = me.id for update;
  if req.id is null then raise exception 'Request not found'; end if;
  if req.status <> 'pending' then raise exception 'This request was already closed'; end if;
  update public.session_reader_requests set status = 'withdrawn', decided_at = now() where id = req.id;
end;
$$;

-- Approve: the requester becomes the only reader, the change is kept in the
-- correction history, and other open requests for the night are declined.
-- Returns whether readers changed and which were replaced, so the app can
-- send the new invite and cancel the old ones.
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
  select display_name into requester_name from public.family_members where id = req.member_id;
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

revoke all on function public.request_session_reader(uuid, text) from public, anon;
revoke all on function public.withdraw_session_reader_request(uuid) from public, anon;
revoke all on function public.decide_session_reader_request(uuid, boolean) from public, anon;
grant execute on function public.request_session_reader(uuid, text) to authenticated;
grant execute on function public.withdraw_session_reader_request(uuid) to authenticated;
grant execute on function public.decide_session_reader_request(uuid, boolean) to authenticated;
grant select, insert, update on public.session_reader_requests to authenticated;
