"use client";

import { saveThemePreferenceAction } from "@/app/actions";
import { THEME_COOKIE, THEME_COOKIE_MAX_AGE, parseTheme, type Theme } from "@/lib/theme";

/**
 * Client-side theme state shared by every toggle on the page (top bar, menu,
 * Family card) and by ThemeSync. The theme itself lives on <html data-theme>
 * and in a cookie; whether a save is in flight lives here so all toggles agree.
 */
type SaveResult = Awaited<ReturnType<typeof saveThemePreferenceAction>>;

const listeners = new Set<() => void>();
let saving = false;
// Bumped on each save so a slow, older response can't revert a newer choice.
let saveRequest = 0;

const notify = () => listeners.forEach((listener) => listener());

const darkQuery = () => window.matchMedia("(prefers-color-scheme: dark)");

/** The theme on screen: the saved choice on <html>, else the OS setting. */
export const readTheme = (): Theme =>
  parseTheme(document.documentElement.dataset.theme) ??
  (darkQuery().matches ? "dark" : "light");

/** The explicit choice on <html>, or null while the page follows the OS. */
export const readExplicitTheme = (): Theme | null =>
  parseTheme(document.documentElement.dataset.theme);

export const readSaving = () => saving;

export const subscribeTheme = (onChange: () => void) => {
  listeners.add(onChange);
  const query = darkQuery();
  query.addEventListener("change", onChange);
  return () => {
    listeners.delete(onChange);
    query.removeEventListener("change", onChange);
  };
};

const setSaving = (next: boolean) => {
  saving = next;
  notify();
};

/** Shows a theme and remembers it on this device. Doesn't touch the profile. */
export const applyTheme = (theme: Theme) => {
  document.documentElement.dataset.theme = theme;
  document.cookie = `${THEME_COOKIE}=${theme}; path=/; max-age=${THEME_COOKIE_MAX_AGE}; samesite=lax`;
  notify();
};

/** Saves a theme to the profile without changing what's on screen. */
export const persistTheme = async (theme: Theme): Promise<SaveResult> => {
  const request = ++saveRequest;
  setSaving(true);
  let result: SaveResult;
  try {
    result = await saveThemePreferenceAction(theme);
  } catch {
    result = { ok: false, error: "Couldn't save your theme. Try again." };
  }
  if (request === saveRequest) setSaving(false);
  return result;
};

/**
 * The toggle's click: switch at once, then save to the profile. If the save
 * fails, put the previous theme back. Returns the save result (null when
 * nothing changed) so the caller can explain a failure.
 */
export const selectTheme = async (next: Theme): Promise<SaveResult | null> => {
  const previous = readTheme();
  if (saving || next === previous) return null;
  applyTheme(next);
  const result = await persistTheme(next);
  if (!result.ok && readTheme() === next) applyTheme(previous);
  return result;
};
