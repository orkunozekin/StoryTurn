// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import * as store from "@/lib/demo/store";
import SessionPage from "@/app/(app)/sessions/[id]/page";
import SchedulePage from "@/app/(app)/schedule/page";

vi.mock("@/components/app-nav", () => ({ AppNav: () => null }));
vi.mock("@/components/site-nav", () => ({ SiteNav: () => null }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn(), unstable_rethrow: vi.fn() }));
vi.mock("@/lib/session-mail", () => ({
  sendSessionInviteEmail: vi.fn(async () => null),
}));

/** A future night Jordan reads, so Nana can ask for it. */
function jordanNight() {
  const state = store.getDemoState();
  const today = new Date().toISOString().slice(0, 10);
  return state.sessions
    .filter((s) => s.status === "scheduled" && s.scheduledFor.slice(0, 10) > today)
    .sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor))
    .find((s) =>
      state.assignments.some(
        (a) => a.sessionId === s.id && a.isCurrent && a.memberId === "mem_jordan",
      ),
    )!;
}
const sessionPage = async (id: string) =>
  SessionPage({ params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.stubEnv("FORCE_DEMO_MODE", "1");
  store.resetDemoStore();
});
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

it("lets a relative ask for a night with a note, then shows the pending state and withdraw", async () => {
  const night = jordanNight();
  store.setDemoSessionUserId("user_nana");
  render(await sessionPage(night.id));
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Note (optional)"), "I'm in town");
  await user.click(screen.getByRole("button", { name: "Ask to read this night" }));
  await waitFor(() =>
    expect(store.listReaderRequests(night.id)[0]).toMatchObject({
      memberId: "mem_nana",
      note: "I'm in town",
      status: "pending",
    }),
  );
  cleanup();

  render(await sessionPage(night.id));
  expect(screen.getByText("Requested · waiting for a parent")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Ask to read this night" })).toBeNull();
  await user.click(screen.getByRole("button", { name: "Withdraw" }));
  await waitFor(() =>
    expect(store.listReaderRequests(night.id)[0].status).toBe("withdrawn"),
  );
});

it("hides the ask action from the night's reader and on past nights", async () => {
  const night = jordanNight();
  store.setDemoSessionUserId("user_jordan");
  expect(renderToStaticMarkup(await sessionPage(night.id))).not.toContain(
    "Ask to read this night",
  );
  store.setDemoSessionUserId("user_nana");
  const past = store.getDemoState().sessions.find((s) => s.status === "completed")!;
  expect(renderToStaticMarkup(await sessionPage(past.id))).not.toContain(
    "Ask to read this night",
  );
});

it("shows parents the pending request on the night and approves it", async () => {
  const night = jordanNight();
  store.setDemoSessionUserId("user_nana");
  store.requestToReadNight(night.id, "Can I take it?");
  store.setDemoSessionUserId("user_alex");
  render(await sessionPage(night.id));
  const requests = screen.getByRole("region", { name: /Requests for this night/ });
  expect(within(requests).getByText(/Nana/)).toBeTruthy();
  expect(within(requests).getByText("“Can I take it?”")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Ask to read this night" })).toBeNull();
  const user = userEvent.setup();
  await user.click(within(requests).getByRole("button", { name: /^Approve Nana/ }));
  await waitFor(() =>
    expect(
      store
        .getDemoState()
        .assignments.filter((a) => a.sessionId === night.id && a.isCurrent)
        .map((a) => a.memberId),
    ).toEqual(["mem_nana"]),
  );
  expect(store.listReaderRequests(night.id)[0].status).toBe("approved");
});

it("puts pending requests at the top of the schedule for parents with approve and decline", async () => {
  // The schedule lists upcoming nights first, earliest first.
  const night = jordanNight();
  store.setDemoSessionUserId("user_nana");
  store.requestToReadNight(night.id);
  const readerView = renderToStaticMarkup(
    await SchedulePage({ searchParams: Promise.resolve({}) }),
  );
  expect(readerView).toContain("Requested · waiting for a parent");
  expect(readerView).toContain("Ask to read");
  expect(readerView).not.toContain("Requests to read");

  store.setDemoSessionUserId("user_alex");
  const ownerView = renderToStaticMarkup(
    await SchedulePage({ searchParams: Promise.resolve({}) }),
  );
  expect(ownerView).toContain("Requests to read");
  expect(ownerView).toContain(`href="/sessions/${night.id}"`);
  expect(ownerView).toMatch(/aria-label="Approve Nana for [^"]+"/);
  expect(ownerView).toMatch(/aria-label="Decline Nana for [^"]+"/);
  expect(ownerView.indexOf("Requests to read")).toBeLessThan(
    ownerView.indexOf("Edit rotation"),
  );
});
