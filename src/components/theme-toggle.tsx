"use client";

import { Moon, Sun, type LucideIcon } from "lucide-react";
import { useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";
import type { Theme } from "@/lib/theme";
import {
  readSaving,
  readTheme,
  selectTheme,
  subscribeTheme,
} from "@/components/theme-store";
import { useToast } from "@/hooks/use-toast";

const OPTIONS: { value: Theme; label: string; icon: LucideIcon }[] = [
  { value: "dark", label: "Dark theme", icon: Moon },
  { value: "light", label: "Light theme", icon: Sun },
];

/**
 * Icon-only Dark / Light switch. Applies the theme at once, then saves it to
 * the reader's profile so it follows them to other devices; on failure it
 * switches back and says so in a toast. Until a theme is picked, the app follows the OS.
 */
export function ThemeToggle({ className }: { className?: string }) {
  // Null on the server: which button is pressed is only known in the browser.
  const current = useSyncExternalStore<Theme | null>(
    subscribeTheme,
    readTheme,
    () => null,
  );
  const saving = useSyncExternalStore(subscribeTheme, readSaving, () => false);
  const toast = useToast();

  return (
    <div
      role="group"
      aria-label="Theme"
      aria-busy={saving || undefined}
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
            disabled={saving}
            onClick={async () => {
              if (!current) return;
              const result = await selectTheme(value);
              if (result && !result.ok) toast.error(result.error);
            }}
            className={cn(
              "inline-flex size-9 items-center justify-center rounded-full transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-wait",
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
