"use client";

import { Check, CalendarDays, ChevronLeft, ChevronRight, Pencil } from "lucide-react";
import { useMemo, useState, type KeyboardEvent, type ReactNode } from "react";
import { NativeTimezoneForm } from "@/components/native-timezone-form";
import { Button } from "@/components/ui/button";
import { ChoiceChip } from "@/components/ui/choice-chip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { InfoTip } from "@/components/ui/info-tip";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { parseDateOnly } from "@/lib/domain/rotation";
import {
  SCHEDULE_LENGTHS,
  lengthForEndDate,
  presetEndDate,
  type ScheduleLength,
} from "@/lib/domain/schedule-length";
import {
  EMPTY_POOL_MESSAGE,
  ROTATE,
  WEEKDAY_NAMES,
  WEEKDAY_SHORT,
  hasRotateNights,
  matchPattern,
  patternPlan,
  poolStartingWith,
  previewPlanNights,
  weekdayFieldName,
  weekdayIndex,
  type SchedulePattern,
  type WeekdaySlot,
} from "@/lib/domain/weekday-plan";
import "./schedule-wizard.css";

const PREVIEW_DAYS = 14;

export type WizardReader = { id: string; displayName: string; hint: string };

export type ScheduleDefaults = {
  /** Rotation order as saved; the first person reads the first rotate night. */
  pool: string[];
  plan: string[];
  startDate?: string;
  /** Last night planned; null or missing means the schedule keeps going. */
  endDate?: string | null;
  timeLocal: string;
  booksPerSession: number;
  assignRandomBooks: boolean;
};

type NightsMode = "pattern" | "custom";

type WizardState = {
  pool: string[];
  mode: NightsMode;
  pattern: SchedulePattern;
  weekendReaderId: string;
  customPlan: WeekdaySlot[];
  startDate: string;
  length: ScheduleLength;
  customEndDate: string;
  timeLocal: string;
  starterId: string;
  booksPerSession: string;
  assignRandomBooks: boolean;
};

const STEPS = [
  { id: "readers", label: "Readers" },
  { id: "nights", label: "Nights" },
  { id: "start", label: "Dates" },
  { id: "starter", label: "First reader" },
  { id: "review", label: "Review" },
] as const;
type StepId = (typeof STEPS)[number]["id"];

