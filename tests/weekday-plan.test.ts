import { describe, expect, it } from "vitest";
import { addDays, readerForDate } from "@/lib/domain/rotation";
import { generateSessionsFromSchedule, sessionDateKey } from "@/lib/domain/sessions";
import {
  ALL_ROTATE,
  EMPTY_POOL_MESSAGE,
  assertWeekdayPlan,
  defaultRotationPool,
  effectiveWeekdayPlan,
  normalizeWeekdayPlan,
  parseWeekdayPlanForm,
  previewPlanNights,
  readerForPlanDate,
  rotateTurnsBefore,
  weekdayIndex,
  describeWeekdayPlan,
  matchPattern,
  patternPlan,
  poolStartingWith,
} from "@/lib/domain/weekday-plan";
import type { Schedule } from "@/lib/types";

// 2026-11-02 is a Monday.
const MONDAY = "2026-11-02";
const R = "rotate";
const plan = (...slots: string[]) => slots;

function schedule(overrides: Partial<Schedule> = {}): Schedule {
  return {
    id: "sch",
    familyId: "fam",
    mode: "together",
    readerRotationMemberIds: ["alex", "jordan"],
    weekdayReaders: [...ALL_ROTATE],
    startDate: MONDAY,
    timeLocal: "19:30",
    timezone: "UTC",
    bookTiming: "after",
    active: true,
    createdAt: "",
    ...overrides,
  };
}

function readersFor(drafts: { scheduledFor: string; memberId: string }[]) {
  return drafts.map((d) => [sessionDateKey(d.scheduledFor), d.memberId]);
}

describe("weekday plan rule", () => {
  it("numbers weekdays from Monday", () => {
    expect(weekdayIndex(MONDAY)).toBe(0);
    expect(weekdayIndex("2026-11-07")).toBe(5);
    expect(weekdayIndex("2026-11-08")).toBe(6);
  });

  it("gives fixed weekdays to their member every week", () => {
    const weekly = plan(R, R, R, R, R, "nana", R);
    const saturdays = [0, 1, 2, 3].map((week) =>
      readerForPlanDate({
        pool: ["alex", "jordan"],
        plan: weekly,
        startDate: MONDAY,
        date: addDays("2026-11-07", week * 7),
      }),
    );
    expect(saturdays.every((n) => n.memberId === "nana" && n.fixed)).toBe(true);
  });

  it("advances the turn only on rotate nights and carries it into the next week", () => {
    const nights = previewPlanNights({
      pool: ["alex", "jordan"],
      plan: plan(R, R, R, R, R, "nana", R),
      startDate: MONDAY,
      fromDate: MONDAY,
      days: 14,
    });
    expect(nights.map((n) => n.memberId)).toEqual([
      // Mon..Sun, Saturday fixed: Sunday continues from Friday's turn.
      "alex",
      "jordan",
      "alex",
      "jordan",
      "alex",
      "nana",
      "jordan",
      // Six rotate nights a week keeps the turn moving across the week boundary.
      "alex",
      "jordan",
      "alex",
      "jordan",
      "alex",
      "nana",
      "jordan",
    ]);
    expect(nights.filter((n) => n.fixed).map((n) => n.date)).toEqual([
      "2026-11-07",
      "2026-11-14",
    ]);
  });

  it("carries an odd turn count across weeks with a fixed day", () => {
    // Five rotate nights a week with two readers: next week starts with the other reader.
    const nights = previewPlanNights({
      pool: ["alex", "jordan"],
      plan: plan(R, R, R, R, R, "nana", "nana"),
      startDate: MONDAY,
      fromDate: MONDAY,
      days: 14,
    });
    expect(nights.map((n) => n.memberId)).toEqual([
      "alex",
      "jordan",
      "alex",
      "jordan",
      "alex",
      "nana",
      "nana",
      "jordan",
      "alex",
      "jordan",
      "alex",
      "jordan",
      "nana",
      "nana",
    ]);
  });

  it("counts rotate nights from the start date even when it is mid-week", () => {
    const weekly = plan(R, "nana", R, R, R, R, R);
    // Start on a Wednesday: Wed, Thu, Fri, Sat, Sun, Mon rotate; Tue is fixed.
    expect(rotateTurnsBefore(weekly, "2026-11-04", "2026-11-11")).toBe(6);
    expect(rotateTurnsBefore(weekly, "2026-11-04", "2026-11-04")).toBe(0);
    expect(rotateTurnsBefore(weekly, "2026-11-04", "2026-11-25")).toBe(18);
  });

  it("matches the old every-night rotation when every weekday rotates", () => {
    const pool = ["alex", "jordan", "nana"];
    for (let offset = 0; offset < 60; offset++) {
      const date = addDays("2026-10-29", offset);
      expect(
        readerForPlanDate({ pool, plan: ALL_ROTATE, startDate: "2026-10-29", date })
          .memberId,
      ).toBe(readerForDate(pool, "2026-10-29", date));
    }
  });

  it("leaves rotate nights without a reader when the pool is empty", () => {
    const nights = previewPlanNights({
      pool: [],
      plan: plan(R, R, R, R, R, "nana", R),
      startDate: MONDAY,
      fromDate: MONDAY,
      days: 7,
    });
    expect(nights.map((n) => n.memberId)).toEqual([
      null,
      null,
      null,
      null,
      null,
      "nana",
      null,
    ]);
  });

  it("falls back to rotate for a fixed member who left the family", () => {
    const weekly = plan(R, R, R, R, R, "gone", R);
    expect(effectiveWeekdayPlan(weekly, ["alex", "jordan"])).toEqual([...ALL_ROTATE]);
    const saturday = readerForPlanDate({
      pool: ["alex", "jordan"],
      plan: weekly,
      startDate: MONDAY,
      date: "2026-11-07",
      familyMemberIds: ["alex", "jordan"],
    });
    expect(saturday).toEqual({ date: "2026-11-07", memberId: "jordan", fixed: false });
  });

  it("drops people who left from the pool", () => {
    const nights = previewPlanNights({
      pool: ["alex", "gone", "jordan"],
      plan: ALL_ROTATE,
      startDate: MONDAY,
      fromDate: MONDAY,
      days: 4,
      familyMemberIds: ["alex", "jordan"],
    });
    expect(nights.map((n) => n.memberId)).toEqual(["alex", "jordan", "alex", "jordan"]);
  });

  it("reads missing or malformed stored plans as all rotate", () => {
    expect(normalizeWeekdayPlan(undefined)).toEqual([...ALL_ROTATE]);
    expect(normalizeWeekdayPlan(["rotate"])).toEqual([...ALL_ROTATE]);
    expect(normalizeWeekdayPlan([R, R, R, R, R, 7, R])).toEqual([...ALL_ROTATE]);
    expect(normalizeWeekdayPlan([R, R, R, R, R, "nana", R])).toEqual([
      R,
      R,
      R,
      R,
      R,
      "nana",
      R,
    ]);
  });

  it("defaults a new pool to the parents", () => {
    expect(
      defaultRotationPool([
        { id: "alex", role: "owner", relationToChildren: "other" },
        { id: "jordan", role: "reader", relationToChildren: "parent" },
        { id: "nana", role: "reader", relationToChildren: "grandparent" },
      ]),
    ).toEqual(["alex", "jordan"]);
  });
});

