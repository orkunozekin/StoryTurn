/** Light/dark choice saved in a cookie so the server renders the right palette on first paint. */
export type Theme = "light" | "dark";

export const THEME_COOKIE = "storyturn-theme";

/** One year; the choice sticks until the reader flips it again. */
export const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** Returns the saved theme, or null when the reader hasn't picked one (follow the OS). */
export const parseTheme = (value: string | undefined | null): Theme | null =>
  value === "light" || value === "dark" ? value : null;

/**
 * The theme on the reader's profile: a saved choice, "unset" when they never
 * picked one, or "unavailable" when it couldn't be read. Only "unset" may be
 * filled in from this device; "unavailable" must not overwrite anything.
 */
export type ProfileTheme = Theme | "unset" | "unavailable";
