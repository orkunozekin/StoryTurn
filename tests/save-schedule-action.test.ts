import { beforeEach, expect, it, vi } from "vitest";
import { saveScheduleAction } from "@/app/actions";

const mocks = vi.hoisted(() => ({ saveSchedule: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({}) }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/data", () => ({ saveSchedule: mocks.saveSchedule }));

function scheduleForm(weekdays: (string | null)[]) {
  const data = new FormData();
  data.append("readers", "mem_alex");
  data.append("readers", "mem_jordan");
  weekdays.forEach((value, index) => {
    if (value !== null) data.set(`weekday${index}`, value);
  });
  data.set("startDate", "2026-11-02");
  data.set("timeLocal", "19:30");
  data.set("timezone", "America/Los_Angeles");
  data.set("booksPerSession", "3");
  data.set("assignRandomBooks", "on");
  return data;
}

beforeEach(() => vi.clearAllMocks());

it("posts the pool and the Monday-first weekday plan", async () => {
  const plan = ["rotate", "rotate", "rotate", "rotate", "rotate", "mem_nana", "rotate"];
  await saveScheduleAction(scheduleForm(plan));
  expect(mocks.saveSchedule).toHaveBeenCalledWith(
    expect.objectContaining({
      readerRotationMemberIds: ["mem_alex", "mem_jordan"],
      weekdayReaders: plan,
      startDate: "2026-11-02",
    }),
  );
});

it("rejects a form missing a weekday before saving", async () => {
  await expect(
    saveScheduleAction(
      scheduleForm(["rotate", "rotate", "rotate", "rotate", "rotate", "rotate", null]),
    ),
  ).rejects.toThrow("Choose who reads on Sunday");
  expect(mocks.saveSchedule).not.toHaveBeenCalled();
});

it("posts the end date, or null for a schedule with no end", async () => {
  const plan = Array.from({ length: 7 }, () => "rotate");
  const data = scheduleForm(plan);
  data.set("endDate", "2026-11-15");
  await saveScheduleAction(data);
  expect(mocks.saveSchedule).toHaveBeenLastCalledWith(
    expect.objectContaining({ endDate: "2026-11-15" }),
  );
  data.set("endDate", "");
  await saveScheduleAction(data);
  expect(mocks.saveSchedule).toHaveBeenLastCalledWith(
    expect.objectContaining({ endDate: null }),
  );
});
