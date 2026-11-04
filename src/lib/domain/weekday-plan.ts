import {
  addDays,
  daysBetween,
  parseDateOnly,
  readerForNightIndex,
} from "@/lib/domain/rotation";

/**
 * A weekday plan says who reads on each day of the week. Index 0 is Monday and
 * index 6 is Sunday. Each slot is either "rotate" (the next person in the
 * rotation pool takes the night) or a family member id (that member always
 * reads that weekday). Stored as `schedules.weekday_readers` (jsonb).
 */
export const ROTATE = "rotate";
export type WeekdaySlot = typeof ROTATE | (string & {});
export type WeekdayPlan = readonly WeekdaySlot[];

export const WEEKDAY_COUNT = 7;
export const WEEKDAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
export const WEEKDAY_NAMES = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

export const EMPTY_POOL_MESSAGE =
  "Add someone to the rotation or pick a reader for every night";

/** Every night rotates: the plan of schedules saved before weekday plans existed. */
export const ALL_ROTATE: WeekdayPlan = Object.freeze(
  Array.from({ length: WEEKDAY_COUNT }, () => ROTATE),
);

/** Monday = 0 … Sunday = 6 for a YYYY-MM-DD date. */
export function weekdayIndex(date: string): number {
  return (parseDateOnly(date).getUTCDay() + 6) % 7;
}

/** Field name the schedule form posts for a weekday, e.g. `weekday0` for Monday. */
export function weekdayFieldName(index: number): string {
  return `weekday${index}`;
}

/** A stored value as a 7-slot plan; anything malformed reads as all "rotate". */
export function normalizeWeekdayPlan(raw: unknown): WeekdaySlot[] {
  if (
    !Array.isArray(raw) ||
    raw.length !== WEEKDAY_COUNT ||
    raw.some((slot) => typeof slot !== "string" || slot === "")
  ) {
    return [...ALL_ROTATE];
  }
  return raw.map(String);
}

/**
 * The plan as it applies today: a weekday fixed to someone who is no longer in
 * the family falls back to "rotate". Without a member list the plan is unchanged.
 */
export function effectiveWeekdayPlan(
  plan: WeekdayPlan | undefined,
  familyMemberIds?: Iterable<string>,
): WeekdaySlot[] {
  const slots = normalizeWeekdayPlan(plan);
  if (!familyMemberIds) return slots;
  const members = new Set(familyMemberIds);
  return slots.map((slot) => (slot === ROTATE || members.has(slot) ? slot : ROTATE));
}

/** The rotation pool limited to current family members (order kept). */
export function effectivePool(
  pool: readonly string[],
  familyMemberIds?: Iterable<string>,
): string[] {
  if (!familyMemberIds) return [...pool];
  const members = new Set(familyMemberIds);
  return pool.filter((id) => members.has(id));
}

/** A new schedule's pool: the family's parents (owners or anyone marked a parent). */
export function defaultRotationPool(
  members: readonly { id: string; role: string; relationToChildren: string }[],
): string[] {
  return members
    .filter((m) => m.role === "owner" || m.relationToChildren === "parent")
    .map((m) => m.id);
}

export function hasRotateNights(plan: WeekdayPlan): boolean {
  return plan.includes(ROTATE);
}

/**
 * How many rotate nights fall on or after `startDate` and before `date`. This is
 * the turn number for a rotate night on `date`; fixed nights never use a turn.
 */
export function rotateTurnsBefore(
  plan: WeekdayPlan,
  startDate: string,
  date: string,
): number {
  const elapsed = daysBetween(startDate, date);
  if (elapsed <= 0) return 0;
  const perWeek = plan.filter((slot) => slot === ROTATE).length;
  const weeks = Math.floor(elapsed / WEEKDAY_COUNT);
  let turns = weeks * perWeek;
  const startWeekday = weekdayIndex(startDate);
  for (let offset = 0; offset < elapsed % WEEKDAY_COUNT; offset++) {
    if (plan[(startWeekday + offset) % WEEKDAY_COUNT] === ROTATE) turns += 1;
  }
  return turns;
}

export type PlanNight = { date: string; memberId: string | null; fixed: boolean };

/**
 * Who reads on `date`. A fixed weekday goes to its member. A rotate weekday goes
 * to `pool[turn % pool.length]`, where the turn counts only rotate nights since
 * the start date, so the answer never depends on what was generated before.
 * An all-"rotate" plan is the old rotation (`readerForDate`).
 *
 * `memberId` is null before the start date, or on a rotate night with an empty pool.
 * Pass `familyMemberIds` to drop people who have left the family.
 */
export function readerForPlanDate(params: {
  pool: readonly string[];
  plan: WeekdayPlan | undefined;
  startDate: string;
  date: string;
  familyMemberIds?: Iterable<string>;
}): PlanNight {
  const members = params.familyMemberIds ? [...params.familyMemberIds] : undefined;
  const plan = effectiveWeekdayPlan(params.plan, members);
  if (params.date < params.startDate) {
    return { date: params.date, memberId: null, fixed: false };
  }
  const slot = plan[weekdayIndex(params.date)]!;
  if (slot !== ROTATE) return { date: params.date, memberId: slot, fixed: true };
  const pool = effectivePool(params.pool, members);
  if (pool.length === 0) return { date: params.date, memberId: null, fixed: false };
  const turn = rotateTurnsBefore(plan, params.startDate, params.date);
  return { date: params.date, memberId: readerForNightIndex(pool, turn), fixed: false };
}

