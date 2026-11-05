"use client";

import { useEffect } from "react";
import type { ProfileTheme } from "@/lib/theme";
import { applyTheme, persistTheme, readExplicitTheme } from "@/components/theme-store";

/**
 * Keeps this device in step with the theme saved on the reader's profile.
 *
 * Runs when the saved value it is given changes (first render, or a server
 * refresh after a save elsewhere), not on every toggle click, so the toggle's
 * optimistic switch is never undone while its save is in flight.
 * A device-only choice made before profiles stored themes is uploaded, but only
 * once the profile is known to have none: a failed read changes nothing.
 */
export function ThemeSync({ saved }: { saved: ProfileTheme }) {
  useEffect(() => {
    if (saved === "unavailable") return;
    if (saved === "unset") {
      const local = readExplicitTheme();
      if (local) void persistTheme(local);
      return;
    }
    if (readExplicitTheme() !== saved) applyTheme(saved);
  }, [saved]);

  return null;
}
