import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { sendSessionInviteEmail } from "@/lib/session-mail";
import {
  decideReaderRequest,
  listReaderRequests,
  requestToReadNight,
  withdrawReaderRequest,
} from "@/lib/supabase/repository";

type Row = Record<string, unknown>;
const fixture = vi.hoisted(() => ({
  tables: {} as Record<string, Row[]>,
  userId: "user",
  rpcCalls: [] as { name: string; args: Row }[],
  rpcResult: { data: null as unknown, error: null as null | { message: string } },
}));

function client() {
  return {
    auth: {
      getUser: async () => ({
        data: {
          user: { id: fixture.userId, email: "", created_at: "", user_metadata: {} },
        },
        error: null,
      }),
    },
    rpc: async (name: string, args: Row) => {
      fixture.rpcCalls.push({ name, args });
      return fixture.rpcResult;
    },
    from(table: string) {
      const filters: ((r: Row) => boolean)[] = [];
      let one = false;
      let descending: string | null = null;
      const builder = {
        select: () => builder,
        eq: (key: string, value: unknown) => {
          filters.push((r) => r[key] === value);
          return builder;
        },
        in: (key: string, values: unknown[]) => {
          filters.push((r) => values.includes(r[key]));
          return builder;
        },
        order: (key: string, options?: { ascending: boolean }) => {
          if (options?.ascending === false) descending = key;
          return builder;
        },
        limit: () => builder,
        maybeSingle: () => {
          one = true;
          return builder;
        },
        then: (resolve: (result: { data: unknown; error: null }) => unknown) => {
          const matched = (fixture.tables[table] ?? []).filter((r) =>
            filters.every((f) => f(r)),
          );
          if (descending) {
            const key = descending;
            matched.sort((a, b) => String(b[key]).localeCompare(String(a[key])));
          }
          return Promise.resolve({
            data: one ? (matched[0] ?? null) : matched,
            error: null,
          }).then(resolve);
        },
      };
      return builder;
    },
  };
}
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => client() }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => client() }));
vi.mock("@/lib/session-mail", () => ({
  sendSessionInviteEmail: vi.fn(async () => null),
}));

const night = (id: string, date: string, status = "scheduled") => ({
  id,
  family_id: "family",
  schedule_id: "schedule",
  scheduled_for: `${date}T19:30:00+00:00`,
  status,
  ics_uid: `uid-${id}`,
  calendar_sequence: 3,
});
const req = (id: string, sessionId: string, status = "pending", createdAt = "1") => ({
  id,
  session_id: sessionId,
  family_id: "family",
  member_id: "nana",
  note: "In town",
  status,
  created_at: createdAt,
  decided_at: null,
  decided_by_member_id: null,
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-05T20:00:00Z"));
  vi.clearAllMocks();
  fixture.userId = "user";
  fixture.rpcCalls = [];
  fixture.rpcResult = { data: null, error: null };
  fixture.tables = {
    family_members: [
      {
        id: "parent",
        user_id: "user",
        family_id: "family",
        display_name: "Parent",
        email: "parent@example.com",
        role: "owner",
      },
      {
        id: "jordan",
        user_id: "user-jordan",
        family_id: "family",
        display_name: "Jordan",
        email: "jordan@example.com",
        role: "reader",
      },
      {
        id: "nana",
        user_id: "user-nana",
        family_id: "family",
        display_name: "Nana",
        email: "nana@example.com",
        role: "reader",
      },
    ],
    families: [{ id: "family", name: "Family" }],
    schedules: [
      {
        id: "schedule",
        family_id: "family",
        active: true,
        timezone: "America/Los_Angeles",
      },
    ],
    reading_sessions: [night("sat", "2026-10-10"), night("past", "2026-10-01")],
    session_assignments: [
      { id: "a1", session_id: "sat", member_id: "nana", is_current: true },
    ],
    session_reader_requests: [
      req("r1", "sat", "pending", "2026-10-04T00:00:00Z"),
      req("r2", "past", "pending", "2026-09-30T00:00:00Z"),
      req("r3", "sat", "declined", "2026-10-03T00:00:00Z"),
      { ...req("other", "sat"), family_id: "other-family" },
    ],
  };
});
afterEach(() => vi.useRealTimers());

it("lists the family's requests newest first and shows past pending ones as expired", async () => {
  const requests = await listReaderRequests();
  expect(requests.map((r) => [r.id, r.status])).toEqual([
    ["r1", "pending"],
    ["r3", "declined"],
    ["r2", "expired"],
  ]);
  expect(requests[0]).toMatchObject({
    sessionId: "sat",
    memberId: "nana",
    note: "In town",
    decidedAt: null,
  });
  expect((await listReaderRequests("sat")).map((r) => r.id)).toEqual(["r1", "r3"]);
});

it("sends requests and withdrawals through the validating RPCs", async () => {
  fixture.userId = "user-nana";
  await requestToReadNight("sat", "  Can I   take it? ");
  await withdrawReaderRequest("r1");
  expect(fixture.rpcCalls).toEqual([
    {
      name: "request_session_reader",
      args: { target_session_id: "sat", request_note: "Can I take it?" },
    },
    { name: "withdraw_session_reader_request", args: { request_id: "r1" } },
  ]);
  fixture.rpcResult = { data: null, error: { message: "This night has passed" } };
  await expect(requestToReadNight("past")).rejects.toThrow("This night has passed");
  await expect(requestToReadNight("sat", "x".repeat(201))).rejects.toThrow(/under 200/);
});

it("approval cancels the replaced reader's invite before inviting the requester", async () => {
  fixture.rpcResult = {
    data: [{ session_id: "sat", changed: true, removed_member_ids: ["jordan"] }],
    error: null,
  };
  await decideReaderRequest("r1", true);
  expect(fixture.rpcCalls).toEqual([
    { name: "decide_session_reader_request", args: { request_id: "r1", approve: true } },
  ]);
  const invites = vi.mocked(sendSessionInviteEmail).mock.calls.map(([input]) => input);
  expect(invites).toHaveLength(2);
  expect(invites[0]).toMatchObject({
    method: "CANCEL",
    icsUid: "uid-sat",
    sequence: 3,
    scheduledFor: "2026-10-10T19:30:00",
    attendees: [{ email: "jordan@example.com" }],
  });
  expect(invites[1]).toMatchObject({
    method: "REQUEST",
    attendees: [{ email: "nana@example.com" }],
  });
});

it("sends no invites for declines or unchanged readers, and blocks non-owners", async () => {
  fixture.rpcResult = {
    data: [{ session_id: "sat", changed: false, removed_member_ids: [] }],
    error: null,
  };
  await decideReaderRequest("r1", false);
  await decideReaderRequest("r1", true);
  expect(sendSessionInviteEmail).not.toHaveBeenCalled();
  fixture.userId = "user-nana";
  fixture.rpcCalls = [];
  await expect(decideReaderRequest("r1", true)).rejects.toThrow(/owners/);
  expect(fixture.rpcCalls).toEqual([]);
});
