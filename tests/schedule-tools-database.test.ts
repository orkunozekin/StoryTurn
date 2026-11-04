import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { beforeAll, beforeEach, afterAll, expect, it } from "vitest";
let db: PGlite;
const owner = "00000000-0000-0000-0000-000000000001";
const reader = "00000000-0000-0000-0000-000000000002";
const nana = "00000000-0000-0000-0000-000000000003";
let fid: string;
let scheduleId: string;
const members: Record<string, string> = {};
async function as(uid: string) {
  await db.query("select set_config('test.uid',$1,false)", [uid]);
}
async function addNight(dayOffset: number, memberId: string, status = "scheduled") {
  const id = (
    await db.query<{ id: string }>(
      `insert into reading_sessions(family_id,schedule_id,scheduled_for,status,ics_uid)
       values($1::uuid,$2,((now() at time zone 'UTC')::date + $3::int + time '19:30') at time zone 'UTC',$4,
         'storyturn-' || $1::text || '-' || ((now() at time zone 'UTC')::date + $3::int) || '@bedtime-readers.app')
       returning id`,
      [fid, scheduleId, dayOffset, status],
    )
  ).rows[0].id;
  await db.query(
    "insert into session_assignments(session_id,member_id,is_original,is_current) values($1,$2,true,true)",
    [id, memberId],
  );
  return id;
}
async function currentReaders() {
  return (
    await db.query<{ day: number; member_id: string }>(
      `select ((s.scheduled_for at time zone 'UTC')::date - (now() at time zone 'UTC')::date) as day, a.member_id
       from reading_sessions s join session_assignments a on a.session_id = s.id and a.is_current
       where s.family_id = $1 and s.status = 'scheduled' order by s.scheduled_for`,
      [fid],
    )
  ).rows.map((row) => [row.day, row.member_id]);
}
async function bookIdsFor(sessionId: string) {
  return (
    await db.query<{ book_id: string | null; title_freeform: string | null }>(
      "select book_id, title_freeform from session_books where session_id = $1",
      [sessionId],
    )
  ).rows;
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    `create schema auth; create table auth.users(id uuid primary key, email text); create role authenticated; create role service_role; create role anon; create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;`,
  );
  for (const file of readdirSync("supabase/migrations").sort()) {
    await db.exec(
      readFileSync(`supabase/migrations/${file}`, "utf8").replace(
        'create extension if not exists "pgcrypto";',
        "",
      ),
    );
  }
  await db.query(
    "insert into auth.users values($1,'owner@example.com'),($2,'reader@example.com'),($3,'nana@example.com')",
    [owner, reader, nana],
  );
  await as(owner);
  fid = (await db.query<{ id: string }>("select create_family('Family','Parent') as id"))
    .rows[0].id;
  members.owner = (
    await db.query<{ id: string }>("select id from family_members where user_id = $1", [
      owner,
    ])
  ).rows[0].id;
  for (const [key, uid, name] of [
    ["reader", reader, "Reader"],
    ["nana", nana, "Nana"],
  ])
    members[key] = (
      await db.query<{ id: string }>(
        "insert into family_members(family_id,user_id,display_name,email,role) values($1,$2,$3,$4,'reader') returning id",
        [fid, uid, name, `${key}@example.com`],
      )
    ).rows[0].id;
  scheduleId = (
    await db.query<{ id: string }>(
      "insert into schedules(family_id,reader_rotation_member_ids,start_date,time_local,timezone,book_timing) values($1,$2,current_date,'19:30','UTC','after') returning id",
      [fid, [members.owner, members.reader]],
    )
  ).rows[0].id;
  await db.query(
    "insert into books(family_id,title) select $1, 'Book ' || n from generate_series(1,5) n",
    [fid],
  );
}, 20000);
beforeEach(async () => {
  await db.query("delete from reading_sessions where family_id = $1", [fid]);
  await as(owner);
});
afterAll(async () => {
  await db?.close();
});

it("shifts readers forward from the anchor night and adds an extra night", async () => {
  await addNight(-1, members.reader);
  const anchor = await addNight(0, members.owner);
  await addNight(1, members.reader);
  await addNight(3, members.owner);
  const sequenceBefore = (
    await db.query<{ calendar_sequence: number }>(
      "select calendar_sequence from reading_sessions where id = $1",
      [anchor],
    )
  ).rows[0].calendar_sequence;

  const changed = (
    await db.query<{ ids: string[] }>("select cascade_insert_reader($1,$2,3) as ids", [
      anchor,
      members.nana,
    ])
  ).rows[0].ids;

  expect(changed).toHaveLength(4);
  expect(changed[0]).toBe(anchor);
  expect(await currentReaders()).toEqual([
    [-1, members.reader],
    [0, members.nana],
    [1, members.owner],
    [3, members.reader],
    [4, members.owner],
  ]);
  const extra = changed.at(-1)!;
  expect(await bookIdsFor(extra)).toHaveLength(3);
  const sequenceAfter = (
    await db.query<{ calendar_sequence: number }>(
      "select calendar_sequence from reading_sessions where id = $1",
      [anchor],
    )
  ).rows[0].calendar_sequence;
  expect(sequenceAfter).toBeGreaterThan(sequenceBefore);
});