/** `days` consecutive nights from `fromDate`, using the same rule as generation. */
export function previewPlanNights(params: {
  pool: readonly string[];
  plan: WeekdayPlan | undefined;
  startDate: string;
  fromDate: string;
  days: number;
  familyMemberIds?: Iterable<string>;
}): PlanNight[] {
  const members = params.familyMemberIds ? [...params.familyMemberIds] : undefined;
  return Array.from({ length: params.days }, (_, offset) =>
    readerForPlanDate({
      pool: params.pool,
      plan: params.plan,
      startDate: params.startDate,
      date: addDays(params.fromDate, offset),
      familyMemberIds: members,
    }),
  );
}

/** Read `weekday0`..`weekday6` from a posted form. Missing fields are an error. */
export function parseWeekdayPlanForm(form: Pick<FormData, "get">): string[] {
  return Array.from({ length: WEEKDAY_COUNT }, (_, index) => {
    const value = form.get(weekdayFieldName(index));
    if (typeof value !== "string" || !value.trim()) {
      throw new Error(`Choose who reads on ${WEEKDAY_NAMES[index]}`);
    }
    return value.trim();
  });
}

/**
 * Server-side check before saving: exactly seven slots, each "rotate" or a member
 * of this family, every pool member in this family, and someone in the pool if any
 * night rotates. Returns the validated plan.
 */
export function assertWeekdayPlan(params: {
  plan: unknown;
  pool: readonly string[];
  familyMemberIds: Iterable<string>;
}): WeekdaySlot[] {
  const members = new Set(params.familyMemberIds);
  const { plan } = params;
  if (!Array.isArray(plan) || plan.length !== WEEKDAY_COUNT) {
    throw new Error("Choose a reader for each of the seven nights");
  }
  plan.forEach((slot, index) => {
    if (typeof slot !== "string" || (slot !== ROTATE && !members.has(slot))) {
      throw new Error(`Choose a family member or Rotate for ${WEEKDAY_NAMES[index]}`);
    }
  });
  if (params.pool.some((id) => !members.has(id))) {
    throw new Error("Invalid reader in rotation");
  }
  if (params.pool.length === 0 && plan.includes(ROTATE)) {
    throw new Error(EMPTY_POOL_MESSAGE);
  }
  return plan.map(String);
}

/**
 * Ready-made plans for the schedule wizard, so a family can pick "how" without
 * filling in seven nights. Each one is an ordinary weekday plan underneath.
 * - `every-night`: everyone in the rotation takes a turn, night after night.
 * - `weekend-reader`: weeknights rotate; one reader always has Saturday and Sunday.
 */
export const SCHEDULE_PATTERNS = ["every-night", "weekend-reader"] as const;
export type SchedulePattern = (typeof SCHEDULE_PATTERNS)[number];

const SATURDAY = 5;
const SUNDAY = 6;

export function patternPlan(
  pattern: SchedulePattern,
  weekendReaderId?: string,
): WeekdaySlot[] {
  if (pattern === "every-night" || !weekendReaderId) return [...ALL_ROTATE];
  return Array.from({ length: WEEKDAY_COUNT }, (_, index) =>
    index === SATURDAY || index === SUNDAY ? weekendReaderId : ROTATE,
  );
}

/** Which ready-made pattern a saved plan matches, or null for a hand-picked week. */
export function matchPattern(
  plan: WeekdayPlan,
): { pattern: SchedulePattern; weekendReaderId?: string } | null {
  if (plan.every((slot) => slot === ROTATE)) return { pattern: "every-night" };
  const weekend = plan[SATURDAY];
  const weekdaysRotate = plan.slice(0, SATURDAY).every((slot) => slot === ROTATE);
  if (weekdaysRotate && weekend && weekend !== ROTATE && plan[SUNDAY] === weekend) {
    return { pattern: "weekend-reader", weekendReaderId: weekend };
  }
  return null;
}

/**
 * The first rotate night after the start date goes to `pool[0]`, so choosing who
 * starts means turning the pool until they are first. The order after them stays.
 */
export function poolStartingWith(pool: readonly string[], starterId: string): string[] {
  const start = pool.indexOf(starterId);
  if (start <= 0) return [...pool];
  return [...pool.slice(start), ...pool.slice(0, start)];
}

/** One line for the schedule page, e.g. "Take turns every night". */
export function describeWeekdayPlan(
  plan: WeekdayPlan,
  names: Record<string, string>,
): string {
  const matched = matchPattern(plan);
  if (matched?.pattern === "every-night") return "Take turns every night";
  if (matched?.pattern === "weekend-reader") {
    const reader = names[matched.weekendReaderId ?? ""] ?? "One reader";
    return `Take turns on weeknights · ${reader} reads on weekends`;
  }
  const fixed = plan.filter((slot) => slot !== ROTATE).length;
  return fixed === WEEKDAY_COUNT
    ? "A fixed reader every night"
    : `Rotate, with ${fixed} fixed ${fixed === 1 ? "night" : "nights"} a week`;
}
