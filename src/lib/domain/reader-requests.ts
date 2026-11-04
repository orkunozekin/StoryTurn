import { sessionDateKey } from "@/lib/domain/sessions";
import type {
  FamilyMember,
  ReadingSession,
  SessionAssignment,
  SessionReaderRequest,
  SessionReaderRequestStatus,
} from "@/lib/types";

/** Longest note a requester can attach ("Can I take Saturday? I'm in town."). */
export const READER_REQUEST_NOTE_MAX = 200;

export type RequestCheck = { ok: true } | { ok: false; reason: string };

/**
 * A night can be asked for only while it is still scheduled and its family-local
 * calendar day is today or later. `today` is YYYY-MM-DD in the family timezone.
 */
export function nightBlockReason(
  session: Pick<ReadingSession, "status" | "scheduledFor">,
  today: string,
): string | null {
  if (session.status === "cancelled") return "This night was canceled";
  if (session.status === "completed") return "This night is already done";
  if (sessionDateKey(session.scheduledFor) < today) return "This night has passed";
  return null;
}

export function isRequestableNight(
  session: Pick<ReadingSession, "status" | "scheduledFor">,
  today: string,
): boolean {
  return nightBlockReason(session, today) === null;
}

export function normalizeRequestNote(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const note = raw.replace(/\s+/g, " ").trim();
  if (!note) return null;
  if (note.length > READER_REQUEST_NOTE_MAX) {
    throw new Error(`Keep the note under ${READER_REQUEST_NOTE_MAX} characters`);
  }
  return note;
}

export function isCurrentReader(
  assignments: Pick<SessionAssignment, "sessionId" | "memberId" | "isCurrent">[],
  sessionId: string,
  memberId: string,
): boolean {
  return assignments.some(
    (a) => a.sessionId === sessionId && a.memberId === memberId && a.isCurrent,
  );
}

/** Who may ask for a night: any family member not already reading it. */
export function canRequestNight(params: {
  member: Pick<FamilyMember, "id" | "familyId">;
  session: Pick<ReadingSession, "id" | "familyId" | "status" | "scheduledFor">;
  assignments: Pick<SessionAssignment, "sessionId" | "memberId" | "isCurrent">[];
  requests: Pick<SessionReaderRequest, "sessionId" | "memberId" | "status">[];
  today: string;
}): RequestCheck {
  const { member, session } = params;
  if (session.familyId !== member.familyId) {
    return { ok: false, reason: "Night not found" };
  }
  const blocked = nightBlockReason(session, params.today);
  if (blocked) return { ok: false, reason: blocked };
  if (isCurrentReader(params.assignments, session.id, member.id)) {
    return { ok: false, reason: "You're already reading this night" };
  }
  if (
    params.requests.some(
      (r) =>
        r.sessionId === session.id && r.memberId === member.id && r.status === "pending",
    )
  ) {
    return { ok: false, reason: "You already asked for this night" };
  }
  return { ok: true };
}

/**
 * Pending requests on nights that can no longer be read (past, canceled,
 * completed) are expired: they are shown as closed and cannot be decided.
 */
export function effectiveRequestStatus(
  request: Pick<SessionReaderRequest, "status">,
  session: Pick<ReadingSession, "status" | "scheduledFor"> | undefined,
  today: string,
): SessionReaderRequestStatus {
  if (request.status !== "pending") return request.status;
  if (!session || !isRequestableNight(session, today)) return "expired";
  return "pending";
}

export function withEffectiveStatus<T extends SessionReaderRequest>(
  requests: T[],
  sessions: Pick<ReadingSession, "id" | "status" | "scheduledFor">[],
  today: string,
): T[] {
  const byId = new Map(sessions.map((s) => [s.id, s]));
  return requests.map((request) => {
    const status = effectiveRequestStatus(request, byId.get(request.sessionId), today);
    return status === request.status ? request : { ...request, status };
  });
}

export interface RequestStatusChange {
  id: string;
  status: Exclude<SessionReaderRequestStatus, "pending">;
  decidedAt: string;
  decidedByMemberId: string | null;
}

export interface DecisionPlan {
  /** Status changes to persist, the decided request first. */
  changes: RequestStatusChange[];
  /** Set when approving: this member becomes the night's only reader. */
  newReaderId: string | null;
}

/**
 * Owner approves or declines one pending request. Approving makes the requester
 * the reader and declines every other pending request for that night.
 */
export function planRequestDecision(params: {
  decider: Pick<FamilyMember, "id" | "familyId" | "role">;
  request: SessionReaderRequest;
  session: Pick<ReadingSession, "id" | "familyId" | "status" | "scheduledFor">;
  otherRequests: SessionReaderRequest[];
  approve: boolean;
  today: string;
  nowIso?: string;
}): DecisionPlan {
  const { decider, request, session } = params;
  if (decider.role !== "owner") {
    throw new Error("Only parents can approve or decline requests");
  }
  if (request.familyId !== decider.familyId || session.familyId !== decider.familyId) {
    throw new Error("Request not found");
  }
  if (request.sessionId !== session.id) throw new Error("Request not found");
  if (request.status !== "pending") {
    throw new Error("This request was already closed");
  }
  const blocked = nightBlockReason(session, params.today);
  if (blocked) throw new Error(`${blocked}; the request has expired`);

  const decidedAt = params.nowIso ?? new Date().toISOString();
  const changes: RequestStatusChange[] = [
    {
      id: request.id,
      status: params.approve ? "approved" : "declined",
      decidedAt,
      decidedByMemberId: decider.id,
    },
  ];
  if (params.approve) {
    for (const other of params.otherRequests) {
      if (
        other.id !== request.id &&
        other.sessionId === session.id &&
        other.status === "pending"
      ) {
        changes.push({
          id: other.id,
          status: "declined",
          decidedAt,
          decidedByMemberId: decider.id,
        });
      }
    }
  }
  return { changes, newReaderId: params.approve ? request.memberId : null };
}

/** Only the requester can withdraw, and only while the request is open. */
export function planWithdraw(params: {
  member: Pick<FamilyMember, "id" | "familyId">;
  request: SessionReaderRequest;
  nowIso?: string;
}): RequestStatusChange {
  const { member, request } = params;
  if (request.familyId !== member.familyId || request.memberId !== member.id) {
    throw new Error("Request not found");
  }
  if (request.status !== "pending") {
    throw new Error("This request was already closed");
  }
  return {
    id: request.id,
    status: "withdrawn",
    decidedAt: params.nowIso ?? new Date().toISOString(),
    decidedByMemberId: null,
  };
}

export function approvalCorrectionReason(requesterName: string, note: string | null) {
  return note
    ? `Approved ${requesterName}'s request to read: “${note}”`
    : `Approved ${requesterName}'s request to read`;
}

const STATUS_LABELS: Record<SessionReaderRequestStatus, string> = {
  pending: "Requested · waiting for a parent",
  approved: "Request approved",
  declined: "Request declined",
  withdrawn: "Request withdrawn",
  expired: "Request expired",
};

export function readerRequestStatusLabel(status: SessionReaderRequestStatus): string {
  return STATUS_LABELS[status];
}
