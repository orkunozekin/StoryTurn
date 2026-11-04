-- 010_family_library_wishlist: restored from production migration history (version 010, already applied).
-- This file was missing from the repo; `supabase db push` refuses to run while remote history has a version with no local file.
-- Preserve reading history when consolidating existing work-level duplicates.
begin;
lock table public.books in share row exclusive mode;
create temporary table book_duplicates on commit drop as
select id, first_value(id) over (partition by family_id, open_library_key order by created_at, id) as retained_id
from public.books where open_library_key is not null;
update public.session_books sb set book_id = d.retained_id
from book_duplicates d where sb.book_id = d.id and d.id <> d.retained_id;
delete from public.books b using book_duplicates d where b.id = d.id and d.id <> d.retained_id;
create unique index books_family_work_key on public.books(family_id, open_library_key) where open_library_key is not null;
create table public.wishlist_books (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  title text not null check (length(trim(title)) between 1 and 500),
  authors text[] not null default '{}',
  open_library_key text not null check (open_library_key ~ '^/works/[A-Za-z0-9]+$'),
  cover_url text,
  isbn text,
  created_at timestamptz not null default now(),
  unique(family_id, open_library_key)
);
alter table public.wishlist_books enable row level security;
create policy "members manage wishlist" on public.wishlist_books for all
using (public.is_family_member(family_id)) with check (public.is_family_member(family_id));
grant select, insert, update, delete on public.wishlist_books to authenticated;
-- All mutation entry points share this lock, including direct table writes.
create function public.reconcile_book_destination() returns trigger
language plpgsql set search_path = public as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(new.family_id::text, 0));
  if tg_table_name = 'books' then
    delete from public.wishlist_books where family_id = new.family_id and open_library_key = new.open_library_key;
  elsif exists (select 1 from public.books where family_id = new.family_id and open_library_key = new.open_library_key) then
    return null;
  end if;
  return new;
end;
$$;
create trigger reconcile_collection before insert or update on public.books
for each row execute function public.reconcile_book_destination();
create trigger reconcile_wishlist before insert or update on public.wishlist_books
for each row execute function public.reconcile_book_destination();
create function public.save_family_book(book_title text, book_authors text[], work_key text, book_cover text, book_isbn text, destination text default 'library')
returns uuid language plpgsql set search_path = public as $$
declare fid uuid; result uuid; wanted public.wishlist_books%rowtype;
begin
  select family_id into fid from public.family_members where user_id = auth.uid() limit 1;
  if fid is null then raise exception 'Join a family first'; end if;
  if length(trim(coalesce(book_title,''))) not between 1 and 500 or destination is null or destination not in ('library','wishlist') then raise exception 'Invalid book'; end if;
  if work_key is not null and work_key !~ '^/works/[A-Za-z0-9]+$' then raise exception 'Invalid work key'; end if;
  if destination = 'wishlist' and work_key is null then raise exception 'Work key required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(fid::text, 0));
  select id into result from public.books where family_id = fid and open_library_key = work_key;
  if result is not null then
    delete from public.wishlist_books where family_id = fid and open_library_key = work_key;
    return result;
  end if;
  if destination = 'library' then
    select * into wanted from public.wishlist_books where family_id = fid and open_library_key = work_key;
    if found then
      book_title := wanted.title; book_authors := wanted.authors;
      book_cover := wanted.cover_url; book_isbn := wanted.isbn;
    end if;
    insert into public.books(family_id,title,authors,open_library_key,cover_url,isbn)
    values(fid,trim(book_title),coalesce(book_authors,'{}'),work_key,book_cover,book_isbn) returning id into result;
  else
    insert into public.wishlist_books(family_id,title,authors,open_library_key,cover_url,isbn)
    values(fid,trim(book_title),coalesce(book_authors,'{}'),work_key,book_cover,book_isbn)
    on conflict(family_id,open_library_key) do update set open_library_key = excluded.open_library_key returning id into result;
  end if;
  return result;
end;
$$;
create function public.move_wishlist_book(target_id uuid) returns void
language plpgsql set search_path = public as $$
declare fid uuid; wanted public.wishlist_books%rowtype;
begin
  select family_id into fid from public.family_members where user_id = auth.uid() limit 1;
  if fid is null then raise exception 'Join a family first'; end if;
  perform pg_advisory_xact_lock(hashtextextended(fid::text, 0));
  select * into wanted from public.wishlist_books where id = target_id and family_id = fid for update;
  -- Already removed/promoted or inaccessible: leave all other families untouched.
  if not found then return; end if;
  perform public.save_family_book(wanted.title,wanted.authors,wanted.open_library_key,wanted.cover_url,wanted.isbn,'library');
end;
$$;
create function public.remove_wishlist_book(target_id uuid) returns void
language plpgsql set search_path = public as $$
declare fid uuid;
begin
  select family_id into fid from public.family_members where user_id = auth.uid() limit 1;
  if fid is null then raise exception 'Join a family first'; end if;
  perform pg_advisory_xact_lock(hashtextextended(fid::text, 0));
  delete from public.wishlist_books where id = target_id and family_id = fid;
end;
$$;
revoke all on function public.save_family_book(text,text[],text,text,text,text), public.move_wishlist_book(uuid), public.remove_wishlist_book(uuid), public.reconcile_book_destination() from public;
grant execute on function public.save_family_book(text,text[],text,text,text,text), public.move_wishlist_book(uuid), public.remove_wishlist_book(uuid) to authenticated;
commit;
