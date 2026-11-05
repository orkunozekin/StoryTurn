"use client";

import { CalendarDays, Library, Moon, Users, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type MouseEvent } from "react";

export type TabLink = { href: string; label: string; icon: LucideIcon };

export const tabLinks: TabLink[] = [
  { href: "/", label: "Tonight", icon: Moon },
  { href: "/schedule", label: "Week", icon: CalendarDays },
  { href: "/library", label: "Shelf", icon: Library },
  { href: "/family", label: "Family", icon: Users },
];

export const isActiveTab = (pathname: string, href: string) =>
  href === "/"
    ? pathname === "/" || pathname.startsWith("/sessions")
    : pathname.startsWith(href);

const isPlainClick = (event: MouseEvent) =>
  event.button === 0 &&
  !event.metaKey &&
  !event.ctrlKey &&
  !event.shiftKey &&
  !event.altKey;

/**
 * Phone: floating bar at the bottom. Tablet (md to lg): vertical rail on the left.
 * Hidden on desktop, where the top bar takes over.
 *
 * The tapped tab lights up right away instead of waiting for the route to commit.
 * The optimistic choice is tied to the pathname it was made on and cleared as soon
 * as the route changes.
 */
export function AppTabBar() {
  const pathname = usePathname() ?? "";
  const [tapped, setTapped] = useState<{ href: string; from: string } | null>(null);
  // Forget the tap once the route moves, so returning to `from` later is not mis-lit.
  if (tapped && tapped.from !== pathname) setTapped(null);
  const optimisticHref = tapped?.from === pathname ? tapped.href : null;
  const isActive = (href: string) =>
    optimisticHref ? href === optimisticHref : isActiveTab(pathname, href);
  const activeIndex = Math.max(
    0,
    tabLinks.findIndex((link) => isActive(link.href)),
  );

  return (
    <nav
      aria-label="Main navigation"
      data-app-tab-bar=""
      style={{ "--tab-index": activeIndex } as React.CSSProperties}
      className="tab-bar fixed z-40 grid border border-border bg-[color-mix(in_oklab,var(--card)_88%,transparent)] backdrop-blur-md lg:hidden"
    >
      <span aria-hidden="true" className="tab-bar-pill" />
      {tabLinks.map(({ href, label, icon: Icon }) => {
        const active = isActive(href);
        return (
          <Link
            key={href}
            href={href}
            onClick={(event) => {
              if (isPlainClick(event)) setTapped({ href, from: pathname });
            }}
            aria-current={active ? "page" : undefined}
            className="tab-bar-link relative flex flex-col items-center justify-center gap-0.5 rounded-full text-xs font-bold text-muted-foreground transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring aria-[current=page]:text-primary"
          >
            <Icon className="tab-bar-icon size-5" aria-hidden="true" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
