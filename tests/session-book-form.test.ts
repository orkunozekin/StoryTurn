// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import * as store from "@/lib/demo/store";
import SessionPage from "@/app/(app)/sessions/[id]/page";
vi.mock("@/components/app-nav", () => ({ AppNav: () => null }));
vi.mock("@/components/site-nav", () => ({ SiteNav: () => null }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/session-mail", () => ({
  sendSessionInviteEmail: vi.fn(async () => null),
}));
beforeEach(() => {
  vi.stubEnv("FORCE_DEMO_MODE", "1");
  store.resetDemoStore();
});
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});
it("submits retained planned books through the actual session form and server action", async () => {
  const night = store.getHomeContext().nextSession!;
  await store.updateSession({
    sessionId: night.id,
    memberIds: ["mem_alex"],
    bookIds: ["book_moon"],
    freeformTitles: ["Planned story"],
    notes: null,
    status: "scheduled",
  });
  render(await SessionPage({ params: Promise.resolve({ id: night.id }) }));
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Add books from library" }));
  expect(
    (
      (await screen.findByRole("button", {
        name: /^Goodnight Moon$/,
      })) as HTMLInputElement
    ).getAttribute("aria-pressed"),
  ).toBe("true");
  await user.click(
    await screen.findByRole("button", {
      name: /^The Very Hungry Caterpillar$/,
    }),
  );
  await user.click(screen.getByRole("button", { name: /Done ·/ }));
  await user.type(
    screen.getByLabelText("Other book titles (one per line)"),
    "\nOne more story",
  );
  // A coming-up night can't be marked past by hand any more; it stays coming up.
  await user.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() =>
    expect(
      store.getSessionDetail(night.id)?.books.map((b) => b.titleFreeform ?? b.bookId),
    ).toEqual(["book_moon", "book_hungry", "Planned story", "One more story"]),
  );
  expect(store.getSessionDetail(night.id)?.session.status).toBe("scheduled");
});

it("removes an initially selected book when saved with the modal closed", async () => {
  const night = store.getHomeContext().nextSession!;
  await store.updateSession({
    sessionId: night.id,
    memberIds: ["mem_alex"],
    bookIds: ["book_moon", "book_hungry"],
    freeformTitles: ["Planned story"],
    notes: null,
    status: "scheduled",
  });
  const view = render(await SessionPage({ params: Promise.resolve({ id: night.id }) }));
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Add books from library" }));
  const moon = (await screen.findByRole("button", {
    name: /^Goodnight Moon$/,
  })) as HTMLInputElement;
  expect(moon.getAttribute("aria-pressed")).toBe("true");
  await user.click(moon);
  expect(moon.getAttribute("aria-pressed")).toBe("false");
  await user.click(screen.getByRole("button", { name: /Done ·/ }));
  expect(screen.queryByRole("dialog")).toBeNull();
  await user.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() =>
    expect(
      store.getSessionDetail(night.id)?.books.map((b) => b.titleFreeform ?? b.bookId),
    ).toEqual(["book_hungry", "Planned story"]),
  );

  view.unmount();
  render(await SessionPage({ params: Promise.resolve({ id: night.id }) }));
  await user.click(screen.getByRole("button", { name: "Add books from library" }));
  expect(
    (
      (await screen.findByRole("button", {
        name: /^Goodnight Moon$/,
      })) as HTMLInputElement
    ).getAttribute("aria-pressed"),
  ).toBe("false");
  expect(
    (
      screen.getByRole("button", {
        name: /^The Very Hungry Caterpillar$/,
      }) as HTMLInputElement
    ).getAttribute("aria-pressed"),
  ).toBe("true");
});