describe("generating nights from a weekday plan", () => {
  const weekly = schedule({
    readerRotationMemberIds: ["alex", "jordan"],
    weekdayReaders: plan(R, R, R, R, R, "nana", R),
  });

  it("gives the same readers when generated in two horizons or all at once", () => {
    const day1 = MONDAY;
    const day14 = addDays(day1, 13);
    const day28 = addDays(day1, 27);
    const first = generateSessionsFromSchedule({
      schedule: weekly,
      existingSessionDates: new Set(),
      throughDate: day14,
      nowDate: day1,
    });
    const second = generateSessionsFromSchedule({
      schedule: weekly,
      existingSessionDates: new Set(first.map((d) => sessionDateKey(d.scheduledFor))),
      throughDate: day28,
      nowDate: addDays(day1, 14),
    });
    const once = generateSessionsFromSchedule({
      schedule: weekly,
      existingSessionDates: new Set(),
      throughDate: day28,
      nowDate: day1,
    });
    expect(first).toHaveLength(14);
    expect(second).toHaveLength(14);
    expect(readersFor([...first, ...second])).toEqual(readersFor(once));
    // Rerunning with every night present creates nothing.
    expect(
      generateSessionsFromSchedule({
        schedule: weekly,
        existingSessionDates: new Set(once.map((d) => sessionDateKey(d.scheduledFor))),
        throughDate: day28,
        nowDate: day1,
      }),
    ).toEqual([]);
  });

  it("keeps the rotation stable when the daily cron starts later in the schedule", () => {
    const fromLater = generateSessionsFromSchedule({
      schedule: weekly,
      existingSessionDates: new Set(),
      throughDate: addDays(MONDAY, 27),
      nowDate: addDays(MONDAY, 17),
    });
    const once = generateSessionsFromSchedule({
      schedule: weekly,
      existingSessionDates: new Set(),
      throughDate: addDays(MONDAY, 27),
      nowDate: MONDAY,
    });
    expect(readersFor(fromLater)).toEqual(readersFor(once).slice(17));
  });

  it("skips rotate nights when nobody is in the pool but keeps fixed nights", () => {
    const drafts = generateSessionsFromSchedule({
      schedule: schedule({
        readerRotationMemberIds: [],
        weekdayReaders: plan(R, R, R, R, R, "nana", R),
      }),
      existingSessionDates: new Set(),
      throughDate: addDays(MONDAY, 13),
    });
    expect(readersFor(drafts)).toEqual([
      ["2026-11-07", "nana"],
      ["2026-11-14", "nana"],
    ]);
  });

  it("treats a removed member's weekday as rotate during generation", () => {
    const drafts = generateSessionsFromSchedule({
      schedule: schedule({ weekdayReaders: plan(R, R, R, R, R, "gone", R) }),
      existingSessionDates: new Set(),
      throughDate: addDays(MONDAY, 6),
      familyMemberIds: ["alex", "jordan"],
    });
    expect(drafts.map((d) => d.memberId)).toEqual([
      "alex",
      "jordan",
      "alex",
      "jordan",
      "alex",
      "jordan",
      "alex",
    ]);
  });

  it("generates schedules without a stored plan exactly as before", () => {
    const legacy = schedule({ weekdayReaders: undefined });
    const drafts = generateSessionsFromSchedule({
      schedule: legacy,
      existingSessionDates: new Set(),
      throughDate: addDays(MONDAY, 9),
    });
    expect(drafts.map((d) => d.memberId)).toEqual(
      drafts.map((d) =>
        readerForDate(["alex", "jordan"], MONDAY, sessionDateKey(d.scheduledFor)),
      ),
    );
  });
});

