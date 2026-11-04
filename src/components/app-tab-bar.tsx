"use client";

import { CalendarDays, Library, Moon, Users, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

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

/**
 * Phone: floating bar at the bottom. Tablet (md to lg): vertical rail on the left.
 * Hidden on desktop, where the top bar takes over.
 */
export function AppTabBar() {
  const pathname = usePathname() ?? "";
  const activeIndex = Math.max(
    0,
    tabLinks.findIndex((link) => isActiveTab(pathname, link.href)),
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
        const active = isActiveTab(pathname, href);
        return (
          <Link
            key={href}
            href={href}
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
