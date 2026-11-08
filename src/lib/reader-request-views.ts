import type { MyRequestView, PendingRequestView } from "@/components/reader-requests";
import { formatRelativeSessionWhen } from "@/lib/domain/dates";
import { childRelationLabel } from "@/lib/domain/relations";
import { familyDisplayNames } from "@/lib/first-name";
import type {
  FamilyMember,
  ReadingSession,
  SessionAssignment,
  SessionReaderRequest,
} from "@/lib/types";

/** Plain props for the parent Approve / Decline list. */
export function pendingRequestViews(params: {
  requests: SessionReaderRequest[];
  sessions: ReadingSession[];
  assignments: SessionAssignment[];
  readers: FamilyMember[];
  today: string;
  timeZone: string;
}): PendingRequestView[] {
  const sessions = new Map(params.sessions.map((s) => [s.id, s]));
  const readers = new Map(params.readers.map((r) => [r.id, r]));
  const names = familyDisplayNames(params.readers);
  return params.requests
    .filter((r) => r.status === "pending" && sessions.has(r.sessionId))
    .sort((a, b) => {
      const night = sessions
        .get(a.sessionId)!
        .scheduledFor.localeCompare(sessions.get(b.sessionId)!.scheduledFor);
      return night || a.createdAt.localeCompare(b.createdAt);
    })
    .map((request) => {
      const requester = readers.get(request.memberId);
      return {
        id: request.id,
        sessionId: request.sessionId,
        requesterName: names[request.memberId] ?? "A reader",
        requesterRelation: requester
          ? childRelationLabel(requester.relationToChildren)
          : "Reader",
        note: request.note,
        nightLabel: formatRelativeSessionWhen(sessions.get(request.sessionId)!.scheduledFor, {
          today: params.today,
          timeZone: params.timeZone,
        }),
        currentReader: params.assignments
          .filter((a) => a.sessionId === request.sessionId && a.isCurrent)
          .map((a) => names[a.memberId] ?? "Reader")
          .join(", "),
      };
    });
}

/** The member's most recent request for a night, if any. */
export function myLatestRequest(
  requests: SessionReaderRequest[],
  sessionId: string,
  memberId: string,
): MyRequestView | null {
  const mine = requests
    .filter((r) => r.sessionId === sessionId && r.memberId === memberId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const latest = mine.find((r) => r.status === "pending") ?? mine[0];
  return latest ? { id: latest.id, status: latest.status, note: latest.note } : null;
}
