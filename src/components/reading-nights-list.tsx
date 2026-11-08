"use client";

import Link from "next/link";
import { useEffect, useState, type MouseEvent, type ReactNode } from "react";
import { SessionStatusBadge } from "@/components/session-status";
import { buttonVariants } from "@/components/ui/button";
import {
  SESSION_LIST_FILTERS,
  filterSessionsForList,
  paginateSessions,
  sessionFilterParam,
  sessionListFilter,
  sessionPageNumbers,
  type SessionListFilter,
} from "@/lib/domain/session-presentation";
import type { SessionStatus } from "@/lib/types";

/** One night in the list, worked out on the server. */
export type ReadingNightRow = {
  id: string;
  status: SessionStatus;
  scheduledFor: string;
  /** e.g. "Tonight at 19:30" */
  when: string;
  /** The status the badge shows (see `effectiveStatus`). */
  badgeStatus: SessionStatus;
  readers: string;
  /** The "ask to read" control, when this member can ask (or already asked). */
  ask?: ReactNode;
};

const FILTER_LABELS: Record<SessionListFilter, string> = {
  upcoming: "Coming up",
  past: "Past",
  canceled: "Canceled",
  all: "All",
};

const EMPTY_MESSAGES: Record<SessionListFilter, string> = {
  upcoming: "No nights coming up.",
  past: "No past nights yet.",
  canceled: "No canceled nights.",
  all: "No reading nights yet.",
};

function countText(filter: SessionListFilter, total: number): string {
  const nights = total === 1 ? "night" : "nights";
  if (filter === "upcoming") return `${total} ${nights} coming up`;
  if (filter === "past") return `${total} past ${nights}`;
  if (filter === "canceled") return `${total} canceled ${nights}`;
  return `${total} ${nights}`;
}

/** Filter pills omit `page` so switching filters always starts on page 1. */
export function scheduleHref(filter: SessionListFilter, page?: number) {
  const params = new URLSearchParams();
  if (page !== undefined) params.set("page", String(page));
  const status = sessionFilterParam(filter);
  if (status) params.set("status", status);
  const query = params.toString();
  return query ? `/schedule?${query}` : "/schedule";
}

type View = { filter: SessionListFilter; page?: string };

const viewFromLocation = (): View => {
  const params = new URLSearchParams(window.location.search);
  return {
    filter: sessionListFilter(params.get("status") ?? undefined),
    page: params.get("page") ?? undefined,
  };
};

/** Plain clicks switch in place; modified clicks (new tab, etc.) keep link behavior. */
const isPlainClick = (event: MouseEvent<HTMLAnchorElement>) =>
  event.button === 0 &&
  !event.metaKey &&
  !event.ctrlKey &&
  !event.shiftKey &&
  !event.altKey;

/**
 * The schedule's "Reading nights" list. Every night is already on the page, so the
 * filter pills and page links switch instantly in the browser and keep the URL in
 * step, instead of waiting on a server render for each click.
 */
export function ReadingNightsList({
  rows,
  today,
  initialFilter,
  initialPage,
}: {
  rows: ReadingNightRow[];
  today: string;
  initialFilter: SessionListFilter;
  initialPage?: string;
}) {
  const [view, setView] = useState<View>({ filter: initialFilter, page: initialPage });

  useEffect(() => {
    const syncWithHistory = () => setView(viewFromLocation());
    window.addEventListener("popstate", syncWithHistory);
    return () => window.removeEventListener("popstate", syncWithHistory);
  }, []);

  const { items, counts } = filterSessionsForList(rows, view.filter, today);
  const pagination = paginateSessions(items, view.page);

  const show = (next: View, href: string) => (event: MouseEvent<HTMLAnchorElement>) => {
    if (!isPlainClick(event)) return;
    event.preventDefault();
    setView(next);
    window.history.pushState(null, "", href);
    // Page links sit under the list; bring the new page's first night into view.
    if (next.page) document.getElementById("reading-nights")?.scrollIntoView();
  };

  return (
    <>
      <nav aria-label="Filter reading nights" className="chip-row mt-3">
        {SESSION_LIST_FILTERS.map((option) => {
          const href = scheduleHref(option);
          return (
            <a
              key={option}
              className="chip schedule-filter-chip"
              aria-current={option === view.filter ? "page" : undefined}
              href={href}
              onClick={show({ filter: option }, href)}
            >
              {FILTER_LABELS[option]}
              <span className="schedule-filter-chip__count">{counts[option]}</span>
            </a>
          );
        })}
      </nav>
      <ul className="mt-4 space-y-2">
        {pagination.items.map((row) => (
          <li key={row.id}>
            <Link
              href={`/sessions/${row.id}`}
              className="story-panel panel-interactive grid grid-cols-[minmax(0,1fr)_6rem] items-center gap-x-3 gap-y-1 rounded-xl px-4 py-3 hover:border-primary/40 sm:grid-cols-[minmax(0,1fr)_7rem_minmax(0,1fr)]"
            >
              <span className="min-w-0 break-words">{row.when}</span>
              <SessionStatusBadge
                status={row.badgeStatus}
                className="col-start-2 row-start-1 justify-self-center"
              />
              <span className="col-start-1 row-start-2 min-w-0 break-words text-sm text-muted-foreground sm:col-start-3 sm:row-start-1 sm:text-right">
                {row.readers}
              </span>
            </Link>
            {row.ask && <div className="mt-1 flex justify-end px-1">{row.ask}</div>}
          </li>
        ))}
      </ul>
      {pagination.total === 0 ? (
        <p className="mt-4 text-muted-foreground">{EMPTY_MESSAGES[view.filter]}</p>
      ) : (
        <nav
          aria-label="Session pages"
          className="mt-4 flex flex-wrap items-center justify-between gap-3"
        >
          <div className="flex flex-wrap gap-2">
            {sessionPageNumbers(pagination.page, pagination.pageCount).map(
              (page, index) => {
                if (page === "ellipsis")
                  return (
                    <span key={`gap-${index}`} className="px-2 py-2" aria-hidden="true">
                      …
                    </span>
                  );
                const href = scheduleHref(view.filter, page);
                return (
                  <a
                    key={page}
                    href={href}
                    aria-label={`Page ${page}`}
                    aria-current={page === pagination.page ? "page" : undefined}
                    className={buttonVariants({
                      variant: page === pagination.page ? "default" : "outline",
                      size: "sm",
                    })}
                    onClick={show({ filter: view.filter, page: String(page) }, href)}
                  >
                    {page}
                  </a>
                );
              },
            )}
          </div>
          <span className="text-sm" aria-live="polite">
            Page {pagination.page} of {pagination.pageCount} ·{" "}
            {countText(view.filter, pagination.total)}
          </span>
        </nav>
      )}
    </>
  );
}
