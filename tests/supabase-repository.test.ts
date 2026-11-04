import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { sendSessionInviteEmail } from "@/lib/session-mail";
import {
  addBookFromSearch,
  cascadeInsertReader,
  ensureAllUpcomingSessions,
  saveSchedule,
  getFamilySessionPage,
  getLibraryPage,
  getSessionDetail,
  getBookHistory,
} from "@/lib/supabase/repository";
type Row = Record<string, unknown>;
const fixture = vi.hoisted(() => ({
  tables: {} as Record<string, Row[]>,
  changes: [] as Row[],
  beforeQuery: undefined as undefined | ((table: string) => Promise<void>),
  ranges: [] as { table: string; start: number; end: number }[],
}));
function client() {
  return {
    auth: {
      getUser: async () => ({
        data: {
          user: {
            id: "user",
            email: "parent@example.com",
            created_at: "",
            user_metadata: {},
          },
        },
        error: null,
      }),
    },
    rpc: async (name: string, args: Row) => {
      if (name !== "generate_schedule_night")
        return { data: fixture.changes, error: null };
      const schedule = fixture.tables.schedules.find(
        (row) => row.id === args.target_schedule_id,
      )!;
      const id = `night-${args.night_date}`;
      fixture.tables.reading_sessions.push({
        id,
        family_id: schedule.family_id,
        schedule_id: schedule.id,
        scheduled_for: `${args.night_date}T${schedule.time_local}:00+00:00`,
        status: "scheduled",
        ics_uid: id,
      });
      fixture.tables.session_assignments.push({
        session_id: id,
        member_id: "parent",
        is_current: true,
        is_original: true,
      });
      if (schedule.assign_random_books) {
        fixture.tables.session_books.push(
          ...fixture.tables.books
            .filter((book) => book.family_id === schedule.family_id)
            .slice(0, Number(schedule.books_per_session))
            .map((book) => ({ session_id: id, book_id: book.id })),
        );
      }
      return { data: id, error: null };
    },
    from(table: string) {
      const filters: ((r: Row) => boolean)[] = [];
      let one = false;
      let limit = 1000;
      let offset = 0;
      let head = false;
      const ordering: { key: string; ascending: boolean }[] = [];
      const builder = {
        select: (_columns?: string, options?: { count?: string; head?: boolean }) => {
          head = options?.head ?? false;
          return builder;
        },
        eq: (key: string, value: unknown) => {
          filters.push((r) => r[key] === value);
          return builder;
        },
        neq: (key: string, value: unknown) => {
          filters.push((r) => r[key] !== value);
          return builder;
        },
        gte: (key: string, value: string) => {
          filters.push((r) => String(r[key]) >= value);
          return builder;
        },
        lt: (key: string, value: string) => {
          filters.push((r) => String(r[key]) < value);
          return builder;
        },
        // Minimal PostgREST `or` parser: "col.op.value,col.op.value" with eq/neq/lt/gte.
        or: (expression: string) => {
          const clauses = expression.split(",").map((clause) => {
            const [key, op, ...rest] = clause.split(".");
            const value = rest.join(".");
            return (r: Row) => {
              const cell = String(r[key]);
              if (op === "eq") return cell === value;
              if (op === "neq") return cell !== value;
              if (op === "lt") return cell < value;
              if (op === "gte") return cell >= value;
              throw new Error(`Unsupported or() operator ${op}`);
            };
          });
          filters.push((r) => clauses.some((matches) => matches(r)));
          return builder;
        },
        ilike: (key: string, pattern: string) => {
          const term = pattern
            .slice(1, -1)
            .replace(/\\([\\%_])/g, "$1")
            .toLowerCase();
          filters.push((row) => String(row[key]).toLowerCase().includes(term));
          return builder;
        },
        in: (key: string, values: unknown[]) => {
          filters.push((r) => values.includes(r[key]));
          return builder;
        },
        order: (key: string, options?: { ascending: boolean }) => {
          ordering.push({ key, ascending: options?.ascending ?? true });
          return builder;
        },
        range: (start: number, end: number) => {
          offset = start;
          // Like PostgREST with max_rows = 1000: a range never returns more than the cap.
          limit = Math.min(end - start + 1, 1000);
          fixture.ranges.push({ table, start, end });
          return builder;
        },
        limit: (value: number) => {
          limit = value;
          return builder;
        },
        insert: (values: Row | Row[]) => {
          const list = Array.isArray(values) ? values : [values];
          fixture.tables[table] ??= [];
          fixture.tables[table].push(
            ...list.map((r) => ({
              id: `${table}-${fixture.tables[table].length}`,
              ...r,
            })),
          );
          return builder;
        },
        single: () => {
          one = true;
          return builder;
        },
        maybeSingle: () => {
          one = true;
          return builder;
        },
        then: (
          resolve: (result: { data: Row[] | Row | null; error: null }) => unknown,
        ) => {
          const matched = (fixture.tables[table] ?? [])
            .filter((r) => filters.every((f) => f(r)))
            .sort((a, b) => {
              for (const order of ordering) {
                const result = String(a[order.key]).localeCompare(String(b[order.key]));
                if (result) return order.ascending ? result : -result;
              }
              return 0;
            });
          const data = matched.slice(offset, offset + limit);
          return Promise.resolve({
            data: head ? null : one ? (data.at(-1) ?? null) : data,
            count: matched.length,
            error: null,
          }).then(async (result) => {
            await fixture.beforeQuery?.(table);
            return resolve(result);
          });
        },
      };
      return builder;
    },
  };
}
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => client() }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => client() }));
vi.mock("@/lib/session-mail", () => ({
  sendSessionInviteEmail: vi.fn(async () => null),
}));
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-05T02:00:00Z"));
  vi.clearAllMocks();
  fixture.changes = [];
  fixture.beforeQuery = undefined;
  fixture.ranges = [];
  fixture.tables = {
    schedules: [
      {
        id: "schedule",
        family_id: "family",
        active: true,
        timezone: "America/Los_Angeles",
        start_date: "2026-10-04",
        time_local: "19:30",
        reader_rotation_member_ids: ["parent"],
        book_timing: "after",
      },
    ],
    family_members: [
      {
        id: "parent",
        user_id: "user",
        family_id: "family",
        display_name: "Parent",
        email: "parent@example.com",
        role: "owner",
      },
      {
        id: "reader",
        family_id: "family",
        email: "reader@example.com",
        display_name: "Reader",
        role: "reader",
      },
    ],
    reading_sessions: [],
    session_assignments: [],
    families: [],
  };
});
afterEach(() => vi.useRealTimers());
it("generates tonight and the horizon from each schedule's local calendar date", async () => {
  expect(await ensureAllUpcomingSessions(1)).toBe(2);
  expect(
    fixture.tables.reading_sessions.map((r) => String(r.scheduled_for).slice(0, 10)),
  ).toEqual(["2026-10-04", "2026-10-05"]);
});
it("uses the RPC's former readers to send cancellations before updated requests", async () => {
  fixture.tables.schedules[0].start_date = "2030-01-01";
  fixture.tables.families = [{ id: "family", name: "Family" }];
  fixture.tables.reading_sessions = [
    {
      id: "night",
      family_id: "family",
      schedule_id: "schedule",
      scheduled_for: "2026-10-04T20:30:00+00:00",
      status: "scheduled",
      ics_uid: "uid",
    },
  ];
  fixture.tables.session_assignments = [
    { id: "new", session_id: "night", member_id: "reader", is_current: true },
  ];
  fixture.changes = [
    {
      session_id: "night",
      cancelled: false,
      removed_member_ids: ["parent"],
      previous_scheduled_for: "2026-10-04T19:30:00+00:00",
    },
  ];
  await saveSchedule({
    readerRotationMemberIds: ["reader"],
    startDate: "2030-01-01",
    timeLocal: "20:30",
    timezone: "America/Los_Angeles",
    bookTiming: "after",
  });
  const messages = vi.mocked(sendSessionInviteEmail).mock.calls.map(([input]) => input);
  expect(messages).toHaveLength(2);
  expect(messages[0]).toMatchObject({
    method: "CANCEL",
    scheduledFor: "2026-10-04T19:30:00",
    attendees: [{ email: "parent@example.com" }],
  });
  expect(messages[1]).toMatchObject({
    method: "REQUEST",
    attendees: [{ email: "reader@example.com" }],
  });
});

