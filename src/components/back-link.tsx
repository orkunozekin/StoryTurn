import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { NAV_STYLE } from "@/lib/nav-config";

export function BackLink({
  href = "/",
  label = "Back to tonight",
  compact = false,
  hiddenWithTabs = false,
}: {
  href?: string;
  label?: string;
  compact?: boolean;
  /** Top-level tab pages don't need a back link while the tab bar is showing. */
  hiddenWithTabs?: boolean;
}) {
  if (hiddenWithTabs && NAV_STYLE === "tabs") return null;
  return (
    <Link
      href={href}
      className={`-ml-2 inline-flex min-h-11 md:min-h-0 items-center gap-2 rounded-md px-2 py-1.5 text-base text-primary hover:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${compact ? "mb-1" : "mb-4"}`}
    >
      <ArrowLeft className="size-4" aria-hidden="true" />
      {label}
    </Link>
  );
}
