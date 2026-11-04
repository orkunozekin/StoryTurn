import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as store from "@/lib/demo/store";

vi.mock("@/lib/plunk", () => ({
  sendEmail: vi.fn(async () => ({ ok: true })),
}));

const tonight = "ses_2026-10-05";
const saturday = "ses_2026-10-10";

function as(userId: string) {
  store.setDemoSessionUserId(userId);
}
function currentReaders(sessionId: string) {
  return store
    .getDemoState()
    .assignments.filter((a) => a.sessionId === sessionId && a.isCurrent)
    .map((a) => a.memberId);
}

beforeEach(() => {
  vi.useFakeTimers();
  // 13:00 in Los Angeles on Monday Oct 5.
  vi.setSystemTime(new Date("2026-10-05T20:00:00Z"));
  store.resetDemoStore();
});
afterEach(() => vi.useRealTimers());

describe("demo reader requests", () => {
  it("lets Nana ask for a night with a note and shows it pending to the family", () => {
    as("user_nana");
    store.requestToReadNight(saturday, "  Can I take Saturday? I'm in town. ");
    const [request] = store.listReaderRequests(saturday);
    expect(request).toMatchObject({
      memberId: "mem_nana",
      note: "Can I take Saturday? I'm in town.",
      status: "pending",
      decidedAt: null,
    });
    as("user_alex");
    expect(store.listReaderRequests().map((r) => r.id)).toEqual([request.id]);
    expect(() => {
      as("user_nana");
      store.requestToReadNight(saturday);
    }).toThrow(/already asked/);
  });

  it("rejects requests from the current reader and on closed or past nights", () => {
    as("user_nana");
    const assigned = currentReaders(saturday)[0];
    const state = store.getDemoState();
    const reader = state.members.find((m) => m.id === assigned)!;
    as(reader.userId);
    expect(() => store.requestToReadNight(saturday)).toThrow(/already reading/);
    as("user_nana");
    expect(() => store.requestToReadNight("ses_2026-10-01")).toThrow();
    state.sessions.find((s) => s.id === "ses_2026-10-08")!.status = "cancelled";
    expect(() => store.requestToReadNight("ses_2026-10-08")).toThrow(/canceled/);
    expect(() => store.requestToReadNight("missing")).toThrow(/not found/);
  });

  it("approval assigns the reader, records a correction, invites and closes other requests", async () => {
    as("user_nana");
    store.requestToReadNight(saturday, "In town");
    const previous = currentReaders(saturday);
    // A second relative asks for the same night.
    const state = store.getDemoState();
    state.users.push({
      id: "user_aunt",
      email: "aunt@example.com",
      displayName: "Aunt Bea",
      passwordHash: "demo",
      createdAt: "",
    });
    state.members.push({
      id: "mem_aunt",
      familyId: "fam_demo",
      userId: "user_aunt",
      displayName: "Aunt Bea",
      email: "aunt@example.com",
      role: "reader",
      relationToChildren: "aunt_uncle",
      createdAt: "",
    });
    as("user_aunt");
    store.requestToReadNight(saturday);

    as("user_alex");
    const nanaRequest = store
      .listReaderRequests(saturday)
      .find((r) => r.memberId === "mem_nana")!;
    const emailsBefore = state.outboundEmails.length;
    await store.decideReaderRequest(nanaRequest.id, true);

    expect(currentReaders(saturday)).toEqual(["mem_nana"]);
    const statuses = Object.fromEntries(
      store.listReaderRequests(saturday).map((r) => [r.memberId, r.status]),
    );
    expect(statuses).toEqual({ mem_nana: "approved", mem_aunt: "declined" });
    expect(store.listReaderRequests(saturday)[0].decidedByMemberId).toBe("mem_alex");
    const correction = state.corrections.find((c) => c.sessionId === saturday)!;
    expect(correction).toMatchObject({
      correctedByMemberId: "mem_alex",
      reason: "Approved Nana's request to read: “In town”",
      before: { currentMemberIds: previous },
      after: { currentMemberIds: ["mem_nana"] },
    });
    const mails = state.outboundEmails.slice(emailsBefore);
    expect(mails.map((m) => [m.to, m.icsContent?.includes("METHOD:CANCEL")])).toEqual([
      [state.members.filter((m) => previous.includes(m.id)).map((m) => m.email), true],
      [["nana@example.com"], false],
    ]);
    // Original assignment stays in history.
    expect(
      state.assignments.some(
        (a) => a.sessionId === saturday && a.isOriginal && a.memberId === previous[0],
      ),
    ).toBe(true);
    await expect(store.decideReaderRequest(nanaRequest.id, false)).rejects.toThrow(
      /already closed/,
    );
  });

  it("decline closes the request without changing readers and only parents decide", async () => {
    as("user_nana");
    store.requestToReadNight(tonight);
    const [request] = store.listReaderRequests(tonight);
    const before = currentReaders(tonight);
    await expect(store.decideReaderRequest(request.id, true)).rejects.toThrow(
      /admins|parents/,
    );
    as("user_alex");
    await store.decideReaderRequest(request.id, false);
    expect(currentReaders(tonight)).toEqual(before);
    as("user_nana");
    expect(store.listReaderRequests(tonight)[0].status).toBe("declined");
    // Nana can ask again after a decline.
    vi.advanceTimersByTime(60_000);
    store.requestToReadNight(tonight);
    expect(store.listReaderRequests(tonight)[0].status).toBe("pending");
  });

  it("withdraw is limited to the requester and open requests", () => {
    as("user_nana");
    store.requestToReadNight(saturday);
    const [request] = store.listReaderRequests(saturday);
    as("user_alex");
    expect(() => store.withdrawReaderRequest(request.id)).toThrow(/not found/);
    as("user_nana");
    store.withdrawReaderRequest(request.id);
    expect(store.listReaderRequests(saturday)[0].status).toBe("withdrawn");
    expect(() => store.withdrawReaderRequest(request.id)).toThrow(/already closed/);
  });

  it("expires open requests once the night is canceled or has passed", async () => {
    as("user_nana");
    store.requestToReadNight(tonight);
    store.requestToReadNight(saturday);
    as("user_alex");
    await store.cancelSession(saturday);
    vi.setSystemTime(new Date("2026-10-07T20:00:00Z"));
    const statuses = Object.fromEntries(
      store.listReaderRequests().map((r) => [r.sessionId, r.status]),
    );
    expect(statuses).toEqual({ [tonight]: "expired", [saturday]: "expired" });
    const [stale] = store.listReaderRequests(tonight);
    await expect(store.decideReaderRequest(stale.id, true)).rejects.toThrow(
      /already closed/,
    );
  });
});
