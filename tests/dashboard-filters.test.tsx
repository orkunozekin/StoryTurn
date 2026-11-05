// @vitest-environment jsdom
import { createElement } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { DashboardFilters } from "@/components/dashboard-filters";

afterEach(cleanup);

const options = [
  { key: "me", label: "Me" },
  { key: "grandma", label: "Grandma" },
  { key: "family", label: "Whole family" },
];

it("links each reader to its filtered dashboard and marks the active one", () => {
  render(createElement(DashboardFilters, { options, activeKey: "me" }));
  expect(screen.getByRole("link", { name: "Grandma" }).getAttribute("href")).toBe(
    "/dashboard?filter=grandma",
  );
  expect(screen.getByRole("link", { current: "page" }).textContent).toBe("Me");
});

it("lights up a tapped filter before the page changes, then follows the page", () => {
  const { rerender } = render(
    createElement(DashboardFilters, { options, activeKey: "me" }),
  );
  const family = screen.getByRole("link", { name: "Whole family" });
  family.addEventListener("click", (event) => event.preventDefault());
  fireEvent.click(family);
  expect(screen.getByRole("link", { current: "page" }).textContent).toBe("Whole family");

  rerender(createElement(DashboardFilters, { options, activeKey: "family" }));
  rerender(createElement(DashboardFilters, { options, activeKey: "me" }));
  expect(screen.getByRole("link", { current: "page" }).textContent).toBe("Me");
});
