import { NativeSelect } from "@/components/ui/native-select";
import { ChoiceChip } from "@/components/ui/choice-chip";
import { WeekdayPlanFields } from "@/components/weekday-plan-fields";
import { defaultRotationPool, effectiveWeekdayPlan } from "@/lib/domain/weekday-plan";
import {
  SESSION_LIST_FILTERS,
  sessionFilterParam,
  sessionListFilter,
  type SessionListFilter,
} from "@/lib/domain/session-presentation";
import { ConfirmationForm } from "@/components/confirmation-form";
import { BackLink } from "@/components/back-link";
export const dynamic = "force-dynamic";
import { redirect } from "next/navigation";
import {
  cascadeInsertAction,
  deleteScheduleAction,
  saveScheduleAction,
  swapSessionsAction,
} from "@/app/actions";
import { ToastForm } from "@/components/toast-form";
import {
  AddRandomBooksForm,
  ShuffleUpcomingBooksForm,
} from "@/components/upcoming-books-forms";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeTimezoneForm } from "@/components/native-timezone-form";
import {
  getCurrentMember,
  getCurrentUser,
  getFamilyAdmin,
  getFamilySessionPage,
  getUpcomingBookCtaState,
  listFamilyAssignments,
  listFamilySessions,
  listReaderRequests,
} from "@/lib/data";
import { AskToReadPanel, PendingRequestList } from "@/components/reader-requests";
import { canRequestNight } from "@/lib/domain/reader-requests";
import { myLatestRequest, pendingRequestViews } from "@/lib/reader-request-views";
import {
  DEFAULT_FAMILY_TIMEZONE,
  formatDateOnlyInTimeZone,
  formatRelativeDay,
  formatRelativeSessionWhen,
} from "@/lib/domain/dates";
import { childRelationLabel } from "@/lib/domain/relations";
import { SESSION_BOOK_PICK_COUNT } from "@/lib/domain/session-books";
import { effectiveStatus, isUpcomingNight } from "@/lib/domain/sessions";
import { sessionPageNumbers } from "@/lib/domain/session-presentation";
import Link from "next/link";
import { SessionStatusBadge } from "@/components/session-status";
import { buttonVariants } from "@/components/ui/button";
import { InfoTip } from "@/components/ui/info-tip";
import "./schedule.css";

const FILTER_LABELS: Record<SessionListFilter, string> = {
  upcoming: "Coming up",
  past: "Past",
  canceled: "Canceled",
  all: "All",
};

const EMPTY_MESSAGES: Record<SessionListFilter, string> = {
  upcoming: "No nights coming up.",
  past: "No past nights yet.",
  canceled: "No canceled nights.",
  all: "No reading nights yet.",
};

function countText(filter: SessionListFilter, total: number): string {
  const nights = total === 1 ? "night" : "nights";
  if (filter === "upcoming") return `${total} ${nights} coming up`;
  if (filter === "past") return `${total} past ${nights}`;
  if (filter === "canceled") return `${total} canceled ${nights}`;
  return `${total} ${nights}`;
}