it("fetches session pages beyond the API row limit with the exact family count", async () => {
  fixture.tables.reading_sessions = Array.from({ length: 1005 }, (_, i) => ({
    id: `night-${String(i).padStart(4, "0")}`,
    family_id: "family",
    scheduled_for: new Date(Date.UTC(2026, 0, 1) + i * 86400000).toISOString(),
    status: "scheduled",
  }));
  fixture.tables.reading_sessions.push({
    id: "foreign",
    family_id: "other",
    scheduled_for: "2040-01-01T19:30Z",
    status: "scheduled",
  });
  fixture.tables.session_assignments = [
    { id: "a", session_id: "night-0000", member_id: "reader", is_current: true },
    { id: "b", session_id: "night-1004", member_id: "parent", is_current: true },
  ];
  const page = await getFamilySessionPage("101");
  expect(page).toMatchObject({ page: 101, pageCount: 101, total: 1005 });
  expect(page.items).toHaveLength(5);
  expect(page.items.at(-1)?.id).toBe("night-0000");
  expect(page.assignments.map((a) => a.sessionId)).toEqual(["night-0000"]);
  // All 1005 nights are "scheduled"; 728 are on or after today (Oct 4 in LA, the
  // default "today" is UTC Oct 5), so page 101 reads the past segment at offset 1000 - 727.
  const past = fixture.ranges.filter((r) => r.table === "reading_sessions");
  expect(past.at(-1)?.end).toBe(past.at(-1)!.start + 9);
});
it("clamps oversized page requests using the database count and handles empty families", async () => {
  expect(await getFamilySessionPage("999")).toMatchObject({
    items: [],
    assignments: [],
    page: 1,
    pageCount: 1,
    total: 0,
  });
  fixture.tables.reading_sessions = [
    {
      id: "only",
      family_id: "family",
      scheduled_for: "2026-10-05T19:30:00Z",
      status: "scheduled",
    },
  ];
  const page = await getFamilySessionPage("999");
  expect(page.page).toBe(1);
  expect(page.items.map((s) => s.id)).toEqual(["only"]);
});

