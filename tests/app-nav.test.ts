// @vitest-environment jsdom
import { createElement } from "react";
import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { AppNav } from "@/components/app-nav";

vi.mock("@/app/actions", () => ({ logoutAction: vi.fn() }));
let desktop = false;
let change: (() => void) | undefined;
beforeEach(() => {
  desktop = false;
  change = undefined;
  vi.stubGlobal("matchMedia", () => ({
    get matches() {
      return desktop;
    },
    addEventListener: (_event: string, listener: () => void) => {
      change = listener;
    },
    removeEventListener: vi.fn(),
  }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("toggles mobile navigation and restores focus when Escape closes it", async () => {
  const user = userEvent.setup();
  render(createElement(AppNav, { displayName: "Alex" }));
  const toggle = screen.getByRole("button", { name: "Open navigation" });
  const panel = document.getElementById(toggle.getAttribute("aria-controls")!)!;
  expect(toggle.getAttribute("aria-expanded")).toBe("false");
  expect(panel.hasAttribute("inert")).toBe(true);
  expect(screen.queryByRole("navigation", { name: "Mobile navigation" })).toBeNull();

  await user.click(toggle);
  expect(toggle.getAttribute("aria-expanded")).toBe("true");
  expect(panel.hasAttribute("inert")).toBe(false);
  const mobileNav = screen.getByRole("navigation", { name: "Mobile navigation" });
  const links = within(mobileNav).getAllByRole("link");
  expect(links.map((link) => link.textContent)).toEqual([
    "Tonight",
    "Dashboard",
    "Library",
    "Schedule",
    "Family",
  ]);
  expect(
    links.map((link) => link.querySelector("svg")?.getAttribute("aria-hidden")),
  ).toEqual(["true", "true", "true", "true", "true"]);
  const desktopNav = screen.getByRole("navigation", { name: "Main navigation" });
  expect(
    within(desktopNav)
      .getAllByRole("link")
      .map((link) => link.querySelector("svg")?.getAttribute("aria-hidden")),
  ).toEqual(["true", "true", "true", "true", "true"]);
  links[0].focus();
  await user.keyboard("{Escape}");
  expect(toggle.getAttribute("aria-expanded")).toBe("false");
  expect(document.activeElement).toBe(toggle);

  await user.click(toggle);
  await user.click(toggle);
  expect(panel.hasAttribute("inert")).toBe(true);
});

it("closes the mobile panel after selecting a destination", async () => {
  const user = userEvent.setup();
  render(createElement(AppNav, { displayName: "Alex" }));
  await user.click(screen.getByRole("button", { name: "Open navigation" }));
  const mobileNav = screen.getByRole("navigation", { name: "Mobile navigation" });
  await user.click(within(mobileNav).getByRole("link", { name: "Tonight" }));
  expect(
    screen.getByRole("button", { name: "Open navigation" }).getAttribute("aria-expanded"),
  ).toBe("false");
});

it("keeps mobile routes available in server HTML before hydration", () => {
  const container = document.createElement("div");
  container.innerHTML = renderToString(createElement(AppNav, { displayName: "Alex" }));
  const nav = container.querySelector('[aria-label="Mobile navigation"]')!;
  expect(nav.parentElement?.parentElement?.hasAttribute("inert")).toBe(false);
  expect(nav.parentElement?.parentElement?.getAttribute("aria-hidden")).toBe("false");
  expect([...nav.querySelectorAll("a")].map((link) => link.getAttribute("href"))).toEqual(
    ["/", "/dashboard", "/library", "/schedule", "/family"],
  );
});
it("closes an expanded mobile panel when desktop navigation appears", async () => {
  const user = userEvent.setup();
  render(createElement(AppNav, { displayName: "Alex" }));
  const toggle = screen.getByRole("button", { name: "Open navigation" });
  await user.click(toggle);
  act(() => {
    desktop = true;
    change?.();
  });
  expect(toggle.getAttribute("aria-expanded")).toBe("false");
  expect(
    document.getElementById(toggle.getAttribute("aria-controls")!)?.hasAttribute("inert"),
  ).toBe(true);
});
