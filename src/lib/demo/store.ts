import type { SessionStatus } from "@/lib/types";
import { paginateLibrary } from "@/lib/domain/library-page";
import { paginateSessions } from "@/lib/domain/session-presentation";
import {
  assertScheduleSettings,
  selectRandomBooks,
} from "@/lib/domain/schedule-settings";
import { dateInTimezone } from "@/lib/domain/calendar-date";
import {
  buildCascadePlan,
  orderedFutureScheduledNights,
  planSwapNights,
} from "@/lib/domain/cascade";
import { applyReassignment, buildCorrectionRecord } from "@/lib/domain/corrections";
import {
  generateInviteCode,
  isInviteUsable,
  normalizeInviteCode,
} from "@/lib/domain/invites";
import {
  assertTransition,
  buildIcsUid,
  generateSessionsFromSchedule,
  isPastSession,
  nextSessionForMember,
  sessionDateKey,
} from "@/lib/domain/sessions";
import {
  checkForDuplicate,
  mergeKeptBook,
  storedIsbnKey,
  type AddBookResolution,
  type AddBookResult,
  type BookInput,
} from "@/lib/domain/book-duplicates";
import { computeDashboardStats } from "@/lib/domain/stats";
import { birthdayFromAge, parseBirthday } from "@/lib/domain/kids";
import { DEFAULT_FAMILY_TIMEZONE, formatDateOnlyInTimeZone } from "@/lib/domain/dates";
import { parseChildRelation, type ChildRelation } from "@/lib/domain/relations";
import { addDays, formatDateOnly, readerForDate } from "@/lib/domain/rotation";
import {
  pickRandomBookIds,
  SESSION_BOOK_PICK_COUNT,
  sessionHasLibraryBooks,
} from "@/lib/domain/session-books";
import { createSeedState } from "@/lib/demo/seed";
import { sendSessionInviteEmail } from "@/lib/session-mail";
import type {
  AppState,
  Book,
  DashboardFilter,
  FamilyMember,
  Kid,
  ReadingSession,
  UserAccount,
} from "@/lib/types";

const globalForDemo = globalThis as unknown as {
  __storyTurnState?: AppState;
  __storyTurnSessionUserId?: string | null;
};

function state(): AppState {
  if (!globalForDemo.__storyTurnState) {
    globalForDemo.__storyTurnState = createSeedState();
  }
  return globalForDemo.__storyTurnState;
}

function id(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function familyLibraryIds(familyId: string): string[] {
  return state()
    .books.filter((b) => b.familyId === familyId)
    .map((b) => b.id);
}

/** Replace a session's library books with a fresh random pick (keeps freeform titles). */
function setSessionLibraryBooks(sessionId: string, bookIds: string[]): void {
  const freeform = state().sessionBooks.filter(
    (b) => b.sessionId === sessionId && b.bookId === null,
  );
  state().sessionBooks = state().sessionBooks.filter((b) => b.sessionId !== sessionId);
  const now = new Date().toISOString();
  for (const bookId of bookIds) {
    state().sessionBooks.push({
      id: id("sb"),
      sessionId,
      bookId,
      titleFreeform: null,
      createdAt: now,
    });
  }
  state().sessionBooks.push(...freeform);
}

function assignRandomBooksToSession(
  sessionId: string,
  familyId: string,
  count: number = SESSION_BOOK_PICK_COUNT,
): string[] {
  const picked = pickRandomBookIds(familyLibraryIds(familyId), count);
  if (picked.length === 0) return [];
  setSessionLibraryBooks(sessionId, picked);
  return picked;
}

function familyTimezone(familyId: string): string {
  return (
    state().schedules.find((s) => s.familyId === familyId && s.active)?.timezone ??
    DEFAULT_FAMILY_TIMEZONE
  );
}

function upcomingScheduledSessions(familyId: string): ReadingSession[] {
  // Match schedule UI: family-local calendar day, not UTC date-only.
  const today = formatDateOnlyInTimeZone(new Date(), familyTimezone(familyId));
  return state()
    .sessions.filter(
      (s) =>
        s.familyId === familyId &&
        s.status === "scheduled" &&
        sessionDateKey(s.scheduledFor) >= today,
    )
    .sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor));
}

export function resetDemoStore(): void {
  globalForDemo.__storyTurnState = createSeedState();
  globalForDemo.__storyTurnSessionUserId = "user_alex";
}

export function getDemoState(): AppState {
  return state();
}

export function getDemoSessionUserId(): string | null {
  // Do not default to the seeded Alex user. Anonymous browsers (invite links)
  // must stay signed out until they explicitly sign in. Tests call resetDemoStore().
  if (globalForDemo.__storyTurnSessionUserId === undefined) {
    globalForDemo.__storyTurnSessionUserId = null;
  }
  return globalForDemo.__storyTurnSessionUserId;
}

