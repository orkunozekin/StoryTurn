import { editionLabel } from "@/lib/book-edition";
import type {
  Book,
  DashboardFilter,
  ReadingSession,
  SessionAssignment,
  SessionBook,
} from "@/lib/types";
import { effectiveStatus, sessionDateKey } from "@/lib/domain/sessions";

export interface BookReadStat {
  title: string;
  edition?: string;
  bookId: string | null;
  readCount: number;
  lastReadAt: string | null;
}

export interface DashboardStats {
  totalBooksLogged: number;
  uniqueTitles: number;
  sessionsCompleted: number;
  recent: BookReadStat[];
  allTime: BookReadStat[];
}

function sessionsMatchingFilter(params: {
  sessions: ReadingSession[];
  assignments: SessionAssignment[];
  filter: DashboardFilter;
  today: string;
}): ReadingSession[] {
  const completed = params.sessions.filter(
    (s) => effectiveStatus(s, params.today) === "completed",
  );
  if (params.filter.type === "family") {
    return completed;
  }
  const memberId = params.filter.memberId;
  const ids = new Set(
    params.assignments
      .filter((a) => a.memberId === memberId && a.isCurrent)
      .map((a) => a.sessionId),
  );
  return completed.filter((s) => ids.has(s.id));
}

export function computeDashboardStats(params: {
  sessions: ReadingSession[];
  assignments: SessionAssignment[];
  sessionBooks: SessionBook[];
  books: Book[];
  filter: DashboardFilter;
  recentDays?: number;
  nowIso?: string;
}): DashboardStats {
  const recentDays = params.recentDays ?? 30;
  const nowDay = (params.nowIso ?? new Date().toISOString()).slice(0, 10);
  const cutoff = new Date(`${nowDay}T00:00:00.000Z`);
  cutoff.setUTCDate(cutoff.getUTCDate() - recentDays);
  const cutoffKey = cutoff.toISOString().slice(0, 10);

  const matched = sessionsMatchingFilter({ ...params, today: nowDay });
  const matchedIds = new Set(matched.map((s) => s.id));
  const bookById = new Map(params.books.map((b) => [b.id, b]));

  const tallies = new Map<
    string,
    { title: string; bookId: string | null; count: number; last: string | null }
  >();

  for (const sb of params.sessionBooks) {
    if (!matchedIds.has(sb.sessionId)) continue;
    const session = matched.find((s) => s.id === sb.sessionId);
    if (!session) continue;
    const title =
      sb.titleFreeform ??
      (sb.bookId ? (bookById.get(sb.bookId)?.title ?? "Unknown") : "Unknown");
    const key = sb.bookId ?? `free:${title.toLowerCase()}`;
    const existing = tallies.get(key) ?? {
      title,
      bookId: sb.bookId,
      count: 0,
      last: null,
    };
    existing.count += 1;
    const day = sessionDateKey(session.scheduledFor);
    if (!existing.last || day > existing.last) existing.last = day;
    tallies.set(key, existing);
  }

  const allTime = [...tallies.values()]
    .map((t) => ({
      title: t.title,
      edition:
        t.bookId && bookById.get(t.bookId)
          ? editionLabel(bookById.get(t.bookId)!)
          : undefined,
      bookId: t.bookId,
      readCount: t.count,
      lastReadAt: t.last,
    }))
    .sort(
      (a, b) =>
        b.readCount - a.readCount ||
        (b.lastReadAt ?? "").localeCompare(a.lastReadAt ?? ""),
    );

  const recent = allTime.filter((t) => t.lastReadAt && t.lastReadAt >= cutoffKey);

  return {
    totalBooksLogged: params.sessionBooks.filter((sb) => matchedIds.has(sb.sessionId))
      .length,
    uniqueTitles: allTime.length,
    sessionsCompleted: matched.length,
    recent,
    allTime,
  };
}
