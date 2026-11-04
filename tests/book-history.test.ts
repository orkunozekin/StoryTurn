import { describe, expect, it } from "vitest";
import { computeBookHistory } from "@/lib/domain/book-history";
import { bookHistorySummary } from "@/components/book-history";
import type { ReadingSession, SessionAssignment, SessionBook } from "@/lib/types";

const session = (
  id: string,
  day: string,
  status: ReadingSession["status"],
): ReadingSession => ({
  id,
  familyId: "f",
  scheduleId: null,
  scheduledFor: `${day}T19:30:00`,
  status,
  notes: null,
  icsUid: id,
  createdAt: "",
  updatedAt: "",
});
const assign = (
  sessionId: string,
  memberId: string,
  isCurrent = true,
): SessionAssignment => ({
  id: `${sessionId}-${memberId}`,
  sessionId,
  memberId,
  isOriginal: true,
  isCurrent,
  createdAt: "",
});
const link = (
  sessionId: string,
  bookId: string | null,
  titleFreeform: string | null = null,
): SessionBook => ({
  id: `${sessionId}-${bookId ?? titleFreeform}`,
  sessionId,
  bookId,
  titleFreeform,
  createdAt: "",
});

const input = {
  bookId: "gruffalo",
  today: "2026-11-06",
  books: [
    { id: "gruffalo", title: "The Gruffalo" },
    { id: "owls", title: "Owl Babies" },
  ],
  members: [
    { id: "alex", displayName: "Alex" },
    { id: "sam", displayName: "Sam" },
  ],
  sessions: [
    session("s1", "2026-10-20", "completed"),
    session("s2", "2026-11-04", "completed"),
    session("s3", "2026-11-01", "completed"),
    session("s4", "2026-11-02", "cancelled"),
    session("s5", "2026-11-08", "scheduled"),
    session("s6", "2026-11-07", "scheduled"),
    session("s7", "2026-11-03", "scheduled"), // past, never logged
    session("s8", "2026-11-05", "completed"), // other book only
  ],
  assignments: [
    assign("s1", "alex"),
    assign("s2", "alex"),
    assign("s2", "sam", false), // replaced reader: not current
    assign("s3", "sam"),
    assign("s5", "sam"),
    assign("s6", "alex"),
  ],
  sessionBooks: [
    link("s1", "gruffalo"),
    link("s2", "gruffalo"),
    link("s2", "owls"),
    link("s2", null, "A comic"),
    link("s3", "gruffalo"),
    link("s4", "gruffalo"),
    link("s5", "gruffalo"),
    link("s6", "gruffalo"),
    link("s7", "gruffalo"),
    link("s8", "owls"),
  ],
};

describe("computeBookHistory", () => {
  const history = computeBookHistory(input);

  it("counts logged and past unlogged nights with the book, most recent first", () => {
    expect(history.timesRead).toBe(4);
    expect(history.history.map((n) => n.sessionId)).toEqual(["s2", "s7", "s3", "s1"]);
    expect(history.lastRead?.sessionId).toBe("s2");
  });

  it("uses current readers and lists the other books read that night", () => {
    expect(history.history[0]).toMatchObject({
      readers: ["Alex"],
      alongside: ["Owl Babies", "A comic"],
    });
  });

  it("finds who reads it most", () => {
    expect(history.topReader).toEqual({ names: ["Alex"], count: 2 });
    const tied = computeBookHistory({
      ...input,
      assignments: input.assignments.filter((a) => a.sessionId !== "s1"),
    });
    expect(tied.topReader).toEqual({ names: ["Alex", "Sam"], count: 1 });
  });

  it("lists upcoming nights from today on, soonest first, skipping past unlogged ones", () => {
    expect(history.upcoming.map((n) => n.sessionId)).toEqual(["s6", "s5"]);
  });

  it("counts a past unlogged night as read but tonight as upcoming", () => {
    const tonight = computeBookHistory({
      ...input,
      sessions: [
        session("p", "2026-11-05", "scheduled"),
        session("t", "2026-11-06", "scheduled"),
      ],
      assignments: [],
      sessionBooks: [link("p", "gruffalo"), link("t", "gruffalo")],
    });
    expect(tonight.history.map((n) => n.sessionId)).toEqual(["p"]);
    expect(tonight.upcoming.map((n) => n.sessionId)).toEqual(["t"]);
  });

  it("handles a book nobody has read", () => {
    const empty = computeBookHistory({ ...input, bookId: "unknown" });
    expect(empty).toEqual({
      timesRead: 0,
      lastRead: null,
      topReader: null,
      history: [],
      upcoming: [],
    });
    expect(bookHistorySummary(empty, input.today, "UTC")).toBe("Not read yet");
  });

  it("summarises for the open book", () => {
    expect(bookHistorySummary(history, input.today, "UTC")).toBe(
      "Read 4 times · last on Wednesday",
    );
  });
});

describe("computeBookHistory with shared names", () => {
  it("counts readers by member, not by display name", () => {
    const history = computeBookHistory({
      ...input,
      members: [
        { id: "alex", displayName: "Alex" },
        { id: "alex2", displayName: "Alex" },
      ],
      sessions: [session("s1", "2026-10-20", "completed")],
      assignments: [assign("s1", "alex"), assign("s1", "alex2")],
      sessionBooks: [link("s1", "gruffalo")],
    });
    expect(history.timesRead).toBe(1);
    expect(history.topReader).toEqual({ names: ["Alex", "Alex"], count: 1 });
  });
});
