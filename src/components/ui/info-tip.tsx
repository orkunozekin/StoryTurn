"use client";

import { Popover } from "@base-ui/react/popover";
import { Info } from "lucide-react";
import type * as React from "react";

/**
 * A small "i" button that shows help text. Opens on hover with a pointer and on tap
 * on touch screens, so the text stays reachable on phones.
 */
export function InfoTip({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Popover.Root>
      <Popover.Trigger
        openOnHover
        delay={150}
        aria-label={label}
        className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring data-[popup-open]:bg-secondary data-[popup-open]:text-foreground"
      >
        <Info className="size-4" aria-hidden="true" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="top" align="end" sideOffset={8} className="z-50">
          <Popover.Popup className="max-w-xs origin-[var(--transform-origin)] space-y-2 rounded-xl border border-border bg-popover p-3.5 text-sm text-popover-foreground shadow-lg transition-[opacity,transform] duration-150 data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0">
            {children}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
