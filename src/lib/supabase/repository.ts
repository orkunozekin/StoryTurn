import type { SessionStatus } from "@/lib/types";
import { librarySearchTerm, type LibraryPage } from "@/lib/domain/library-page";
import { sessionPageBounds } from "@/lib/domain/session-presentation";
import { assertScheduleSettings } from "@/lib/domain/schedule-settings";
import { dateInTimezone } from "@/lib/domain/calendar-date";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { applyReassignment, buildCorrectionRecord } from "@/lib/domain/corrections";
import {
  checkForDuplicate,
  mergeKeptBook,
  storedIsbnKey,
  type AddBookResolution,
  type AddBookResult,
  type BookInput,
} from "@/lib/domain/book-duplicates";
import { generateInviteCode } from "@/lib/domain/invites";
import { plainBookDescription } from "@/lib/book-description";
import { normalizeToIsbn13 } from "@/lib/isbn";
import {
  SESSION_BOOK_PICK_COUNT,
  sessionHasLibraryBooks,
} from "@/lib/domain/session-books";
import { DEFAULT_FAMILY_TIMEZONE, formatDateOnlyInTimeZone } from "@/lib/domain/dates";
import type { ChildRelation } from "@/lib/domain/relations";
import { addDays } from "@/lib/domain/rotation";
import {
  assertTransition,
  generateSessionsFromSchedule,
  isPastSession,
  nextSessionForMember,
  sessionDateKey,
} from "@/lib/domain/sessions";
import { computeDashboardStats } from "@/lib/domain/stats";
import { sendSessionInviteEmail } from "@/lib/session-mail";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  mapAssignment,
  mapBook,
  mapCorrection,
  mapFamily,
  mapInvite,
  mapKid,
  mapMember,
  mapSchedule,
  mapSession,
  mapSessionBook,
  partitionAssignmentWrites,
  toWallClock,
} from "@/lib/supabase/map";
import type {
  Book,
  DashboardFilter,
  Family,
  FamilyMember,
  Kid,
  ReadingSession,
  Schedule,
  SessionAssignment,
  SessionBook,
  SessionCorrection,
  UserAccount,
} from "@/lib/types";

type Row = Record<string, unknown>;
interface ScheduleChange {
  session_id: string;
  cancelled: boolean;
  removed_member_ids: string[];
  previous_scheduled_for: string;
}

function assertNoError(error: { message: string } | null, fallback: string): void {
  if (error) throw new Error(error.message || fallback);
}

function userFromAuth(user: User): UserAccount {
  const meta = user.user_metadata ?? {};
  const displayName =
    (typeof meta.display_name === "string" && meta.display_name.trim()) ||
    (typeof meta.full_name === "string" && meta.full_name.trim()) ||
    (typeof meta.name === "string" && meta.name.trim()) ||
    user.email?.split("@")[0] ||
    "Reader";
  return {
    id: user.id,
    email: user.email ?? "",
    displayName,
    passwordHash: null,
    createdAt: user.created_at,
  };
}

async function loadContext(client?: SupabaseClient) {
  const supabase = client ?? (await createClient());
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) {
    return {
      supabase,
      account: null as UserAccount | null,
      member: null as FamilyMember | null,
    };
  }
  const account = userFromAuth(user);
  const { data, error: memberError } = await supabase
    .from("family_members")
    .select("*")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();
  assertNoError(memberError, "Could not load family membership");
  return {
    supabase,
    account,
    member: data ? mapMember(data as Row) : null,
  };
}

function requireMember(ctx: Awaited<ReturnType<typeof loadContext>>) {
  if (!ctx.account) throw new Error("Not signed in");
  if (!ctx.member) throw new Error("Join a family first");
  return { supabase: ctx.supabase, account: ctx.account, member: ctx.member };
}

function requireOwner(member: FamilyMember): void {
  if (member.role !== "owner") {
    throw new Error("Only family owners can do that");
  }
}

async function rows<T>(
  query: PromiseLike<{ data: unknown; error: { message: string } | null }>,
  map: (row: Row) => T,
  fallback: string,
): Promise<T[]> {
  const { data, error } = await query;
  assertNoError(error, fallback);
  return ((data ?? []) as Row[]).map(map);
}

export async function getCurrentUser(): Promise<UserAccount | null> {
  const ctx = await loadContext();
  return ctx.account;
}

export async function getCurrentMember(): Promise<FamilyMember | null> {
  const ctx = await loadContext();
  return ctx.member;
}

async function familyReaders(
  supabase: SupabaseClient,
  familyId: string,
): Promise<FamilyMember[]> {
  return rows(
    supabase.from("family_members").select("*").eq("family_id", familyId),
    mapMember,
    "Could not load readers",
  );
}

