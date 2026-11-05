import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Label/value pairs. The label is a small muted eyebrow and the value reads in
 * the foreground color, so the two never blur into one sentence.
 */
export function DetailList({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return <dl className={cn("grid gap-4", className)}>{children}</dl>;
}

export function DetailItem({
  label,
  className,
  children,
}: {
  label: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="text-xs font-bold tracking-wider text-muted-foreground uppercase">
        {label}
      </dt>
      <dd className="mt-1 text-base font-semibold break-words text-foreground">
        {children}
      </dd>
    </div>
  );
}

/** One-line variant for running text: "Label  Value" on a single row. */
export function InlineDetail({
  label,
  className,
  children,
}: {
  label: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <p className={cn("text-sm", className)}>
      <span className="text-muted-foreground">{label}</span>{" "}
      <span className="font-semibold text-foreground">{children}</span>
    </p>
  );
}
