import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import * as store from "@/lib/demo/store";
vi.mock("@/app/actions", () => ({
  saveScheduleAction: vi.fn(),
  deleteScheduleAction: vi.fn(),
  addRandomBooksToUpcomingAction: vi.fn(),
  shuffleUpcomingBooksAction: vi.fn(),
  cascadeInsertAction: vi.fn(),
  swapSessionsAction: vi.fn(),
}));
vi.mock("@/components/app-nav", () => ({ AppNav: () => null }));
vi.mock("@/lib/data", () => ({
  getCurrentUser: store.getCurrentUser,
  getCurrentMember: store.getCurrentMember,
  getFamilyAdmin: store.getFamilyAdmin,
  getFamilySessionPage: store.getFamilySessionPage,
  getUpcomingBookCtaState: store.getUpcomingBookCtaState,
  listFamilyAssignments: store.listFamilyAssignments,
  listFamilySessions: store.listFamilySessions,
  getHomeContext: store.getHomeContext,
}));
import SchedulePage from "@/app/schedule/page";
import HomePage from "@/app/page";
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-05T02:00:00Z"));
  store.resetDemoStore();
});
afterEach(() => vi.useRealTimers());
it("renders no more than ten sessions and links to later pages", async () => {
  const first = renderToStaticMarkup(
    await SchedulePage({ searchParams: Promise.resolve({ status: "all", page: "1" }) }),
  );
  const second = renderToStaticMarkup(
    await SchedulePage({ searchParams: Promise.resolve({ status: "all", page: "2" }) }),
  );
  expect((first.match(/href="\/sessions\//g) ?? []).length).toBe(10);
  expect((second.match(/href="\/sessions\//g) ?? []).length).toBe(10);
  expect(first).toContain("/schedule?page=2");
  expect(second).toContain("/schedule?page=1");
  // "All" lists upcoming nights soonest first, so the next night leads page 1.
  const tonight = store
    .listFamilySessions()
    .find((s) => s.scheduledFor.startsWith("2026-10-05"))!;
  const firstLink = first.match(/href="\/sessions\/([^"]+)"/)?.[1];
  expect(firstLink).toBe(tonight.id);
  expect(second).not.toContain(`/sessions/${tonight.id}"`);
});
it("shows Tonight on home using local midnight and Tomorrow for the next calendar night", async () => {
  const state = store.getDemoState();
  const schedule = state.schedules[0];
  schedule.timezone = "America/Chicago";
  const today = state.sessions.find((s) => s.status === "scheduled")!;
  state.sessions = [today];
  today.scheduledFor = "2026-10-04T19:30:00";
  state.assignments = [
    {
      id: "a",
      sessionId: today.id,
      memberId: "mem_alex",
      isCurrent: true,
      isOriginal: true,
      createdAt: "",
    },
  ];
  expect(renderToStaticMarkup(await HomePage())).toContain("Tonight at");
  today.scheduledFor = "2026-10-05T19:30:00";
  expect(renderToStaticMarkup(await HomePage())).toContain("Tomorrow at");
});

it("shows the final partial page and an empty list without invalid navigation", async () => {
  const last = renderToStaticMarkup(
    await SchedulePage({ searchParams: Promise.resolve({ status: "all", page: "99" }) }),
  );
  expect((last.match(/href="\/sessions\//g) ?? []).length).toBe(5);
  expect(last).toContain("Page 3 of 3");
  expect(last).not.toContain("/schedule?page=4");
  store.getDemoState().sessions = [];
  const empty = renderToStaticMarkup(
    await SchedulePage({ searchParams: Promise.resolve({ status: "all" }) }),
  );
  expect(empty).toContain("No reading nights yet.");
  expect(empty).not.toContain('aria-label="Session pages"');
});

it("can reach sessions after the thousandth row through the schedule page", async () => {
  const state = store.getDemoState();
  const template = { ...state.sessions[0] };
  state.sessions = Array.from({ length: 1005 }, (_, i) => ({
    ...template,
    id: `night-${i}`,
    scheduledFor: new Date(Date.UTC(2026, 0, 1) + i * 86400000).toISOString(),
  }));
  state.assignments = [
    {
      id: "oldest",
      sessionId: "night-0",
      memberId: "mem_jordan",
      isCurrent: true,
      isOriginal: true,
      createdAt: "",
    },
  ];
  const html = renderToStaticMarkup(
    await SchedulePage({ searchParams: Promise.resolve({ status: "all", page: "101" }) }),
  );
  expect(html).toContain("Page 101 of 101");
  expect(html).toContain("1005 nights");
  expect(html).toContain("/sessions/night-0");
  expect(html).toContain("Jordan");
  expect((html.match(/href="\/sessions\//g) ?? []).length).toBe(5);
});
it("generates tonight before rendering its local-date label", async () => {
  const state = store.getDemoState();
  state.sessions = [];
  state.assignments = [];
  Object.assign(state.schedules[0], {
    timezone: "America/Chicago",
    startDate: "2026-10-04",
    readerRotationMemberIds: ["mem_alex"],
  });
  store.ensureUpcomingSessions(1);
  expect(renderToStaticMarkup(await HomePage())).toContain("Tonight at");
});

it("renders numbered links, ellipses, and exactly one current page", async () => {
  const state = store.getDemoState();
  const template = { ...state.sessions[0] };
  state.sessions = Array.from({ length: 1005 }, (_, i) => ({
    ...template,
    id: `pagination-${i}`,
    scheduledFor: new Date(Date.UTC(2026, 0, 1) + i * 86400000).toISOString(),
  }));
  const html = renderToStaticMarkup(
    await SchedulePage({ searchParams: Promise.resolve({ status: "all", page: "50" }) }),
  );
  const nav = html.match(/<nav aria-label="Session pages"[\s\S]*?<\/nav>/)?.[0];
  expect(nav).toBeDefined();
  const links = [...nav!.matchAll(/<a\b([^>]*)>(\d+)<\/a>/g)];
  expect(links.map((match) => Number(match[2]))).toEqual([1, 49, 50, 51, 101]);
  for (const [, attributes, label] of links) {
    expect(attributes).toContain(`href="/schedule?page=${label}&amp;status=all"`);
    expect(attributes).toContain(`aria-label="Page ${label}"`);
    expect(attributes.includes('aria-current="page"')).toBe(label === "50");
  }
  expect((nav!.match(/aria-current="page"/g) ?? []).length).toBe(1);
  expect((nav!.match(/aria-hidden="true">…<\/span>/g) ?? []).length).toBe(2);
  expect(nav).not.toContain("Previous");
  expect(nav).not.toContain(">Next<");
});

it("filters before pagination and preserves status in page links", async () => {
  const state = store.getDemoState();
  const template = { ...state.sessions[0] };
  state.sessions = Array.from({ length: 35 }, (_, i) => ({
    ...template,
    id: `filtered-${i}`,
    status: i % 2 === 0 ? "completed" : "scheduled",
    scheduledFor: new Date(Date.UTC(2026, 0, 1) + i * 86400000).toISOString(),
  }));
  const html = renderToStaticMarkup(
    await SchedulePage({
      searchParams: Promise.resolve({ status: "completed", page: "2" }),
    }),
  );
  expect(html).toContain("Page 2 of 2");
  expect(html).toContain("18 nights");
  expect(html).toContain("/schedule?page=1&amp;status=completed");
  expect((html.match(/href="\/sessions\//g) ?? []).length).toBe(8);
  expect(html).toContain("/sessions/filtered-0");
  expect(html).not.toContain('/sessions/filtered-1"');
  expect(html).toMatch(
    /aria-current="page" href="\/schedule\?status=completed">Completed/,
  );
});

it("shows filtered empty states and ignores invalid status values", async () => {
  store.getDemoState().sessions = [];
  const empty = renderToStaticMarkup(
    await SchedulePage({ searchParams: Promise.resolve({ status: "cancelled" }) }),
  );
  expect(empty).toContain("No canceled nights.");
  expect(empty).not.toContain('aria-label="Session pages"');
  store.resetDemoStore();
  // No, unknown or repeated status values fall back to the default: coming up.
  for (const status of [undefined, "unknown", ["scheduled", "completed"]]) {
    const html = renderToStaticMarkup(
      await SchedulePage({ searchParams: Promise.resolve({ status }) }),
    );
    expect(html).toContain("15 nights");
    expect(html).toMatch(/aria-current="page" href="\/schedule">Coming up/);
  }
});

it("renders filter pills with counts that link back to page 1", async () => {
  const html = renderToStaticMarkup(
    await SchedulePage({
      searchParams: Promise.resolve({ status: "scheduled", page: "2" }),
    }),
  );
  expect(html).toContain("Reading nights");
  expect(html).not.toContain("Upcoming &amp; recent");
  expect(html).not.toContain('id="session-status"');
  const pills = html.match(/<nav aria-label="Filter reading nights"[\s\S]*?<\/nav>/)?.[0];
  expect(pills).toBeDefined();
  const links = [
    ...pills!.matchAll(/<a ([^>]*)>([A-Za-z ]+)<span[^>]*>(\d+)<\/span><\/a>/g),
  ];
  expect(links.map((m) => [m[2], Number(m[3])])).toEqual([
    ["Coming up", 15],
    ["Completed", 10],
    ["Canceled", 0],
    ["All", 25],
  ]);
  for (const [, attributes] of links) expect(attributes).not.toContain("page=");
  expect((pills!.match(/aria-current="page"/g) ?? []).length).toBe(1);
  expect(pills).toMatch(/aria-current="page" href="\/schedule">Coming up/);
  expect(pills).toContain('href="/schedule?status=all"');
});

it("uses chips for readers and random books and labels the save button", async () => {
  const html = renderToStaticMarkup(
    await SchedulePage({ searchParams: Promise.resolve({}) }),
  );
  expect(html).toContain(">Save schedule</button>");
  expect(html).not.toContain("generate nights");
  expect(
    (
      html.match(/data-variant="chip"[^>]*><input type="checkbox"[^>]*name="readers"/g) ??
      []
    ).length,
  ).toBe(store.getFamilyAdmin()!.readers.length);
  expect(html).toMatch(
    /data-variant="row"[^>]*><input type="checkbox"[^>]*name="assignRandomBooks"/,
  );
});
