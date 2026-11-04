import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import * as store from "@/lib/demo/store";
vi.mock("@/app/actions", () => ({
  saveScheduleAction: vi.fn(),
  deleteScheduleAction: vi.fn(),
  addKidAction: vi.fn(),
  createInviteAction: vi.fn(),
  updateMemberAction: vi.fn(),
  updateKidAction: vi.fn(),
  deleteKidAction: vi.fn(),
  addRandomBooksToUpcomingAction: vi.fn(),
  shuffleUpcomingBooksAction: vi.fn(),
  cascadeInsertAction: vi.fn(),
  swapSessionsAction: vi.fn(),
  requestToReadAction: vi.fn(),
  withdrawReaderRequestAction: vi.fn(),
  decideReaderRequestAction: vi.fn(),
  logoutAction: vi.fn(),
}));
vi.mock("@/components/app-nav", () => ({ AppNav: () => null }));
vi.mock("@/components/site-nav", () => ({ SiteNav: () => null }));
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
import FamilyPage from "@/app/family/page";
beforeEach(() => store.resetDemoStore());
it("offers parent schedule editing and deletion", async () => {
  const html = renderToStaticMarkup(
    await SchedulePage({ searchParams: Promise.resolve({}) }),
  );
  expect(html).toContain("Edit rotation");
  expect(html).toContain("Delete schedule");
  expect(html).not.toContain("Choose your timezone");
  expect(html).not.toContain("Search city or region");
  expect(html).toContain('name="timezone"');
});
it("offers parent invitations, reader editing, and child editing/removal", async () => {
  const html = renderToStaticMarkup(
    await FamilyPage({ searchParams: Promise.resolve({}) }),
  );
  expect(html).toContain("Parent (you)");
  expect(html).not.toContain('aria-label="Access for Alex"');
  expect(html).toContain('aria-label="Access for Jordan"');
  expect(html).toContain("Save reader");
  expect(html).not.toContain("Save relation");
  expect(html).toContain('aria-label="Remove child Leo"');
});
it("hides management forms from readers", async () => {
  store.demoLogin("jordan@example.com");
  const family = renderToStaticMarkup(
    await FamilyPage({ searchParams: Promise.resolve({}) }),
  );
  const schedule = renderToStaticMarkup(
    await SchedulePage({ searchParams: Promise.resolve({}) }),
  );
  expect(family).not.toContain("Save reader");
  expect(family).not.toContain("Remove child");
  expect(family).not.toContain('name="relationToChildren"');
  expect(schedule).not.toContain("Delete schedule");
});

it("keeps invite-link sharing and membership notices alongside parent management", async () => {
  const html = renderToStaticMarkup(
    await FamilyPage({ searchParams: Promise.resolve({ invite: "already-member" }) }),
  );
  expect(html).toContain("You already belong to a family.");
  expect(html).toContain("Copy invite link");
  expect(html).toContain("Save reader");
});
