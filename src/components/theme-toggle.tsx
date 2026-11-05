"use client";

import { Moon, Sun, type LucideIcon } from "lucide-react";
import { useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";
import { THEME_COOKIE, THEME_COOKIE_MAX_AGE, parseTheme, type Theme } from "@/lib/theme";

const OPTIONS: { value: Theme; label: string; icon: LucideIcon }[] = [
  { value: "dark", label: "Dark theme", icon: Moon },
  { value: "light", label: "Light theme", icon: Sun },
];

const darkQuery = () => window.matchMedia("(prefers-color-scheme: dark)");

/** The theme on screen: the saved choice on <html>, else the OS setting. */
const readTheme = (): Theme =>
  parseTheme(document.documentElement.dataset.theme) ??
  (darkQuery().matches ? "dark" : "light");

const listeners = new Set<() => void>();

const subscribe = (onChange: () => void) => {
  listeners.add(onChange);
  const query = darkQuery();
  query.addEventListener("change", onChange);
  return () => {
    listeners.delete(onChange);
    query.removeEventListener("change", onChange);
  };
};

const applyTheme = (theme: Theme) => {
  document.documentElement.dataset.theme = theme;
  document.cookie = `${THEME_COOKIE}=${theme}; path=/; max-age=${THEME_COOKIE_MAX_AGE}; samesite=lax`;
  listeners.forEach((notify) => notify());
};

/**
 * Icon-only Dark / Light switch. Applies the theme at once and remembers it in a
 * cookie the root layout reads, so the next page load renders in the same theme.
 * Until the reader picks one, the app follows the OS setting.
 */
export function ThemeToggle({ className }: { className?: string }) {
  // Null on the server: which button is pressed is only known in the browser.
  const current = useSyncExternalStore<Theme | null>(subscribe, readTheme, () => null);

  return (
    <div
      role="group"
      aria-label="Theme"
      className={cn(
        "inline-flex shrink-0 items-center rounded-full border border-border p-0.5",
        className,
      )}
    >
      {OPTIONS.map(({ value, label, icon: Icon }) => {
        const pressed = current === value;
        return (
          <button
            key={value}
            type="button"
            aria-label={label}
            aria-pressed={current ? pressed : undefined}
            onClick={() => {
              if (current && !pressed) applyTheme(value);
            }}
            className={cn(
              "inline-flex size-9 items-center justify-center rounded-full transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
              pressed
                ? "bg-secondary text-primary shadow-[inset_0_0_0_1px_var(--border)]"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="size-4" aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}
