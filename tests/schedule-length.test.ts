import { describe, expect, it } from "vitest";
import { lengthForEndDate, presetEndDate } from "@/lib/domain/schedule-length";
import { assertScheduleSettings } from "@/lib/domain/schedule-settings";
import { generateSessionsFromSchedule, sessionDateKey } from "@/lib/domain/sessions";
import type { Schedule } from "@/lib/types";

describe("presetEndDate", () => {
  it("counts the start date as the first night", () => {
    expect(presetEndDate("2026-11-02", "1w")).toBe("2026-11-08");
    expect(presetEndDate("2026-11-02", "2w")).toBe("2026-11-15");
    expect(presetEndDate("2026-11-02", "1m")).toBe("2026-12-01");
    expect(presetEndDate("2026-11-02", "3m")).toBe("2027-02-01");
    expect(presetEndDate("2026-11-02", "6m")).toBe("2027-05-01");
  });

  it("clamps months to short months", () => {
    expect(presetEndDate("2027-01-31", "1m")).toBe("2027-02-27");
  });

  it("has no preset end for ongoing or custom", () => {
    expect(presetEndDate("2026-11-02", "ongoing")).toBeNull();
    expect(presetEndDate("2026-11-02", "custom")).toBeNull();
  });
});

describe("lengthForEndDate", () => {
  it("reopens a saved schedule on the matching choice", () => {
    expect(lengthForEndDate("2026-11-02", null)).toBe("ongoing");
    expect(lengthForEndDate("2026-11-02", "2026-11-15")).toBe("2w");
    expect(lengthForEndDate("2026-11-02", "2027-02-01")).toBe("3m");
    expect(lengthForEndDate("2026-11-02", "2026-11-20")).toBe("custom");
  });
});

describe("assertScheduleSettings end date", () => {
  const base = { startDate: "2026-11-02", timeLocal: "19:30", timezone: "UTC" };
  it("accepts no end, or an end on or after the start", () => {
    expect(() => assertScheduleSettings({ ...base, endDate: null })).not.toThrow();
    expect(() =>
      assertScheduleSettings({ ...base, endDate: "2026-11-02" }),
    ).not.toThrow();
  });
  it("rejects an end before the start or an invalid date", () => {
    expect(() => assertScheduleSettings({ ...base, endDate: "2026-11-01" })).toThrow(
      "The schedule must end on or after its start date",
    );
    expect(() => assertScheduleSettings({ ...base, endDate: "2026-02-30" })).toThrow(
      "Enter a valid end date",
    );
  });
});

describe("generateSessionsFromSchedule with an end date", () => {
  const schedule: Schedule = {
    id: "sch1",
    familyId: "fam1",
    mode: "together",
    readerRotationMemberIds: ["mem_a", "mem_b"],
    startDate: "2026-10-01",
    endDate: "2026-10-03",
    timeLocal: "19:30",
    timezone: "UTC",
    bookTiming: "after",
    active: true,
    createdAt: "2026-10-01T00:00:00.000Z",
  };

  it("stops at the end date", () => {
    const drafts = generateSessionsFromSchedule({
      schedule,
      existingSessionDates: new Set(),
      throughDate: "2026-10-14",
    });
    expect(drafts.map((draft) => sessionDateKey(draft.scheduledFor))).toEqual([
      "2026-10-01",
      "2026-10-02",
      "2026-10-03",
    ]);
  });

  it("creates nothing once the schedule has ended", () => {
    expect(
      generateSessionsFromSchedule({
        schedule,
        existingSessionDates: new Set(),
        throughDate: "2026-10-20",
        nowDate: "2026-10-10",
      }),
    ).toEqual([]);
  });
});
