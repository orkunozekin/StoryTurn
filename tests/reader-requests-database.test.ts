import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

let db: PGlite;
const owner = "00000000-0000-0000-0000-000000000001";
const jordan = "00000000-0000-0000-0000-000000000002";
const nana = "00000000-0000-0000-0000-000000000003";
const aunt = "00000000-0000-0000-0000-000000000004";
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
         'storyturn-' || $1::text || '-' || gen_random_uuid() || '@bedtime-readers.app')
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
async function request(sessionId: string, note: string | null = null) {
  return (
    await db.query<{ id: string }>("select request_session_reader($1,$2) as id", [
      sessionId,
      note,
    ])
  ).rows[0].id;
}
async function statusOf(id: string) {
  return (
    await db.query<{ status: string; decided_by_member_id: string | null }>(
      "select status, decided_by_member_id from session_reader_requests where id = $1",
      [id],
    )
  ).rows[0];
}
async function readers(sessionId: string) {
  return (
    await db.query<{ member_id: string }>(
      "select member_id from session_assignments where session_id = $1 and is_current order by member_id",
      [sessionId],
    )
  ).rows.map((r) => r.member_id);
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    `create schema auth; create table auth.users(id uuid primary key, email text); create role authenticated; create role service_role; create role anon; create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;`,
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
    "insert into auth.users values($1,'owner@example.com'),($2,'jordan@example.com'),($3,'nana@example.com'),($4,'aunt@example.com')",
    [owner, jordan, nana, aunt],
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
    ["aunt", aunt, "Aunt Bea"],
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
      [fid, [members.owner, members.jordan]],
    )
  ).rows[0].id;
  await db.exec(
    "grant usage on schema public,auth to authenticated; grant select on family_members,reading_sessions,session_assignments to authenticated;",
  );
});
beforeEach(async () => {
  await db.exec("reset role");
  await db.query("delete from reading_sessions where family_id = $1", [fid]);
});
afterAll(async () => db.close());

describe("request_session_reader", () => {
  it("stores a pending request with a cleaned note", async () => {
    const night = await addNight(2, members.jordan);
    await as(nana);
    const id = await request(night, "  Can I take   Saturday? ");
    const row = (
      await db.query<{ note: string; status: string; member_id: string }>(
        "select note, status, member_id from session_reader_requests where id = $1",
        [id],
      )
    ).rows[0];
    expect(row).toEqual({
      note: "Can I take Saturday?",
      status: "pending",
      member_id: members.nana,
    });
    await expect(request(night)).rejects.toThrow(/already asked/);
  });

  it("blocks the current reader, closed nights, past nights and long notes", async () => {
    const night = await addNight(1, members.jordan);
    await as(jordan);
    await expect(request(night)).rejects.toThrow(/already reading/);
    await as(nana);
    await expect(request(await addNight(-1, members.jordan))).rejects.toThrow(/passed/);
    await expect(request(await addNight(3, members.jordan, "cancelled"))).rejects.toThrow(
      /canceled/,
    );
    await expect(request(await addNight(4, members.jordan, "completed"))).rejects.toThrow(
      /already done/,
    );
    await expect(request(night, "x".repeat(201))).rejects.toThrow(/under 200/);
    expect(await request(await addNight(0, members.jordan))).toBeTruthy();
  });
});

