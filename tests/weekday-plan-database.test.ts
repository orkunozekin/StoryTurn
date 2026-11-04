import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { addDays } from "@/lib/domain/rotation";
import { readerForPlanDate } from "@/lib/domain/weekday-plan";

let db: PGlite;
const owner = "00000000-0000-0000-0000-000000000001";
const jordan = "00000000-0000-0000-0000-000000000002";
const nana = "00000000-0000-0000-0000-000000000003";
const otherOwner = "00000000-0000-0000-0000-000000000004";
const leaverUser = "00000000-0000-0000-0000-000000000005";
let fid: string;
let today: string;
const members: Record<string, string> = {};
const R = "rotate";

async function as(uid: string) {
  await db.query("select set_config('test.uid',$1,false)", [uid]);
}

async function save(rotation: string[], plan: string[] | null, startsOn = today) {
  await as(owner);
  return db.query(
    "select * from manage_schedule($1::uuid[], $2::date, '19:30', 'UTC', 'after', false, 1, false, $3::jsonb)",
    [rotation, startsOn, plan === null ? null : JSON.stringify(plan)],
  );
}

async function scheduleRow() {
  return (
    await db.query<{
      id: string;
      weekday_readers: string[];
      reader_rotation_member_ids: string[];
      start_date: string;
    }>(
      "select id, weekday_readers, reader_rotation_member_ids, start_date::text from schedules where family_id = $1 and active",
      [fid],
    )
  ).rows[0];
}

async function generate(days: number, from = 0) {
  const schedule = await scheduleRow();
  for (let i = from; i < from + days; i++)
    await db.query("select generate_schedule_night($1, $2::date)", [
      schedule.id,
      addDays(today, i),
    ]);
}

/** Current reader per generated night, oldest first. */
async function nights() {
  return (
    await db.query<{ day: string; member_id: string | null }>(
      `select (s.scheduled_for at time zone 'UTC')::date::text as day,
         (select a.member_id from session_assignments a where a.session_id = s.id and a.is_current limit 1) as member_id
       from reading_sessions s where s.family_id = $1 and s.status = 'scheduled'
       order by s.scheduled_for`,
      [fid],
    )
  ).rows;
}

async function sqlReader(
  rotation: string[],
  plan: unknown,
  startsOn: string,
  day: string,
) {
  return (
    await db.query<{ reader: string | null }>(
      "select schedule_reader_for_date($1, $2::uuid[], $3::jsonb, $4::date, $5::date) as reader",
      [fid, rotation, JSON.stringify(plan), startsOn, day],
    )
  ).rows[0].reader;
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    `set timezone = 'UTC'; create schema auth; create table auth.users(id uuid primary key, email text); create role authenticated; create role service_role; create role anon; create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;`,
  );
  for (const file of readdirSync("supabase/migrations").sort()) {
    if (file.startsWith("011"))
      await db.exec(readFileSync("tests/fixtures/family-library-wishlist.sql", "utf8"));
    await db.exec(
      readFileSync(`supabase/migrations/${file}`, "utf8").replace(
        'create extension if not exists "pgcrypto";',
        "",
      ),
    );
  }
  await db.query(
    "insert into auth.users values($1,'owner@example.com'),($2,'jordan@example.com'),($3,'nana@example.com'),($4,'other@example.com'),($5,'leaver@example.com')",
    [owner, jordan, nana, otherOwner, leaverUser],
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
    ["jordan", jordan, "Jordan"],
    ["nana", nana, "Nana"],
  ])
    members[key] = (
      await db.query<{ id: string }>(
        "insert into family_members(family_id,user_id,display_name,email,role) values($1,$2,$3,$4,'reader') returning id",
        [fid, uid, name, `${key}@example.com`],
      )
    ).rows[0].id;
  await as(otherOwner);
  await db.query("select create_family('Other family','Parent')");
  members.stranger = (
    await db.query<{ id: string }>("select id from family_members where user_id = $1", [
      otherOwner,
    ])
  ).rows[0].id;
  today = (await db.query<{ d: string }>("select current_date::text as d")).rows[0].d;
}, 20000);
beforeEach(async () => {
  await db.query("delete from reading_sessions where family_id = $1", [fid]);
});
afterAll(async () => db?.close());

describe("schedule_reader_for_date", () => {
  it("matches the app's weekday-plan rule for every night", async () => {
    const family = [members.owner, members.jordan, members.nana];
    const gone = "99999999-9999-4999-8999-999999999999";
    const cases: { pool: string[]; plan: string[]; start: string }[] = [
      {
        pool: [members.owner, members.jordan],
        plan: [R, R, R, R, R, R, R],
        start: today,
      },
      {
        pool: [members.owner, members.jordan],
        plan: [R, R, R, R, R, members.nana, R],
        start: addDays(today, -10),
      },
      {
        pool: [members.owner, members.jordan, members.nana],
        plan: [members.jordan, R, R, members.owner, R, members.nana, members.nana],
        start: addDays(today, -3),
      },
      // A fixed member and a pool member who left the family.
      {
        pool: [members.owner, gone, members.jordan],
        plan: [R, R, gone, R, R, R, R],
        start: today,
      },
      { pool: [], plan: [R, R, R, R, R, members.nana, R], start: today },
    ];
    for (const { pool, plan, start } of cases) {
      for (let offset = -2; offset < 30; offset++) {
        const day = addDays(start, offset);
        const expected = readerForPlanDate({
          pool,
          plan,
          startDate: start,
          date: day,
          familyMemberIds: family,
        }).memberId;
        expect(await sqlReader(pool, plan, start, day)).toBe(expected);
      }
    }
  });
});

