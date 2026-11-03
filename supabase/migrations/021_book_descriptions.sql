-- Plain-text blurbs for the library book page. Google shelf scans use
-- edition keys like google:{volumeId}; Open Library editions stay /books/OLnM.
alter table public.books add column description text;

create or replace function public.save_book_edition(metadata jsonb, scan_id uuid default null)
returns table(book jsonb, created boolean) language plpgsql security definer set search_path = public as $$
declare fid uuid; saved public.books%rowtype; code text; edition text;
begin
  select family_id into fid from family_members where user_id=auth.uid() limit 1;
  if fid is null then raise exception 'Join a family first'; end if;
  perform pg_advisory_xact_lock(hashtextextended(fid::text, 0));
  perform 1 from families f where f.id=fid for no key update;
  if scan_id is not null then
    perform 1 from book_scan_sessions s join family_members m on m.id=s.member_id where s.id=scan_id and m.user_id=auth.uid() and not s.closed and s.expires_at>now() for update of s;
    if not found then raise exception 'Scan session ended'; end if;
  end if;
  code := nullif(metadata->>'isbn',''); edition := nullif(metadata->>'editionKey','');
  if edition is null or edition !~ '^(/books/OL[0-9]+M|google:[A-Za-z0-9_-]{1,64})$' or coalesce(length(metadata->>'title'),0)=0 or length(metadata->>'title')>500 then raise exception 'Invalid edition'; end if;
  if code is not null and (code !~ '^97[89][0-9]{10}$' or (select sum(substr(code,i,1)::integer * case when i%2=0 then 3 else 1 end)%10 from generate_series(1,13) i)<>0) then raise exception 'Invalid ISBN'; end if;
  select * into saved from books b where b.family_id=fid and ((code is not null and b.normalized_isbn=code) or b.edition_key=edition) order by (b.normalized_isbn=code) desc nulls last limit 1;
  if saved.id is not null then
    -- Keep the earlier copy, but fill a description it does not have yet.
    if saved.description is null and nullif(left(btrim(coalesce(metadata->>'description','')),4000),'') is not null then
      update books set description=nullif(left(btrim(coalesce(metadata->>'description','')),4000),'') where id=saved.id returning * into saved;
    end if;
    book:=to_jsonb(saved); created:=false; return next; return;
  end if;
  insert into books(family_id,title,authors,open_library_key,cover_url,isbn,normalized_isbn,edition_key,format,publisher,edition_year,description,scan_session_id)
  values(fid,metadata->>'title',array(select jsonb_array_elements_text(metadata->'authors')),nullif(metadata->>'openLibraryKey',''),nullif(metadata->>'coverUrl',''),code,code,edition,nullif(metadata->>'format',''),nullif(metadata->>'publisher',''),nullif(metadata->>'editionYear',''),nullif(left(btrim(coalesce(metadata->>'description','')),4000),''),scan_id) returning * into saved;
  book:=to_jsonb(saved); created:=true; return next;
end; $$;

grant insert (description), update (description) on public.books to authenticated;