describe("decide_session_reader_request", () => {
  it("lets only parents decide", async () => {
    const night = await addNight(2, members.jordan);
    await as(nana);
    const id = await request(night);
    await as(jordan);
    await expect(
      db.query("select * from decide_session_reader_request($1,true)", [id]),
    ).rejects.toThrow(/Only parents/);
    expect((await statusOf(id)).status).toBe("pending");
  });

  it("approves: reassigns, records a correction, declines the rest and bumps the calendar", async () => {
    const night = await addNight(2, members.jordan);
    await as(nana);
    const nanaRequest = await request(night, "In town");
    await as(aunt);
    const auntRequest = await request(night);
    const sequence = async () =>
      (
        await db.query<{ calendar_sequence: number }>(
          "select calendar_sequence from reading_sessions where id = $1",
          [night],
        )
      ).rows[0].calendar_sequence;
    const before = await sequence();
    await as(owner);
    const result = (
      await db.query<{ session_id: string; changed: boolean; removed_member_ids: string[] }>(
        "select * from decide_session_reader_request($1,true)",
        [nanaRequest],
      )
    ).rows[0];
    expect(result).toEqual({
      session_id: night,
      changed: true,
      removed_member_ids: [members.jordan],
    });
    expect(await readers(night)).toEqual([members.nana]);
    expect(await statusOf(nanaRequest)).toEqual({
      status: "approved",
      decided_by_member_id: members.owner,
    });
    expect((await statusOf(auntRequest)).status).toBe("declined");
    const correction = (
      await db.query<{ reason: string; before: unknown; after: unknown }>(
        "select reason, before, after from session_corrections where session_id = $1",
        [night],
      )
    ).rows[0];
    expect(correction.reason).toBe("Approved Nana's request to read: “In town”");
    expect(correction.before).toMatchObject({ currentMemberIds: [members.jordan] });
    expect(correction.after).toMatchObject({ currentMemberIds: [members.nana] });
    expect(await sequence()).toBeGreaterThan(before);
    // Original row kept for history.
    expect(
      (
        await db.query(
          "select 1 from session_assignments where session_id = $1 and member_id = $2 and is_original and not is_current",
          [night, members.jordan],
        )
      ).rows,
    ).toHaveLength(1);
    await expect(
      db.query("select * from decide_session_reader_request($1,false)", [auntRequest]),
    ).rejects.toThrow(/already closed/);
  });

  it("reactivates a single row when the requester was assigned to the night more than once", async () => {
    const night = await addNight(2, members.jordan);
    // Nana read this night twice before being replaced each time.
    await db.query(
      `insert into session_assignments(session_id,member_id,is_original,is_current,created_at)
       values($1,$2,false,false,now() - interval '2 days'),($1,$2,false,false,now() - interval '1 day')`,
      [night, members.nana],
    );
    await as(nana);
    const id = await request(night);
    await as(owner);
    await db.query("select * from decide_session_reader_request($1,true)", [id]);
    expect(await readers(night)).toEqual([members.nana]);
    const current = (
      await db.query<{ count: number }>(
        "select count(*)::int as count from session_assignments where session_id = $1 and is_current",
        [night],
      )
    ).rows[0].count;
    expect(current).toBe(1);
  });

  it("declines without touching readers", async () => {
    const night = await addNight(2, members.jordan);
    await as(nana);
    const id = await request(night);
    await as(owner);
    const result = (
      await db.query<{ changed: boolean }>(
        "select * from decide_session_reader_request($1,false)",
        [id],
      )
    ).rows[0];
    expect(result.changed).toBe(false);
    expect(await readers(night)).toEqual([members.jordan]);
    expect((await statusOf(id)).status).toBe("declined");
  });

  it("expires open requests when the night is canceled or has passed", async () => {
    const night = await addNight(2, members.jordan);
    const past = await addNight(1, members.jordan);
    await as(nana);
    const canceledRequest = await request(night);
    const pastRequest = await request(past);
    await db.query("update reading_sessions set status = 'cancelled' where id = $1", [
      night,
    ]);
    expect((await statusOf(canceledRequest)).status).toBe("expired");
    await db.query(
      "update reading_sessions set scheduled_for = scheduled_for - interval '3 days' where id = $1",
      [past],
    );
    await as(owner);
    await expect(
      db.query("select * from decide_session_reader_request($1,true)", [pastRequest]),
    ).rejects.toThrow(/expired/);
    expect((await statusOf(pastRequest)).status).toBe("pending");
    await as(nana);
    await db.query("select expire_stale_reader_requests($1)", [fid]);
    expect((await statusOf(pastRequest)).status).toBe("expired");
  });
});

describe("withdraw and row-level security", () => {
  it("lets the requester withdraw only their own open request", async () => {
    const night = await addNight(2, members.jordan);
    await as(nana);
    const id = await request(night);
    await as(aunt);
    await expect(
      db.query("select withdraw_session_reader_request($1)", [id]),
    ).rejects.toThrow(/not found/);
    await as(nana);
    await db.query("select withdraw_session_reader_request($1)", [id]);
    expect((await statusOf(id)).status).toBe("withdrawn");
    await expect(
      db.query("select withdraw_session_reader_request($1)", [id]),
    ).rejects.toThrow(/already closed/);
  });

  it("members insert and withdraw their own rows but cannot approve through the table", async () => {
    const night = await addNight(2, members.jordan);
    await as(nana);
    await db.exec("set role authenticated");
    const insertFor = (memberId: string) =>
      db.query(
        "insert into session_reader_requests(session_id,family_id,member_id) values($1,$2,$3) returning id",
        [night, fid, memberId],
      );
    await expect(insertFor(members.aunt)).rejects.toThrow(/row-level security/);
    const id = (await insertFor(members.nana)).rows[0] as { id: string };
    await expect(
      db.query("update session_reader_requests set status = 'approved' where id = $1", [
        id.id,
      ]),
    ).rejects.toThrow(/row-level security/);
    await as(owner);
    const ownerUpdate = await db.query(
      "update session_reader_requests set status = 'declined' where id = $1",
      [id.id],
    );
    expect(ownerUpdate.affectedRows).toBe(0);
    await as(nana);
    const withdrawn = await db.query(
      "update session_reader_requests set status = 'withdrawn', decided_at = now() where id = $1",
      [id.id],
    );
    expect(withdrawn.affectedRows).toBe(1);
    await as(owner);
    expect(
      (await db.query("select id from session_reader_requests where id = $1", [id.id]))
        .rows,
    ).toHaveLength(1);
    await db.exec("reset role");
  });
});
