import { addDays, readerForDate } from "@/lib/domain/rotation";
import type {
  ReadingSession,
  Schedule,
  SessionAssignment,
  SessionStatus,
} from "@/lib/types";

export interface GeneratedSessionDraft {
  scheduledFor: string;
  memberId: string;
  icsUid: string;
}

function combineLocalDateTime(date: string, timeLocal: string, timezone: string): string {
  // Store as ISO-like local wall time with timezone label for display;
  // ICS builder interprets date + time + timezone explicitly.
  void timezone;
  return `${date}T${timeLocal}:00`;
}

export function buildIcsUid(familyId: string, date: string): string {
  return `storyturn-${familyId}-${date}@bedtime-readers.app`;
}

export function generateSessionsFromSchedule(params: {
  schedule: Schedule;
  existingSessionDates: Set<string>;
  throughDate: string;
  nowDate?: string;
}): GeneratedSessionDraft[] {
  const { schedule, existingSessionDates, throughDate } = params;
  if (!schedule.active) return [];
  if (schedule.readerRotationMemberIds.length === 0) return [];

  const drafts: GeneratedSessionDraft[] = [];
  let cursor = schedule.startDate;
  if (params.nowDate && cursor < params.nowDate) cursor = params.nowDate;

  while (cursor <= throughDate) {
    if (!existingSessionDates.has(cursor)) {
      const memberId = readerForDate(
        schedule.readerRotationMemberIds,
        schedule.startDate,
        cursor,
      );
      drafts.push({
        scheduledFor: combineLocalDateTime(cursor, schedule.timeLocal, schedule.timezone),
        memberId,
        icsUid: buildIcsUid(schedule.familyId, cursor),
      });
    }
    cursor = addDays(cursor, 1);
  }

  return drafts;
}

export function sessionDateKey(scheduledFor: string): string {
  return scheduledFor.slice(0, 10);
}

export function isPastSession(
  scheduledFor: string,
  nowIso: string = new Date().toISOString(),
): boolean {
  const sessionDay = sessionDateKey(scheduledFor);
  const nowDay = nowIso.slice(0, 10);
  return sessionDay < nowDay;
}

export function canEditFreely(
  session: Pick<ReadingSession, "scheduledFor" | "status">,
  nowIso?: string,
): boolean {
  if (session.status === "cancelled") return false;
  return !isPastSession(session.scheduledFor, nowIso);
}

export function nextSessionForMember(params: {
  sessions: ReadingSession[];
  assignments: SessionAssignment[];
  memberId: string;
  nowIso?: string;
}): ReadingSession | null {
  const now = params.nowIso ?? new Date().toISOString();
  const nowDay = now.slice(0, 10);

  const assignedSessionIds = new Set(
    params.assignments
      .filter((a) => a.memberId === params.memberId && a.isCurrent)
      .map((a) => a.sessionId),
  );

  const upcoming = params.sessions
    .filter(
      (s) =>
        assignedSessionIds.has(s.id) &&
        s.status === "scheduled" &&
        sessionDateKey(s.scheduledFor) >= nowDay,
    )
    .sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor));

  return upcoming[0] ?? null;
}

export function assertTransition(from: SessionStatus, to: SessionStatus): void {
  if (from === to) return;
  if (from === "completed" && to === "scheduled") {
    throw new Error("Completed sessions cannot return to scheduled");
  }
}

type DatedStatus = { status: SessionStatus; scheduledFor: string };

/** Coming up: scheduled and dated today (the family's local date) or later. */
export function isUpcomingNight(session: DatedStatus, today: string): boolean {
  return session.status === "scheduled" && sessionDateKey(session.scheduledFor) >= today;
}

/** Past: not cancelled, and either logged or dated before today. */
export function isPastNight(session: DatedStatus, today: string): boolean {
  if (session.status === "cancelled") return false;
  return session.status === "completed" || sessionDateKey(session.scheduledFor) < today;
}

/** A scheduled night before today counts as completed; otherwise the stored status. */
export function effectiveStatus(session: DatedStatus, today: string): SessionStatus {
  return session.status === "scheduled" && sessionDateKey(session.scheduledFor) < today
    ? "completed"
    : session.status;
}