it("rejects cascades from readers, past nights, and outside fill-ins", async () => {
  const past = await addNight(-1, members.owner);
  const tonight = await addNight(0, members.reader);
  await expect(
    db.query("select cascade_insert_reader($1,$2,3)", [past, members.nana]),
  ).rejects.toThrow(/past night/);
  await expect(
    db.query("select cascade_insert_reader($1,gen_random_uuid(),3)", [tonight]),
  ).rejects.toThrow(/must be in your family/);
  await as(reader);
  await expect(
    db.query("select cascade_insert_reader($1,$2,3)", [tonight, members.nana]),
  ).rejects.toThrow(/owner/);
  await as(owner);
  expect(await currentReaders()).toEqual([
    [-1, members.owner],
    [0, members.reader],
  ]);
});

it("swaps readers between two upcoming nights and validates the pair", async () => {
  const a = await addNight(0, members.owner);
  const b = await addNight(2, members.reader);
  const same = await addNight(3, members.reader);
  const past = await addNight(-1, members.nana);

  await db.query("select swap_session_readers($1,$2)", [a, b]);
  expect(await currentReaders()).toEqual([
    [-1, members.nana],
    [0, members.reader],
    [2, members.owner],
    [3, members.reader],
  ]);
  await expect(db.query("select swap_session_readers($1,$2)", [a, same])).rejects.toThrow(
    /same reader/,
  );
  await expect(db.query("select swap_session_readers($1,$2)", [a, past])).rejects.toThrow(
    /past nights/,
  );
  await as(reader);
  await expect(db.query("select swap_session_readers($1,$2)", [a, b])).rejects.toThrow(
    /owner/,
  );
});

it("fills empty upcoming nights, reshuffles all of them, and keeps freeform titles", async () => {
  const past = await addNight(-1, members.owner);
  const filled = await addNight(0, members.owner);
  const empty = await addNight(1, members.reader);
  await addNight(2, members.reader, "cancelled");
  const book = (
    await db.query<{ id: string }>("select id from books where family_id = $1 limit 1", [
      fid,
    ])
  ).rows[0].id;
  await db.query(
    "insert into session_books(session_id,book_id,title_freeform) values($1,$2,null),($1,null,'Grandma story')",
    [filled, book],
  );

  await as(reader);
  const added = (
    await db.query<{ n: number }>(
      "select pick_upcoming_session_books(only_empty => true, book_count => 3) as n",
    )
  ).rows[0].n;
  expect(added).toBe(1);
  expect(await bookIdsFor(empty)).toHaveLength(3);
  expect(await bookIdsFor(filled)).toHaveLength(2);
  expect(await bookIdsFor(past)).toHaveLength(0);

  const shuffled = (
    await db.query<{ n: number }>(
      "select pick_upcoming_session_books(book_count => 3) as n",
    )
  ).rows[0].n;
  expect(shuffled).toBe(2);
  const filledBooks = await bookIdsFor(filled);
  expect(filledBooks.filter((row) => row.book_id)).toHaveLength(3);
  expect(filledBooks.filter((row) => row.title_freeform)).toEqual([
    { book_id: null, title_freeform: "Grandma story" },
  ]);
});

it("shuffles one upcoming night and rejects past or cancelled nights", async () => {
  const tonight = await addNight(0, members.owner);
  const past = await addNight(-1, members.owner);
  const cancelled = await addNight(1, members.owner, "cancelled");
  await db.query("select pick_upcoming_session_books($1, book_count => 2)", [tonight]);
  expect(await bookIdsFor(tonight)).toHaveLength(2);
  await expect(
    db.query("select pick_upcoming_session_books($1)", [past]),
  ).rejects.toThrow(/Past nights/);
  await expect(
    db.query("select pick_upcoming_session_books($1)", [cancelled]),
  ).rejects.toThrow(/Only scheduled nights/);
  await expect(
    db.query("select pick_upcoming_session_books(gen_random_uuid())"),
  ).rejects.toThrow(/Session not found/);
});