describe("validating a weekday plan", () => {
  const family = ["alex", "jordan", "nana"];

  it("accepts rotate and family members", () => {
    expect(
      assertWeekdayPlan({
        plan: [R, R, R, R, R, "nana", R],
        pool: ["alex", "jordan"],
        familyMemberIds: family,
      }),
    ).toEqual([R, R, R, R, R, "nana", R]);
  });

  it("rejects values that are neither rotate nor a member", () => {
    expect(() =>
      assertWeekdayPlan({
        plan: [R, R, "everyone", R, R, R, R],
        pool: ["alex"],
        familyMemberIds: family,
      }),
    ).toThrow("Choose a family member or Rotate for Wednesday");
  });

  it("rejects a member from another family", () => {
    expect(() =>
      assertWeekdayPlan({
        plan: [R, R, R, R, R, "stranger", R],
        pool: ["alex"],
        familyMemberIds: family,
      }),
    ).toThrow(/Saturday/);
    expect(() =>
      assertWeekdayPlan({
        plan: [...ALL_ROTATE],
        pool: ["stranger"],
        familyMemberIds: family,
      }),
    ).toThrow("Invalid reader in rotation");
  });

  it("requires exactly seven entries", () => {
    for (const bad of [[R, R, R, R, R, R], [R, R, R, R, R, R, R, R], "rotate", null]) {
      expect(() =>
        assertWeekdayPlan({ plan: bad, pool: ["alex"], familyMemberIds: family }),
      ).toThrow("Choose a reader for each of the seven nights");
    }
  });

  it("rejects rotate nights with an empty pool, but allows a fully fixed week", () => {
    expect(() =>
      assertWeekdayPlan({
        plan: [R, "alex", "alex", "alex", "alex", "alex", "alex"],
        pool: [],
        familyMemberIds: family,
      }),
    ).toThrow(EMPTY_POOL_MESSAGE);
    expect(
      assertWeekdayPlan({
        plan: ["alex", "jordan", "alex", "jordan", "alex", "nana", "nana"],
        pool: [],
        familyMemberIds: family,
      }),
    ).toHaveLength(7);
  });

  it("reads weekday0..weekday6 from a form and rejects a missing day", () => {
    const form = new FormData();
    for (let i = 0; i < 7; i++) form.set(`weekday${i}`, i === 5 ? "nana" : R);
    expect(parseWeekdayPlanForm(form)).toEqual([R, R, R, R, R, "nana", R]);
    form.delete("weekday6");
    expect(() => parseWeekdayPlanForm(form)).toThrow("Choose who reads on Sunday");
  });
});

describe("schedule patterns", () => {
  const R = "rotate";

  it("builds plans from patterns and recognizes them again", () => {
    expect(patternPlan("every-night")).toEqual([R, R, R, R, R, R, R]);
    const weekend = patternPlan("weekend-reader", "nana");
    expect(weekend).toEqual([R, R, R, R, R, "nana", "nana"]);
    expect(matchPattern(weekend)).toEqual({
      pattern: "weekend-reader",
      weekendReaderId: "nana",
    });
    expect(matchPattern(patternPlan("every-night"))).toEqual({ pattern: "every-night" });
    expect(matchPattern([R, "alex", R, R, R, R, R])).toBeNull();
    expect(matchPattern([R, R, R, R, R, "nana", "alex"])).toBeNull();
  });

  it("turns the pool so the chosen reader goes first, keeping the order after them", () => {
    expect(poolStartingWith(["a", "b", "c"], "b")).toEqual(["b", "c", "a"]);
    expect(poolStartingWith(["a", "b", "c"], "a")).toEqual(["a", "b", "c"]);
    expect(poolStartingWith(["a", "b"], "missing")).toEqual(["a", "b"]);
  });

  it("describes a plan in one line", () => {
    const names = { nana: "Nana" };
    expect(describeWeekdayPlan(patternPlan("every-night"), names)).toBe(
      "Take turns every night",
    );
    expect(describeWeekdayPlan(patternPlan("weekend-reader", "nana"), names)).toBe(
      "Take turns on weeknights · Nana reads on weekends",
    );
    expect(describeWeekdayPlan([R, "nana", R, R, R, R, R], names)).toBe(
      "Rotate, with 1 fixed night a week",
    );
  });
});