it("requires confirmation to cancel and reactivates without losing session details", async () => {
  const night = store.getHomeContext().nextSession!;
  await store.updateSession({
    sessionId: night.id,
    memberIds: ["mem_alex"],
    bookIds: ["book_moon"],
    freeformTitles: ["Story"],
    notes: "Keep this note",
    status: "scheduled",
  });
  const user = userEvent.setup();
  const view = render(await SessionPage({ params: Promise.resolve({ id: night.id }) }));
  await user.click(screen.getByRole("button", { name: "Cancel this reading session" }));
  expect(store.getSessionDetail(night.id)?.session.status).toBe("scheduled");
  await user.click(screen.getByRole("button", { name: "Go back" }));
  expect(store.getSessionDetail(night.id)?.session.status).toBe("scheduled");
  await user.click(screen.getByRole("button", { name: "Cancel this reading session" }));
  await user.click(screen.getByRole("button", { name: /^Cancel session$/ }));
  await waitFor(() =>
    expect(store.getSessionDetail(night.id)?.session.status).toBe("cancelled"),
  );
  view.unmount();
  render(await SessionPage({ params: Promise.resolve({ id: night.id }) }));
  await user.click(screen.getByRole("button", { name: "Reactivate session" }));
  expect(store.getSessionDetail(night.id)?.session.status).toBe("cancelled");
  await user.click(
    screen.getByRole("dialog").querySelector('button[data-slot="button"]')!,
  );
  expect(store.getSessionDetail(night.id)?.session.status).toBe("cancelled");
  await user.click(screen.getByRole("button", { name: "Reactivate session" }));
  await user.click(
    within(screen.getByRole("dialog")).getByRole("button", {
      name: "Reactivate session",
    }),
  );
  await waitFor(() =>
    expect(store.getSessionDetail(night.id)?.session.status).toBe("scheduled"),
  );
  const detail = store.getSessionDetail(night.id)!;
  expect(detail.session.notes).toBe("Keep this note");
  expect(detail.books.map((book) => book.bookId ?? book.titleFreeform)).toEqual([
    "book_moon",
    "Story",
  ]);
  expect(
    detail.assignments.filter((row) => row.isCurrent).map((row) => row.memberId),
  ).toEqual(["mem_alex"]);
});

it("confirms reactivation through the edit form status selector", async () => {
  const night = store.getHomeContext().nextSession!;
  await store.cancelSession(night.id);
  render(await SessionPage({ params: Promise.resolve({ id: night.id }) }));
  const user = userEvent.setup();
  await user.click(screen.getByLabelText("Status"));
  await user.click(await screen.findByRole("option", { name: "Coming up" }));
  await user.click(screen.getByRole("button", { name: "Save changes" }));
  expect(screen.getByRole("dialog")).toBeTruthy();
  expect(store.getSessionDetail(night.id)?.session.status).toBe("cancelled");
  await user.click(
    within(screen.getByRole("dialog")).getByRole("button", { name: "Go back" }),
  );
  expect(store.getSessionDetail(night.id)?.session.status).toBe("cancelled");
});

it("does not promise invitations when reopening a past session as completed", async () => {
  const night = store.getHomeContext().nextSession!;
  await store.cancelSession(night.id);
  store.getDemoState().sessions.find((session) => session.id === night.id)!.scheduledFor =
    "2020-01-01T19:30:00";
  render(await SessionPage({ params: Promise.resolve({ id: night.id }) }));
  const user = userEvent.setup();
  await user.click(screen.getByLabelText("Status"));
  await user.click(await screen.findByRole("option", { name: "Past" }));
  await user.type(screen.getByLabelText("Correction reason"), "Correcting the record");
  await user.click(screen.getByRole("button", { name: "Save changes" }));
  expect(screen.getByRole("dialog").textContent).toContain(
    "No calendar invitations will be sent for this past session.",
  );
});

it("offers Coming up / Canceled for a coming-up night", async () => {
  const night = store.getHomeContext().nextSession!;
  render(await SessionPage({ params: Promise.resolve({ id: night.id }) }));
  const user = userEvent.setup();
  await user.click(screen.getByLabelText("Status"));
  const options = (await screen.findAllByRole("option")).map((o) => o.textContent);
  expect(options).toEqual(["Coming up", "Canceled"]);
});

it("shows an unlogged past night as Past and offers Past / Canceled", async () => {
  const night = store.getHomeContext().nextSession!;
  store.getDemoState().sessions.find((session) => session.id === night.id)!.scheduledFor =
    "2020-01-01T19:30:00";
  render(await SessionPage({ params: Promise.resolve({ id: night.id }) }));
  expect(screen.getAllByText("Past").length).toBeGreaterThan(0);
  expect(screen.queryByText("Coming up")).toBeNull();
  const user = userEvent.setup();
  await user.click(screen.getByLabelText("Status"));
  const options = (await screen.findAllByRole("option")).map((o) => o.textContent);
  expect(options).toEqual(["Past", "Canceled"]);
});