export function setDemoSessionUserId(userId: string | null): void {
  globalForDemo.__storyTurnSessionUserId = userId;
}

export function getCurrentUser(): UserAccount | null {
  const userId = getDemoSessionUserId();
  if (!userId) return null;
  return state().users.find((u) => u.id === userId) ?? null;
}

export function getCurrentMember(): FamilyMember | null {
  const user = getCurrentUser();
  if (!user) return null;
  return state().members.find((m) => m.userId === user.id) ?? null;
}

export function demoLogin(email: string): UserAccount {
  const normalized = email.trim().toLowerCase();
  const existing = state().users.find((u) => u.email === normalized);
  if (existing) {
    setDemoSessionUserId(existing.id);
    return existing;
  }
  const user: UserAccount = {
    id: id("user"),
    email: normalized,
    displayName: normalized.split("@")[0] || "Reader",
    passwordHash: "demo",
    createdAt: new Date().toISOString(),
  };
  state().users.push(user);
  setDemoSessionUserId(user.id);
  return user;
}

export function demoLogout(): void {
  setDemoSessionUserId(null);
}

export function createFamily(
  name: string,
  relationToChildren: ChildRelation = "parent",
): void {
  const user = getCurrentUser();
  if (!user) throw new Error("Not signed in");
  if (getCurrentMember()) throw new Error("Already in a family");

  const now = new Date().toISOString();
  const familyId = id("fam");
  state().families.push({
    id: familyId,
    name: name.trim(),
    createdByUserId: user.id,
    createdAt: now,
  });
  state().members.push({
    id: id("mem"),
    familyId,
    userId: user.id,
    displayName: user.displayName,
    email: user.email,
    role: "owner",
    relationToChildren: parseChildRelation(relationToChildren, "parent"),
    createdAt: now,
  });
  state().invites.push({
    id: id("inv"),
    familyId,
    code: generateInviteCode(),
    createdByMemberId: state().members.at(-1)!.id,
    expiresAt: null,
    maxUses: 25,
    uses: 0,
    createdAt: now,
  });
}

export function findInviteByCode(codeRaw: string) {
  const code = normalizeInviteCode(codeRaw);
  if (!code) return null;
  const invite = state().invites.find((i) => normalizeInviteCode(i.code) === code);
  if (!invite) return null;
  const family = state().families.find((f) => f.id === invite.familyId) ?? null;
  const usable = isInviteUsable({
    code,
    expectedCode: invite.code,
    uses: invite.uses,
    maxUses: invite.maxUses,
    expiresAt: invite.expiresAt,
  });
  return { invite, family, usable, code };
}

export function joinFamily(
  codeRaw: string,
  relationToChildren: ChildRelation = "other",
): void {
  const user = getCurrentUser();
  if (!user) throw new Error("Not signed in");
  if (getCurrentMember()) throw new Error("Already in a family");

  const matched = findInviteByCode(codeRaw);
  if (!matched) throw new Error("Invalid invite code");
  if (!matched.usable.ok) throw new Error(matched.usable.reason);

  matched.invite.uses += 1;
  state().members.push({
    id: id("mem"),
    familyId: matched.invite.familyId,
    userId: user.id,
    displayName: user.displayName,
    email: user.email,
    role: matched.invite.role ?? "reader",
    relationToChildren: parseChildRelation(relationToChildren, "other"),
    createdAt: new Date().toISOString(),
  });
}

function requireOwner(): FamilyMember {
  const member = getCurrentMember();
  if (!member) throw new Error("Join a family first");
  if (member.role !== "owner") {
    throw new Error("Only family admins can do that");
  }
  return member;
}

export function updateMemberRelation(
  memberId: string,
  relationToChildren: ChildRelation,
): void {
  const actor = requireOwner();
  const target = state().members.find(
    (m) => m.id === memberId && m.familyId === actor.familyId,
  );
  if (!target) throw new Error("Member not found");
  target.relationToChildren = parseChildRelation(relationToChildren);
}

/**
 * Insert a fill-in reader on a future night and shift later nights forward.
 * Owner-only. Example: Nana covers tonight → wife moves to tomorrow, etc.
 */
