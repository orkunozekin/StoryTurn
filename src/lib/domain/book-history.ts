import { familyDisplayNames } from "@/lib/first-name";
import { effectiveStatus, isUpcomingNight } from "@/lib/domain/sessions";
import type {
  Book,
  FamilyMember,
  ReadingSession,
  SessionAssignment,
  SessionBook,
} from "@/lib/types";

export type BookNight = {
  sessionId: string;
  scheduledFor: string;
  readers: string[];
  /** Other books logged on the same night. */
  alongside: string[];
};

export type BookHistory = {
  timesRead: number;
  lastRead: BookNight | null;
  /** Who read it most; several names when tied. */
  topReader: { names: string[]; count: number } | null;
  /** Completed nights with this book, most recent first. */
  history: BookNight[];
  /** Scheduled nights from today on with this book lined up, soonest first. */
  upcoming: BookNight[];
};

type Input = {
  bookId: string;
  sessions: ReadingSession[];
  assignments: SessionAssignment[];
  sessionBooks: SessionBook[];
  books: Pick<Book, "id" | "title">[];
  members: Pick<FamilyMember, "id" | "displayName">[];
  /** YYYY-MM-DD in the family's timezone. */
  today: string;
};

/** A book's reading life, worked out from the nights that logged it. */
export const computeBookHistory = ({
  bookId,
  sessions,
  assignments,
  sessionBooks,
  books,
  members,
  today,
}: Input): BookHistory => {
  const nameOf = new Map(Object.entries(familyDisplayNames(members)));
  const titleOf = new Map(books.map((b) => [b.id, b.title]));
  const sessionIds = new Set(
    sessionBooks.filter((sb) => sb.bookId === bookId).map((sb) => sb.sessionId),
  );

  const readersFor = (sessionId: string) =>
    assignments
      .filter((a) => a.sessionId === sessionId && a.isCurrent)
      .map((a) => nameOf.get(a.memberId))
      .filter((name): name is string => Boolean(name));

  const alongsideFor = (sessionId: string) =>
    sessionBooks
      .filter((sb) => sb.sessionId === sessionId && sb.bookId !== bookId)
      .map((sb) => sb.titleFreeform ?? (sb.bookId ? titleOf.get(sb.bookId) : undefined))
      .filter((title): title is string => Boolean(title));

  const toNight = (session: ReadingSession): BookNight => ({
    sessionId: session.id,
    scheduledFor: session.scheduledFor,
    readers: readersFor(session.id),
    alongside: alongsideFor(session.id),
  });

  const withBook = sessions.filter((s) => sessionIds.has(s.id));
  const history = withBook
    .filter((s) => effectiveStatus(s, today) === "completed")
    .sort((a, b) => b.scheduledFor.localeCompare(a.scheduledFor))
    .map(toNight);
  const upcoming = withBook
    .filter((s) => isUpcomingNight(s, today))
    .sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor))
    .map(toNight);

  // Tally by member id: two family members can share a display name.
  const counts = new Map<string, number>();
  for (const night of history) {
    const ids = new Set(
      assignments
        .filter((a) => a.sessionId === night.sessionId && a.isCurrent)
        .map((a) => a.memberId),
    );
    for (const memberId of ids) {
      if (nameOf.has(memberId)) counts.set(memberId, (counts.get(memberId) ?? 0) + 1);
    }
  }
  const most = Math.max(0, ...counts.values());
  const leaders = [...counts.entries()]
    .filter(([, count]) => count === most && most > 0)
    .map(([memberId]) => nameOf.get(memberId) ?? "")
    .sort((a, b) => a.localeCompare(b));

  return {
    timesRead: history.length,
    lastRead: history[0] ?? null,
    topReader: leaders.length > 0 ? { names: leaders, count: most } : null,
    history,
    upcoming,
  };
};
