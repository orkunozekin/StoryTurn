-- How long a schedule lasts.
--
-- schedules.end_date is the last night the schedule plans (inclusive), or null
-- for a schedule that keeps going. Saving a shorter schedule cancels the
-- future nights after the new end date (cancellation_source = 'schedule'), and
-- saving a longer one brings those nights back, the same way a later start date
-- works. Generation never creates a night after the end date.

alter table public.schedules
  add column end_date date,
  add constraint schedules_end_after_start check (end_date is null or end_date >= start_date);

-- manage_schedule takes the end date (null = no end).
drop function public.manage_schedule(uuid[],date,time,text,text,boolean,integer,boolean,jsonb);
create or replace function public.manage_schedule(rotation_ids uuid[] default null, starts_on date default null, bedtime time default null, zone text default null, timing text default 'after', deleting boolean default false, book_count integer default 1, random_books boolean default false, weekday_plan jsonb default null, ends_on date default null)
returns table(session_id uuid, cancelled boolean, removed_member_ids uuid[], previous_scheduled_for timestamptz)
language plpgsql security definer set search_path = public as $$
declare fid uuid; sch public.schedules%rowtype; night public.reading_sessions%rowtype; day date; reader_id uuid; today date; previous_readers uuid[]; plan jsonb;
begin
  select family_id into fid from public.family_members where user_id = auth.uid() limit 1;
  if fid is null or not public.is_family_owner(fid) then raise exception 'Only family owners can manage schedules'; end if;
  -- Serialize edits without blocking generation foreign-key KEY SHARE locks.
  perform 1 from public.families where id = fid for no key update;
  select * into sch from public.schedules where family_id = fid order by active desc, created_at desc limit 1;
  today := (now() at time zone coalesce(sch.timezone, 'UTC'))::date;
  if deleting then
    update public.schedules set active = false where family_id = fid and active;
    for night in select s.* from public.reading_sessions s join public.schedules sc on sc.id = s.schedule_id where sc.family_id = fid and s.status = 'scheduled' and (s.scheduled_for at time zone 'UTC')::date >= today loop
      update public.reading_sessions set status = 'cancelled', cancellation_source = 'schedule', updated_at = now() where id = night.id;
      select coalesce(array_agg(a.member_id), '{}') into removed_member_ids from public.session_assignments a where a.session_id = night.id and a.is_current;
      previous_scheduled_for := night.scheduled_for;
      session_id := night.id; cancelled := true; return next;
    end loop;
    return;
  end if;
  rotation_ids := coalesce(rotation_ids, '{}');
  plan := coalesce(weekday_plan, '["rotate","rotate","rotate","rotate","rotate","rotate","rotate"]'::jsonb);
  if not public.is_weekday_plan(plan) then raise exception 'Choose a reader or Rotate for each of the seven nights'; end if;
  if exists(select 1 from jsonb_array_elements_text(plan) e where e <> 'rotate' and not exists(select 1 from public.family_members m where m.id::text = lower(e) and m.family_id = fid)) then raise exception 'Pick valid family readers'; end if;
  if exists(select 1 from unnest(rotation_ids) r where r is null or not exists(select 1 from public.family_members m where m.id = r and m.family_id = fid)) then raise exception 'Pick valid family readers'; end if;
  if cardinality(rotation_ids) = 0 and plan ? 'rotate' then raise exception 'Add someone to the rotation or pick a reader for every night'; end if;
  if starts_on is null or bedtime is null or zone is null or not exists(select 1 from pg_timezone_names where name = zone) or timing not in ('ahead','after') or timing is null then raise exception 'Invalid schedule settings'; end if;
  if ends_on is not null and ends_on < starts_on then raise exception 'The schedule must end on or after its start date'; end if;
  if book_count is null or book_count < 1 or random_books is null then raise exception 'Invalid book settings'; end if;
  today := (now() at time zone zone)::date;
  if sch.id is null then
    insert into public.schedules(family_id,reader_rotation_member_ids,weekday_readers,start_date,end_date,time_local,timezone,book_timing,books_per_session,assign_random_books) values(fid,rotation_ids,plan,starts_on,ends_on,bedtime,zone,timing,book_count,random_books);
    return;
  end if;
  update public.schedules set active = true, reader_rotation_member_ids = rotation_ids, weekday_readers = plan, start_date = starts_on, end_date = ends_on, time_local = bedtime, timezone = zone, book_timing = timing, books_per_session = book_count, assign_random_books = random_books where id = sch.id;
  for night in select * from public.reading_sessions s where s.schedule_id = sch.id and (s.status = 'scheduled' or (s.status = 'cancelled' and s.cancellation_source = 'schedule')) and (s.scheduled_for at time zone 'UTC')::date >= today loop
    day := (night.scheduled_for at time zone 'UTC')::date;
    previous_scheduled_for := night.scheduled_for;
    select coalesce(array_agg(a.member_id), '{}') into previous_readers from public.session_assignments a where a.session_id = night.id and a.is_current;
    removed_member_ids := '{}';
    -- Nights after the end date are cancelled like nights before the start date.
    reader_id := case when ends_on is not null and day > ends_on then null
      else public.schedule_reader_for_date(fid, rotation_ids, plan, starts_on, day) end;
    -- Before the start date, after the end date, or (only if the checks above change) a night nobody can take.
    if reader_id is null then
      if night.status = 'cancelled' then continue; end if;
      removed_member_ids := previous_readers;
      update public.reading_sessions set status = 'cancelled', cancellation_source = 'schedule', updated_at = now() where id = night.id;
      cancelled := true;
    else
      if night.status = 'scheduled' then
        select coalesce(array_agg(r), '{}') into removed_member_ids from unnest(previous_readers) r where r <> reader_id;
      end if;
      update public.reading_sessions set status = 'scheduled', cancellation_source = null, scheduled_for = (day + bedtime) at time zone 'UTC', updated_at = now() where id = night.id;
      update public.session_assignments set is_current = false where session_assignments.session_id = night.id;
      if exists(select 1 from public.session_assignments a where a.session_id = night.id and a.member_id = reader_id) then
        update public.session_assignments set is_current = true where session_assignments.session_id = night.id and member_id = reader_id;
      else
        insert into public.session_assignments(session_id,member_id,is_original,is_current) values(night.id,reader_id,false,true);
      end if;
      cancelled := false;
    end if;
    session_id := night.id; return next;
  end loop;
