import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as store from "@/lib/demo/store";
import { addDays } from "@/lib/domain/rotation";
import { readerForPlanDate } from "@/lib/domain/weekday-plan";
import { sessionDateKey } from "@/lib/domain/sessions";

vi.mock("@/lib/plunk", () => ({
  sendEmail: vi.fn(async () => ({ ok: true })),
}));

const R = "rotate";
// Monday Oct 5, 13:00 in Los Angeles.
const TODAY = "2026-10-05";
const SATURDAY = "2026-10-10";

function as(userId: string) {
  store.setDemoSessionUserId(userId);
}
function readerOn(day: string) {
  const state = store.getDemoState();
  const session = state.sessions.find(
    (s) => sessionDateKey(s.scheduledFor) === day && s.status === "scheduled",
  );
  if (!session) return undefined;
  return state.assignments.find((a) => a.sessionId === session.id && a.isCurrent)
    ?.memberId;
}
function baseInput() {
  const schedule = store.getDemoState().schedules[0]!;
  return {
    readerRotationMemberIds: schedule.readerRotationMemberIds,
    startDate: schedule.startDate,
    timeLocal: schedule.timeLocal,
    timezone: schedule.timezone,
    bookTiming: schedule.bookTiming,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-05T20:00:00Z"));
  store.resetDemoStore();
  as("user_alex");
});
afterEach(() => vi.useRealTimers());

