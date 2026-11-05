// @vitest-environment jsdom
import { createElement } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const save = vi.hoisted(() => ({
  action:
    vi.fn<(theme: string) => Promise<{ ok: true } | { ok: false; error: string }>>(),
}));
vi.mock("@/app/actions", () => ({ saveThemePreferenceAction: save.action }));
const toastError = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ error: toastError }) }));

import { ThemeSync } from "@/components/theme-sync";
import { ThemeToggle } from "@/components/theme-toggle";
import { THEME_COOKIE, parseTheme } from "@/lib/theme";

const osDark = { value: false };
const pressed = (name: string) =>
  screen.getByRole("button", { name }).getAttribute("aria-pressed");

beforeEach(() => {
  osDark.value = false;
  delete document.documentElement.dataset.theme;
  document.cookie = `${THEME_COOKIE}=; path=/; max-age=0`;
  save.action.mockResolvedValue({ ok: true });
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
  expect(pressed("Dark theme")).toBe("true");
  expect(pressed("Light theme")).toBe("false");
});

it("switches at once, remembers the choice on this device, and saves it to the profile", async () => {
  render(createElement(ThemeToggle));
  fireEvent.click(screen.getByRole("button", { name: "Dark theme" }));

  expect(document.documentElement.dataset.theme).toBe("dark");
  expect(document.cookie).toContain(`${THEME_COOKIE}=dark`);
  expect(pressed("Dark theme")).toBe("true");
  expect(save.action).toHaveBeenCalledWith("dark");
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Light theme" })).not.toBeDisabled(),
  );
  expect(toastError).not.toHaveBeenCalled();
});

it("switches back and explains when the profile save fails", async () => {
  save.action.mockResolvedValue({
    ok: false,
    error: "Couldn't save your theme. Try again.",
  });
  render(createElement(ThemeToggle));
  fireEvent.click(screen.getByRole("button", { name: "Dark theme" }));
  expect(document.documentElement.dataset.theme).toBe("dark");

  await waitFor(() =>
    expect(toastError).toHaveBeenCalledWith("Couldn't save your theme. Try again."),
  );
  expect(document.documentElement.dataset.theme).toBe("light");
  expect(pressed("Light theme")).toBe("true");
});

it("applies the theme saved on the profile, without saving it again", async () => {
  render(createElement(ThemeToggle));
  await act(async () => {
    render(createElement(ThemeSync, { saved: "dark" }));
  });
  expect(document.documentElement.dataset.theme).toBe("dark");
  expect(document.cookie).toContain(`${THEME_COOKIE}=dark`);
  expect(pressed("Dark theme")).toBe("true");
  expect(save.action).not.toHaveBeenCalled();
});

it("does not undo a newer pick on this device until the saved theme changes", async () => {
  const { rerender } = render(createElement(ThemeSync, { saved: "dark" }));
  await act(async () => {});
  render(createElement(ThemeToggle));
  fireEvent.click(screen.getByRole("button", { name: "Light theme" }));
  rerender(createElement(ThemeSync, { saved: "dark" }));
  expect(document.documentElement.dataset.theme).toBe("light");
  await waitFor(() => expect(save.action).toHaveBeenCalledWith("light"));
});

it("uploads a device-only choice when the profile has none yet", async () => {
  document.documentElement.dataset.theme = "dark";
  await act(async () => {
    render(createElement(ThemeSync, { saved: null }));
  });
  expect(save.action).toHaveBeenCalledWith("dark");
});

it("only accepts known theme values", () => {
  expect(parseTheme("dark")).toBe("dark");
  expect(parseTheme("light")).toBe("light");
  expect(parseTheme("sepia")).toBeNull();
  expect(parseTheme(undefined)).toBeNull();
});