end;
$$;
revoke all on function public.manage_schedule(uuid[],date,time,text,text,boolean,integer,boolean,jsonb,date) from public, anon;
grant execute on function public.manage_schedule(uuid[],date,time,text,text,boolean,integer,boolean,jsonb,date) to authenticated;

-- Generation stops after the end date.
create or replace function public.generate_schedule_night(target_schedule_id uuid, night_date date)
returns uuid
language plpgsql security invoker set search_path = public as $$
declare
  sch public.schedules%rowtype;
  new_session_id uuid;
  reader_id uuid;
begin
  select * into sch from public.schedules where id = target_schedule_id for update;
  if not found or not sch.active then return null; end if;
  if night_date is null or night_date < sch.start_date then
    raise exception 'Invalid schedule night';
  end if;
  if sch.end_date is not null and night_date > sch.end_date then return null; end if;
  -- Existing nights, including individual cancellations, keep their selections.
  if exists(select 1 from public.reading_sessions where schedule_id = sch.id and (scheduled_for at time zone 'UTC')::date = night_date) then
    return null;
  end if;
  reader_id := public.schedule_reader_for_date(sch.family_id, sch.reader_rotation_member_ids, sch.weekday_readers, sch.start_date, night_date);
  if reader_id is null then return null; end if;
  insert into public.reading_sessions(family_id, schedule_id, scheduled_for, status, ics_uid)
  values(sch.family_id, sch.id, (night_date + sch.time_local) at time zone 'UTC', 'scheduled',
    'storyturn-' || sch.family_id || '-' || night_date || '@bedtime-readers.app')
  on conflict (ics_uid) do nothing returning id into new_session_id;
  if new_session_id is null then return null; end if;
  insert into public.session_assignments(session_id, member_id, is_original, is_current)
  values(new_session_id, reader_id, true, true);
  if sch.assign_random_books then
    -- Lock selected books until commit so concurrent deletion cannot invalidate picks.
    with picks as materialized (
      select id from public.books where family_id = sch.family_id
      order by random() limit sch.books_per_session for key share
    )
    insert into public.session_books(session_id, book_id)
    select new_session_id, id from picks;
  end if;
  return new_session_id;
end;
$$;