async function familySessions(
  supabase: SupabaseClient,
  familyId: string,
): Promise<ReadingSession[]> {
  const sessions = await rows(
    supabase
      .from("reading_sessions")
      .select("*")
      .eq("family_id", familyId)
      .order("scheduled_for", { ascending: false }),
    mapSession,
    "Could not load sessions",
  );
  return sessions;
}

async function assignmentsForSessions(
  supabase: SupabaseClient,
  sessionIds: string[],
): Promise<SessionAssignment[]> {
  if (sessionIds.length === 0) return [];
  return rows(
    supabase.from("session_assignments").select("*").in("session_id", sessionIds),
    mapAssignment,
    "Could not load assignments",
  );
}

export async function getHomeContext() {
  const ctx = await loadContext();
  if (!ctx.account || !ctx.member) {
    return {
      user: ctx.account,
      member: ctx.member,
      nextSession: null as ReadingSession | null,
      timezone: "UTC",
      family: null as Family | null,
      kids: [] as Kid[],
      readers: [] as FamilyMember[],
      assignments: [] as SessionAssignment[],
      sessionBooks: [] as SessionBook[],
      corrections: [] as SessionCorrection[],
      books: [] as Book[],
    };
  }

  const { supabase, member } = ctx;
  const [familyRow, kids, readers, sessions, schedules] = await Promise.all([
    supabase.from("families").select("*").eq("id", member.familyId).maybeSingle(),
    rows(
      supabase.from("kids").select("*").eq("family_id", member.familyId),
      mapKid,
      "Could not load kids",
    ),
    familyReaders(supabase, member.familyId),
    familySessions(supabase, member.familyId),
    rows(
      supabase.from("schedules").select("*").eq("family_id", member.familyId),
      mapSchedule,
      "Could not load schedules",
    ),
  ]);
  assertNoError(familyRow.error, "Could not load family");

  const assignments = await assignmentsForSessions(
    supabase,
    sessions.map((session) => session.id),
  );
  const timezone = schedules.find((s) => s.active)?.timezone ?? "UTC";
  const nextSession = nextSessionForMember({
    sessions,
    assignments,
    memberId: member.id,
    nowIso: dateInTimezone(new Date(), timezone),
  });

  const [sessionBooks, corrections, books] = nextSession
    ? await Promise.all([
        rows(
          supabase.from("session_books").select("*").eq("session_id", nextSession.id),
          mapSessionBook,
          "Could not load session books",
        ),
        rows(
          supabase
            .from("session_corrections")
            .select("*")
            .eq("session_id", nextSession.id),
          mapCorrection,
          "Could not load corrections",
        ),
        rows(
          supabase.from("books").select("*").eq("family_id", member.familyId),
          mapBook,
          "Could not load books",
        ),
      ])
    : [[], [], []];

  return {
    user: ctx.account,
    member,
    family: familyRow.data ? mapFamily(familyRow.data as Row) : null,
    nextSession,
    timezone:
      schedules.find((s) => s.id === nextSession?.scheduleId)?.timezone ?? timezone,
    kids,
    readers,
    assignments: nextSession
      ? assignments.filter((row) => row.sessionId === nextSession.id)
      : [],
    sessionBooks,
    corrections,
    books,
  };
}

export async function getFamilyAdmin() {
  const { supabase, member } = requireMember(await loadContext());
  const [familyRow, readers, kids, invites, schedules] = await Promise.all([
    supabase.from("families").select("*").eq("id", member.familyId).single(),
    familyReaders(supabase, member.familyId),
    rows(
      supabase.from("kids").select("*").eq("family_id", member.familyId),
      mapKid,
      "Could not load kids",
    ),
    rows(
      supabase.from("invite_codes").select("*").eq("family_id", member.familyId),
      mapInvite,
      "Could not load invites",
    ),
    rows(
      supabase
        .from("schedules")
        .select("*")
        .eq("family_id", member.familyId)
        .eq("active", true)
        .limit(1),
      mapSchedule,
      "Could not load schedule",
    ),
  ]);
  assertNoError(familyRow.error, "Could not load family");
  return {
    member,
    family: mapFamily(familyRow.data as Row),
    readers,
    kids,
    invites,
    schedule: schedules[0] ?? null,
  };
}

export async function listFamilySessions(): Promise<ReadingSession[]> {
  const { supabase, member } = requireMember(await loadContext());
  return familySessions(supabase, member.familyId);
}

export async function listFamilyAssignments(): Promise<SessionAssignment[]> {
  const { supabase, member } = requireMember(await loadContext());
  const sessions = await familySessions(supabase, member.familyId);
  return assignmentsForSessions(
    supabase,
    sessions.map((session) => session.id),
  );
}

