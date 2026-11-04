import { describe, expect, it } from "vitest";
import {
  canRequestNight,
  effectiveRequestStatus,
  nightBlockReason,
  normalizeRequestNote,
  planRequestDecision,
  planWithdraw,
  READER_REQUEST_NOTE_MAX,
  readerRequestStatusLabel,
  withEffectiveStatus,
} from "@/lib/domain/reader-requests";
import type { SessionReaderRequest, SessionStatus } from "@/lib/types";

const today = "2026-10-05";
const night = {
  id: "night",
  familyId: "fam",
  status: "scheduled" as SessionStatus,
  scheduledFor: "2026-10-07T19:30:00",
};
const nana = { id: "nana", familyId: "fam", role: "reader" as const };
const owner = { id: "alex", familyId: "fam", role: "owner" as const };
const assignments = [
  { sessionId: "night", memberId: "jordan", isCurrent: true },
  { sessionId: "night", memberId: "nana", isCurrent: false },
];
function request(over: Partial<SessionReaderRequest> = {}): SessionReaderRequest {
  return {
    id: "req",
    sessionId: "night",
    familyId: "fam",
    memberId: "nana",
    note: null,
    status: "pending",
    createdAt: "2026-10-05T10:00:00Z",
    decidedAt: null,
    decidedByMemberId: null,
    ...over,
  };
}

describe("who can request a night", () => {
  it("lets a relative who is not the current reader ask for an upcoming night", () => {
    expect(
      canRequestNight({ member: nana, session: night, assignments, requests: [], today }),
    ).toEqual({ ok: true });
  });

  it("allows tonight but blocks past, canceled and completed nights", () => {
    const check = (session: Partial<typeof night>) =>
      canRequestNight({
        member: nana,
        session: { ...night, ...session },
        assignments,
        requests: [],
        today,
      });
    expect(check({ scheduledFor: "2026-10-05T19:30:00" }).ok).toBe(true);
    expect(check({ scheduledFor: "2026-10-04T19:30:00" })).toEqual({
      ok: false,
      reason: "This night has passed",
    });
    expect(check({ status: "cancelled" })).toEqual({
      ok: false,
      reason: "This night was canceled",
    });
    expect(check({ status: "completed" })).toEqual({
      ok: false,
      reason: "This night is already done",
    });
  });

  it("blocks the current reader, duplicates and other families", () => {
    expect(
      canRequestNight({
        member: { id: "jordan", familyId: "fam" },
        session: night,
        assignments,
        requests: [],
        today,
      }),
    ).toEqual({ ok: false, reason: "You're already reading this night" });
    expect(
      canRequestNight({
        member: nana,
        session: night,
        assignments,
        requests: [request()],
        today,
      }),
    ).toEqual({ ok: false, reason: "You already asked for this night" });
    // A closed request does not stop asking again.
    expect(
      canRequestNight({
        member: nana,
        session: night,
        assignments,
        requests: [request({ status: "declined" })],
        today,
      }).ok,
    ).toBe(true);
    expect(
      canRequestNight({
        member: { id: "nana", familyId: "other" },
        session: night,
        assignments,
        requests: [],
        today,
      }).ok,
    ).toBe(false);
  });
});

describe("expiry", () => {
  it("shows pending requests on closed nights as expired and keeps final states", () => {
    expect(effectiveRequestStatus(request(), night, today)).toBe("pending");
    expect(
      effectiveRequestStatus(request(), { ...night, status: "cancelled" }, today),
    ).toBe("expired");
    expect(
      effectiveRequestStatus(
        request(),
        { ...night, scheduledFor: "2026-10-01T19:30:00" },
        today,
      ),
    ).toBe("expired");
    expect(effectiveRequestStatus(request(), undefined, today)).toBe("expired");
    expect(
      effectiveRequestStatus(
        request({ status: "approved" }),
        { ...night, status: "completed" },
        today,
      ),
    ).toBe("approved");
    const [pending, done] = withEffectiveStatus(
      [request(), request({ id: "b", sessionId: "done" })],
      [night, { ...night, id: "done", status: "completed" }],
      today,
    );
    expect(pending.status).toBe("pending");
    expect(done.status).toBe("expired");
    expect(nightBlockReason(night, today)).toBeNull();
  });
});

describe("notes", () => {
  it("trims, collapses whitespace and limits length", () => {
    expect(normalizeRequestNote("  Can I take   Saturday?\n I'm in town. ")).toBe(
      "Can I take Saturday? I'm in town.",
    );
    expect(normalizeRequestNote("   ")).toBeNull();
    expect(normalizeRequestNote(undefined)).toBeNull();
    expect(() => normalizeRequestNote("x".repeat(READER_REQUEST_NOTE_MAX + 1))).toThrow(
      /under 200/,
    );
  });
});

describe("decisions", () => {
  const others = [
    request(),
    request({ id: "aunt", memberId: "aunt" }),
    request({ id: "old", memberId: "sitter", status: "withdrawn" }),
    request({ id: "elsewhere", sessionId: "other-night", memberId: "aunt" }),
  ];

  it("approving assigns the requester and declines the night's other open requests", () => {
    const plan = planRequestDecision({
      decider: owner,
      request: request(),
      session: night,
      otherRequests: others,
      approve: true,
      today,
      nowIso: "2026-10-05T12:00:00Z",
    });
    expect(plan.newReaderId).toBe("nana");
    expect(plan.changes).toEqual([
      {
        id: "req",
        status: "approved",
        decidedAt: "2026-10-05T12:00:00Z",
        decidedByMemberId: "alex",
      },
      {
        id: "aunt",
        status: "declined",
        decidedAt: "2026-10-05T12:00:00Z",
        decidedByMemberId: "alex",
      },
    ]);
  });

  it("declining closes only that request", () => {
    const plan = planRequestDecision({
      decider: owner,
      request: request(),
      session: night,
      otherRequests: others,
      approve: false,
      today,
    });
    expect(plan.newReaderId).toBeNull();
    expect(plan.changes.map((c) => [c.id, c.status])).toEqual([["req", "declined"]]);
  });

  it("only owners decide, and only open requests on open nights", () => {
    const base = {
      request: request(),
      session: night,
      otherRequests: [],
      approve: true,
      today,
    };
    expect(() => planRequestDecision({ ...base, decider: nana })).toThrow(/Only parents/);
    expect(() =>
      planRequestDecision({
        ...base,
        decider: owner,
        request: request({ status: "withdrawn" }),
      }),
    ).toThrow(/already closed/);
    expect(() =>
      planRequestDecision({
        ...base,
        decider: owner,
        session: { ...night, scheduledFor: "2026-10-01T19:30:00" },
      }),
    ).toThrow(/expired/);
    expect(() =>
      planRequestDecision({
        ...base,
        decider: { ...owner, familyId: "other" },
      }),
    ).toThrow(/not found/);
  });
});

describe("withdraw", () => {
  it("lets only the requester withdraw an open request", () => {
    expect(
      planWithdraw({ member: nana, request: request(), nowIso: "now" }),
    ).toEqual({ id: "req", status: "withdrawn", decidedAt: "now", decidedByMemberId: null });
    expect(() =>
      planWithdraw({ member: { id: "aunt", familyId: "fam" }, request: request() }),
    ).toThrow(/not found/);
    expect(() =>
      planWithdraw({ member: nana, request: request({ status: "approved" }) }),
    ).toThrow(/already closed/);
  });

  it("labels each status for the requester", () => {
    expect(readerRequestStatusLabel("pending")).toBe("Requested · waiting for a parent");
    expect(readerRequestStatusLabel("declined")).toBe("Request declined");
  });
});
