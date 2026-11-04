import { beforeEach, expect, it, vi } from "vitest";
import * as store from "@/lib/demo/store";
import { renderToStaticMarkup } from "react-dom/server";
vi.mock("@/app/actions", () => ({
  saveScheduleAction: vi.fn(),
  deleteScheduleAction: vi.fn(),
  addRandomBooksToUpcomingAction: vi.fn(),
  shuffleUpcomingBooksAction: vi.fn(),
  cascadeInsertAction: vi.fn(),
  swapSessionsAction: vi.fn(),
  requestToReadAction: vi.fn(),
  withdrawReaderRequestAction: vi.fn(),
  decideReaderRequestAction: vi.fn(),
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
  listReaderRequests: store.listReaderRequests,
}));
import SchedulePage from "@/app/schedule/page";
beforeEach(() => store.resetDemoStore());
it("explains mixed logging instead of forcing one timing choice", async () => {
  const html = renderToStaticMarkup(
    await SchedulePage({ searchParams: Promise.resolve({}) }),
  );
  expect(html).not.toContain('name="bookTiming"');
  // The explanation now lives in an info tooltip next to the random-books option.
  expect(html).toContain('aria-label="How book assignments work"');
  expect(html).not.toContain("Bedtime uses your device");
});
it("keeps planned books while adding library and freeform books after reading", async () => {
  const session = store.getHomeContext().nextSession!;
  await store.updateSession({
    sessionId: session.id,
    memberIds: ["mem_alex"],
    bookIds: ["book_moon"],
    freeformTitles: ["Planned story"],
    notes: null,
    status: "scheduled",
  });
  expect(store.getSessionDetail(session.id)?.books).toHaveLength(2);
  await store.updateSession({
    sessionId: session.id,
    memberIds: ["mem_alex"],
    bookIds: ["book_moon"],
    freeformTitles: ["Planned story", "One more story"],
    notes: null,
    status: "completed",
  });
  expect(
    store.getSessionDetail(session.id)?.books.map((b) => b.titleFreeform ?? b.bookId),
  ).toEqual(["book_moon", "Planned story", "One more story"]);
});