export async function getUpcomingBookCtaState() {
  const { supabase, member } = requireMember(await loadContext());
  const [sessions, schedules, libraryCount] = await Promise.all([
    familySessions(supabase, member.familyId),
    rows(
      supabase
        .from("schedules")
        .select("*")
        .eq("family_id", member.familyId)
        .eq("active", true),
      mapSchedule,
      "Could not load schedule",
    ),
    supabase
      .from("books")
      .select("id", { count: "exact", head: true })
      .eq("family_id", member.familyId),
  ]);
  assertNoError(libraryCount.error, "Could not count library");
  const today = formatDateOnlyInTimeZone(
    new Date(),
    schedules[0]?.timezone ?? DEFAULT_FAMILY_TIMEZONE,
  );
  const upcoming = sessions.filter(
    (s) => s.status === "scheduled" && sessionDateKey(s.scheduledFor) >= today,
  );
  const sessionBooks =
    upcoming.length === 0
      ? []
      : await rows(
          supabase
            .from("session_books")
            .select("*")
            .in(
              "session_id",
              upcoming.map((s) => s.id),
            ),
          mapSessionBook,
          "Could not load session books",
        );
  const withBooksCount = upcoming.filter((s) =>
    sessionHasLibraryBooks(sessionBooks, s.id),
  ).length;
  return {
    libraryCount: libraryCount.count ?? 0,
    upcomingCount: upcoming.length,
    withoutBooksCount: upcoming.length - withBooksCount,
    withBooksCount,
  };
}

export async function getBook(id: string): Promise<Book | null> {
  const { supabase, member } = requireMember(await loadContext());
  const { data, error } = await supabase
    .from("books")
    .select("*")
    .eq("family_id", member.familyId)
    .eq("id", id)
    .maybeSingle();
  assertNoError(error, "Could not load book");
  return data ? mapBook(data as Row) : null;
}

export async function getLibrary(): Promise<Book[]> {
  const { supabase, member } = requireMember(await loadContext());
  return rows(
    supabase.from("books").select("*").eq("family_id", member.familyId),
    mapBook,
    "Could not load library",
  );
}

export async function getDashboard(filter: DashboardFilter) {
  const { supabase, member } = requireMember(await loadContext());
  const [sessions, readers, books] = await Promise.all([
    familySessions(supabase, member.familyId),
    familyReaders(supabase, member.familyId),
    rows(
      supabase.from("books").select("*").eq("family_id", member.familyId),
      mapBook,
      "Could not load books",
    ),
  ]);
  const sessionIds = sessions.map((session) => session.id);
  const assignments = await assignmentsForSessions(supabase, sessionIds);
  const sessionBooks =
    sessionIds.length === 0
      ? []
      : await rows(
          supabase.from("session_books").select("*").in("session_id", sessionIds),
          mapSessionBook,
          "Could not load session books",
        );
  return {
    stats: computeDashboardStats({
      sessions,
      assignments,
      sessionBooks: sessions.length === 0 ? [] : sessionBooks,
      books,
      filter,
    }),
    readers,
    member,
  };
}

export async function getSessionDetail(sessionId: string, selectedLibraryOnly = false) {
  const ctx = await loadContext();
  if (!ctx.member) return null;
  const { supabase, member } = ctx;
  const { data, error } = await supabase
    .from("reading_sessions")
    .select("*")
    .eq("id", sessionId)
    .eq("family_id", member.familyId)
    .maybeSingle();
  assertNoError(error, "Could not load session");
  if (!data) return null;

  const [assignments, books, corrections, readers, fullLibrary] = await Promise.all([
    rows(
      supabase.from("session_assignments").select("*").eq("session_id", sessionId),
      mapAssignment,
      "Could not load assignments",
    ),
    rows(
      supabase.from("session_books").select("*").eq("session_id", sessionId),
      mapSessionBook,
      "Could not load session books",
    ),
    rows(
      supabase.from("session_corrections").select("*").eq("session_id", sessionId),
      mapCorrection,
      "Could not load corrections",
    ),
    familyReaders(supabase, member.familyId),
    selectedLibraryOnly
      ? Promise.resolve([])
      : rows(
          supabase.from("books").select("*").eq("family_id", member.familyId),
          mapBook,
          "Could not load library",
        ),
  ]);
  const selectedIds = books.flatMap((book) => (book.bookId ? [book.bookId] : []));
  const library = !selectedLibraryOnly
    ? fullLibrary
    : selectedIds.length === 0
      ? []
      : await rows(
          supabase
            .from("books")
            .select("*")
            .eq("family_id", member.familyId)
            .in("id", selectedIds),
          mapBook,
          "Could not load library",
        );

  return {
    session: mapSession(data as Row),
    assignments,
    books,
    corrections,
    memberNames: Object.fromEntries(
      readers.map((reader) => [reader.id, reader.displayName]),
    ),
    library,
    readers,
  };
}

