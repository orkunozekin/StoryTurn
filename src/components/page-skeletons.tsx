import type { ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * Building blocks for the route `loading.tsx` files. Each mirrors the spacing of the
 * real page so the swap from skeleton to content doesn't jump.
 */

export function PageSkeleton({
  label,
  width = "max-w-5xl",
  children,
}: {
  /** Announced to screen readers while the page loads, e.g. "Loading schedule". */
  label: string;
  width?: "max-w-5xl" | "max-w-3xl";
  children: ReactNode;
}) {
  return (
    <main aria-busy="true" className={cn("mx-auto w-full flex-1 px-4 py-8", width)}>
      <p role="status" className="sr-only">
        {label}…
      </p>
      {children}
    </main>
  );
}

export function HeadingSkeleton({ subtitle = true }: { subtitle?: boolean }) {
  return (
    <div className="space-y-3">
      <Skeleton className="h-9 w-56 max-w-full rounded-lg" />
      {subtitle && <Skeleton className="h-4 w-80 max-w-full" />}
    </div>
  );
}

export function PanelSkeleton({
  lines = 3,
  className,
  children,
}: {
  lines?: number;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div className={cn("story-panel space-y-3 rounded-2xl p-5", className)}>
      <Skeleton className="h-6 w-40 rounded-lg" />
      {Array.from({ length: lines }, (_, line) => (
        <Skeleton
          key={line}
          className={cn("h-4", line === lines - 1 ? "w-2/3" : "w-full")}
        />
      ))}
      {children}
    </div>
  );
}

export function ListRowsSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <ul className="mt-3 space-y-2">
      {Array.from({ length: rows }, (_, row) => (
        <li
          key={row}
          className="story-panel flex items-center justify-between gap-3 rounded-xl px-4 py-3"
        >
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3 w-1/2" />
          </div>
          <Skeleton className="h-6 w-20 rounded-full" />
        </li>
      ))}
    </ul>
  );
}

export function ButtonSkeleton({ className }: { className?: string }) {
  return <Skeleton className={cn("h-8 w-32 rounded-lg", className)} />;
}