describe("manage_schedule with a weekday plan", () => {
  it("stores the plan and generates fixed and rotate nights", async () => {
    const plan = [R, R, R, R, R, members.nana, R];
    await save([members.owner, members.jordan], plan);
    expect((await scheduleRow()).weekday_readers).toEqual(plan);
    await generate(14);
    const expected = Array.from({ length: 14 }, (_, i) => {
      const day = addDays(today, i);
      return {
        day,
        member_id: readerForPlanDate({
          pool: [members.owner, members.jordan],
          plan,
          startDate: today,
          date: day,
        }).memberId,
      };
    });
    expect(await nights()).toEqual(expected);
    expect((await nights()).filter((n) => n.member_id === members.nana)).toHaveLength(2);
  });

  it("generates the same readers in two horizons as in one", async () => {
    const plan = [R, members.jordan, R, R, R, R, members.nana];
    await save([members.owner, members.jordan, members.nana], plan);
    await generate(14);
    await generate(14, 14);
    const incremental = await nights();
    await db.query("delete from reading_sessions where family_id = $1", [fid]);
    await generate(28);
    expect(await nights()).toEqual(incremental);
  });

  it("reassigns future nights when the plan changes", async () => {
    await save([members.owner, members.jordan], null);
    expect((await scheduleRow()).weekday_readers).toEqual([R, R, R, R, R, R, R]);
    await generate(7);
    const plan = [R, R, R, R, R, R, R].map(() => members.nana);
    plan[0] = R;
    const changed = await save([members.owner], plan);
    expect(changed.rows).toHaveLength(7);
    for (const night of await nights())
      expect(night.member_id).toBe(
        readerForPlanDate({
          pool: [members.owner],
          plan,
          startDate: today,
          date: night.day,
        }).memberId,
      );
  });

  it("keeps the old positional call working as an all-rotate plan", async () => {
    await as(owner);
    await db.query(
      "select * from manage_schedule($1::uuid[], current_date, '19:30', 'UTC', 'after')",
      [[members.owner, members.jordan]],
    );
    expect((await scheduleRow()).weekday_readers).toEqual([R, R, R, R, R, R, R]);
  });

  it("rejects bad plans, outside members and rotate nights with an empty pool", async () => {
    await expect(save([members.owner], [R, R, R])).rejects.toThrow(/seven nights/);
    await expect(save([members.owner], [R, R, R, R, R, "everyone", R])).rejects.toThrow(
      /seven nights/,
    );
    await expect(
      save([members.owner], [R, R, R, R, R, members.stranger, R]),
    ).rejects.toThrow(/valid family readers/);
    await expect(save([members.stranger], [R, R, R, R, R, R, R])).rejects.toThrow(
      /valid family readers/,
    );
    await expect(save([], [R, R, R, R, R, members.nana, R])).rejects.toThrow(
      /Add someone to the rotation or pick a reader for every night/,
    );
    const fixedWeek = [R, R, R, R, R, R, R].map(() => members.jordan);
    await save([], fixedWeek);
    expect((await scheduleRow()).reader_rotation_member_ids).toEqual([]);
    await generate(3);
    expect((await nights()).map((n) => n.member_id)).toEqual([
      members.jordan,
      members.jordan,
      members.jordan,
    ]);
  });

  it("rejects malformed plans written straight to the table", async () => {
    await save([members.owner], null);
    await expect(
      db.query(
        "update schedules set weekday_readers = '[\"rotate\"]' where family_id = $1",
        [fid],
      ),
    ).rejects.toThrow(/schedules_weekday_readers_plan/);
  });
});

describe("generate_schedule_night after someone leaves", () => {
  it("falls back to rotate for their weekdays and skips nights nobody can take", async () => {
    await as(owner);
    const leaver = (
      await db.query<{ id: string }>(
        "insert into family_members(family_id,user_id,display_name,email,role) values($1,$2,'Leaver','leaver@example.com','reader') returning id",
        [fid, leaverUser],
      )
    ).rows[0].id;
    const everyNight = [R, R, R, R, R, R, R].map(() => leaver);
    await save([leaver], everyNight);
    await db.query("delete from family_members where id = $1", [leaver]);
    // Their fixed nights now rotate, and the only pool member is gone: nothing to generate.
    await generate(7);
    expect(await nights()).toEqual([]);

    await save([members.owner], [R, R, R, R, R, members.nana, R]);
    await db.query(
      "update schedules set weekday_readers = $2::jsonb where family_id = $1",
      [fid, JSON.stringify([R, R, R, R, R, "99999999-9999-4999-8999-999999999999", R])],
    );
    await generate(7);
    expect((await nights()).map((n) => n.member_id)).toEqual(
      Array.from({ length: 7 }, () => members.owner),
    );
  });
});
