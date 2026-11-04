"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChoiceChip } from "@/components/ui/choice-chip";
import { NativeSelect } from "@/components/ui/native-select";
import { parseDateOnly } from "@/lib/domain/rotation";
import {
  EMPTY_POOL_MESSAGE,
  ROTATE,
  WEEKDAY_COUNT,
  WEEKDAY_NAMES,
  WEEKDAY_SHORT,
  hasRotateNights,
  previewPlanNights,
  weekdayFieldName,
  weekdayIndex,
} from "@/lib/domain/weekday-plan";
import "./weekday-plan-fields.css";

const PREVIEW_DAYS = 14;

type PlanReader = { id: string; displayName: string; hint: string };

type PlanValues = { pool: string[]; plan: string[]; startDate: string };

function isDateOnly(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return !Number.isNaN(parseDateOnly(value).getTime());
}

/** Current values straight from the form, so resets and restored values count too. */
function readValues(root: HTMLElement, form: HTMLFormElement | null): PlanValues {
  const pool = Array.from(
    root.querySelectorAll<HTMLInputElement>('input[name="readers"]'),
  )
    .filter((input) => input.checked)
    .map((input) => input.value);
  const plan = Array.from({ length: WEEKDAY_COUNT }, (_, index) => {
    const select = root.querySelector<HTMLSelectElement>(
      `select[name="${weekdayFieldName(index)}"]`,
    );
    return select?.value || ROTATE;
  });
  const start = form?.querySelector<HTMLInputElement>('input[name="startDate"]');
  return { pool, plan, startDate: start?.value ?? "" };
}

function sameValues(a: PlanValues, b: PlanValues): boolean {
  return (
    a.startDate === b.startDate &&
    a.pool.join() === b.pool.join() &&
    a.plan.join() === b.plan.join()
  );
}

/**
 * The rotation pool chips, the Monday–Sunday plan, and a live two-week preview.
 * Inputs stay uncontrolled so they post with the surrounding form as usual; the
 * preview re-reads them whenever the form changes.
 */
export function WeekdayPlanFields({
  readers,
  defaultPool,
  defaultPlan,
  defaultStartDate,
  today,
}: {
  readers: PlanReader[];
  defaultPool: string[];
  defaultPlan: string[];
  defaultStartDate?: string;
  /** YYYY-MM-DD in the family timezone. */
  today: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [values, setValues] = useState<PlanValues>({
    pool: defaultPool,
    plan: defaultPlan,
    startDate: defaultStartDate ?? "",
  });

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const form = root.closest("form");
    let frame = 0;
    const sync = () => {
      cancelAnimationFrame(frame);
      // After a reset (or a restore of submitted values) the DOM settles a frame later.
      frame = requestAnimationFrame(() => {
        const next = readValues(root, form);
        setValues((current) => (sameValues(current, next) ? current : next));
      });
    };
    sync();
    const target: HTMLElement = form ?? root;
    for (const type of ["input", "change", "reset"]) target.addEventListener(type, sync);
    return () => {
      cancelAnimationFrame(frame);
      for (const type of ["input", "change", "reset"])
        target.removeEventListener(type, sync);
    };
  }, []);

  const names = useMemo(
    () => Object.fromEntries(readers.map((reader) => [reader.id, reader.displayName])),
    [readers],
  );
  const startDate = isDateOnly(values.startDate) ? values.startDate : today;
  const fromDate = startDate > today ? startDate : today;
  const nights = useMemo(
    () =>
      previewPlanNights({
        pool: values.pool,
        plan: values.plan,
        startDate,
        fromDate,
        days: PREVIEW_DAYS,
        familyMemberIds: readers.map((reader) => reader.id),
      }),
    [values.pool, values.plan, startDate, fromDate, readers],
  );
  const missingPool = values.pool.length === 0 && hasRotateNights(values.plan);

  return (
    <div ref={rootRef} className="space-y-5">
      <fieldset className="space-y-2">
        <legend className="text-sm font-bold">Who&apos;s in the rotation</legend>
        <p className="text-sm text-muted-foreground">
          They take turns on the nights set to Rotate.
        </p>
        <div className="flex flex-wrap gap-2">
          {readers.map((reader) => (
            <ChoiceChip
              key={reader.id}
              variant="chip"
              name="readers"
              value={reader.id}
              hint={reader.hint}
              defaultChecked={defaultPool.includes(reader.id)}
            >
              {reader.displayName}
            </ChoiceChip>
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-sm font-bold">Every week</legend>
        <p className="text-sm text-muted-foreground">
          Pick a reader to keep a night fixed, or leave it on Rotate.
        </p>
        <div className="weekday-plan">
          {WEEKDAY_SHORT.map((label, index) => {
            const id = `weekday-plan-${index}`;
            return (
              <div key={label} className="weekday-plan__day">
                <label htmlFor={id} className="weekday-plan__label">
                  {label}
                </label>
                <NativeSelect
                  id={id}
                  name={weekdayFieldName(index)}
                  aria-label={`Who reads on ${WEEKDAY_NAMES[index]}`}
                  defaultValue={defaultPlan[index] ?? ROTATE}
                  className="h-10"
                >
                  <option value={ROTATE}>Rotate</option>
                  {readers.map((reader) => (
                    <option key={reader.id} value={reader.id}>
                      {reader.displayName}
                    </option>
                  ))}
                </NativeSelect>
              </div>
            );
          })}
        </div>
      </fieldset>

      <section aria-labelledby="weekday-plan-preview" className="space-y-2">
        <h3 id="weekday-plan-preview" className="text-sm font-bold">
          Next two weeks
        </h3>
        {missingPool ? (
          <p role="status" className="weekday-plan__warning">
            {EMPTY_POOL_MESSAGE}
          </p>
        ) : (
          <ol className="weekday-preview" aria-live="polite">
            {nights.map((night) => (
              <li
                key={night.date}
                className="weekday-preview__night"
                data-fixed={night.fixed ? "true" : undefined}
              >
                <span className="weekday-preview__day">
                  <span>{WEEKDAY_SHORT[weekdayIndex(night.date)]}</span>{" "}
                  <span>{Number(night.date.slice(8, 10))}</span>
                </span>
                <span
                  className="weekday-preview__reader"
                  title={night.memberId ? names[night.memberId] : undefined}
                >
                  {night.memberId ? (names[night.memberId] ?? "Reader") : "—"}
                </span>
                {night.fixed && <span className="sr-only"> (every week)</span>}
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
