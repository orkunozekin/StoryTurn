// @vitest-environment jsdom
import { createElement } from "react";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it } from "vitest";
import {
  ReadingNightsList,
  type ReadingNightRow,
} from "@/components/reading-nights-list";

afterEach(cleanup);
beforeEach(() => window.history.replaceState(null, "", "/schedule"));

const today = "2026-10-10";
const night = (
  id: string,
  day: string,
  status: ReadingNightRow["status"] = "scheduled",
): ReadingNightRow => ({
  id,
  status,
  scheduledFor: `${day}T19:30:00`,
  when: `Night ${id}`,
  badgeStatus: status,
  readers: "Alex",
});
const rows = [
  night("up-1", "2026-10-11"),
  night("up-2", "2026-10-12"),
  night("past-1", "2026-10-01", "completed"),
  night("gone-1", "2026-10-13", "cancelled"),
  // Twelve more past nights, so "Past" spans two pages.
  ...Array.from({ length: 12 }, (_, i) =>
    night(`old-${i}`, `2026-09-${String(i + 10).padStart(2, "0")}`, "completed"),
  ),
];
const nights = () =>
  screen
    .queryAllByRole("link")
    .map((link) => link.getAttribute("href"))
    .filter((href) => href?.startsWith("/sessions/"));
const filters = () => within(screen.getByRole("navigation", { name: /filter/i }));

it("switches filters in place and keeps the URL in step", () => {
  render(createElement(ReadingNightsList, { rows, today, initialFilter: "upcoming" }));
  expect(nights()).toEqual(["/sessions/up-1", "/sessions/up-2"]);

  fireEvent.click(filters().getByRole("link", { name: /Canceled/ }));
  expect(nights()).toEqual(["/sessions/gone-1"]);
  expect(filters().getByRole("link", { current: "page" }).textContent).toMatch(
    /^Canceled/,
  );
  expect(window.location.pathname + window.location.search).toBe(
    "/schedule?status=canceled",
  );
});

it("pages within a filter and restores the view on Back", () => {
  render(createElement(ReadingNightsList, { rows, today, initialFilter: "upcoming" }));
  fireEvent.click(filters().getByRole("link", { name: /Past/ }));
  expect(nights()).toHaveLength(10);
  expect(screen.getByText(/Page 1 of 2 · 13 past nights/)).toBeTruthy();

  fireEvent.click(screen.getByRole("link", { name: "Page 2" }));
  expect(nights()).toHaveLength(3);
  expect(window.location.search).toBe("?page=2&status=past");

  act(() => {
    window.history.replaceState(null, "", "/schedule");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  expect(nights()).toEqual(["/sessions/up-1", "/sessions/up-2"]);
});

it("leaves modified clicks to the browser", () => {
  render(createElement(ReadingNightsList, { rows, today, initialFilter: "upcoming" }));
  const all = filters().getByRole("link", { name: /All/ });
  all.addEventListener("click", (event) => event.preventDefault());
  fireEvent.click(all, { metaKey: true });
  expect(nights()).toEqual(["/sessions/up-1", "/sessions/up-2"]);
  expect(window.location.search).toBe("");
});
