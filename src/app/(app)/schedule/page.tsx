import { NativeSelect } from "@/components/ui/native-select";
import { ScheduleWizard } from "@/components/schedule-wizard";
import {
  defaultRotationPool,
  describeWeekdayPlan,
  effectivePool,
  effectiveWeekdayPlan,
} from "@/lib/domain/weekday-plan";
import { sessionListFilter } from "@/lib/domain/session-presentation";
import {
  ReadingNightsList,
  type ReadingNightRow,
} from "@/components/reading-nights-list";
import type { ReadingSession } from "@/lib/types";
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
import { Label } from "@/components/ui/label";
import {
  getCurrentMember,
  getCurrentUser,
  getFamilyAdmin,
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
  formatMonthDay,
  formatRelativeDay,
  formatRelativeSessionWhen,
} from "@/lib/domain/dates";
import { childRelationLabel } from "@/lib/domain/relations";
import { SESSION_BOOK_PICK_COUNT } from "@/lib/domain/session-books";
import { effectiveStatus, isUpcomingNight } from "@/lib/domain/sessions";
import "./schedule.css";
import { familyDisplayNames } from "@/lib/first-name";

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
  const requestedPageParam =
    typeof requestedPage === "string" ? requestedPage : undefined;
  const filter = sessionListFilter(requestedStatus);
  const isOwner = member.role === "owner";
  const timeZone = admin.schedule?.timezone ?? DEFAULT_FAMILY_TIMEZONE;
  const today = formatDateOnlyInTimeZone(new Date(), timeZone);
  const names = familyDisplayNames(admin.readers);
  const readerIds = admin.readers.map((reader) => reader.id);
  const rotationNames = effectivePool(
    admin.schedule?.readerRotationMemberIds ?? [],
    readerIds,
  )
    .map((id) => names[id])
    .join(" → ");
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

  const currentAssignments = allAssignments.filter((a) => a.isCurrent);
  const readerLabel = (sessionId: string) =>
    currentAssignments
      .filter((a) => a.sessionId === sessionId)
      .map((a) => names[a.memberId] ?? "Reader")
      .join(", ");

  // The list filters and pages in the browser, so every night is sent once here.
  const askPanel = (session: ReadingSession) => {
    if (
      isOwner ||
      currentAssignments.some(
        (a) => a.sessionId === session.id && a.memberId === member.id,
      )
    )
      return null;
    const mine = myLatestRequest(requests, session.id, member.id);
    const canRequest = canRequestNight({
      member,
      session,
      assignments: currentAssignments,
      requests,
      today,
    }).ok;
    if (!canRequest && mine?.status !== "pending") return null;
    return (
      <AskToReadPanel
        compact
        sessionId={session.id}
        nightLabel={formatRelativeSessionWhen(session.scheduledFor, { today, timeZone })}
        myRequest={mine}
        canRequest={canRequest}
      />
    );
  };
  const nightRows: ReadingNightRow[] = allSessions.map((session) => ({
    id: session.id,
    status: session.status,
    scheduledFor: session.scheduledFor,
    when: formatRelativeSessionWhen(session.scheduledFor, { today, timeZone }),
    badgeStatus: effectiveStatus(session, today),
    readers: readerLabel(session.id),
    ask: askPanel(session),
  }));

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
          <section className="story-panel mt-6 flex flex-wrap items-start justify-between gap-4 rounded-2xl p-5 animate-rise-delay">
            <div className="min-w-0 space-y-1">
              <h2 className="font-display text-xl">
                {admin.schedule ? "Your rotation" : "No schedule yet"}
              </h2>
              {admin.schedule ? (
                <>
                  <p className="font-bold">
                    {describeWeekdayPlan(
                      effectiveWeekdayPlan(admin.schedule.weekdayReaders, readerIds),
                      names,
                    )}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {rotationNames || "No one rotates"} · from{" "}
                    {formatMonthDay(admin.schedule.startDate)}
                    {admin.schedule.endDate
                      ? ` to ${formatMonthDay(admin.schedule.endDate)}`
                      : ""}{" "}
                    at {admin.schedule.timeLocal}
                  </p>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Choose who reads, how nights are shared, and when to start. We fill in
                  the nights for you.
                </p>
              )}
            </div>
            <ScheduleWizard
              action={saveScheduleAction}
              editing={Boolean(admin.schedule)}
              today={today}
              readers={admin.readers.map((reader) => ({
                id: reader.id,
                displayName: names[reader.id] ?? reader.displayName,
                hint: `(${childRelationLabel(reader.relationToChildren)})`,
              }))}
              defaults={{
                pool: admin.schedule
                  ? effectivePool(admin.schedule.readerRotationMemberIds, readerIds)
                  : defaultRotationPool(admin.readers),
                plan: effectiveWeekdayPlan(admin.schedule?.weekdayReaders, readerIds),
                startDate: admin.schedule?.startDate ?? today,
                endDate: admin.schedule?.endDate ?? null,
                timeLocal: admin.schedule?.timeLocal ?? "19:30",
                booksPerSession: admin.schedule?.booksPerSession ?? 3,
                assignRandomBooks: admin.schedule?.assignRandomBooks ?? true,
              }}
            />
          </section>
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
                      {names[reader.id] ?? reader.displayName} (
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
          <ReadingNightsList
            key={`${filter}:${requestedPageParam ?? ""}`}
            rows={nightRows}
            today={today}
            initialFilter={filter}
            initialPage={requestedPageParam}
          />
        </section>
      </main>
    </div>
  );
}