it("assigns only family library books to generated nights and keeps them on repeat runs", async () => {
  Object.assign(fixture.tables.schedules[0], {
    books_per_session: 2,
    assign_random_books: true,
  });
  fixture.tables.books = [
    { id: "a", family_id: "family", title: "A" },
    { id: "b", family_id: "family", title: "B" },
    { id: "other", family_id: "other-family", title: "Other" },
  ];
  fixture.tables.session_books = [];
  expect(await ensureAllUpcomingSessions(1)).toBe(2);
  for (const session of fixture.tables.reading_sessions) {
    const books = fixture.tables.session_books.filter(
      (book) => book.session_id === session.id,
    );
    expect(books.map((book) => book.book_id).sort()).toEqual(["a", "b"]);
  }
  const assigned = [...fixture.tables.session_books];
  expect(await ensureAllUpcomingSessions(1)).toBe(0);
  expect(fixture.tables.session_books).toEqual(assigned);
});

it("searches and paginates the family library beyond the database row cap", async () => {
  fixture.tables.books = Array.from({ length: 1005 }, (_, i) => ({
    id: `book-${String(i).padStart(4, "0")}`,
    family_id: "family",
    title: `Story ${String(i).padStart(4, "0")}`,
  }));
  fixture.tables.books.push({
    id: "other",
    family_id: "other-family",
    title: "Story 1004",
  });
  const last = await getLibraryPage("Story", 101);
  expect(last).toMatchObject({ page: 101, pageCount: 101, total: 1005 });
  expect(last.items.map((book) => book.id)).toEqual([
    "book-1000",
    "book-1001",
    "book-1002",
    "book-1003",
    "book-1004",
  ]);
  expect(await getLibraryPage("1004", 99)).toMatchObject({
    total: 1,
    page: 1,
    items: [{ id: "book-1004" }],
  });
  expect(await getLibraryPage("missing", 2)).toMatchObject({
    total: 0,
    page: 1,
    items: [],
  });
});

it("loads only selected library books on the edit page while retaining full mutation context", async () => {
  fixture.tables.reading_sessions = [
    {
      id: "night",
      family_id: "family",
      scheduled_for: "2026-10-04T19:30:00",
      status: "scheduled",
    },
  ];
  fixture.tables.session_books = [{ session_id: "night", book_id: "selected" }];
  fixture.tables.books = [
    { id: "selected", family_id: "family", title: "Selected" },
    { id: "other", family_id: "family", title: "Other" },
    { id: "foreign", family_id: "foreign", title: "Foreign" },
  ];
  expect((await getSessionDetail("night", true))?.library.map((book) => book.id)).toEqual(
    ["selected"],
  );
  expect((await getSessionDetail("night"))?.library.map((book) => book.id)).toEqual([
    "selected",
    "other",
  ]);
  fixture.tables.session_books = [];
  expect((await getSessionDetail("night", true))?.library).toEqual([]);
});

