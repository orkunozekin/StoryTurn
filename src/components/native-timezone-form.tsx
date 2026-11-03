"use client";

import { useCallback, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { unstable_rethrow } from "next/navigation";
import { useToast } from "@/hooks/use-toast";
import {
  SaveCelebration,
  prefersReducedMotion,
  type CelebrationBurst,
} from "@/components/save-celebration";

const subscribe = () => () => {};
const browserTimezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
const serverTimezone = () => "";

export function NativeTimezoneForm({
  action,
  successMessage,
  celebrate = false,
  children,
}: {
  action: (data: FormData) => void | Promise<void>;
  /** Toast shown after a successful save. Errors always show a toast. */
  successMessage?: string;
  /** Play a short burst from the submit button after a successful save. */
  celebrate?: boolean;
  children?: ReactNode;
}) {
  const timezone = useSyncExternalStore(subscribe, browserTimezone, serverTimezone);
  const toast = useToast();
  const submitter = useRef<HTMLElement | null>(null);
  const [burst, setBurst] = useState<CelebrationBurst | null>(null);
  const clearBurst = useCallback(() => setBurst(null), []);

  return (
    <form
      onSubmit={(event) => {
        const native = event.nativeEvent;
        submitter.current =
          (native instanceof SubmitEvent ? native.submitter : null) ?? event.currentTarget;
      }}
      action={async (data) => {
        try {
          await action(data);
        } catch (error) {
          unstable_rethrow(error);
          toast.error(error instanceof Error ? error.message : "Could not save");
          return;
        }
        if (successMessage) toast.success(successMessage);
        // Measure after the save: the refreshed page may have moved the button.
        const button = submitter.current;
        if (celebrate && button?.isConnected && !prefersReducedMotion()) {
          const rect = button.getBoundingClientRect();
          setBurst({
            id: Date.now(),
            x: rect.left + window.scrollX + rect.width / 2,
            y: rect.top + window.scrollY + rect.height / 2,
          });
        }
      }}
      className="story-panel mt-6 rounded-2xl p-5 animate-rise-delay"
    >
      <input type="hidden" name="timezone" value={timezone} />
      <fieldset disabled={!timezone} className="space-y-4">
        {children}
      </fieldset>
      <p className="mt-4 text-sm text-muted-foreground" aria-live="polite">
        {timezone
          ? "Bedtime uses your device’s local timezone automatically."
          : "Detecting your device’s timezone…"}
      </p>
      <noscript>Enable JavaScript to save a schedule in your local timezone.</noscript>
      {burst && <SaveCelebration burst={burst} onDone={clearBurst} />}
    </form>
  );
}
