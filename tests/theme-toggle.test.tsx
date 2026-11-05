// @vitest-environment jsdom
import { createElement } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ThemeToggle } from "@/components/theme-toggle";
import { THEME_COOKIE, parseTheme } from "@/lib/theme";

const osDark = { value: false };

beforeEach(() => {
  osDark.value = false;
  delete document.documentElement.dataset.theme;
  document.cookie = `${THEME_COOKIE}=; path=/; max-age=0`;
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query.includes("dark") && osDark.value,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("follows the OS setting until a theme is picked", () => {
  osDark.value = true;
  render(createElement(ThemeToggle));
  expect(
    screen.getByRole("button", { name: "Dark theme" }).getAttribute("aria-pressed"),
  ).toBe("true");
  expect(
    screen.getByRole("button", { name: "Light theme" }).getAttribute("aria-pressed"),
  ).toBe("false");
});

it("applies the picked theme at once and remembers it in a cookie", () => {
  render(createElement(ThemeToggle));
  fireEvent.click(screen.getByRole("button", { name: "Dark theme" }));

  expect(document.documentElement.dataset.theme).toBe("dark");
  expect(document.cookie).toContain(`${THEME_COOKIE}=dark`);
  expect(
    screen.getByRole("button", { name: "Dark theme" }).getAttribute("aria-pressed"),
  ).toBe("true");

  fireEvent.click(screen.getByRole("button", { name: "Light theme" }));
  expect(document.documentElement.dataset.theme).toBe("light");
  expect(document.cookie).toContain(`${THEME_COOKIE}=light`);
});

it("only accepts known theme values from the cookie", () => {
  expect(parseTheme("dark")).toBe("dark");
  expect(parseTheme("light")).toBe("light");
  expect(parseTheme("sepia")).toBeNull();
  expect(parseTheme(undefined)).toBeNull();
});