const isDateOnly = (value: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(parseDateOnly(value).getTime());

const shortDate = (date: string) =>
  parseDateOnly(date).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

function initialState(defaults: ScheduleDefaults, readers: WizardReader[]): WizardState {
  const matched = matchPattern(defaults.plan);
  const startDate = defaults.startDate ?? "";
  return {
    pool: defaults.pool,
    mode: matched ? "pattern" : "custom",
    pattern: matched?.pattern ?? "every-night",
    weekendReaderId: matched?.weekendReaderId ?? readers[0]?.id ?? "",
    customPlan: [...defaults.plan],
    startDate,
    length: lengthForEndDate(startDate, defaults.endDate),
    customEndDate: defaults.endDate ?? "",
    timeLocal: defaults.timeLocal,
    starterId: defaults.pool[0] ?? "",
    booksPerSession: String(defaults.booksPerSession),
    assignRandomBooks: defaults.assignRandomBooks,
  };
}

function planFor(state: WizardState): WeekdaySlot[] {
  return state.mode === "pattern"
    ? patternPlan(state.pattern, state.weekendReaderId)
    : state.customPlan;
}

/** The last night to plan, or "" for a schedule with no end. */
function endDateFor(state: WizardState): string {
  if (state.length === "ongoing") return "";
  if (state.length === "custom") return state.customEndDate;
  return isDateOnly(state.startDate)
    ? (presetEndDate(state.startDate, state.length) ?? "")
    : "";
}

/** Problems that block saving, by the step that can fix them. */
function stepErrors(state: WizardState): Partial<Record<StepId, string>> {
  const plan = planFor(state);
  const errors: Partial<Record<StepId, string>> = {};
  if (state.pool.length === 0 && hasRotateNights(plan)) {
    errors.readers = EMPTY_POOL_MESSAGE;
  }
  if (state.mode === "pattern" && state.pattern === "weekend-reader") {
    if (!state.weekendReaderId) errors.nights = "Choose who reads on weekends";
  }
  if (!isDateOnly(state.startDate)) errors.start = "Choose a start date";
  else if (!state.timeLocal) errors.start = "Choose a bedtime";
  else if (state.length === "custom" && !isDateOnly(state.customEndDate))
    errors.start = "Choose an end date";
  else if (state.length === "custom" && state.customEndDate < state.startDate)
    errors.start = "The end date must be on or after the start date";
  const books = Number(state.booksPerSession);
  if (!Number.isInteger(books) || books < 1) {
    errors.review = "Books per session must be 1 or more";
  }
  return errors;
}

/**
 * The create / edit schedule flow: a dialog that walks through readers, nights,
 * start date, and who goes first, then previews the nights it will assign. Every
 * step stays reachable from the rail on the left. The posted fields match what
 * `saveScheduleAction` has always read, so the server side is unchanged.
 */
export function ScheduleWizard({
  action,
  readers,
  defaults,
  today,
  editing,
}: {
  action: (data: FormData) => void | Promise<void>;
  readers: WizardReader[];
  defaults: ScheduleDefaults;
  /** YYYY-MM-DD in the family timezone. */
  today: string;
  editing: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        type="button"
        variant={editing ? "outline" : "default"}
        onClick={() => setOpen(true)}
      >
        {editing ? <Pencil aria-hidden="true" /> : <CalendarDays aria-hidden="true" />}
        {editing ? "Edit schedule" : "Create schedule"}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="schedule-wizard-dialog gap-0 p-0 sm:max-w-3xl">
          {/* Mounted only while open, so each opening starts from the saved schedule. */}
          <WizardForm
            action={action}
            readers={readers}
            defaults={defaults}
            today={today}
            editing={editing}
            onSaved={() => setOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

function WizardForm({
  action,
  readers,
  defaults,
  today,
  editing,
  onSaved,
}: {
  action: (data: FormData) => void | Promise<void>;
  readers: WizardReader[];
  defaults: ScheduleDefaults;
  today: string;
  editing: boolean;
  onSaved: () => void;
}) {
  const [state, setState] = useState(() => initialState(defaults, readers));
  const [stepIndex, setStepIndex] = useState(0);
  // Editing opens on a complete schedule, so every step counts as seen.
  const [visited, setVisited] = useState<Set<number>>(
    () => new Set(editing ? STEPS.map((_, index) => index) : [0]),
  );
  const update = (patch: Partial<WizardState>) =>
    setState((current) => ({ ...current, ...patch }));

  const names = useMemo(
    () => Object.fromEntries(readers.map((reader) => [reader.id, reader.displayName])),
    [readers],
  );
  const plan = planFor(state);
  const endDate = endDateFor(state);
  const rotates = hasRotateNights(plan);
  const starterId = state.pool.includes(state.starterId)
    ? state.starterId
    : (state.pool[0] ?? "");
  const rotationOrder = poolStartingWith(state.pool, starterId);
  const errors = stepErrors(state);
  const step = STEPS[stepIndex]!;
  const last = stepIndex === STEPS.length - 1;

  const goTo = (index: number) => {
    setStepIndex(index);
    setVisited((seen) => new Set(seen).add(index));
  };

  const togglePool = (id: string, checked: boolean) =>
    // Keep the saved order for people already in; newcomers join at the end.
    update({
      pool: checked
        ? [...state.pool.filter((member) => member !== id), id]
        : state.pool.filter((member) => member !== id),
    });

  const summaries: Record<StepId, string> = {
    readers: state.pool.length
      ? state.pool.map((id) => names[id] ?? "Reader").join(", ")
      : "No one yet",
    nights:
      state.mode === "custom"
        ? "Days assigned by hand"
        : state.pattern === "every-night"
          ? "Turns every night"
          : `Weekends: ${names[state.weekendReaderId] ?? "pick a reader"}`,
    start: isDateOnly(state.startDate)
      ? [
          shortDate(state.startDate),
          state.timeLocal,
          isDateOnly(endDate) ? `until ${shortDate(endDate)}` : null,
        ]
          .filter(Boolean)
          .join(" · ")
      : "Not set",
    starter: rotates && starterId ? (names[starterId] ?? "Reader") : "No rotation",
    review: "",
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    // Enter in a field moves forward instead of saving half a schedule.
    const target = event.target as HTMLElement;
    if (event.key !== "Enter" || last || target.tagName !== "INPUT") return;
    event.preventDefault();
    goTo(stepIndex + 1);
  };

  return (
    <NativeTimezoneForm
      action={action}
      successMessage="Schedule saved"
      onSaved={onSaved}
      className="schedule-wizard"
    >
      {/* Everything posts from here, so steps can mount and unmount freely. */}
      {rotationOrder.map((id) => (
        <input key={id} type="hidden" name="readers" value={id} />
      ))}
      {plan.map((slot, index) => (
        <input key={index} type="hidden" name={weekdayFieldName(index)} value={slot} />
      ))}
      <input type="hidden" name="startDate" value={state.startDate} />
      <input type="hidden" name="endDate" value={endDate} />
      <input type="hidden" name="timeLocal" value={state.timeLocal} />
      <input type="hidden" name="booksPerSession" value={state.booksPerSession} />
      {state.assignRandomBooks && (
        <input type="hidden" name="assignRandomBooks" value="on" />
      )}

      <div className="schedule-wizard__header">
        <DialogTitle className="font-display text-2xl text-primary">
          {editing ? "Edit schedule" : "Create a schedule"}
        </DialogTitle>
        <DialogDescription>
          Step {stepIndex + 1} of {STEPS.length}: {step.label}
        </DialogDescription>
      </div>

      <div className="schedule-wizard__body">
        <nav aria-label="Schedule steps" className="schedule-steps">
          <ol
            style={
              { "--progress": stepIndex / (STEPS.length - 1) } as React.CSSProperties
            }
          >
            {STEPS.map(({ id, label }, index) => {
              const status =
                index === stepIndex
                  ? "current"
                  : visited.has(index) && errors[id]
                    ? "attention"
                    : visited.has(index)
                      ? "complete"
                      : "upcoming";
              return (
                <li key={id}>
                  <button
                    type="button"
                    className="schedule-steps__step"
                    data-status={status}
                    aria-current={index === stepIndex ? "step" : undefined}
                    aria-label={`${label}${status === "complete" ? " (done)" : status === "attention" ? " (needs attention)" : ""}`}
                    onClick={() => goTo(index)}
                  >
                    <span className="schedule-steps__dot" aria-hidden="true">
                      {status === "complete" ? <Check className="size-3.5" /> : index + 1}
                    </span>
                    <span className="schedule-steps__text" aria-hidden="true">
                      <span className="schedule-steps__label">{label}</span>
                      {summaries[id] && (
                        <span className="schedule-steps__summary">{summaries[id]}</span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>

        <div className="schedule-wizard__content" onKeyDown={onKeyDown}>
          {step.id === "readers" && (
            <StepSection
              title="Who reads?"
              description="Pick everyone who takes bedtime turns. You can still give someone a fixed night later."
              error={visited.has(0) ? errors.readers : undefined}
            >
              <div className="flex flex-wrap gap-2">
                {readers.map((reader) => (
                  <ChoiceChip
                    key={reader.id}
                    variant="chip"
                    hint={reader.hint}
                    checked={state.pool.includes(reader.id)}
                    onChange={(event) => togglePool(reader.id, event.target.checked)}
                  >
                    {reader.displayName}
                  </ChoiceChip>
                ))}
              </div>
            </StepSection>
          )}

          {step.id === "nights" && (
            <StepSection
              title="How are nights shared?"
              description="Follow a pattern, or assign each day of the week yourself."
              error={errors.nights ?? (state.pool.length ? undefined : errors.readers)}
            >
              <div
                role="radiogroup"
                aria-label="How nights are shared"
                className="grid gap-2 sm:grid-cols-2"
              >
                <ModeCard
                  checked={state.mode === "pattern"}
                  onSelect={() => update({ mode: "pattern" })}
                  title="Follow a pattern"
                  description="Readers take turns automatically."
                />
                <ModeCard
                  checked={state.mode === "custom"}
                  onSelect={() => update({ mode: "custom" })}
                  title="Assign days"
                  description="Choose a reader for each weekday."
                />
              </div>

              {state.mode === "pattern" ? (
                <fieldset className="space-y-2">
                  <legend className="mb-2 text-sm font-bold">Pattern</legend>
                  <PatternOption
                    checked={state.pattern === "every-night"}
                    onSelect={() => update({ pattern: "every-night" })}
                    title="Take turns every night"
                    description="Each reader takes the next night, around and around."
                  />
                  <PatternOption
                    checked={state.pattern === "weekend-reader"}
                    onSelect={() => update({ pattern: "weekend-reader" })}
                    title="Take turns on weeknights, one reader on weekends"
                    description="Monday to Friday rotate; the same person has Saturday and Sunday."
                  >
                    {state.pattern === "weekend-reader" && (
                      <div className="mt-3 space-y-1.5">
                        <Label htmlFor="weekend-reader">Weekend reader</Label>
                        <NativeSelect
                          id="weekend-reader"
                          value={state.weekendReaderId}
                          onChange={(event) =>
                            update({ weekendReaderId: event.target.value })
                          }
                          className="h-10"
                        >
                          {readers.map((reader) => (
                            <option key={reader.id} value={reader.id}>
                              {reader.displayName}
                            </option>
                          ))}
                        </NativeSelect>
                      </div>
                    )}
                  </PatternOption>
                </fieldset>
              ) : (
                <fieldset className="space-y-2">
                  <legend className="mb-1 text-sm font-bold">Every week</legend>
                  <p className="text-sm text-muted-foreground">
                    Pick a reader to keep a night fixed, or leave it on Rotate.
                  </p>
                  <div className="weekday-plan">
                    {WEEKDAY_SHORT.map((label, index) => (
                      <div key={label} className="weekday-plan__day">
                        <label
                          htmlFor={`weekday-plan-${index}`}
                          className="weekday-plan__label"
                        >
                          {label}
                        </label>
                        <NativeSelect
                          id={`weekday-plan-${index}`}
                          aria-label={`Who reads on ${WEEKDAY_NAMES[index]}`}
                          value={state.customPlan[index] ?? ROTATE}
                          onChange={(event) =>
                            update({
                              customPlan: state.customPlan.map((slot, day) =>
                                day === index ? event.target.value : slot,
                              ),
                            })
                          }
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
                    ))}
                  </div>
                </fieldset>
              )}
            </StepSection>
          )}

          {step.id === "start" && (
            <StepSection
              title="When does it run?"
              description="Nights are planned from the start date, at bedtime in your timezone, for as long as you choose."
              error={visited.has(2) ? errors.start : undefined}
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="wizard-start-date">Start date</Label>
                  <Input
                    id="wizard-start-date"
                    type="date"
                    required
                    value={state.startDate}
                    onChange={(event) => update({ startDate: event.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="wizard-bedtime">Bedtime</Label>
                  <Input
                    id="wizard-bedtime"
                    type="time"
                    required
                    value={state.timeLocal}
                    onChange={(event) => update({ timeLocal: event.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="wizard-length">How long?</Label>
                  <NativeSelect
                    id="wizard-length"
                    value={state.length}
                    onChange={(event) => {
                      const length =
                        SCHEDULE_LENGTHS.find(({ id }) => id === event.target.value)
                          ?.id ?? "ongoing";
                      // Start a custom date from whatever end was showing.
                      update(
                        length === "custom" && !state.customEndDate
                          ? { length, customEndDate: endDate || state.startDate }
                          : { length },
                      );
                    }}
                    className="h-10"
                  >
                    {SCHEDULE_LENGTHS.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
                {state.length === "custom" ? (
                  <div className="space-y-2">
                    <Label htmlFor="wizard-end-date">End date</Label>
                    <Input
                      id="wizard-end-date"
                      type="date"
                      required
                      min={isDateOnly(state.startDate) ? state.startDate : undefined}
                      value={state.customEndDate}
                      onChange={(event) => update({ customEndDate: event.target.value })}
                    />
                  </div>
                ) : (
                  <p className="self-end text-sm text-muted-foreground sm:pb-2.5">
                    {isDateOnly(endDate)
                      ? `Last night: ${shortDate(endDate)}`
                      : "Nights keep coming until you change or delete the schedule."}
                  </p>
                )}
              </div>
            </StepSection>
          )}

          {step.id === "starter" && (
            <StepSection
              title="Who reads first?"
              description="The first rotating night goes to this reader; the others follow in order."
            >
              {!rotates ? (
                <p className="weekday-plan__warning" role="status">
                  Every night has a fixed reader, so there is no rotation to start.
                </p>
              ) : state.pool.length === 0 ? (
                <p className="weekday-plan__warning" role="status">
                  {EMPTY_POOL_MESSAGE}
                </p>
              ) : (
                <>
                  <div role="radiogroup" aria-label="First reader" className="grid gap-2">
                    {state.pool.map((id) => (
                      <PatternOption
                        key={id}
                        checked={starterId === id}
                        onSelect={() => update({ starterId: id })}
                        title={names[id] ?? "Reader"}
                      />
                    ))}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Order:{" "}
                    <span className="font-bold text-foreground">
                      {rotationOrder.map((id) => names[id] ?? "Reader").join(" → ")}
                    </span>
                  </p>
                </>
              )}
            </StepSection>
          )}

          {step.id === "review" && (
            <StepSection
              title="Nights assigned"
              description="The rest of the nights follow the pattern automatically. Here are the next two weeks."
              error={errors.review}
            >
              <PlanPreview
                pool={rotationOrder}
                plan={plan}
                startDate={state.startDate}
                endDate={endDate}
                today={today}
                readers={readers}
                names={names}
              />
              <div className="grid gap-4 border-t border-border pt-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="wizard-books">Books per session</Label>
                  <Input
                    id="wizard-books"
                    type="number"
                    min={1}
                    step={1}
                    required
                    value={state.booksPerSession}
                    onChange={(event) => update({ booksPerSession: event.target.value })}
                  />
                </div>
                <div className="flex items-center gap-1 sm:col-span-2">
                  <ChoiceChip
                    variant="row"
                    checked={state.assignRandomBooks}
                    onChange={(event) =>
                      update({ assignRandomBooks: event.target.checked })
                    }
                    labelClassName="flex-1"
                  >
                    Assign random books from the family library each night
                  </ChoiceChip>
                  <InfoTip label="How book assignments work">
                    <p>
                      Random assignments apply to new nights. If your library has fewer
                      books, we use the available books. Existing selections stay as they
                      are.
                    </p>
                    <p>
                      Choose books before reading, log them afterward, or do both. You can
                      update each night’s book list at any time.
                    </p>
                  </InfoTip>
                </div>
              </div>
            </StepSection>
          )}
        </div>
      </div>

      <div className="schedule-wizard__footer">
        <Button
          type="button"
          variant="ghost"
          disabled={stepIndex === 0}
          onClick={() => goTo(stepIndex - 1)}
        >
          <ChevronLeft aria-hidden="true" />
          Back
        </Button>
        {last ? (
          <Button
            type="submit"
            onClick={(event) => {
              const firstProblem = STEPS.findIndex(({ id }) => errors[id]);
              if (firstProblem === -1) return;
              // Point at what to fix rather than letting the server reject it.
              event.preventDefault();
              setVisited(new Set(STEPS.map((_, index) => index)));
              setStepIndex(firstProblem);
            }}
          >
            Save schedule
          </Button>
        ) : (
          <Button type="button" onClick={() => goTo(stepIndex + 1)}>
            Next
            <ChevronRight aria-hidden="true" />
          </Button>
        )}
      </div>
    </NativeTimezoneForm>
  );
}

function StepSection({
  title,
  description,
  error,
  children,
}: {
  title: string;
  description: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby="schedule-step-title" className="space-y-4">
      <div>
        <h3 id="schedule-step-title" className="font-display text-xl">
          {title}
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      {children}
      {error && (
        <p role="alert" className="weekday-plan__warning">
          {error}
        </p>
      )}
    </section>
  );
}

/** A large radio choice; the whole card is the hit area. */
function ModeCard({
  checked,
  onSelect,
  title,
  description,
}: {
  checked: boolean;
  onSelect: () => void;
  title: string;
  description: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      onClick={onSelect}
      className="schedule-choice flex flex-col items-start gap-1 p-4 text-left"
    >
      <span className="font-bold">{title}</span>
      <span className="text-sm text-muted-foreground">{description}</span>
    </button>
  );
}

function PatternOption({
  checked,
  onSelect,
  title,
  description,
  children,
}: {
  checked: boolean;
  onSelect: () => void;
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <div className="schedule-choice px-3.5 py-3" data-checked={checked || undefined}>
      <button
        type="button"
        role="radio"
        aria-checked={checked}
        onClick={onSelect}
        className="flex w-full items-start gap-3 text-left outline-none"
      >
        <span aria-hidden="true" className="schedule-choice__radio" />
        <span className="min-w-0">
          <span className="block font-bold">{title}</span>
          {description && (
            <span className="block text-sm text-muted-foreground">{description}</span>
          )}
        </span>
      </button>
      {children}
    </div>
  );
}

function PlanPreview({
  pool,
  plan,
  startDate,
  endDate,
  today,
  readers,
  names,
}: {
  pool: string[];
  plan: WeekdaySlot[];
  startDate: string;
  /** "" for no end. */
  endDate: string;
  today: string;
  readers: WizardReader[];
  names: Record<string, string>;
}) {
  const start = isDateOnly(startDate) ? startDate : today;
  const from = start > today ? start : today;
  const nights = previewPlanNights({
    pool,
    plan,
    startDate: start,
    fromDate: from,
    days: PREVIEW_DAYS,
    familyMemberIds: readers.map((reader) => reader.id),
  }).filter((night) => !isDateOnly(endDate) || night.date <= endDate);
  if (pool.length === 0 && hasRotateNights(plan)) {
    return (
      <p role="status" className="weekday-plan__warning">
        {EMPTY_POOL_MESSAGE}
      </p>
    );
  }
  if (nights.length === 0) {
    return (
      <p role="status" className="weekday-plan__warning">
        This schedule has no nights left to plan.
      </p>
    );
  }
  return (
    <ol className="weekday-preview" aria-label="Next two weeks">
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
  );
}
