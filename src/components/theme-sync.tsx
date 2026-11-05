"use client";

import { useEffect } from "react";
import type { Theme } from "@/lib/theme";
import { applyTheme, persistTheme, readExplicitTheme } from "@/components/theme-store";

/**
 * Keeps this device in step with the theme saved on the reader's profile.
 *
 * Runs when the saved value it is given changes (first render, or a server
 * refresh after a save elsewhere), not on every toggle click, so the toggle's
 * optimistic switch is never undone while its save is in flight.
 * A device-only choice made before profiles stored themes is uploaded once.
 */
export function ThemeSync({ saved }: { saved: Theme | null }) {
  useEffect(() => {
    if (saved) {
      if (readExplicitTheme() !== saved) applyTheme(saved);
      return;
    }
    const local = readExplicitTheme();
    if (local) void persistTheme(local);
  }, [saved]);

  return null;
}
