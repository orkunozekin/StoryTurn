import { addDays, formatDateOnly, parseDateOnly } from "@/lib/domain/rotation";

/**
 * How long a schedule runs, as offered in the schedule wizard. Every length
 * except "ongoing" becomes an inclusive end date (the last night planned).
 */
export const SCHEDULE_LENGTHS = [
  { id: "ongoing", label: "Keep going (no end date)" },
  { id: "1w", label: "1 week", days: 7 },
  { id: "2w", label: "2 weeks", days: 14 },
  { id: "1m", label: "1 month", months: 1 },
  { id: "3m", label: "3 months", months: 3 },
  { id: "6m", label: "6 months", months: 6 },
  { id: "custom", label: "Until a date I pick" },
] as const satisfies readonly {
  id: string;
  label: string;
  days?: number;
  months?: number;
}[];

export type ScheduleLength = (typeof SCHEDULE_LENGTHS)[number]["id"];

/** The same day of the month `months` later, clamped to the end of a short month. */
function addMonths(date: string, months: number): string {
  const start = parseDateOnly(date);
  const target = new Date(
    Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + months, 1),
  );
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(start.getUTCDate(), lastDay));
  return formatDateOnly(target);
}

/**
 * The last night for a preset length starting on `startDate`: "2 weeks" from a
 * Monday ends on the Sunday 13 days later. Null for "ongoing" and "custom",
 * which have no preset end.
 */
export function presetEndDate(startDate: string, length: ScheduleLength): string | null {
  const option = SCHEDULE_LENGTHS.find((entry) => entry.id === length);
  if (!option) return null;
  if ("days" in option) return addDays(startDate, option.days - 1);
  if ("months" in option) return addDays(addMonths(startDate, option.months), -1);
  return null;
}

/** Which length a saved end date matches, so editing reopens on the same choice. */
export function lengthForEndDate(
  startDate: string,
  endDate: string | null | undefined,
): ScheduleLength {
  if (!endDate) return "ongoing";
  const preset = SCHEDULE_LENGTHS.find(
    (entry) => presetEndDate(startDate, entry.id) === endDate,
  );
  return preset?.id ?? "custom";
}