async function sendInvite(
  supabase: SupabaseClient,
  sessionId: string,
  method: "REQUEST" | "CANCEL",
  previous?: { memberIds: string[]; scheduledFor: string },
): Promise<void> {
  const { data: sessionRow, error } = await supabase
    .from("reading_sessions")
    .select("*")
    .eq("id", sessionId)
    .maybeSingle();
  assertNoError(error, "Could not load session for invite");
  if (!sessionRow) return;
  const session = mapSession(sessionRow as Row);
  const { data: familyRow } = await supabase
    .from("families")
    .select("*")
    .eq("id", session.familyId)
    .maybeSingle();
  if (!familyRow) return;
  const family = mapFamily(familyRow as Row);
  const assignments = await rows(
    supabase
      .from("session_assignments")
      .select("*")
      .eq("session_id", sessionId)
      .eq("is_current", true),
    mapAssignment,
    "Could not load assignees",
  );
  const readers = await familyReaders(supabase, session.familyId);
  const attendees = (previous?.memberIds ?? assignments.map((a) => a.memberId))
    .map((memberId) => readers.find((reader) => reader.id === memberId))
    .filter((reader): reader is FamilyMember => Boolean(reader))
    .map((reader) => ({ email: reader.email, displayName: reader.displayName }));

  const sent = await sendSessionInviteEmail({
    familyName: family.name,
    scheduledFor: previous?.scheduledFor ?? session.scheduledFor,
    icsUid: session.icsUid,
    sequence: session.calendarSequence ?? 0,
    attendees,
    method,
  });
  if (sent && !sent.result.ok) {
    console.error("[plunk]", sent.result.error);
  }
}

async function insertGeneratedSessions(
  supabase: SupabaseClient,
  schedules: Schedule[],
  daysAhead: number,
): Promise<number> {
  let created = 0;

  for (const schedule of schedules) {
    const today = dateInTimezone(new Date(), schedule.timezone);
    const through = addDays(today, daysAhead);
    const { data: existingRows, error: existingError } = await supabase
      .from("reading_sessions")
      .select("scheduled_for")
      .eq("schedule_id", schedule.id);
    assertNoError(existingError, "Could not load existing sessions");
    const existing = new Set(
      ((existingRows ?? []) as Row[]).map((row) =>
        sessionDateKey(toWallClock(String(row.scheduled_for ?? ""))),
      ),
    );
    const drafts = generateSessionsFromSchedule({
      schedule,
      existingSessionDates: existing,
      throughDate: through,
      nowDate: today,
    });

    for (const draft of drafts) {
      const { data, error } = await supabase.rpc("generate_schedule_night", {
        target_schedule_id: schedule.id,
        night_date: sessionDateKey(draft.scheduledFor),
      });
      assertNoError(error, "Could not generate session");
      // Another generator may already have created this night.
      if (!data) continue;
      const sessionId = String(data);
      await sendInvite(supabase, sessionId, "REQUEST");
      created += 1;
    }
  }

  return created;
}

export async function ensureAllUpcomingSessions(daysAhead = 14): Promise<number> {
  const supabase = createServiceClient();
  const schedules = await rows(
    supabase.from("schedules").select("*").eq("active", true),
    mapSchedule,
    "Could not load schedules",
  );
  return insertGeneratedSessions(supabase, schedules, daysAhead);
}

export async function createFamily(
  name: string,
  relation: ChildRelation = "parent",
): Promise<void> {
  const ctx = await loadContext();
  if (!ctx.account) throw new Error("Not signed in");
  if (ctx.member) throw new Error("Already in a family");
  const { error } = await ctx.supabase.rpc("create_family", {
    family_name: name.trim(),
    display_name: ctx.account.displayName,
    relation,
  });
  assertNoError(error, "Could not create family");

  const member = await getCurrentMember();
  if (!member) throw new Error("Family was created without a membership");
  const code = generateInviteCode();
  const { error: inviteError } = await ctx.supabase.from("invite_codes").insert({
    family_id: member.familyId,
    code,
    role: "reader",
    created_by_member_id: member.id,
    max_uses: 25,
    uses: 0,
  });
  assertNoError(inviteError, "Could not create the first invite code");
}

export async function joinFamily(
  codeRaw: string,
  relation: ChildRelation = "other",
): Promise<void> {
  const ctx = await loadContext();
  if (!ctx.account) throw new Error("Not signed in");
  if (ctx.member) throw new Error("Already in a family");
  const { error } = await ctx.supabase.rpc("join_family", {
    raw_code: codeRaw,
    display_name: ctx.account.displayName,
    relation,
  });
  assertNoError(error, "Could not join family");
}