/** Filter pills omit `page` so switching filters always starts on page 1. */
function scheduleHref(filter: SessionListFilter, page?: number) {
  const params = new URLSearchParams();
  if (page !== undefined) params.set("page", String(page));
  const status = sessionFilterParam(filter);
  if (status) params.set("status", status);
  const query = params.toString();
  return query ? `/schedule?${query}` : "/schedule";
}

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string | string[]; status?: string | string[] }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const member = await getCurrentMember();
  if (!member) redirect("/onboarding");
  const admin = await getFamilyAdmin();
  if (!admin) redirect("/onboarding");

  const { page: requestedPage, status: requestedStatus } = await searchParams;
  const filter = sessionListFilter(requestedStatus);
  const isOwner = member.role === "owner";
  const timeZone = admin.schedule?.timezone ?? DEFAULT_FAMILY_TIMEZONE;
  const today = formatDateOnlyInTimeZone(new Date(), timeZone);
  const pagination = await getFamilySessionPage(requestedPage, filter, today);
  const assignments = pagination.assignments;
  const sessions = pagination.items;
  const names = Object.fromEntries(admin.readers.map((r) => [r.id, r.displayName]));
  // Cascade/swap need the full upcoming set, not just the current page.
  const [allSessions, allAssignments, bookCta, requests] = await Promise.all([
    listFamilySessions(),
    listFamilyAssignments(),
    getUpcomingBookCtaState(),
    listReaderRequests(),
  ]);
  const pendingRequests = isOwner
    ? pendingRequestViews({
        requests,
        sessions: allSessions,
        assignments: allAssignments,
        readers: admin.readers,
        today,
        timeZone,
      })
    : [];
  const futureScheduled = allSessions.filter((s) => isUpcomingNight(s, today));

  const readerLabel = (sessionId: string) =>
    [...assignments, ...allAssignments]
      .filter((a) => a.sessionId === sessionId && a.isCurrent)
      .filter((a, index, all) => all.findIndex((row) => row.id === a.id) === index)
      .map((a) => names[a.memberId] ?? "Reader")
      .join(", ");

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <main className="mx-auto w-full max-w-5xl px-4 py-8">
        <BackLink hiddenWithTabs />
        <section className="animate-rise">
          <h1 className="font-display text-3xl text-primary">Reading schedule</h1>
          <p className="mt-1 text-muted-foreground">
            Rotate readers for nights with both kids together. Future nights get ICS
            invites automatically.
          </p>
        </section>

        <PendingRequestList requests={pendingRequests} />

        {isOwner ? (
          <NativeTimezoneForm
            action={saveScheduleAction}
            successMessage="Schedule saved"
            celebrate
          >
            <h2 className="font-display text-xl">
              {admin.schedule ? "Edit rotation" : "Create rotation"}
            </h2>
            <WeekdayPlanFields
              readers={admin.readers.map((reader) => ({
                id: reader.id,
                displayName: reader.displayName,
                hint: `(${childRelationLabel(reader.relationToChildren)})`,
              }))}
              defaultPool={
                admin.schedule
                  ? admin.schedule.readerRotationMemberIds
                  : defaultRotationPool(admin.readers)
              }
              defaultPlan={effectiveWeekdayPlan(
                admin.schedule?.weekdayReaders,
                admin.readers.map((reader) => reader.id),
              )}
              defaultStartDate={admin.schedule?.startDate}
              today={today}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="startDate">Start date</Label>
                <Input
                  id="startDate"
                  name="startDate"
                  type="date"
                  required
                  defaultValue={admin.schedule?.startDate}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="timeLocal">Bedtime</Label>
                <Input
                  id="timeLocal"
                  name="timeLocal"
                  type="time"
                  required
                  defaultValue={admin.schedule?.timeLocal ?? "19:30"}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="booksPerSession">Books per session</Label>
                <Input
                  id="booksPerSession"
                  name="booksPerSession"
                  type="number"
                  min={1}
                  step={1}
                  required
                  defaultValue={admin.schedule?.booksPerSession ?? 3}
                />
              </div>
              <div className="flex items-center gap-1 sm:col-span-2">
                <ChoiceChip
                  variant="row"
                  name="assignRandomBooks"
                  defaultChecked={admin.schedule?.assignRandomBooks ?? true}
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
            <Button type="submit">Save schedule</Button>
          </NativeTimezoneForm>
        ) : (
          <p className="story-panel mt-6 rounded-2xl p-5 text-sm text-muted-foreground">
            Family owners manage the rotation. Your upcoming nights are listed below. Want
            a night that isn&apos;t yours? Ask to read it and a parent will approve or
            decline.
          </p>
        )}

        {bookCta.libraryCount > 0 && bookCta.upcomingCount > 0 && (
          <section className="story-panel mt-6 space-y-4 rounded-2xl p-5">
            <div>
              <h2 className="font-display text-xl">Bedtime books</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                New nights get {SESSION_BOOK_PICK_COUNT} random library books
                automatically. Use these when you want to fill empty nights or reshuffle
                picks across the schedule.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              {bookCta.withoutBooksCount > 0 && <AddRandomBooksForm />}
              {bookCta.withBooksCount > 0 && <ShuffleUpcomingBooksForm />}
            </div>
          </section>
        )}

        {isOwner && futureScheduled.length > 0 && (
          <div className="reveal mt-6 grid gap-4 md:grid-cols-2">
            <ToastForm
              action={cascadeInsertAction}
              successMessage="Rotation cascaded forward"
              className="story-panel space-y-4 rounded-2xl p-5"
            >
              <div>
                <h2 className="font-display text-xl">Cascade a fill-in</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Put someone on a night (like a grandparent covering tonight) and shift
                  everyone after them forward one day.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="fromSessionId">Starting night</Label>
                <NativeSelect
                  id="fromSessionId"
                  name="fromSessionId"
                  required
                  defaultValue={futureScheduled[0]?.id}
                >
                  {futureScheduled.map((session) => (
                    <option key={session.id} value={session.id}>
                      {formatRelativeDay(session.scheduledFor, today, timeZone)} ·{" "}
                      {readerLabel(session.id)}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <div className="space-y-2">
                <Label htmlFor="fillInMemberId">Fill-in reader</Label>
                <NativeSelect
                  id="fillInMemberId"
                  name="fillInMemberId"
                  required
                  defaultValue={
                    admin.readers.find((r) => r.relationToChildren === "grandparent")
                      ?.id ?? admin.readers[0]?.id
                  }
                >
                  {admin.readers.map((reader) => (
                    <option key={reader.id} value={reader.id}>
                      {reader.displayName} (
                      {childRelationLabel(reader.relationToChildren)})
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <Button type="submit">Cascade forward</Button>
            </ToastForm>

            <ToastForm
              action={swapSessionsAction}
              successMessage="Nights swapped"
              className="story-panel space-y-4 rounded-2xl p-5"
            >
              <div>
                <h2 className="font-display text-xl">Swap two nights</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Exchange readers between two nights without shifting the rest of the
                  rotation.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="sessionAId">First night</Label>
                <NativeSelect
                  id="sessionAId"
                  name="sessionAId"
                  required
                  defaultValue={futureScheduled[0]?.id}
                >
                  {futureScheduled.map((session) => (
                    <option key={session.id} value={session.id}>
                      {formatRelativeDay(session.scheduledFor, today, timeZone)} ·{" "}
                      {readerLabel(session.id)}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <div className="space-y-2">
                <Label htmlFor="sessionBId">Second night</Label>
                <NativeSelect
                  id="sessionBId"
                  name="sessionBId"
                  required
                  defaultValue={futureScheduled[1]?.id ?? futureScheduled[0]?.id}
                >
                  {futureScheduled.map((session) => (
                    <option key={session.id} value={session.id}>
                      {formatRelativeDay(session.scheduledFor, today, timeZone)} ·{" "}
                      {readerLabel(session.id)}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <Button type="submit" variant="secondary">
                Swap readers
              </Button>
            </ToastForm>
          </div>
        )}

        {isOwner && admin.schedule && (
          <ConfirmationForm
            title="Delete this schedule?"
            description="Future nights from this schedule and their calendar invitations will be canceled."
            confirmLabel="Delete schedule"
            action={deleteScheduleAction}
            className="story-panel mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl p-5"
          >
            <p className="text-sm text-muted-foreground">
              Deleting the schedule cancels its upcoming nights and keeps reading history.
            </p>
            <Button type="submit" variant="destructive">
              Delete schedule
            </Button>
          </ConfirmationForm>
        )}

        <section className="reveal mt-6">
          <h2 id="reading-nights" className="font-display text-xl">
            Reading nights
          </h2>
          <nav aria-label="Filter reading nights" className="chip-row mt-3">
            {SESSION_LIST_FILTERS.map((option) => (
              <Link
                key={option}
                href={scheduleHref(option)}
                scroll={false}
                className="chip schedule-filter-chip"
                aria-current={option === filter ? "page" : undefined}
              >
                {FILTER_LABELS[option]}
                <span className="schedule-filter-chip__count">
                  {pagination.counts[option]}
                </span>
              </Link>
            ))}
          </nav>
          <ul className="mt-4 space-y-2">
            {sessions.map((session) => (
              <li key={session.id}>
                <Link
                  href={`/sessions/${session.id}`}
                  className="story-panel panel-interactive grid grid-cols-[minmax(0,1fr)_6rem] items-center gap-x-3 gap-y-1 rounded-xl px-4 py-3 hover:border-primary/40 sm:grid-cols-[minmax(0,1fr)_7rem_minmax(0,1fr)]"
                >
                  <span className="min-w-0 break-words">
                    {formatRelativeSessionWhen(session.scheduledFor, {
                      today,
                      timeZone,
                    })}
                  </span>
                  <SessionStatusBadge
                    status={effectiveStatus(session, today)}
                    className="col-start-2 row-start-1 justify-self-center"
                  />
                  <span className="col-start-1 row-start-2 min-w-0 break-words text-sm text-muted-foreground sm:col-start-3 sm:row-start-1 sm:text-right">
                    {readerLabel(session.id)}
                  </span>
                </Link>
                {(() => {
                  if (
                    isOwner ||
                    assignments.some(
                      (a) =>
                        a.sessionId === session.id &&
                        a.memberId === member.id &&
                        a.isCurrent,
                    )
                  )
                    return null;
                  const mine = myLatestRequest(requests, session.id, member.id);
                  const canRequest = canRequestNight({
                    member,
                    session,
                    assignments,
                    requests,
                    today,
                  }).ok;
                  if (!canRequest && mine?.status !== "pending") return null;
                  return (
                    <div className="mt-1 flex justify-end px-1">
                      <AskToReadPanel
                        compact
                        sessionId={session.id}
                        nightLabel={formatRelativeSessionWhen(session.scheduledFor, {
                          today,
                          timeZone,
                        })}
                        myRequest={mine}
                        canRequest={canRequest}
                      />
                    </div>
                  );
                })()}
              </li>
            ))}
          </ul>
          {pagination.total === 0 ? (
            <p className="mt-4 text-muted-foreground">{EMPTY_MESSAGES[filter]}</p>
          ) : (
            <nav
              aria-label="Session pages"
              className="mt-4 flex flex-wrap items-center justify-between gap-3"
            >
              <div className="flex flex-wrap gap-2">
                {sessionPageNumbers(pagination.page, pagination.pageCount).map(
                  (page, index) =>
                    page === "ellipsis" ? (
                      <span key={`gap-${index}`} className="px-2 py-2" aria-hidden="true">
                        …
                      </span>
                    ) : (
                      <Link
                        key={page}
                        href={scheduleHref(filter, page)}
                        aria-label={`Page ${page}`}
                        aria-current={page === pagination.page ? "page" : undefined}
                        className={buttonVariants({
                          variant: page === pagination.page ? "default" : "outline",
                          size: "sm",
                        })}
                      >
                        {page}
                      </Link>
                    ),
                )}
              </div>
              <span className="text-sm" aria-live="polite">
                Page {pagination.page} of {pagination.pageCount} ·{" "}
                {countText(filter, pagination.total)}
              </span>
            </nav>
          )}
        </section>
      </main>
    </div>
  );
}
