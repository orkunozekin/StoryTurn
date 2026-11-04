// @vitest-environment jsdom
import { createElement } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

const pathname = vi.hoisted(() => ({ value: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => pathname.value }));

import { AppTabBar, isActiveTab } from "@/components/app-tab-bar";

afterEach(cleanup);

it("marks the current tab and moves the pill to it", () => {
  pathname.value = "/library/abc";
  render(createElement(AppTabBar));
  const current = screen.getByRole("link", { current: "page" });
  expect(current.textContent).toBe("Shelf");
  const nav = screen.getByRole("navigation", { name: "Main navigation" });
  expect(nav.style.getPropertyValue("--tab-index")).toBe("2");
});

it("treats session pages as part of Tonight", () => {
  expect(isActiveTab("/sessions/1", "/")).toBe(true);
  expect(isActiveTab("/library", "/")).toBe(false);
  expect(isActiveTab("/schedule", "/schedule")).toBe(true);
});

it("lights up a tapped tab before the route changes, then follows the route", async () => {
  pathname.value = "/";
  const { rerender } = render(createElement(AppTabBar));
  const week = screen.getByRole("link", { name: "Week" });
  week.addEventListener("click", (event) => event.preventDefault());
  fireEvent.click(week);

  expect(screen.getByRole("link", { current: "page" }).textContent).toBe("Week");
  const nav = screen.getByRole("navigation", { name: "Main navigation" });
  expect(nav.style.getPropertyValue("--tab-index")).toBe("1");

  pathname.value = "/schedule";
  rerender(createElement(AppTabBar));
  pathname.value = "/";
  rerender(createElement(AppTabBar));
  expect(screen.getByRole("link", { current: "page" }).textContent).toBe("Tonight");
});