it("starts the full library query while session books are still loading", async () => {
  vi.useRealTimers();
  fixture.tables.reading_sessions = [
    {
      id: "night",
      family_id: "family",
      scheduled_for: "2026-10-04T19:30:00",
      status: "scheduled",
    },
  ];
  fixture.tables.session_books = [];
  fixture.tables.books = [];
  let releaseBooks!: () => void;
  const pendingBooks = new Promise<void>((resolve) => {
    releaseBooks = resolve;
  });
  let libraryStarted = false;
  fixture.beforeQuery = async (table) => {
    if (table === "session_books") await pendingBooks;
    if (table === "books") libraryStarted = true;
  };
  const detail = getSessionDetail("night");
  try {
    await vi.waitFor(() => expect(libraryStarted).toBe(true));
  } finally {
    releaseBooks();
    await detail;
  }
});

it("filters both session count and rows by status within the current family", async () => {
  fixture.tables.reading_sessions = Array.from({ length: 35 }, (_, i) => ({
    id: `filtered-${String(i).padStart(2, "0")}`,
    family_id: "family",
    scheduled_for: new Date(Date.UTC(2026, 0, 1) + i * 86400000).toISOString(),
    status: i % 2 === 0 ? "completed" : "scheduled",
  }));
  fixture.tables.reading_sessions.push({
    id: "foreign",
    family_id: "other",
    status: "completed",
    scheduled_for: "2040-01-01T19:30Z",
  });
  const page = await getFamilySessionPage("2", "completed");
  expect(page).toMatchObject({ page: 2, pageCount: 2, total: 18 });
  expect(page.items).toHaveLength(8);
  expect(page.items.every((session) => session.status === "completed")).toBe(true);
  expect(page.items.at(-1)?.id).toBe("filtered-00");
  expect(await getFamilySessionPage("99", "canceled")).toMatchObject({
    items: [],
    assignments: [],
    total: 0,
    page: 1,
  });
});

it("returns each filter's rows in a sensible order with counts", async () => {
  const statuses = ["completed", "cancelled", "scheduled"] as const;
  fixture.tables.reading_sessions = Array.from({ length: 30 }, (_, i) => {
    const day = new Date(Date.UTC(2026, 8, 20 + i)).toISOString().slice(0, 10);
    const status =
      day >= "2026-10-04" ? (i % 5 === 0 ? "cancelled" : "scheduled") : statuses[i % 3];
    return {
      id: `n-${String(i).padStart(2, "0")}`,
      family_id: "family",
      scheduled_for: `${day}T19:30:00+00:00`,
      status,
    };
  });
  const rowsFor = (status: string) =>
    fixture.tables.reading_sessions.filter((r) => r.status === status);
  const upcomingRows = rowsFor("scheduled").filter(
    (r) => String(r.scheduled_for) >= "2026-10-04",
  );
  const day = (s: { scheduledFor: string }) => s.scheduledFor.slice(0, 10);

  const upcoming = await getFamilySessionPage("1", "upcoming", "2026-10-04");
  expect(upcoming.items.map(day)).toEqual(
    upcomingRows
      .map((r) => String(r.scheduled_for).slice(0, 10))
      .sort()
      .slice(0, 10),
  );
  expect(upcoming.items.map(day)[0]).toBe("2026-10-04"); // today leads
  expect(upcoming.items.map(day)).not.toContain("2026-09-22"); // past unlogged night

  const completed = await getFamilySessionPage("1", "completed", "2026-10-04");
  expect(completed.items.every((s) => s.status === "completed")).toBe(true);
  expect(completed.items.map(day)).toEqual(
    [...completed.items.map(day)].sort().reverse(),
  );

  const canceled = await getFamilySessionPage("1", "canceled", "2026-10-04");
  expect(canceled.total).toBe(rowsFor("cancelled").length);
  expect(canceled.items.every((s) => s.status === "cancelled")).toBe(true);

  const all = [1, 2, 3].map((n) => getFamilySessionPage(String(n), "all", "2026-10-04"));
  const items = (await Promise.all(all)).flatMap((p) => p.items);
  expect(new Set(items.map((s) => s.id)).size).toBe(30);
  const head = items.slice(0, upcomingRows.length).map(day);
  const tail = items.slice(upcomingRows.length).map(day);
  expect(head).toEqual([...head].sort());
  expect(tail).toEqual([...tail].sort().reverse());
  expect(upcoming.counts).toEqual({
    all: 30,
    upcoming: upcomingRows.length,
    completed: rowsFor("completed").length,
    canceled: rowsFor("cancelled").length,
  });
});

