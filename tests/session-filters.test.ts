import { afterEach, beforeEach, expect, it, vi } from "vitest";
import * as store from "@/lib/demo/store";
import {
  filterSessionsForList,
  sessionFilterParam,
  sessionListFilter,
} from "@/lib/domain/session-presentation";
import type { ReadingSession, SessionStatus } from "@/lib/types";

const TODAY = "2026-10-04";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-05T02:00:00Z"));
  store.resetDemoStore();
});
afterEach(() => vi.useRealTimers());

/** 30 nights from Sep 20 to Oct 19 with a mix of statuses, including an unlogged past night. */
function seedNights() {
  const state = store.getDemoState();
  const template = { ...state.sessions[0] };
  state.sessions = Array.from({ length: 30 }, (_, i): ReadingSession => {
    const day = new Date(Date.UTC(2026, 8, 20 + i)).toISOString().slice(0, 10);
    const past = day < TODAY;
    const status: SessionStatus =
      i % 7 === 3
        ? "cancelled"
        : past
          ? i === 5
            ? "scheduled"
            : "completed"
          : "scheduled";
    return {
      ...template,
      id: `n-${String(i).padStart(2, "0")}`,
      status,
      scheduledFor: `${day}T19:30:00`,
    };
  });
  return state.sessions;
}

const days = (items: ReadingSession[]) => items.map((s) => s.scheduledFor.slice(0, 10));

it("parses status params, accepting both spellings and the legacy value", () => {
  expect(sessionListFilter(undefined)).toBe("upcoming");
  expect(sessionListFilter("bogus")).toBe("upcoming");
  expect(sessionListFilter(["completed", "scheduled"])).toBe("upcoming");
  expect(sessionListFilter("all")).toBe("all");
  expect(sessionListFilter("scheduled")).toBe("upcoming");
  expect(sessionListFilter("upcoming")).toBe("upcoming");
  expect(sessionListFilter("cancelled")).toBe("canceled");
  expect(sessionListFilter("canceled")).toBe("canceled");
  expect(sessionListFilter("completed")).toBe("completed");
  expect(sessionFilterParam("upcoming")).toBeUndefined();
  expect(sessionFilterParam("all")).toBe("all");
  expect(sessionFilterParam("canceled")).toBe("canceled");
});

it("reproduces the old bug: scheduled page 1 skipped the next nights", () => {
  // Before the fix the list was sorted newest-first, so "Scheduled" page 1 showed the
  // furthest-out nights and the next few nights were pushed to the last page.
  seedNights();
  const page = store.getFamilySessionPage("1", "upcoming", TODAY);
  expect(days(page.items)[0]).toBe(TODAY);
});

it("lists upcoming scheduled nights soonest first and excludes past unlogged nights", () => {
  const sessions = seedNights();
  const page1 = store.getFamilySessionPage("1", "upcoming", TODAY);
  const page2 = store.getFamilySessionPage("2", "upcoming", TODAY);
  const expected = sessions
    .filter((s) => s.status === "scheduled" && s.scheduledFor.slice(0, 10) >= TODAY)
    .map((s) => s.scheduledFor.slice(0, 10))
    .sort();
  expect(page1.total).toBe(expected.length);
  expect([...days(page1.items), ...days(page2.items)]).toEqual(expected);
  expect(page1.items).toHaveLength(10);
  expect(page1.items.every((s) => s.status === "scheduled")).toBe(true);
  expect(days(page1.items)).not.toContain("2026-09-25"); // the unlogged past night
});

it("lists completed and canceled nights most recent first", () => {
  const sessions = seedNights();
  for (const [filter, status] of [
    ["completed", "completed"],
    ["canceled", "cancelled"],
  ] as const) {
    const page = store.getFamilySessionPage("1", filter, TODAY);
    const expected = sessions
      .filter((s) => s.status === status)
      .map((s) => s.scheduledFor.slice(0, 10))
      .sort()
      .reverse()
      .slice(0, 10);
    expect(page.items.every((s) => s.status === status)).toBe(true);
    expect(days(page.items)).toEqual(expected);
  }
});

it("lists all nights as upcoming first, then everything else newest first", () => {
  const sessions = seedNights();
  const pages = [1, 2, 3].map((n) => store.getFamilySessionPage(String(n), "all", TODAY));
  const ids = pages.flatMap((p) => p.items.map((s) => s.id));
  expect(new Set(ids).size).toBe(30);
  const { items } = filterSessionsForList(sessions, "all", TODAY);
  expect(ids).toEqual(items.map((s) => s.id));
  const upcomingCount = pages[0].counts.upcoming;
  const upcoming = days(items.slice(0, upcomingCount));
  const rest = days(items.slice(upcomingCount));
  expect(upcoming).toEqual([...upcoming].sort());
  expect(rest).toEqual([...rest].sort().reverse());
  expect(upcoming[0]).toBe(TODAY);
});

it("returns per-filter counts and clamps out-of-range pages", () => {
  const sessions = seedNights();
  const page = store.getFamilySessionPage("99", "canceled", TODAY);
  const canceled = sessions.filter((s) => s.status === "cancelled").length;
  expect(page).toMatchObject({ page: 1, pageCount: 1, total: canceled });
  expect(page.counts).toEqual({
    all: 30,
    upcoming: sessions.filter((s) => s.status === "scheduled" && s.scheduledFor >= TODAY)
      .length,
    completed: sessions.filter((s) => s.status === "completed").length,
    canceled,
  });
  expect(
    page.assignments.every((a) => page.items.some((s) => s.id === a.sessionId)),
  ).toBe(true);
});
