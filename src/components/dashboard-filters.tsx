"use client";

import Link from "next/link";
import { useState, type MouseEvent } from "react";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";

export type DashboardFilterOption = { key: string; label: string };

const isPlainClick = (event: MouseEvent) =>
  event.button === 0 &&
  !event.metaKey &&
  !event.ctrlKey &&
  !event.shiftKey &&
  !event.altKey;

/**
 * Reader filter for the dashboard.
 *
 * Each option is fully prefetched (`prefetch`), so its stats sit in the client
 * cache and switching back to a filter you already saw is instant instead of
 * hitting the server again. Server actions that change reading data revalidate
 * paths, which clears that cache, so the numbers don't go stale after a save.
 *
 * The tapped option lights up right away; the choice is tied to the filter it
 * was made from and dropped once the page catches up.
 */
export function DashboardFilters({
  options,
  activeKey,
}: {
  options: DashboardFilterOption[];
  activeKey: string;
}) {
  const [tapped, setTapped] = useState<{ key: string; from: string } | null>(null);
  if (tapped && tapped.from !== activeKey) setTapped(null);
  const selectedKey = tapped?.from === activeKey ? tapped.key : activeKey;

  return (
    <nav aria-label="Filter dashboard by reader" className="flex flex-wrap gap-2">
      {options.map(({ key, label }) => {
        const selected = key === selectedKey;
        return (
          <Link
            key={key}
            href={`/dashboard?filter=${encodeURIComponent(key)}`}
            prefetch
            scroll={false}
            aria-current={selected ? "page" : undefined}
            onClick={(event) => {
              if (isPlainClick(event) && key !== activeKey) {
                setTapped({ key, from: activeKey });
              }
            }}
            className={cn(
              buttonVariants({ variant: selected ? "default" : "outline" }),
              "h-10 rounded-full px-4 text-sm font-bold md:h-11 md:px-5 md:text-base",
            )}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