it("adds search results to the live library and reports barcode and title duplicates", async () => {
  fixture.tables.books = [
    {
      id: "existing",
      family_id: "family",
      title: "The Gruffalo",
      authors: ["Julia Donaldson"],
      isbn: "9780142403877",
      created_at: "2026-01-01T00:00:00Z",
    },
  ];
  const base = { authors: [], openLibraryKey: null, coverUrl: null };
  expect(
    await addBookFromSearch({ ...base, title: "Gruffalo copy", isbn: "0142403873" }),
  ).toMatchObject({ status: "already_in_library", existing: { id: "existing" } });
  const duplicate = await addBookFromSearch({
    ...base,
    title: "Gruffalo",
    authors: ["Julia Donaldson"],
    isbn: null,
  });
  expect(duplicate).toMatchObject({ status: "possible_duplicate" });
  expect(fixture.tables.books).toHaveLength(1);
  expect(
    await addBookFromSearch(
      { ...base, title: "Gruffalo", authors: ["Julia Donaldson"], isbn: null },
      { action: "keep_both" },
    ),
  ).toMatchObject({ status: "added", book: { familyId: "family", title: "Gruffalo" } });
  expect(fixture.tables.books.at(-1)).toMatchObject({
    family_id: "family",
    title: "Gruffalo",
    authors: ["Julia Donaldson"],
  });
  await addBookFromSearch({ ...base, title: "Room on the Broom", isbn: "0803726066" });
  expect(fixture.tables.books.at(-1)).toMatchObject({
    isbn: "9780803726062",
    normalized_isbn: "9780803726062",
  });
});

it("sends calendar requests for every night the cascade RPC changed", async () => {
  fixture.tables.families = [{ id: "family", name: "Family" }];
  fixture.tables.reading_sessions = ["a", "b", "extra"].map((id) => ({
    id,
    family_id: "family",
    schedule_id: "schedule",
    scheduled_for: "2026-10-06T19:30:00+00:00",
    status: "scheduled",
    ics_uid: id,
  }));
  fixture.tables.session_assignments = ["a", "b", "extra"].map((id) => ({
    id: `asg-${id}`,
    session_id: id,
    member_id: "reader",
    is_current: true,
  }));
  fixture.changes = ["a", "b", "extra"] as unknown as Row[];
  expect(
    await cascadeInsertReader({ fromSessionId: "a", fillInMemberId: "reader" }),
  ).toEqual({ changedSessionIds: ["a", "b"], extraSessionId: "extra" });
  expect(
    vi.mocked(sendSessionInviteEmail).mock.calls.map(([invite]) => invite.icsUid),
  ).toEqual(["a", "b", "extra"]);
});

it("reads a book's whole history past the API row limit", async () => {
  fixture.tables.reading_sessions = Array.from({ length: 1005 }, (_, i) => ({
    id: `night-${String(i).padStart(4, "0")}`,
    family_id: "family",
    scheduled_for: new Date(Date.UTC(2024, 0, 1) + i * 86400000).toISOString(),
    status: "completed",
  }));
  fixture.tables.session_books = fixture.tables.reading_sessions.map((session, i) => ({
    id: `link-${String(i).padStart(4, "0")}`,
    session_id: session.id,
    book_id: "gruffalo",
    title_freeform: null,
  }));
  fixture.tables.session_assignments = fixture.tables.reading_sessions.map(
    (session, i) => ({
      id: `assign-${String(i).padStart(4, "0")}`,
      session_id: session.id,
      member_id: "reader",
      is_current: true,
    }),
  );
  const history = await getBookHistory("gruffalo", "2030-01-01");
  expect(history.timesRead).toBe(1005);
  expect(history.lastRead?.sessionId).toBe("night-1004");
  expect(history.topReader?.count).toBe(1005);
});