describe("demo weekday plan", () => {
  it("seeds an all-rotate plan, so existing nights follow the old rotation", () => {
    expect(store.getFamilyAdmin()!.schedule!.weekdayReaders).toEqual(
      Array.from({ length: 7 }, () => R),
    );
  });

  it("saves a plan and reassigns future nights with fixed and rotate weekdays", () => {
    const state = store.getDemoState();
    const past = state.sessions
      .filter((s) => sessionDateKey(s.scheduledFor) < TODAY)
      .map((s) => ({
        id: s.id,
        status: s.status,
        readers: state.assignments
          .filter((a) => a.sessionId === s.id && a.isCurrent)
          .map((a) => a.memberId),
      }));
    const input = baseInput();
    const plan = [R, R, R, R, R, "mem_nana", R];
    store.saveSchedule({ ...input, weekdayReaders: plan });

    expect(store.getFamilyAdmin()!.schedule!.weekdayReaders).toEqual(plan);
    for (let i = 0; i <= 14; i++) {
      const day = addDays(TODAY, i);
      expect(readerOn(day)).toBe(
        readerForPlanDate({
          pool: input.readerRotationMemberIds,
          plan,
          startDate: input.startDate,
          date: day,
        }).memberId,
      );
    }
    expect(readerOn(SATURDAY)).toBe("mem_nana");
    expect(readerOn(addDays(SATURDAY, 7))).toBe("mem_nana");
    // Past and completed nights never change.
    expect(
      past.map(({ id }) => ({
        id,
        status: state.sessions.find((s) => s.id === id)!.status,
        readers: state.assignments
          .filter((a) => a.sessionId === id && a.isCurrent)
          .map((a) => a.memberId),
      })),
    ).toEqual(past);
  });

  it("keeps generating the same readers when the horizon moves forward", () => {
    const input = baseInput();
    const plan = [R, "mem_jordan", R, R, R, "mem_nana", "mem_nana"];
    store.saveSchedule({ ...input, weekdayReaders: plan });
    vi.setSystemTime(new Date("2026-10-19T20:00:00Z"));
    store.ensureUpcomingSessions(14);
    for (let i = 0; i <= 28; i++) {
      const day = addDays(TODAY, i);
      expect(readerOn(day)).toBe(
        readerForPlanDate({
          pool: input.readerRotationMemberIds,
          plan,
          startDate: input.startDate,
          date: day,
        }).memberId,
      );
    }
  });

  it("lets every night be fixed with nobody in the rotation", () => {
    store.saveSchedule({
      ...baseInput(),
      readerRotationMemberIds: [],
      weekdayReaders: Array.from({ length: 7 }, () => "mem_jordan"),
    });
    for (let i = 0; i < 7; i++) expect(readerOn(addDays(TODAY, i))).toBe("mem_jordan");
  });

  it("rejects bad plans without changing the schedule", () => {
    const state = store.getDemoState();
    state.members.push({
      ...state.members[0]!,
      id: "mem_stranger",
      familyId: "fam_other",
      userId: "user_stranger",
    });
    const before = structuredClone(state.schedules[0]);
    const input = baseInput();
    const cases: [
      Partial<ReturnType<typeof baseInput>> & { weekdayReaders: string[] },
      string,
    ][] = [
      [{ weekdayReaders: [R, R, R] }, "Choose a reader for each of the seven nights"],
      [{ weekdayReaders: [R, R, R, R, R, "nobody", R] }, "Saturday"],
      [{ weekdayReaders: [R, R, R, R, R, "mem_stranger", R] }, "Saturday"],
      [
        { readerRotationMemberIds: [], weekdayReaders: [R, R, R, R, R, "mem_nana", R] },
        "Add someone to the rotation or pick a reader for every night",
      ],
    ];
    for (const [override, message] of cases) {
      expect(() => store.saveSchedule({ ...input, ...override })).toThrow(message);
      expect(state.schedules[0]).toEqual(before);
    }
  });

  it("treats a removed member's weekday as rotate when generating", () => {
    const input = baseInput();
    store.saveSchedule({ ...input, weekdayReaders: [R, R, R, R, R, "mem_nana", R] });
    const state = store.getDemoState();
    state.members = state.members.filter((m) => m.id !== "mem_nana");
    vi.setSystemTime(new Date("2026-10-19T20:00:00Z"));
    store.ensureUpcomingSessions(14);
    // Oct 31 is a Saturday generated after Nana left: it rotates now.
    const day = "2026-10-31";
    expect(readerOn(day)).toBe(
      readerForPlanDate({
        pool: input.readerRotationMemberIds,
        plan: [R, R, R, R, R, R, R],
        startDate: input.startDate,
        date: day,
      }).memberId,
    );
  });

  it("still lets an approved reader request override a single night", async () => {
    store.saveSchedule({
      ...baseInput(),
      weekdayReaders: [R, R, R, R, R, "mem_jordan", R],
    });
    const saturday = store
      .getDemoState()
      .sessions.find((s) => sessionDateKey(s.scheduledFor) === SATURDAY)!;
    as("user_nana");
    store.requestToReadNight(saturday.id, null);
    const [request] = store.listReaderRequests(saturday.id);
    as("user_alex");
    await store.decideReaderRequest(request!.id, true);
    expect(readerOn(SATURDAY)).toBe("mem_nana");
    expect(readerOn(addDays(SATURDAY, 7))).toBe("mem_jordan");
  });
});

describe("demo schedule end date", () => {
  it("stops generating after the end date and cancels later nights", () => {
    const input = baseInput();
    store.saveSchedule({ ...input, startDate: TODAY, endDate: addDays(TODAY, 4) });
    const state = store.getDemoState();
    const future = state.sessions.filter((s) => sessionDateKey(s.scheduledFor) >= TODAY);
    const scheduledDays = future
      .filter((s) => s.status === "scheduled")
      .map((s) => sessionDateKey(s.scheduledFor))
      .sort();
    expect(scheduledDays).toEqual(Array.from({ length: 5 }, (_, i) => addDays(TODAY, i)));
    expect(store.getFamilyAdmin()!.schedule!.endDate).toBe(addDays(TODAY, 4));

    store.saveSchedule({ ...input, startDate: TODAY, endDate: null });
    expect(readerOn(addDays(TODAY, 10))).toBeDefined();
    expect(store.getFamilyAdmin()!.schedule!.endDate).toBeNull();
  });
});