export async function addKid(name: string, birthday: string): Promise<void> {
  const { supabase, member } = requireMember(await loadContext());
  requireOwner(member);
  const { parseBirthday } = await import("@/lib/domain/kids");
  const parsed = parseBirthday(birthday);
  if (!name.trim()) throw new Error("Enter a name and birthday");
  const { error } = await supabase.from("kids").insert({
    family_id: member.familyId,
    name: name.trim(),
    birthday: parsed,
  });
  assertNoError(error, "Could not add kid");
}

export async function createInviteCode(
  role: "owner" | "reader" = "reader",
): Promise<string> {
  const { supabase, member } = requireMember(await loadContext());
  requireOwner(member);
  const code = generateInviteCode();
  const { error } = await supabase.from("invite_codes").insert({
    family_id: member.familyId,
    code,
    role,
    created_by_member_id: member.id,
    max_uses: 25,
    uses: 0,
  });
  assertNoError(error, "Could not create invite");
  return code;
}

export async function saveSchedule(input: {
  readerRotationMemberIds: string[];
  startDate: string;
  timeLocal: string;
  timezone: string;
  bookTiming: "ahead" | "after";
  booksPerSession?: number;
  assignRandomBooks?: boolean;
}): Promise<void> {
  const { supabase, member } = requireMember(await loadContext());
  requireOwner(member);
  assertScheduleSettings(input);
  if (input.readerRotationMemberIds.length === 0) {
    throw new Error("Pick at least one reader");
  }

  const { data, error } = await supabase.rpc("manage_schedule", {
    rotation_ids: input.readerRotationMemberIds,
    starts_on: input.startDate,
    bedtime: input.timeLocal,
    zone: input.timezone,
    timing: input.bookTiming,
    deleting: false,
    book_count: input.booksPerSession ?? 1,
    random_books: input.assignRandomBooks ?? false,
  });
  assertNoError(error, "Could not save schedule");
  for (const changed of (data ?? []) as ScheduleChange[]) {
    if (changed.removed_member_ids.length)
      await sendInvite(supabase, changed.session_id, "CANCEL", {
        memberIds: changed.removed_member_ids,
        scheduledFor: toWallClock(changed.previous_scheduled_for),
      });
    if (!changed.cancelled) await sendInvite(supabase, changed.session_id, "REQUEST");
  }
  const admin = await getFamilyAdmin();
  if (admin.schedule) await insertGeneratedSessions(supabase, [admin.schedule], 14);
}

async function persistAssignments(
  supabase: SupabaseClient,
  sessionId: string,
  existing: SessionAssignment[],
  memberIds: string[],
): Promise<void> {
  const reassigned = applyReassignment({ existing, sessionId, newMemberIds: memberIds });
  if (reassigned === existing) return;
  const next = reassigned.filter((row) => row.sessionId === sessionId);
  const { updates, inserts } = partitionAssignmentWrites(next);

  for (const row of updates) {
    const { error } = await supabase
      .from("session_assignments")
      .update({ is_current: row.isCurrent })
      .eq("id", row.id);
    assertNoError(error, "Could not update assignment");
  }

  if (inserts.length > 0) {
    const { error } = await supabase.from("session_assignments").insert(
      inserts.map((row) => ({
        session_id: row.sessionId,
        member_id: row.memberId,
        is_original: row.isOriginal,
        is_current: row.isCurrent,
      })),
    );
    assertNoError(error, "Could not add assignment");
  }
}

