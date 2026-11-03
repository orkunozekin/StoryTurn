"use client";

import {
  CalendarDays,
  LayoutDashboard,
  Library,
  Moon,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react";
import { ConfirmationForm } from "@/components/confirmation-form";

import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";
import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { logoutAction } from "@/app/actions";
import { Button } from "@/components/ui/button";

const links: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/", label: "Tonight", icon: Moon },
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/library", label: "Library", icon: Library },
  { href: "/schedule", label: "Schedule", icon: CalendarDays },
  { href: "/family", label: "Family", icon: Users },
];

function NavLinkLabel({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <>
      <Icon className="size-4 shrink-0 text-primary" aria-hidden="true" />
      {label}
    </>
  );
}

const subscribeHydration = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

export function AppNav({ displayName }: { displayName: string }) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const toggleRef = useRef<HTMLButtonElement>(null);
  const hydrated = useSyncExternalStore(
    subscribeHydration,
    clientSnapshot,
    serverSnapshot,
  );
  const expanded = !hydrated || open;

  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 768px)");
    const closeOnDesktop = () => {
      if (desktop.matches) setOpen(false);
    };
    desktop.addEventListener("change", closeOnDesktop);
    return () => desktop.removeEventListener("change", closeOnDesktop);
  }, []);

  return (
    <header
      className="border-b border-border/70 bg-[color-mix(in_oklab,var(--card)_85%,transparent)] backdrop-blur-md"
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          setOpen(false);
          toggleRef.current?.focus();
        }
      }}
    >
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="flex items-center gap-6">
          <Link
            href="/"
            className="shrink-0 rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <BrandLogo className="w-32" />
          </Link>
          <nav aria-label="Main navigation" className="hidden items-center gap-1 md:flex">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-base font-semibold text-foreground transition hover:bg-secondary hover:text-foreground"
              >
                <NavLinkLabel icon={link.icon} label={link.label} />
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-2">
          <span
            className="hidden max-w-40 items-center gap-1.5 rounded-full bg-secondary px-3 py-1.5 text-xs text-muted-foreground md:inline-flex"
            title={displayName}
          >
            <UserRound className="size-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">{displayName}</span>
          </span>
          <ConfirmationForm
            title="Sign out?"
            description="You will need to sign in again to access your family."
            confirmLabel="Sign out"
            action={logoutAction}
            className="hidden md:block"
          >
            <Button type="submit" variant="outline" size="sm">
              Sign out
            </Button>
          </ConfirmationForm>
          <button
            ref={toggleRef}
            type="button"
            aria-label={open ? "Close navigation" : "Open navigation"}
            aria-expanded={open}
            aria-controls={menuId}
            onClick={() => setOpen(!open)}
            className={`${hydrated ? "flex" : "hidden"} size-11 items-center justify-center rounded-lg text-primary transition-colors hover:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring md:hidden`}
          >
            <span aria-hidden="true" className="relative h-5 w-5">
              <span
                className={`absolute left-0 top-0 h-0.5 w-5 rounded-full bg-current transition-transform duration-300 ease-in-out motion-reduce:transition-none ${open ? "translate-y-[9px] rotate-45" : ""}`}
              />
              <span
                className={`absolute left-0 top-[9px] h-0.5 w-5 rounded-full bg-current transition-all duration-200 ease-in-out motion-reduce:transition-none ${open ? "scale-x-0 opacity-0" : ""}`}
              />
              <span
                className={`absolute bottom-0 left-0 h-0.5 w-5 rounded-full bg-current transition-transform duration-300 ease-in-out motion-reduce:transition-none ${open ? "-translate-y-[9px] -rotate-45" : ""}`}
              />
            </span>
          </button>
        </div>
      </div>
      <div
        id={menuId}
        inert={!expanded}
        aria-hidden={!expanded}
        className={`grid transition-[grid-template-rows,opacity] duration-300 ease-in-out motion-reduce:transition-none md:hidden ${expanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}
      >
        <div className="overflow-hidden">
          <nav
            aria-label="Mobile navigation"
            className="mx-auto flex max-w-5xl flex-col gap-1 px-4 pb-3"
          >
            <span className="mb-1 flex items-center gap-2 border-b border-border px-3 py-2 text-xs text-muted-foreground">
              <UserRound className="size-4 shrink-0" aria-hidden="true" />
              <span className="min-w-0 break-words">{displayName}</span>
            </span>
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 rounded-lg px-3 py-3 text-base font-semibold text-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
              >
                <NavLinkLabel icon={link.icon} label={link.label} />
              </Link>
            ))}
            <ConfirmationForm
              title="Sign out?"
              description="You will need to sign in again to access your family."
              confirmLabel="Sign out"
              action={logoutAction}
              className="mt-2 border-t border-border pt-2"
            >
              <Button
                type="submit"
                variant="ghost"
                className="w-full justify-start px-3 text-muted-foreground"
              >
                Sign out
              </Button>
            </ConfirmationForm>
          </nav>
        </div>
      </div>
    </header>
  );
}
