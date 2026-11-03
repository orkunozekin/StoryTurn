import { Check } from "lucide-react";
import type * as React from "react";
import { cn } from "@/lib/utils";

type ChoiceChipProps = Omit<React.ComponentProps<"input">, "type" | "children"> & {
  /** Main label. */
  children: React.ReactNode;
  /** Optional secondary text, shown muted after the label. */
  hint?: React.ReactNode;
  /** "chip" is a compact pill; "row" spans the full width, for lists. */
  variant?: "chip" | "row";
  /** Extra content placed at the end of a row (e.g. a cover thumbnail or an action). */
  trailing?: React.ReactNode;
  labelClassName?: string;
};

/**
 * A selectable chip or row backed by a real (visually hidden) checkbox, so it works in
 * plain forms and server components. The checked look comes from CSS `:has(:checked)`.
 */
export function ChoiceChip({
  children,
  hint,
  variant = "chip",
  trailing,
  className,
  labelClassName,
  ...inputProps
}: ChoiceChipProps) {
  return (
    <label
      data-variant={variant}
      className={cn(
        "group/choice relative flex cursor-pointer items-center gap-2.5 border border-input bg-card text-sm font-bold text-foreground transition-[background-color,border-color,color,transform] duration-150 select-none hover:border-ring/60 active:scale-[0.98]",
        "has-[:checked]:border-primary has-[:checked]:bg-primary/12 has-[:checked]:text-foreground",
        "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring",
        "has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50",
        variant === "chip" ? "min-h-10 rounded-full px-3.5" : "min-h-12 w-full rounded-xl px-3.5 py-2",
        labelClassName,
      )}
    >
      <input type="checkbox" className={cn("peer sr-only", className)} {...inputProps} />
      <span
        aria-hidden="true"
        className="flex size-5 shrink-0 items-center justify-center rounded-full border-2 border-input transition-colors group-has-[:checked]/choice:border-primary group-has-[:checked]/choice:bg-primary group-has-[:checked]/choice:text-primary-foreground"
      >
        <Check className="size-3 scale-50 opacity-0 transition-[opacity,transform] duration-150 group-has-[:checked]/choice:scale-100 group-has-[:checked]/choice:opacity-100" strokeWidth={3} />
      </span>
      <span className="min-w-0 flex-1 break-words">
        {children}
        {hint && <span className="ml-1 font-normal text-muted-foreground">{hint}</span>}
      </span>
      {trailing}
    </label>
  );
}
