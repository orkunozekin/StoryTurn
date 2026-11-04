import type { SessionStatus } from "@/lib/types";
import { addDays } from "@/lib/domain/rotation";
import { sessionDateKey } from "@/lib/domain/sessions";
import { dateInTimezone } from "@/lib/domain/timezones";

export function sessionStatusFilter(
  value?: string | string[],
): SessionStatus | undefined {
  return value === "scheduled" || value === "completed" || value === "cancelled"
    ? value
    : undefined;
}

export function sessionPageBounds(total: number, requestedPage?: string | string[]) {
  const pageCount = Math.max(1, Math.ceil(total / 10));
  const parsed =
    typeof requestedPage === "string" && /^[1-9]\d*$/.test(requestedPage)
      ? Number(requestedPage)
      : 1;
  const page = Math.min(pageCount, parsed);
  const from = (page - 1) * 10;
  return { page, pageCount, total, from, to: from + 9 };
}

export function paginateSessions<T>(sessions: T[], requestedPage?: string | string[]) {
  const { page, pageCount, total, from, to } = sessionPageBounds(
    sessions.length,
    requestedPage,
  );
  return { items: sessions.slice(from, to + 1), page, pageCount, total };
}

export function upcomingSessionDay(
  scheduledFor: string,
  timezone: string,
  now = new Date(),
): string {
  const today = dateInTimezone(now, timezone);
  const day = sessionDateKey(scheduledFor);
  if (day === today) return "Tonight";
  if (day === addDays(today, 1)) return "Tomorrow";
  return formatSessionDate(scheduledFor);
}

export function formatSessionDate(scheduledFor: string): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${sessionDateKey(scheduledFor)}T12:00:00Z`));
}

export function sessionPageNumbers(
  page: number,
  pageCount: number,
): (number | "ellipsis")[] {
  const visible = new Set([1, pageCount, page - 1, page, page + 1]);
  const pages = [...visible]
    .filter((n) => n >= 1 && n <= pageCount)
    .sort((a, b) => a - b);
  const result: (number | "ellipsis")[] = [];
  pages.forEach((n, i) => {
    const previous = pages[i - 1];
    if (previous && n - previous === 2) result.push(previous + 1);
    else if (previous && n - previous > 2) result.push("ellipsis");
    result.push(n);
  });
  return result;
}

/**
 * Filters for the schedule's "Reading nights" list. "upcoming" means scheduled nights
 * from today on; past nights that were never logged only show under "all".
 */
export type SessionListFilter = "all" | "upcoming" | "completed" | "canceled";

export const SESSION_LIST_FILTERS = [
  "upcoming",
  "completed",
  "canceled",
  "all",
] as const satisfies readonly SessionListFilter[];

export type SessionFilterCounts = Record<SessionListFilter, number>;

/**
 * Parses `?status=`; accepts both spellings of canceled and the legacy "scheduled".
 * With no (or an unknown) value the list shows upcoming nights.
 */
export function sessionListFilter(value?: string | string[]): SessionListFilter {
  switch (value) {
    case "all":
      return "all";
    case "completed":
      return "completed";
    case "canceled":
    case "cancelled":
      return "canceled";
    default:
      return "upcoming";
  }
}

/** The `?status=` value for a filter, or undefined for the default (upcoming). */
export function sessionFilterParam(filter: SessionListFilter): string | undefined {
  return filter === "upcoming" ? undefined : filter;
}

/** Start of the family's local day in the wall-clock-as-UTC format sessions use. */
export function sessionDayStart(today: string): string {
  return `${today}T00:00:00Z`;
}

function isUpcoming(
  session: { status: SessionStatus; scheduledFor: string },
  today: string,
) {
  return session.status === "scheduled" && sessionDateKey(session.scheduledFor) >= today;
}

/**
 * Filters and orders sessions for the list: upcoming nights soonest first, past or
 * finished nights most recent first. "all" shows upcoming nights before the rest.
 */
export function filterSessionsForList<
  T extends { id: string; status: SessionStatus; scheduledFor: string },
>(sessions: T[], filter: SessionListFilter, today: string) {
  const ascending = (a: T, b: T) =>
    a.scheduledFor.localeCompare(b.scheduledFor) || a.id.localeCompare(b.id);
  const descending = (a: T, b: T) => ascending(b, a);
  const upcoming = sessions.filter((s) => isUpcoming(s, today)).sort(ascending);
  const counts: SessionFilterCounts = {
    all: sessions.length,
    upcoming: upcoming.length,
    completed: sessions.filter((s) => s.status === "completed").length,
    canceled: sessions.filter((s) => s.status === "cancelled").length,
  };
  const byStatus = (status: SessionStatus) =>
    sessions.filter((s) => s.status === status).sort(descending);
  const items =
    filter === "upcoming"
      ? upcoming
      : filter === "completed"
        ? byStatus("completed")
        : filter === "canceled"
          ? byStatus("cancelled")
          : [
              ...upcoming,
              ...sessions.filter((s) => !isUpcoming(s, today)).sort(descending),
            ];
  return { items, counts };
}
