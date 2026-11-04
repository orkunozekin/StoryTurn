// @vitest-environment jsdom
import { createElement } from "react";
import { cleanup, render, screen } from "@testing-library/react";
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