export async function cancelSession(sessionId: string): Promise<void> {
  const detail = await getSessionDetail(sessionId);
  if (!detail) throw new Error("Session not found");
  assertTransition(detail.session.status, "cancelled");
  const { supabase } = requireMember(await loadContext());
  const { error } = await supabase
    .from("reading_sessions")
    .update({
      status: "cancelled",
      cancellation_source: "individual",
      updated_at: new Date().toISOString(),
    })
    .eq("id", sessionId);
  assertNoError(error, "Could not cancel session");
  await sendInvite(supabase, sessionId, "CANCEL");
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
  const { supabase, member } = requireMember(await loadContext());
  const detail = await getSessionDetail(input.sessionId);
  if (!detail) throw new Error("Session not found");

  const before = {
    status: detail.session.status,
    currentMemberIds: detail.assignments
      .filter((row) => row.isCurrent)
      .map((row) => row.memberId)
      .sort(),
    bookTitles: detail.books.map(
      (book) =>
        book.titleFreeform ??
        detail.library.find((item) => item.id === book.bookId)?.title ??
        "Unknown",
    ),
    notes: detail.session.notes,
  };

  assertTransition(detail.session.status, input.status);
  const { error } = await supabase
    .from("reading_sessions")
    .update({
      status: input.status,
      cancellation_source: input.status === "cancelled" ? "individual" : null,
      notes: input.notes,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.sessionId);
  assertNoError(error, "Could not update session");

  await persistAssignments(
    supabase,
    input.sessionId,
    detail.assignments,
    input.memberIds,
  );

  const { error: clearError } = await supabase
    .from("session_books")
    .delete()
    .eq("session_id", input.sessionId);
  assertNoError(clearError, "Could not update books");

  const bookRows = [
    ...input.bookIds.map((bookId) => ({
      session_id: input.sessionId,
      book_id: bookId,
      title_freeform: null,
    })),
    ...input.freeformTitles.filter(Boolean).map((title) => ({
      session_id: input.sessionId,
      book_id: null,
      title_freeform: title,
    })),
  ];
  if (bookRows.length > 0) {
    const { error: bookError } = await supabase.from("session_books").insert(bookRows);
    assertNoError(bookError, "Could not save books");
  }

  const after = {
    status: input.status,
    currentMemberIds: [...input.memberIds].sort(),
    bookTitles: [
      ...input.bookIds.map(
        (id) => detail.library.find((book) => book.id === id)?.title ?? "Unknown",
      ),
      ...input.freeformTitles.filter(Boolean),
    ],
    notes: input.notes,
  };

  if (isPastSession(detail.session.scheduledFor) || before.status === "completed") {
    const correction = buildCorrectionRecord({
      sessionId: input.sessionId,
      correctedByMemberId: member.id,
      reason: input.reason ?? "Corrected after the fact",
      before,
      after,
    });
    const { error: correctionError } = await supabase.from("session_corrections").insert({
      session_id: correction.sessionId,
      corrected_by_member_id: correction.correctedByMemberId,
      reason: correction.reason,
      before: correction.before,
      after: correction.after,
    });
    assertNoError(correctionError, "Could not record correction");
  }

  if (input.status === "cancelled") {
    await sendInvite(supabase, input.sessionId, "CANCEL");
  } else if (!isPastSession(detail.session.scheduledFor)) {
    await sendInvite(supabase, input.sessionId, "REQUEST");
  }
}

export async function deleteSchedule(): Promise<void> {
  const { supabase, member } = requireMember(await loadContext());
  requireOwner(member);
  const { data, error } = await supabase.rpc("manage_schedule", { deleting: true });
  assertNoError(error, "Could not delete schedule");
  for (const row of (data ?? []) as ScheduleChange[]) {
    if (row.removed_member_ids.length)
      await sendInvite(supabase, row.session_id, "CANCEL", {
        memberIds: row.removed_member_ids,
        scheduledFor: toWallClock(row.previous_scheduled_for),
      });
  }
}

export async function updateMember(
  memberId: string,
  displayName: string,
  role: "owner" | "reader",
): Promise<void> {
  const { supabase, member } = requireMember(await loadContext());
  requireOwner(member);
  if (memberId === member.id && role !== member.role)
    throw new Error("Cannot change your own role");
  const { error } = await supabase.rpc("update_family_member", {
    target_id: memberId,
    new_name: displayName.trim(),
    new_role: role,
  });
  assertNoError(error, "Could not update reader");
}

export async function updateMemberRelation(
  memberId: string,
  relationToChildren: ChildRelation,
): Promise<void> {
  const { supabase, member } = requireMember(await loadContext());
  requireOwner(member);
  const { error } = await supabase.rpc("update_family_member_relation", {
    target_id: memberId,
    new_relation: relationToChildren,
  });
  assertNoError(error, "Could not update relation");
}

export async function updateKid(
  kidId: string,
  name: string,
  birthday: string,
): Promise<void> {
  const { supabase, member } = requireMember(await loadContext());
  requireOwner(member);
  const { parseBirthday } = await import("@/lib/domain/kids");
  const parsed = parseBirthday(birthday);
  if (!name.trim()) throw new Error("Enter a name and birthday");
  const { data, error } = await supabase
    .from("kids")
    .update({ name: name.trim(), birthday: parsed })
    .eq("id", kidId)
    .eq("family_id", member.familyId)
    .select("id");
  assertNoError(error, "Could not update child");
  if (!data?.length) throw new Error("Child not found");
}

export async function deleteKid(kidId: string): Promise<void> {
  const { supabase, member } = requireMember(await loadContext());
  requireOwner(member);
  const { data, error } = await supabase
    .from("kids")
    .delete()
    .eq("id", kidId)
    .eq("family_id", member.familyId)
    .select("id");
  assertNoError(error, "Could not delete child");
  if (!data?.length) throw new Error("Child not found");
}

export async function getFamilySessionPage(
  requestedPage?: string | string[],
  status?: SessionStatus,
) {
  const { supabase, member } = requireMember(await loadContext());
  const countQuery = supabase
    .from("reading_sessions")
    .select("id", { count: "exact", head: true })
    .eq("family_id", member.familyId);
  const { count, error } = await (status ? countQuery.eq("status", status) : countQuery);
  assertNoError(error, "Could not count sessions");
  const { page, pageCount, total, from, to } = sessionPageBounds(
    count ?? 0,
    requestedPage,
  );
  const sessionsQuery = supabase
    .from("reading_sessions")
    .select("*")
    .eq("family_id", member.familyId);
  const filteredQuery = status ? sessionsQuery.eq("status", status) : sessionsQuery;
  const items =
    total === 0
      ? []
      : await rows(
          filteredQuery
            .order("scheduled_for", { ascending: false })
            .order("id", { ascending: false })
            .range(from, to),
          mapSession,
          "Could not load session page",
        );
  const assignments =
    items.length === 0
      ? []
      : await rows(
          supabase
            .from("session_assignments")
            .select("*")
            .in(
              "session_id",
              items.map((s) => s.id),
            )
            .eq("is_current", true),
          mapAssignment,
          "Could not load session readers",
        );
  return { items, assignments, page, pageCount, total };
}

export async function getLibraryPage(
  query: string,
  requestedPage = 1,
): Promise<LibraryPage> {
  const { supabase, member } = requireMember(await loadContext());
  const term = librarySearchTerm(query).replace(/[\\%_]/g, "\\$&");
  const scopedQuery = () => {
    const builder = supabase
      .from("books")
      .select("id,title,cover_url,isbn,format,publisher,edition_year", { count: "exact" })
      .eq("family_id", member.familyId);
    return term ? builder.ilike("title", `%${term}%`) : builder;
  };
  const countResult = await scopedQuery().limit(0);
  assertNoError(countResult.error, "Could not search library");
  const bounds = sessionPageBounds(countResult.count ?? 0, String(requestedPage));
  const result = await scopedQuery()
    .order("title")
    .order("id")
    .range(bounds.from, bounds.to);
  assertNoError(result.error, "Could not search library");
  return {
    items: (result.data ?? []).map((book) => ({
      id: book.id,
      title: book.title,
      coverUrl: book.cover_url,
      ...(book.format !== undefined ? { format: book.format } : {}),
      ...(book.publisher !== undefined ? { publisher: book.publisher } : {}),
      ...(book.edition_year !== undefined ? { editionYear: book.edition_year } : {}),
      ...(book.isbn !== undefined ? { isbn: book.isbn } : {}),
    })),
    page: bounds.page,
    pageCount: bounds.pageCount,
    total: bounds.total,
  };
}

export async function startBookScan(): Promise<string> {
  const { supabase } = requireMember(await loadContext());
  const { data, error } = await supabase.rpc("start_book_scan");
  assertNoError(error, "Could not start scan");
  return data;
}
export async function finishBookScan(scanId: string) {
  const { supabase } = requireMember(await loadContext());
  const { error } = await supabase.rpc("finish_book_scan", { scan_id: scanId });
  assertNoError(error, "Could not finish scan");
}
export async function saveBookEdition(
  input: import("@/lib/book-edition").BookInput,
  scanId?: string,
): Promise<import("@/lib/book-edition").SaveBookResult> {
  const { supabase } = requireMember(await loadContext());
  const { data, error } = await supabase.rpc("save_book_edition", {
    metadata: input,
    scan_id: scanId ?? null,
  });
  assertNoError(error, "Could not save book. Please retry.");
  return { book: mapBook(data[0].book), created: data[0].created };
}
export async function removeLibraryBooks(
  ids: string[],
  scanId?: string,
): Promise<import("@/lib/book-edition").RemoveBookResult[]> {
  const { supabase } = requireMember(await loadContext());
  const { data, error } = await supabase.rpc("remove_library_books", {
    book_ids: ids,
    scan_id: scanId ?? null,
  });
  assertNoError(error, "Could not remove books. Please retry.");
  return data;
}
export async function correctBookFormat(id: string, format: string) {
  const { supabase } = requireMember(await loadContext());
  const { error } = await supabase.rpc("correct_book_format", {
    book_id: id,
    label: format,
  });
  assertNoError(error, "Could not update format");
}
export async function cascadeInsertReader(input: {
  fromSessionId: string;
  fillInMemberId: string;
}): Promise<{ changedSessionIds: string[]; extraSessionId: string }> {
  const { supabase, member } = requireMember(await loadContext());
  requireOwner(member);
  const { data, error } = await supabase.rpc("cascade_insert_reader", {
    from_session_id: input.fromSessionId,
    fill_in_member_id: input.fillInMemberId,
    book_count: SESSION_BOOK_PICK_COUNT,
  });
  assertNoError(error, "Could not shift readers");
  const sessionIds = ((data ?? []) as unknown[]).map(String);
  for (const sessionId of sessionIds) await sendInvite(supabase, sessionId, "REQUEST");
  return {
    changedSessionIds: sessionIds.slice(0, -1),
    extraSessionId: sessionIds.at(-1)!,
  };
}

export async function swapSessionReaders(input: {
  sessionAId: string;
  sessionBId: string;
}): Promise<void> {
  const { supabase, member } = requireMember(await loadContext());
  requireOwner(member);
  const { error } = await supabase.rpc("swap_session_readers", {
    session_a_id: input.sessionAId,
    session_b_id: input.sessionBId,
  });
  assertNoError(error, "Could not swap readers");
  await sendInvite(supabase, input.sessionAId, "REQUEST");
  await sendInvite(supabase, input.sessionBId, "REQUEST");
}

async function pickUpcomingSessionBooks(args: {
  target_session_id?: string;
  only_empty?: boolean;
}): Promise<number> {
  const { supabase } = requireMember(await loadContext());
  const { data, error } = await supabase.rpc("pick_upcoming_session_books", {
    ...args,
    book_count: SESSION_BOOK_PICK_COUNT,
  });
  assertNoError(error, "Could not pick books");
  return Number(data ?? 0);
}

export async function addRandomBooksToUpcomingSessions(): Promise<number> {
  return pickUpcomingSessionBooks({ only_empty: true });
}

export async function shuffleBooksForUpcomingSessions(): Promise<number> {
  return pickUpcomingSessionBooks({});
}

export async function shuffleSessionBooks(sessionId: string): Promise<void> {
  await pickUpcomingSessionBooks({ target_session_id: sessionId });
}

function bookColumns(input: BookInput): Row {
  return {
    title: input.title,
    authors: input.authors,
    open_library_key: input.openLibraryKey,
    cover_url: input.coverUrl,
    isbn: input.isbn,
    normalized_isbn: input.isbn ? normalizeToIsbn13(input.isbn) : null,
    description: plainBookDescription(input.description),
  };
}

export async function addBookFromSearch(
  input: BookInput,
  resolution?: AddBookResolution,
): Promise<AddBookResult> {
  const { supabase, member } = requireMember(await loadContext());
  const title = input.title.trim();
  if (!title) throw new Error("Book title is required");
  const incoming: BookInput = { ...input, title, isbn: storedIsbnKey(input.isbn) };
  const loadLibrary = () =>
    rows(
      supabase.from("books").select("*").eq("family_id", member.familyId),
      mapBook,
      "Could not load library",
    );
  const check = checkForDuplicate(await loadLibrary(), incoming);

  if (check.kind === "same_isbn") {
    if (!check.existing.description && incoming.description) {
      const { data, error } = await supabase
        .from("books")
        .update({ description: plainBookDescription(incoming.description) })
        .eq("id", check.existing.id)
        .eq("family_id", member.familyId)
        .select("*")
        .single();
      assertNoError(error, "Could not save book description");
      return { status: "already_in_library", existing: mapBook(data as Row) };
    }
    return { status: "already_in_library", existing: check.existing };
  }

  if (check.kind === "same_title") {
    if (resolution?.action === "replace") {
      const target = check.candidates.find(
        (c) => c.existing.id === resolution.existingBookId,
      )?.existing;
      if (!target) throw new Error("That book is no longer a match in your library");
      const { data, error } = await supabase
        .from("books")
        .update(bookColumns(mergeKeptBook(incoming, target)))
        .eq("id", target.id)
        .eq("family_id", member.familyId)
        .select("*")
        .single();
      assertNoError(error, "Could not replace book");
      return { status: "replaced", book: mapBook(data as Row) };
    }
    if (resolution?.action !== "keep_both") {
      return { status: "possible_duplicate", incoming, candidates: check.candidates };
    }
  }

  const { data, error } = await supabase
    .from("books")
    .insert({ family_id: member.familyId, ...bookColumns(incoming) })
    .select("*")
    .single();
  if (error && "code" in error && error.code === "23505") {
    const raced = checkForDuplicate(await loadLibrary(), incoming);
    if (raced.kind === "same_isbn") {
      return { status: "already_in_library", existing: raced.existing };
    }
  }
  assertNoError(error, "Could not add book");
  return { status: "added", book: mapBook(data as Row) };
}

export async function reserveBookLookup() {
  const { supabase } = requireMember(await loadContext());
  const { data, error } = await supabase.rpc("reserve_book_lookup");
  assertNoError(error, "Book lookup is busy. Please retry shortly.");
  await new Promise((resolve) => setTimeout(resolve, data));
}
