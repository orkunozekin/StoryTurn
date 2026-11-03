import type { ChildRelation } from "@/lib/domain/relations";

export type MemberRole = "owner" | "reader";

export type SessionStatus = "scheduled" | "completed" | "cancelled";

export type BookTiming = "ahead" | "after";

export type ScheduleMode = "together";

export type { ChildRelation };

export interface Family {
  id: string;
  name: string;
  createdByUserId: string;
  createdAt: string;
}

export interface FamilyMember {
  id: string;
  familyId: string;
  userId: string;
  displayName: string;
  email: string;
  role: MemberRole;
  /** How this adult relates to the family's children. */
  relationToChildren: ChildRelation;
  createdAt: string;
}

export interface Kid {
  id: string;
  familyId: string;
  name: string;
  /** YYYY-MM-DD */
  birthday: string;
  createdAt: string;
}

export interface InviteCode {
  id: string;
  familyId: string;
  code: string;
  createdByMemberId: string;
  expiresAt: string | null;
  maxUses: number | null;
  uses: number;
  role?: MemberRole;
  createdAt: string;
}

export interface Book {
  editionKey?: string | null;
  format?: string | null;
  publisher?: string | null;
  editionYear?: string | null;
  id: string;
  familyId: string;
  title: string;
  authors: string[];
  openLibraryKey: string | null;
  coverUrl: string | null;
  isbn: string | null;
  /** Plain text from Google Books or Open Library. */
  description?: string | null;
  createdAt: string;
}

export interface Schedule {
  id: string;
  familyId: string;
  mode: ScheduleMode;
  readerRotationMemberIds: string[];
  startDate: string; // YYYY-MM-DD
  timeLocal: string; // HH:mm
  timezone: string;
  bookTiming: BookTiming;
  booksPerSession?: number;
  assignRandomBooks?: boolean;
  active: boolean;
  createdAt: string;
}

export interface SessionAssignment {
  id: string;
  sessionId: string;
  memberId: string;
  isOriginal: boolean;
  isCurrent: boolean;
  createdAt: string;
}

export interface SessionBook {
  id: string;
  sessionId: string;
  bookId: string | null;
  titleFreeform: string | null;
  createdAt: string;
}

export interface SessionCorrection {
  id: string;
  sessionId: string;
  correctedByMemberId: string;
  reason: string;
  before: {
    status: string;
    currentMemberIds: string[];
    bookTitles: string[];
    notes: string | null;
  };
  after: {
    status: string;
    currentMemberIds: string[];
    bookTitles: string[];
    notes: string | null;
  };
  createdAt: string;
}

export interface ReadingSession {
  id: string;
  familyId: string;
  scheduleId: string | null;
  scheduledFor: string; // ISO datetime
  status: SessionStatus;
  cancellationSource?: "schedule" | "individual" | null;
  notes: string | null;
  icsUid: string;
  calendarSequence?: number;
  createdAt: string;
  updatedAt: string;
}

export interface UserAccount {
  id: string;
  email: string;
  displayName: string;
  passwordHash: string | null; // demo-only; Supabase owns real passwords
  createdAt: string;
}

export interface AppState {
  users: UserAccount[];
  families: Family[];
  members: FamilyMember[];
  kids: Kid[];
  invites: InviteCode[];
  books: Book[];
  schedules: Schedule[];
  sessions: ReadingSession[];
  assignments: SessionAssignment[];
  sessionBooks: SessionBook[];
  corrections: SessionCorrection[];
  outboundEmails: OutboundEmail[];
}

export interface OutboundEmail {
  id: string;
  to: string[];
  subject: string;
  body: string;
  icsContent: string | null;
  createdAt: string;
}

export type DashboardFilter = { type: "member"; memberId: string } | { type: "family" };