export async function cascadeInsertReader(input: {
  fromSessionId: string;
  fillInMemberId: string;
}): Promise<{ changedSessionIds: string[]; extraSessionId: string }> {
  const actor = requireOwner();
  const fillIn = state().members.find(
    (m) => m.id === input.fillInMemberId && m.familyId === actor.familyId,
  );
  if (!fillIn) throw new Error("Fill-in reader must be in your family");

  const familySessions = state().sessions.filter((s) => s.familyId === actor.familyId);
  const nights = orderedFutureScheduledNights({
    sessions: familySessions,
    assignments: state().assignments,
    fromSessionId: input.fromSessionId,
  });

  const plan = buildCascadePlan({
    nights,
    fillInMemberId: input.fillInMemberId,
    allFamilySessionDates: familySessions.map((s) => sessionDateKey(s.scheduledFor)),
  });

  const schedule = state().schedules.find(
    (s) => s.familyId === actor.familyId && s.active,
  );
  if (!schedule) throw new Error("Save a schedule before cascading");

  for (const step of plan.reassignments) {
    state().assignments = applyReassignment({
      existing: state().assignments,
      sessionId: step.sessionId,
      newMemberIds: [step.memberId],
    });
    await sendSessionInvite(step.sessionId, "REQUEST");
  }

  const extraSessionId = id("ses");
  const extra: ReadingSession = {
    id: extraSessionId,
    familyId: actor.familyId,
    scheduleId: schedule.id,
    scheduledFor: `${plan.extraNightDate}T${schedule.timeLocal}:00`,
    status: "scheduled",
    notes: null,
    icsUid: buildIcsUid(actor.familyId, plan.extraNightDate),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  state().sessions.push(extra);
  state().assignments = applyReassignment({
    existing: state().assignments,
    sessionId: extraSessionId,
    newMemberIds: [plan.extraNightMemberId],
  });
  assignRandomBooksToSession(extraSessionId, actor.familyId);
  await sendSessionInvite(extraSessionId, "REQUEST");

  return {
    changedSessionIds: plan.reassignments.map((r) => r.sessionId),
    extraSessionId,
  };
}

/**
 * Fill upcoming scheduled nights that have no library books with a random pick.
 * Returns how many nights were updated.
 */
export function addRandomBooksToUpcomingSessions(): number {
  const member = getCurrentMember();
  if (!member) throw new Error("Join a family first");
  const library = familyLibraryIds(member.familyId);
  if (library.length === 0) {
    throw new Error("Add books to the family library first");
  }

  let updated = 0;
  for (const session of upcomingScheduledSessions(member.familyId)) {
    if (sessionHasLibraryBooks(state().sessionBooks, session.id)) continue;
    assignRandomBooksToSession(session.id, member.familyId);
    updated += 1;
  }
  return updated;
}

/**
 * Re-pick random library books for every upcoming scheduled night.
 */
export function shuffleBooksForUpcomingSessions(): number {
  const member = getCurrentMember();
  if (!member) throw new Error("Join a family first");
  const library = familyLibraryIds(member.familyId);
  if (library.length === 0) {
    throw new Error("Add books to the family library first");
  }

  let updated = 0;
  for (const session of upcomingScheduledSessions(member.familyId)) {
    assignRandomBooksToSession(session.id, member.familyId);
    updated += 1;
  }
  return updated;
}

/** Re-pick random library books for one upcoming scheduled session. */
export function shuffleSessionBooks(sessionId: string): string[] {
  const member = getCurrentMember();
  if (!member) throw new Error("Join a family first");
  const session = state().sessions.find(
    (s) => s.id === sessionId && s.familyId === member.familyId,
  );
  if (!session) throw new Error("Session not found");
  if (session.status !== "scheduled") {
    throw new Error("Only scheduled nights can shuffle books");
  }
  if (isPastSession(session.scheduledFor)) {
    throw new Error(
      "Past nights cannot shuffle books; edit the session with a correction instead",
    );
  }
  const library = familyLibraryIds(member.familyId);
  if (library.length === 0) {
    throw new Error("Add books to the family library first");
  }
  return assignRandomBooksToSession(session.id, member.familyId);
}

export function getUpcomingBookCtaState() {
  const member = getCurrentMember();
  if (!member) {
    return {
      libraryCount: 0,
      upcomingCount: 0,
      withoutBooksCount: 0,
      withBooksCount: 0,
    };
  }
  const libraryCount = familyLibraryIds(member.familyId).length;
  const upcoming = upcomingScheduledSessions(member.familyId);
  let withoutBooksCount = 0;
  let withBooksCount = 0;
  for (const session of upcoming) {
    if (sessionHasLibraryBooks(state().sessionBooks, session.id)) {
      withBooksCount += 1;
    } else {
      withoutBooksCount += 1;
    }
  }
  return {
    libraryCount,
    upcomingCount: upcoming.length,
    withoutBooksCount,
    withBooksCount,
  };
}

/**
 * Swap current readers between two future scheduled nights. Owner-only.
 */
export async function swapSessionReaders(input: {
  sessionAId: string;
  sessionBId: string;
}): Promise<void> {
  const actor = requireOwner();
  const familySessions = state().sessions.filter((s) => s.familyId === actor.familyId);
  const a = familySessions.find((s) => s.id === input.sessionAId);
  const b = familySessions.find((s) => s.id === input.sessionBId);
  if (!a || !b) throw new Error("Both nights must belong to your family");
  if (a.status !== "scheduled" || b.status !== "scheduled") {
    throw new Error("Only scheduled nights can be swapped");
  }
  const nowDay = formatDateOnly(new Date());
  if (
    sessionDateKey(a.scheduledFor) < nowDay ||
    sessionDateKey(b.scheduledFor) < nowDay
  ) {
    throw new Error("Cannot swap past nights");
  }

  const readerOf = (sessionId: string) => {
    const current = state().assignments.find(
      (asg) => asg.sessionId === sessionId && asg.isCurrent,
    );
    if (!current) throw new Error("Night is missing a reader");
    return current.memberId;
  };

  const swaps = planSwapNights({
    sessionAId: a.id,
    sessionBId: b.id,
    readerAId: readerOf(a.id),
    readerBId: readerOf(b.id),
  });

  for (const step of swaps) {
    state().assignments = applyReassignment({
      existing: state().assignments,
      sessionId: step.sessionId,
      newMemberIds: [step.memberId],
    });
    await sendSessionInvite(step.sessionId, "REQUEST");
  }
}

export function addKid(name: string, birthdayRaw: string): Kid {
  const member = getCurrentMember();
  if (!member) throw new Error("Join a family first");
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Name is required");
  const birthday = parseBirthday(birthdayRaw);
  const kid: Kid = {
    id: id("kid"),
    familyId: member.familyId,
    name: trimmed,
    birthday,
    createdAt: new Date().toISOString(),
  };
  state().kids.push(kid);
  return kid;
}

export type { AddBookResolution, AddBookResult };

/**
 * Same barcode always keeps the earlier book. Same title (and author) asks the
 * caller to resolve: keep both, or replace the existing book's metadata in
 * place so sessions that reference it keep pointing at the same id.
 */
export function addBookFromSearch(
  input: BookInput,
  resolution?: AddBookResolution,
): AddBookResult {
  const member = getCurrentMember();
  if (!member) throw new Error("Join a family first");
  const title = input.title.trim();
  if (!title) throw new Error("Book title is required");
  const incoming: BookInput = {
    ...input,
    title,
    isbn: storedIsbnKey(input.isbn),
  };
  const library = state().books.filter((b) => b.familyId === member.familyId);
  const check = checkForDuplicate(library, incoming);

  if (check.kind === "same_isbn") {
    if (!check.existing.description && incoming.description) {
      check.existing.description = incoming.description;
    }
    return { status: "already_in_library", existing: check.existing };
  }

  if (check.kind === "same_title") {
    if (resolution?.action === "replace") {
      const target = check.candidates.find(
        (c) => c.existing.id === resolution.existingBookId,
      )?.existing;
      if (!target) throw new Error("That book is no longer a match in your library");
      Object.assign(target, mergeKeptBook(incoming, target));
      return { status: "replaced", book: target };
    }
    if (resolution?.action !== "keep_both") {
      return { status: "possible_duplicate", incoming, candidates: check.candidates };
    }
  }

  const book: Book = {
    id: id("book"),
    familyId: member.familyId,
    ...incoming,
    createdAt: new Date().toISOString(),
  };
  state().books.push(book);
  return { status: "added", book };
}

export function ensureUpcomingSessions(daysAhead = 14): number {
  const member = getCurrentMember();
  if (!member) return 0;
  let created = 0;

  for (const schedule of state().schedules.filter(
    (s) => s.familyId === member.familyId && s.active,
  )) {
    const today = dateInTimezone(new Date(), schedule.timezone);
    const through = addDays(today, daysAhead);
    const existing = new Set(
      state()
        .sessions.filter((s) => s.scheduleId === schedule.id)
        .map((s) => sessionDateKey(s.scheduledFor)),
    );
    const drafts = generateSessionsFromSchedule({
      schedule,
      existingSessionDates: existing,
      throughDate: through,
      nowDate: today,
    });
    for (const draft of drafts) {
      const sessionId = id("ses");
      const session: ReadingSession = {
        id: sessionId,
        familyId: schedule.familyId,
        scheduleId: schedule.id,
        scheduledFor: draft.scheduledFor,
        status: "scheduled",
        notes: null,
        icsUid: draft.icsUid,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      state().sessions.push(session);
      if (schedule.assignRandomBooks) {
        for (const bookId of selectRandomBooks(
          state()
            .books.filter((book) => book.familyId === schedule.familyId)
            .map((book) => book.id),
          schedule.booksPerSession ?? 1,
        )) {
          state().sessionBooks.push({
            id: id("sb"),
            sessionId,
            bookId,
            titleFreeform: null,
            createdAt: new Date().toISOString(),
          });
        }
      }
      state().assignments = applyReassignment({
        existing: state().assignments,
        sessionId,
        newMemberIds: [draft.memberId],
      });
      void sendSessionInvite(sessionId, "REQUEST");
      created += 1;
    }
  }
  return created;
}

export function saveSchedule(input: {
  readerRotationMemberIds: string[];
  startDate: string;
  timeLocal: string;
  timezone: string;
  bookTiming: "ahead" | "after";
  booksPerSession?: number;
  assignRandomBooks?: boolean;
}): void {
  const member = getCurrentMember();
  if (!member) throw new Error("Join a family first");
  if (member.role !== "owner") {
    throw new Error("Only family owners can edit the schedule");
  }
  assertScheduleSettings(input);
  if (input.readerRotationMemberIds.length === 0) {
    throw new Error("Pick at least one reader");
  }

  if (
    input.readerRotationMemberIds.some(
      (readerId) =>
        !state().members.some((r) => r.id === readerId && r.familyId === member.familyId),
    )
  ) {
    throw new Error("Invalid reader in rotation");
  }
  const existing =
    state().schedules.find((s) => s.familyId === member.familyId && s.active) ??
    state().schedules.find((s) => s.familyId === member.familyId);
  if (existing) {
    Object.assign(existing, input, { active: true });
    for (const session of state().sessions.filter(
      (s) =>
        s.scheduleId === existing.id &&
        (s.status === "scheduled" ||
          (s.status === "cancelled" && s.cancellationSource === "schedule")) &&
        !isPastSession(s.scheduledFor, dateInTimezone(new Date(), input.timezone)),
    )) {
      const day = sessionDateKey(session.scheduledFor);
      const previousTime = session.scheduledFor;
      const previousReaders = state()
        .assignments.filter((a) => a.sessionId === session.id && a.isCurrent)
        .map((a) => a.memberId);
      const wasCancelled = session.status === "cancelled";
      if (day < input.startDate) {
        if (wasCancelled) continue;
        session.calendarSequence = (session.calendarSequence ?? 0) + 1;
        session.status = "cancelled";
        session.cancellationSource = "schedule";
        void sendSessionInvite(session.id, "CANCEL");
      } else {
        session.calendarSequence = (session.calendarSequence ?? 0) + 1;
        session.status = "scheduled";
        session.cancellationSource = null;
        session.scheduledFor = `${day}T${input.timeLocal}:00`;
        state().assignments = applyReassignment({
          existing: state().assignments,
          sessionId: session.id,
          newMemberIds: [
            readerForDate(input.readerRotationMemberIds, input.startDate, day),
          ],
        });
        const nextReaders = state()
          .assignments.filter((a) => a.sessionId === session.id && a.isCurrent)
          .map((a) => a.memberId);
        const removed = wasCancelled
          ? []
          : previousReaders.filter((id) => !nextReaders.includes(id));
        if (removed.length)
          void sendSessionInvite(session.id, "CANCEL", {
            memberIds: removed,
            scheduledFor: previousTime,
          });
        void sendSessionInvite(session.id, "REQUEST");
      }
      session.updatedAt = new Date().toISOString();
    }
    ensureUpcomingSessions(14);
    return;
  }
  state().schedules.push({
    id: id("sch"),
    familyId: member.familyId,
    mode: "together",
    readerRotationMemberIds: input.readerRotationMemberIds,
    startDate: input.startDate,
    timeLocal: input.timeLocal,
    timezone: input.timezone,
    bookTiming: input.bookTiming,
    booksPerSession: input.booksPerSession ?? 1,
    assignRandomBooks: input.assignRandomBooks ?? false,
    active: true,
    createdAt: new Date().toISOString(),
  });
  ensureUpcomingSessions(14);
}

async function sendSessionInvite(
  sessionId: string,
  method: "REQUEST" | "CANCEL",
  previous?: { memberIds: string[]; scheduledFor: string },
): Promise<void> {
  const session = state().sessions.find((s) => s.id === sessionId);
  if (!session) return;
  const family = state().families.find((f) => f.id === session.familyId);
  const currentAssignees = state().assignments.filter(
    (a) => a.sessionId === sessionId && a.isCurrent,
  );
  const members = (previous?.memberIds ?? currentAssignees.map((a) => a.memberId))
    .map((memberId) =>
      state().members.find((m) => m.id === memberId && m.familyId === session.familyId),
    )
    .filter(Boolean) as FamilyMember[];
  if (members.length === 0 || !family) return;

  const sent = await sendSessionInviteEmail({
    familyName: family.name,
    scheduledFor: previous?.scheduledFor ?? session.scheduledFor,
    icsUid: session.icsUid,
    sequence: session.calendarSequence ?? 0,
    attendees: members.map((member) => ({
      email: member.email,
      displayName: member.displayName,
    })),
    method,
  });
  if (!sent) return;

  state().outboundEmails.push({
    id: id("mail"),
    to: sent.to,
    subject: sent.subject,
    body: sent.body,
    icsContent: sent.ics,
    createdAt: new Date().toISOString(),
  });
}

export function getHomeContext() {
  const user = getCurrentUser();
  const member = getCurrentMember();
  if (!user || !member) {
    return {
      user,
      member,
      nextSession: null as ReadingSession | null,
      timezone: "UTC",
      family: null,
      kids: [] as Kid[],
      readers: [] as FamilyMember[],
      assignments: [],
      sessionBooks: [],
      corrections: [],
      books: [],
    };
  }
  const family = state().families.find((f) => f.id === member.familyId) ?? null;
  const schedules = state().schedules.filter((s) => s.familyId === member.familyId);
  const timezone = schedules.find((s) => s.active)?.timezone ?? "UTC";
  const nextSession = nextSessionForMember({
    sessions: state().sessions.filter((s) => s.familyId === member.familyId),
    assignments: state().assignments,
    memberId: member.id,
    nowIso: dateInTimezone(new Date(), timezone),
  });
  return {
    user,
    member,
    family,
    nextSession,
    timezone:
      schedules.find((s) => s.id === nextSession?.scheduleId)?.timezone ?? timezone,
    kids: state().kids.filter((k) => k.familyId === member.familyId),
    readers: state().members.filter((m) => m.familyId === member.familyId),
    assignments: nextSession
      ? state().assignments.filter((row) => row.sessionId === nextSession.id)
      : [],
    sessionBooks: nextSession
      ? state().sessionBooks.filter((row) => row.sessionId === nextSession.id)
      : [],
    corrections: nextSession
      ? state().corrections.filter((row) => row.sessionId === nextSession.id)
      : [],
    books: state().books.filter((book) => book.familyId === member.familyId),
  };
}

export function listFamilySessions() {
  const member = getCurrentMember();
  if (!member) return [];
  return state()
    .sessions.filter((s) => s.familyId === member.familyId)
    .sort(
      (a, b) => b.scheduledFor.localeCompare(a.scheduledFor) || b.id.localeCompare(a.id),
    );
}

export function listFamilyAssignments() {
  const sessions = listFamilySessions();
  const ids = new Set(sessions.map((session) => session.id));
  return state().assignments.filter((row) => ids.has(row.sessionId));
}

export function getSessionDetail(sessionId: string, selectedLibraryOnly = false) {
  const member = getCurrentMember();
  if (!member) return null;
  const session = state().sessions.find(
    (s) => s.id === sessionId && s.familyId === member.familyId,
  );
  if (!session) return null;
  const assignments = state().assignments.filter((a) => a.sessionId === sessionId);
  const books = state().sessionBooks.filter((b) => b.sessionId === sessionId);
  const corrections = state().corrections.filter((c) => c.sessionId === sessionId);
  const memberNames = Object.fromEntries(
    state()
      .members.filter((m) => m.familyId === member.familyId)
      .map((m) => [m.id, m.displayName]),
  );
  const library = state().books.filter(
    (b) =>
      b.familyId === member.familyId &&
      (!selectedLibraryOnly || books.some((selected) => selected.bookId === b.id)),
  );
  return {
    session,
    assignments,
    books,
    corrections,
    memberNames,
    library,
    readers: state().members.filter((m) => m.familyId === member.familyId),
  };
}

export async function cancelSession(
  sessionId: string,
  source: "schedule" | "individual" = "individual",
): Promise<void> {
  const detail = getSessionDetail(sessionId);
  if (!detail) throw new Error("Session not found");
  assertTransition(detail.session.status, "cancelled");
  detail.session.status = "cancelled";
  detail.session.cancellationSource = source;
  detail.session.calendarSequence = (detail.session.calendarSequence ?? 0) + 1;
  detail.session.updatedAt = new Date().toISOString();
  await sendSessionInvite(sessionId, "CANCEL");
}

export async function updateSession(input: {
  sessionId: string;
  memberIds: string[];
  bookIds: string[];
  freeformTitles: string[];
  notes: string | null;
  status: "scheduled" | "completed" | "cancelled";
  reason?: string;
}): Promise<void> {
  const member = getCurrentMember();
  if (!member) throw new Error("Not signed in");
  const detail = getSessionDetail(input.sessionId);
  if (!detail) throw new Error("Session not found");

  const before = {
    status: detail.session.status,
    currentMemberIds: detail.assignments
      .filter((a) => a.isCurrent)
      .map((a) => a.memberId)
      .sort(),
    bookTitles: detail.books.map(
      (b) =>
        b.titleFreeform ??
        detail.library.find((x) => x.id === b.bookId)?.title ??
        "Unknown",
    ),
    notes: detail.session.notes,
  };

  assertTransition(detail.session.status, input.status);
  detail.session.status = input.status;
  detail.session.cancellationSource = input.status === "cancelled" ? "individual" : null;
  detail.session.notes = input.notes;
  detail.session.calendarSequence = (detail.session.calendarSequence ?? 0) + 1;
  detail.session.updatedAt = new Date().toISOString();

  state().assignments = applyReassignment({
    existing: state().assignments,
    sessionId: input.sessionId,
    newMemberIds: input.memberIds,
  });

  state().sessionBooks = state().sessionBooks.filter(
    (b) => b.sessionId !== input.sessionId,
  );
  for (const bookId of input.bookIds) {
    state().sessionBooks.push({
      id: id("sb"),
      sessionId: input.sessionId,
      bookId,
      titleFreeform: null,
      createdAt: new Date().toISOString(),
    });
  }
  for (const title of input.freeformTitles.filter(Boolean)) {
    state().sessionBooks.push({
      id: id("sb"),
      sessionId: input.sessionId,
      bookId: null,
      titleFreeform: title,
      createdAt: new Date().toISOString(),
    });
  }

  const after = {
    status: detail.session.status,
    currentMemberIds: [...input.memberIds].sort(),
    bookTitles: [
      ...input.bookIds.map(
        (id) => detail.library.find((b) => b.id === id)?.title ?? "Unknown",
      ),
      ...input.freeformTitles.filter(Boolean),
    ],
    notes: detail.session.notes,
  };

  if (isPastSession(detail.session.scheduledFor) || before.status === "completed") {
    const correction = buildCorrectionRecord({
      sessionId: input.sessionId,
      correctedByMemberId: member.id,
      reason: input.reason ?? "Corrected after the fact",
      before,
      after,
    });
    state().corrections.push({ id: id("cor"), ...correction });
  }

  if (input.status === "cancelled") {
    await sendSessionInvite(input.sessionId, "CANCEL");
  } else if (!isPastSession(detail.session.scheduledFor)) {
    await sendSessionInvite(input.sessionId, "REQUEST");
  }
}

export function getDashboard(filter: DashboardFilter) {
  const member = getCurrentMember();
  if (!member) return null;
  const familyId = member.familyId;
  return {
    stats: computeDashboardStats({
      sessions: state().sessions.filter((s) => s.familyId === familyId),
      assignments: state().assignments,
      sessionBooks: state().sessionBooks,
      books: state().books.filter((b) => b.familyId === familyId),
      filter,
    }),
    readers: state().members.filter((m) => m.familyId === familyId),
    member,
  };
}

export function getLibrary() {
  const member = getCurrentMember();
  if (!member) return [];
  return state().books.filter((b) => b.familyId === member.familyId);
}

export function getBook(id: string) {
  const member = getCurrentMember();
  if (!member) return null;
  return (
    state().books.find((book) => book.id === id && book.familyId === member.familyId) ??
    null
  );
}

export function getFamilyAdmin() {
  const member = getCurrentMember();
  if (!member) return null;
  return {
    member,
    family: state().families.find((f) => f.id === member.familyId)!,
    readers: state().members.filter((m) => m.familyId === member.familyId),
    kids: state().kids.filter((k) => k.familyId === member.familyId),
    invites: state().invites.filter((i) => i.familyId === member.familyId),
    schedule: state().schedules.find((s) => s.familyId === member.familyId && s.active),
  };
}

/** Active schedule timezone for the current member's family (display/compare days). */
export function getFamilyTimezone(): string {
  const member = getCurrentMember();
  if (!member) return DEFAULT_FAMILY_TIMEZONE;
  return familyTimezone(member.familyId);
}

export function createInviteCode(role: "owner" | "reader" = "reader"): string {
  const member = requireDemoOwner();
  const code = generateInviteCode();
  state().invites.push({
    id: id("inv"),
    familyId: member.familyId,
    code,
    role,
    createdByMemberId: member.id,
    expiresAt: null,
    maxUses: 25,
    uses: 0,
    createdAt: new Date().toISOString(),
  });
  return code;
}

function requireDemoOwner(): FamilyMember {
  const member = getCurrentMember();
  if (!member) throw new Error("Not signed in");
  if (member.role !== "owner")
    throw new Error("Only family owners can manage the family");
  return member;
}

export async function deleteSchedule(): Promise<void> {
  const member = requireDemoOwner();
  for (const schedule of state().schedules.filter(
    (s) => s.familyId === member.familyId && s.active,
  )) {
    schedule.active = false;
    for (const session of state().sessions.filter(
      (s) =>
        s.scheduleId === schedule.id &&
        s.status === "scheduled" &&
        !isPastSession(s.scheduledFor, dateInTimezone(new Date(), schedule.timezone)),
    )) {
      await cancelSession(session.id, "schedule");
    }
  }
}

export function updateMember(
  memberId: string,
  displayName: string,
  role: "owner" | "reader",
): void {
  const owner = requireDemoOwner();
  const target = state().members.find(
    (m) => m.id === memberId && m.familyId === owner.familyId,
  );
  if (!target) throw new Error("Reader not found");
  if (target.id === owner.id && role !== target.role)
    throw new Error("Cannot change your own role");
  if (!displayName.trim()) throw new Error("Name is required");
  if (
    target.role === "owner" &&
    role !== "owner" &&
    state().members.filter((m) => m.familyId === owner.familyId && m.role === "owner")
      .length === 1
  )
    throw new Error("Cannot demote the last parent");
  Object.assign(target, { displayName: displayName.trim(), role });
}

export function updateKid(
  kidId: string,
  name: string,
  birthdayOrAge: string | number,
): void {
  const owner = requireDemoOwner();
  const kid = state().kids.find((k) => k.id === kidId && k.familyId === owner.familyId);
  if (!kid) throw new Error("Child not found");
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Name is required");
  const birthday =
    typeof birthdayOrAge === "number"
      ? birthdayFromAge(birthdayOrAge)
      : parseBirthday(birthdayOrAge);
  Object.assign(kid, { name: trimmed, birthday });
}

export function deleteKid(kidId: string): void {
  const owner = requireDemoOwner();
  const kid = state().kids.find((k) => k.id === kidId && k.familyId === owner.familyId);
  if (!kid) throw new Error("Child not found");
  state().kids = state().kids.filter((k) => k.id !== kid.id);
}

export function getFamilySessionPage(
  requestedPage?: string | string[],
  status?: SessionStatus,
) {
  const pagination = paginateSessions(
    listFamilySessions().filter((session) => !status || session.status === status),
    requestedPage,
  );
  const ids = new Set(pagination.items.map((s) => s.id));
  const assignments = state().assignments.filter(
    (a) => ids.has(a.sessionId) && a.isCurrent,
  );
  return { ...pagination, assignments };
}

export function getLibraryPage(query: string, page = 1) {
  const member = getCurrentMember();
  if (!member) throw new Error("Sign in to choose library books");
  return paginateLibrary(getLibrary(), query, page);
}

const scanSessions = new Map<string, { memberId: string; expires: number }>();
const scanInsertions = new Map<string, string>();
export function startBookScan() {
  const member = getCurrentMember();
  if (!member) throw new Error("Join a family first");
  const key = crypto.randomUUID();
  scanSessions.set(key, { memberId: member.id, expires: Date.now() + 4 * 3600000 });
  return key;
}
export function finishBookScan(key: string) {
  const member = getCurrentMember();
  if (scanSessions.get(key)?.memberId === member?.id) scanSessions.delete(key);
}
function requireScan(key: string) {
  const session = scanSessions.get(key);
  if (
    !session ||
    session.memberId !== getCurrentMember()?.id ||
    session.expires < Date.now()
  )
    throw new Error("Scan session ended");
}
export function saveBookEdition(
  input: import("@/lib/book-edition").BookInput,
  scanId?: string,
): import("@/lib/book-edition").SaveBookResult {
  const member = getCurrentMember();
  if (!member) throw new Error("Join a family first");
  if (scanId) requireScan(scanId);
  const existing = state().books.find(
    (b) =>
      b.familyId === member.familyId &&
      b.editionKey &&
      (b.editionKey === input.editionKey || (input.isbn && b.isbn === input.isbn)),
  );
  if (existing) {
    if (!existing.description && input.description)
      existing.description = input.description;
    return { book: existing, created: false };
  }
  let result = addBookFromSearch(input);
  if (result.status === "possible_duplicate") {
    result = addBookFromSearch(input, { action: "keep_both" });
  }
  if (result.status === "already_in_library") {
    return { book: result.existing, created: false };
  }
  if (result.status !== "added" && result.status !== "replaced") {
    throw new Error("Could not save book to library");
  }
  const book = result.book;
  Object.assign(book, {
    editionKey: input.editionKey,
    format: input.format,
    publisher: input.publisher,
    editionYear: input.editionYear,
  });
  if (scanId) scanInsertions.set(book.id, scanId);
  return { book, created: true };
}
export function removeLibraryBooks(
  ids: string[],
  scanId?: string,
): import("@/lib/book-edition").RemoveBookResult[] {
  const member = getCurrentMember();
  if (!member) throw new Error("Join a family first");
  if (scanId) requireScan(scanId);
  return [...new Set(ids)].map((id) => {
    const book = state().books.find((b) => b.id === id);
    if (!book || book.familyId !== member.familyId) return { id, status: "removed" };
    if (scanId && scanInsertions.get(id) !== scanId) return { id, status: "unavailable" };
    if (state().sessionBooks.some((row) => row.bookId === id))
      return { id, status: "referenced" };
    state().books = state().books.filter((b) => b.id !== id);
    return { id, status: "removed" };
  });
}
export function correctBookFormat(id: string, format: string) {
  const member = getCurrentMember();
  if (!member) throw new Error("Join a family first");
  const book = state().books.find((b) => b.id === id && b.familyId === member.familyId);
  if (!book || book.format) throw new Error("Book unavailable or format already set");
  book.format = format;
}
