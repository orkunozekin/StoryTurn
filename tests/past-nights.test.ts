import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as store from "@/lib/demo/store";
import { sessionStatusOptions } from "@/lib/domain/session-presentation";
import {
  assertTransition,
  effectiveStatus,
  isPastNight,
  isUpcomingNight,
} from "@/lib/domain/sessions";
import { computeDashboardStats } from "@/lib/domain/stats";
import type { ReadingSession, SessionStatus } from "@/lib/types";

const TODAY = "2026-10-04";
const night = (status: SessionStatus, day: string) => ({
  status,
  scheduledFor: `${day}T19:30:00`,
});

describe("effectiveStatus", () => {
  it("treats a scheduled night before today as completed", () => {
    expect(effectiveStatus(night("scheduled", "2026-10-03"), TODAY)).toBe("completed");
  });
  it("keeps tonight and later nights scheduled", () => {
    expect(effectiveStatus(night("scheduled", TODAY), TODAY)).toBe("scheduled");
    expect(effectiveStatus(night("scheduled", "2026-10-09"), TODAY)).toBe("scheduled");
  });
  it("keeps stored completed and cancelled statuses", () => {
    expect(effectiveStatus(night("cancelled", "2026-10-01"), TODAY)).toBe("cancelled");
    expect(effectiveStatus(night("cancelled", "2026-10-09"), TODAY)).toBe("cancelled");
    expect(effectiveStatus(night("completed", "2026-10-09"), TODAY)).toBe("completed");
  });
  it("classifies past and upcoming nights", () => {
    expect(isUpcomingNight(night("scheduled", TODAY), TODAY)).toBe(true);
    expect(isPastNight(night("scheduled", TODAY), TODAY)).toBe(false);
    expect(isPastNight(night("scheduled", "2026-10-03"), TODAY)).toBe(true);
    expect(isPastNight(night("completed", "2026-10-09"), TODAY)).toBe(true);
    expect(isPastNight(night("cancelled", "2026-10-03"), TODAY)).toBe(false);
    expect(isUpcomingNight(night("cancelled", "2026-10-09"), TODAY)).toBe(false);
  });
});

describe("sessionStatusOptions", () => {
  const values = (status: SessionStatus, day: string) =>
    sessionStatusOptions(night(status, day), TODAY).map((o) => [o.value, o.label]);
  it("offers coming up or canceled for tonight and later", () => {
    expect(values("scheduled", TODAY)).toEqual([
      ["scheduled", "Coming up"],
      ["cancelled", "Canceled"],
    ]);
    expect(values("cancelled", "2026-10-09")[0]).toEqual(["scheduled", "Coming up"]);
  });
  it("offers past or canceled for past nights, and reopens a canceled past night as past", () => {
    for (const status of ["scheduled", "completed", "cancelled"] as const) {
      expect(values(status, "2026-10-01")).toEqual([
        ["completed", "Past"],
        ["cancelled", "Canceled"],
      ]);
    }
    expect(values("completed", "2026-10-09")[0]).toEqual(["completed", "Past"]);
  });
  it("never offers a transition assertTransition rejects", () => {
    for (const status of ["scheduled", "completed", "cancelled"] as const) {
      for (const day of ["2026-10-01", TODAY, "2026-10-09"]) {
        for (const option of sessionStatusOptions(night(status, day), TODAY)) {
          expect(() => assertTransition(status, option.value)).not.toThrow();
        }
      }
    }
  });
});

describe("computeDashboardStats", () => {
  const session = (id: string, status: SessionStatus, day: string): ReadingSession => ({
    id,
    familyId: "f",
    scheduleId: null,
    ...night(status, day),
    notes: null,
    icsUid: id,
    createdAt: "",
    updatedAt: "",
  });
  it("counts past unlogged nights as read but not tonight or cancelled nights", () => {
    const sessions = [
      session("logged", "completed", "2026-10-01"),
      session("unlogged", "scheduled", "2026-10-02"),
      session("canceled", "cancelled", "2026-10-03"),
      session("tonight", "scheduled", TODAY),
    ];
    const stats = computeDashboardStats({
      sessions,
      assignments: [],
      sessionBooks: sessions.map((s) => ({
        id: s.id,
        sessionId: s.id,
        bookId: null,
        titleFreeform: `Book ${s.id}`,
        createdAt: "",
      })),
      books: [],
      filter: { type: "family" },
      nowIso: `${TODAY}T12:00:00.000Z`,
    });
    expect(stats.sessionsCompleted).toBe(2);
    expect(stats.allTime.map((b) => b.title).sort()).toEqual([
      "Book logged",
      "Book unlogged",
    ]);
  });
});

describe("demo completePastSessions", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // 02:00Z on Oct 5 is still Oct 4 in the demo family's Los Angeles timezone.
    vi.setSystemTime(new Date("2026-10-05T02:00:00Z"));
    store.resetDemoStore();
  });
  afterEach(() => vi.useRealTimers());

  it("completes past scheduled nights only, without emails or corrections", () => {
    const state = store.getDemoState();
    const template = { ...state.sessions[0] };
    const familyId = template.familyId;
    state.sessions = [
      {
        ...template,
        id: "past",
        status: "scheduled",
        scheduledFor: "2026-10-03T19:30:00",
      },
      {
        ...template,
        id: "tonight",
        status: "scheduled",
        scheduledFor: `${TODAY}T19:30:00`,
      },
      {
        ...template,
        id: "future",
        status: "scheduled",
        scheduledFor: "2026-10-08T19:30:00",
      },
      {
        ...template,
        id: "canceled",
        status: "cancelled",
        scheduledFor: "2026-10-01T19:30:00",
      },
      {
        ...template,
        id: "other",
        familyId: `${familyId}-other`,
        status: "scheduled",
        scheduledFor: "2026-10-01T19:30:00",
      },
    ];
    const emails = state.outboundEmails.length;
    const corrections = state.corrections.length;
    expect(store.completePastSessions()).toBe(1);
    expect(Object.fromEntries(state.sessions.map((s) => [s.id, s.status]))).toEqual({
      past: "completed",
      tonight: "scheduled",
      future: "scheduled",
      canceled: "cancelled",
      other: "scheduled",
    });
    expect(state.outboundEmails.length).toBe(emails);
    expect(state.corrections.length).toBe(corrections);
    expect(store.completePastSessions()).toBe(0);
  });
});
