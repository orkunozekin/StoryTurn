import { parseChildRelation } from "@/lib/domain/relations";
import type {
  Book,
  Family,
  FamilyMember,
  InviteCode,
  Kid,
  ReadingSession,
  Schedule,
  SessionAssignment,
  SessionBook,
  SessionCorrection,
  SessionStatus,
} from "@/lib/types";

export function toWallClock(value: string): string {
  const match = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/.exec(value);
  if (!match) return value;
  return `${match[1]}T${match[2]}:00`;
}

export function toTimeHm(value: string): string {
  const match = /^(\d{2}:\d{2})/.exec(value);
  return match?.[1] ?? value;
}

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

type Row = Record<string, unknown>;

function str(row: Row, key: string): string {
  const value = row[key];
  return typeof value === "string" ? value : "";
}

function strOrNull(row: Row, key: string): string | null {
  const value = row[key];
  return typeof value === "string" ? value : null;
}

export function mapFamily(row: Row): Family {
  return {
    id: str(row, "id"),
    name: str(row, "name"),
    createdByUserId: str(row, "created_by"),
    createdAt: str(row, "created_at"),
  };
}

export function mapMember(row: Row): FamilyMember {
  const role = str(row, "role");
  return {
    id: str(row, "id"),
    familyId: str(row, "family_id"),
    userId: str(row, "user_id"),
    displayName: str(row, "display_name"),
    email: str(row, "email"),
    role: role === "owner" ? "owner" : "reader",
    relationToChildren: parseChildRelation(row.relation_to_children, "other"),
    createdAt: str(row, "created_at"),
  };
}

export function mapKid(row: Row): Kid {
  const birthday =
    typeof row.birthday === "string" && row.birthday
      ? row.birthday.slice(0, 10)
      : null;
  return {
    id: str(row, "id"),
    familyId: str(row, "family_id"),
    name: str(row, "name"),
    birthday: birthday ?? "2020-01-01",
    createdAt: str(row, "created_at"),
  };
}

export function mapInvite(row: Row): InviteCode {
  return {
    id: str(row, "id"),
    familyId: str(row, "family_id"),
    code: str(row, "code"),
    createdByMemberId: str(row, "created_by_member_id"),
    expiresAt: strOrNull(row, "expires_at"),
    maxUses:
      row.max_uses === null || row.max_uses === undefined ? null : Number(row.max_uses),
    uses: Number(row.uses ?? 0),
    role: str(row, "role") === "owner" ? "owner" : "reader",
    createdAt: str(row, "created_at"),
  };
}

export function mapBook(row: Row): Book {
  const authors = row.authors;
  return {
    id: str(row, "id"),
    familyId: str(row, "family_id"),
    title: str(row, "title"),
    authors: Array.isArray(authors) ? authors.map(String) : [],
    openLibraryKey: strOrNull(row, "open_library_key"),
    coverUrl: strOrNull(row, "cover_url"),
    isbn: strOrNull(row, "isbn"),
    description: strOrNull(row, "description"),
    editionKey: strOrNull(row, "edition_key"),
    format: strOrNull(row, "format"),
    publisher: strOrNull(row, "publisher"),
    editionYear: strOrNull(row, "edition_year"),
    createdAt: str(row, "created_at"),
  };
}

export function mapSchedule(row: Row): Schedule {
  const ids = row.reader_rotation_member_ids;
  const timing = str(row, "book_timing");
  return {
    id: str(row, "id"),
    familyId: str(row, "family_id"),
    mode: "together",
    readerRotationMemberIds: Array.isArray(ids) ? ids.map(String) : [],
    startDate: str(row, "start_date").slice(0, 10),
    timeLocal: toTimeHm(str(row, "time_local")),
    timezone: str(row, "timezone"),
    bookTiming: timing === "ahead" ? "ahead" : "after",
    booksPerSession:
      typeof row.books_per_session === "number" ? row.books_per_session : 1,
    assignRandomBooks: row.assign_random_books === true,
    active: Boolean(row.active),
    createdAt: str(row, "created_at"),
  };
}

function sessionStatus(value: string): SessionStatus {
  if (value === "completed" || value === "cancelled" || value === "scheduled") {
    return value;
  }
  return "scheduled";
}

export function mapSession(row: Row): ReadingSession {
  return {
    id: str(row, "id"),
    familyId: str(row, "family_id"),
    scheduleId: strOrNull(row, "schedule_id"),
    scheduledFor: toWallClock(str(row, "scheduled_for")),
    status: sessionStatus(str(row, "status")),
    cancellationSource:
      row.cancellation_source === "schedule"
        ? "schedule"
        : row.cancellation_source === "individual"
          ? "individual"
          : null,
    notes: strOrNull(row, "notes"),
    icsUid: str(row, "ics_uid"),
    calendarSequence: Number(row.calendar_sequence ?? 0),
    createdAt: str(row, "created_at"),
    updatedAt: str(row, "updated_at"),
  };
}

export function mapAssignment(row: Row): SessionAssignment {
  return {
    id: str(row, "id"),
    sessionId: str(row, "session_id"),
    memberId: str(row, "member_id"),
    isOriginal: Boolean(row.is_original),
    isCurrent: Boolean(row.is_current),
    createdAt: str(row, "created_at"),
  };
}

export function mapSessionBook(row: Row): SessionBook {
  return {
    id: str(row, "id"),
    sessionId: str(row, "session_id"),
    bookId: strOrNull(row, "book_id"),
    titleFreeform: strOrNull(row, "title_freeform"),
    createdAt: str(row, "created_at"),
  };
}

function snapshot(value: unknown): SessionCorrection["before"] {
  const row = (value ?? {}) as Record<string, unknown>;
  return {
    status: typeof row.status === "string" ? row.status : "scheduled",
    currentMemberIds: Array.isArray(row.currentMemberIds)
      ? row.currentMemberIds.map(String)
      : [],
    bookTitles: Array.isArray(row.bookTitles) ? row.bookTitles.map(String) : [],
    notes: typeof row.notes === "string" ? row.notes : null,
  };
}

export function mapCorrection(row: Row): SessionCorrection {
  return {
    id: str(row, "id"),
    sessionId: str(row, "session_id"),
    correctedByMemberId: str(row, "corrected_by_member_id"),
    reason: str(row, "reason"),
    before: snapshot(row.before),
    after: snapshot(row.after),
    createdAt: str(row, "created_at"),
  };
}

export function partitionAssignmentWrites(rows: SessionAssignment[]): {
  updates: SessionAssignment[];
  inserts: Array<Omit<SessionAssignment, "id">>;
} {
  const updates: SessionAssignment[] = [];
  const inserts: Array<Omit<SessionAssignment, "id">> = [];
  for (const row of rows) {
    if (isUuid(row.id)) {
      updates.push(row);
    } else {
      inserts.push({
        sessionId: row.sessionId,
        memberId: row.memberId,
        isOriginal: row.isOriginal,
        isCurrent: row.isCurrent,
        createdAt: row.createdAt,
      });
    }
  }
  return { updates, inserts };
}
