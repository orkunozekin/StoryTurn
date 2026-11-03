import { applyReassignment } from "@/lib/domain/corrections";
import { pickRandomBookIds, SESSION_BOOK_PICK_COUNT } from "@/lib/domain/session-books";
import { generateSessionsFromSchedule, sessionDateKey } from "@/lib/domain/sessions";
import type { AppState } from "@/lib/types";
import { addDays, formatDateOnly } from "@/lib/domain/rotation";

function todayUtc(): string {
  return formatDateOnly(new Date());
}

export function createSeedState(now = new Date()): AppState {
  const today = formatDateOnly(now);
  const startDate = addDays(today, -10);

  const state: AppState = {
    users: [
      {
        id: "user_alex",
        email: "alex@example.com",
        displayName: "Alex",
        passwordHash: "demo",
        createdAt: `${startDate}T12:00:00.000Z`,
      },
      {
        id: "user_jordan",
        email: "jordan@example.com",
        displayName: "Jordan",
        passwordHash: "demo",
        createdAt: `${startDate}T12:00:00.000Z`,
      },
      {
        id: "user_nana",
        email: "nana@example.com",
        displayName: "Nana",
        passwordHash: "demo",
        createdAt: `${startDate}T12:00:00.000Z`,
      },
    ],
    families: [
      {
        id: "fam_demo",
        name: "The Riveras",
        createdByUserId: "user_alex",
        createdAt: `${startDate}T12:00:00.000Z`,
      },
    ],
    members: [
      {
        id: "mem_alex",
        familyId: "fam_demo",
        userId: "user_alex",
        displayName: "Alex",
        email: "alex@example.com",
        role: "owner",
        relationToChildren: "parent",
        createdAt: `${startDate}T12:00:00.000Z`,
      },
      {
        id: "mem_jordan",
        familyId: "fam_demo",
        userId: "user_jordan",
        displayName: "Jordan",
        email: "jordan@example.com",
        role: "reader",
        relationToChildren: "parent",
        createdAt: `${startDate}T12:00:00.000Z`,
      },
      {
        id: "mem_nana",
        familyId: "fam_demo",
        userId: "user_nana",
        displayName: "Nana",
        email: "nana@example.com",
        role: "reader",
        relationToChildren: "grandparent",
        createdAt: `${startDate}T12:05:00.000Z`,
      },
    ],
    kids: [
      {
        id: "kid_leo",
        familyId: "fam_demo",
        name: "Leo",
        birthday: "2020-03-12",
        createdAt: `${startDate}T12:00:00.000Z`,
      },
      {
        id: "kid_mira",
        familyId: "fam_demo",
        name: "Mira",
        birthday: "2022-08-04",
        createdAt: `${startDate}T12:00:00.000Z`,
      },
    ],
    invites: [
      {
        id: "inv_demo",
        familyId: "fam_demo",
        code: "RIVERA24",
        createdByMemberId: "mem_alex",
        expiresAt: null,
        maxUses: 20,
        uses: 1,
        createdAt: `${startDate}T12:00:00.000Z`,
      },
    ],
    books: [
      {
        id: "book_moon",
        familyId: "fam_demo",
        title: "Goodnight Moon",
        authors: ["Margaret Wise Brown"],
        openLibraryKey: "/works/OL45804W",
        coverUrl: "https://covers.openlibrary.org/b/isbn/9780060775858-L.jpg",
        isbn: "9780060775858",
        description:
          "A little bunny says goodnight to the moon, the room, and everything in it.",
        createdAt: `${startDate}T12:00:00.000Z`,
      },
      {
        id: "book_hungry",
        familyId: "fam_demo",
        title: "The Very Hungry Caterpillar",
        authors: ["Eric Carle"],
        openLibraryKey: "/works/OL45804X",
        coverUrl: "https://covers.openlibrary.org/b/isbn/9780399226908-L.jpg",
        isbn: "9780399226908",
        description:
          "A very hungry caterpillar eats through the week and turns into a butterfly.",
        createdAt: `${startDate}T12:00:00.000Z`,
      },
      {
        id: "book_where",
        familyId: "fam_demo",
        title: "Where the Wild Things Are",
        authors: ["Maurice Sendak"],
        openLibraryKey: "/works/OL45804Y",
        coverUrl: "https://covers.openlibrary.org/b/isbn/9780060254926-L.jpg",
        isbn: "9780060254926",
        description:
          "After making mischief, Max sails to the wild things and finds his supper waiting at home.",
        createdAt: `${startDate}T12:00:00.000Z`,
      },
    ],
    schedules: [
      {
        id: "sch_demo",
        familyId: "fam_demo",
        mode: "together",
        readerRotationMemberIds: ["mem_alex", "mem_jordan"],
        startDate,
        timeLocal: "19:30",
        timezone: "America/Los_Angeles",
        bookTiming: "after",
        active: true,
        createdAt: `${startDate}T12:00:00.000Z`,
      },
    ],
    sessions: [],
    assignments: [],
    sessionBooks: [],
    corrections: [],
    outboundEmails: [],
  };

  const schedule = state.schedules[0]!;
  const through = addDays(today, 14);
  const drafts = generateSessionsFromSchedule({
    schedule,
    existingSessionDates: new Set(),
    throughDate: through,
  });

  for (const draft of drafts) {
    const date = sessionDateKey(draft.scheduledFor);
    const id = `ses_${date}`;
    const isPast = date < today;
    const status = isPast ? "completed" : "scheduled";
    state.sessions.push({
      id,
      familyId: "fam_demo",
      scheduleId: schedule.id,
      scheduledFor: draft.scheduledFor,
      status,
      notes: null,
      icsUid: draft.icsUid,
      createdAt: `${date}T12:00:00.000Z`,
      updatedAt: `${date}T12:00:00.000Z`,
    });
    state.assignments = applyReassignment({
      existing: state.assignments,
      sessionId: id,
      newMemberIds: [draft.memberId],
      nowIso: `${date}T12:00:00.000Z`,
    });
  }

  const libraryIds = state.books.map((b) => b.id);

  // Log a few past books
  const pastCompleted = state.sessions.filter((s) => s.status === "completed").slice(-5);
  const bookIds = ["book_moon", "book_hungry", "book_where", "book_moon", "book_hungry"];
  pastCompleted.forEach((session, i) => {
    state.sessionBooks.push({
      id: `sb_${session.id}`,
      sessionId: session.id,
      bookId: bookIds[i] ?? "book_moon",
      titleFreeform: null,
      createdAt: session.updatedAt,
    });
  });

  // Pre-pick three library books for each upcoming night
  for (const session of state.sessions.filter((s) => s.status === "scheduled")) {
    const picked = pickRandomBookIds(libraryIds, SESSION_BOOK_PICK_COUNT);
    for (const bookId of picked) {
      state.sessionBooks.push({
        id: `sb_${session.id}_${bookId}`,
        sessionId: session.id,
        bookId,
        titleFreeform: null,
        createdAt: session.createdAt,
      });
    }
  }

  // One corrected past night: originally Alex, corrected to Nana
  const correctable = state.sessions.find(
    (s) =>
      s.status === "completed" &&
      state.assignments.some(
        (a) => a.sessionId === s.id && a.isCurrent && a.memberId === "mem_alex",
      ),
  );
  if (correctable) {
    state.assignments = applyReassignment({
      existing: state.assignments,
      sessionId: correctable.id,
      newMemberIds: ["mem_nana"],
      nowIso: `${today}T15:00:00.000Z`,
    });
    state.corrections.push({
      id: "cor_demo_1",
      sessionId: correctable.id,
      correctedByMemberId: "mem_alex",
      reason: "Alex was traveling; Nana covered bedtime.",
      before: {
        status: "completed",
        currentMemberIds: ["mem_alex"],
        bookTitles: ["Goodnight Moon"],
        notes: null,
      },
      after: {
        status: "completed",
        currentMemberIds: ["mem_nana"],
        bookTitles: ["Goodnight Moon"],
        notes: null,
      },
      createdAt: `${today}T15:00:00.000Z`,
    });
  }

  void todayUtc;
  return state;
}
