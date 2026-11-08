import { RotateCcw } from "lucide-react";
import { DetailItem, DetailList } from "@/components/ui/detail";
import { ChoiceChip } from "@/components/ui/choice-chip";
import { ConfirmationForm } from "@/components/confirmation-form";
import { BackLink } from "@/components/back-link";
import { FormSelect } from "@/components/form-select";
export const dynamic = "force-dynamic";
import { redirect } from "next/navigation";
import {
  reactivateSessionAction,
  shuffleSessionBooksAction,
  updateSessionAction,
} from "@/app/actions";
import { CancelSessionForm } from "@/components/cancel-session-form";
import { SessionBookPicker } from "@/components/session-book-picker";
import { ToastForm } from "@/components/toast-form";
import { Badge } from "@/components/ui/badge";
import { SessionStatusBadge } from "@/components/session-status";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  currentReaderLabels,
  originalReaderLabels,
  wasCorrected,
} from "@/lib/domain/corrections";
import {
  DEFAULT_FAMILY_TIMEZONE,
  formatDateOnlyInTimeZone,
  formatRelativeInstant,
  formatRelativeSessionWhen,
} from "@/lib/domain/dates";
import { SESSION_BOOK_PICK_COUNT } from "@/lib/domain/session-books";
import { sessionStatusOptions } from "@/lib/domain/session-presentation";
import { effectiveStatus, isPastSession } from "@/lib/domain/sessions";
import {
  getCurrentMember,
  getCurrentUser,
  getFamilyAdmin,
  getSessionDetail,
  listReaderRequests,
} from "@/lib/data";
import { AskToReadPanel, PendingRequestList } from "@/components/reader-requests";
import { canRequestNight } from "@/lib/domain/reader-requests";
import { myLatestRequest, pendingRequestViews } from "@/lib/reader-request-views";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export default async function SessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const member = await getCurrentMember();
  if (!member) redirect("/onboarding");

  const { id } = await params;
  const detail = await getSessionDetail(id, true);
  if (!detail) redirect("/");
  const admin = await getFamilyAdmin();
  const timeZone = admin?.schedule?.timezone ?? DEFAULT_FAMILY_TIMEZONE;
  const today = formatDateOnlyInTimeZone(new Date(), timeZone);
  const requests = await listReaderRequests(id);
  const isOwner = member.role === "owner";
  const nightLabel = formatRelativeSessionWhen(detail.session.scheduledFor, {
    today,
    timeZone,
  });
  const myRequest = myLatestRequest(requests, id, member.id);
  const canRequest =
    !isOwner &&
    canRequestNight({
      member,
      session: detail.session,
      assignments: detail.assignments,
      requests,
      today,
    }).ok;
  const pendingForNight = isOwner
    ? pendingRequestViews({
        requests,
        sessions: [detail.session],
        assignments: detail.assignments,
        readers: detail.readers,
        today,
        timeZone,
      })
    : [];

  const corrected = wasCorrected({
    assignments: detail.assignments,
    corrections: detail.corrections,
    sessionId: id,
  });
  const past = isPastSession(detail.session.scheduledFor);
  const shownStatus = effectiveStatus(detail.session, today);
  const statusOptions = sessionStatusOptions(detail.session, today);
  const currentIds = new Set(
    detail.assignments.filter((a) => a.isCurrent).map((a) => a.memberId),
  );
  const selectedBookIds = new Set(
    detail.books.map((b) => b.bookId).filter(Boolean) as string[],
  );

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <main className="mx-auto w-full max-w-3xl px-4 py-8">
        <BackLink compact />
        <section className="animate-rise">
          <div className="flex flex-wrap items-center gap-2">
            <SessionStatusBadge status={shownStatus} />
            {detail.session.status === "cancelled" && (
              <ConfirmationForm
                title="Reactivate this session?"
                description={`This night will return to ${statusOptions[0].label} with its readers, books, and notes preserved. ${past ? "No calendar invitations will be sent for this past session." : "Calendar invitations will be sent again."}`}
                confirmLabel="Reactivate session"
                confirmVariant="default"
                action={async () => {
                  "use server";
                  await reactivateSessionAction(id);
                }}
              >
                <Button
                  type="submit"
                  variant="ghost"
                  size="icon"
                  aria-label="Reactivate session"
                  title="Reactivate session"
                  className="text-primary"
                >
                  <RotateCcw aria-hidden="true" />
                </Button>
              </ConfirmationForm>
            )}
            {corrected && (
              <Badge className="bg-primary text-primary-foreground">Corrected</Badge>
            )}
          </div>
          <h1 className="font-display mt-3 text-3xl text-primary">{nightLabel}</h1>
          <DetailList className="mt-3">
            <DetailItem label="Current reader">
              <span className="text-lg">
                {currentReaderLabels({
                  assignments: detail.assignments,
                  memberNames: detail.memberNames,
                  sessionId: id,
                }).join(", ")}
              </span>
            </DetailItem>
          </DetailList>
          {corrected && (
            <Alert className="mt-4">
              <AlertTitle>Original assignment preserved</AlertTitle>
              <AlertDescription>
                Originally assigned to{" "}
                {originalReaderLabels({
                  assignments: detail.assignments,
                  memberNames: detail.memberNames,
                  sessionId: id,
                }).join(", ")}
                . Corrections do not erase who was first on the schedule.
              </AlertDescription>
            </Alert>
          )}
        </section>

        <PendingRequestList
          requests={pendingForNight}
          title="Requests for this night"
          showNight={false}
        />
        {!currentIds.has(member.id) && (
          <AskToReadPanel
            sessionId={id}
            nightLabel={nightLabel}
            myRequest={myRequest}
            canRequest={canRequest}
          />
        )}

        {detail.corrections.length > 0 && (
          <section className="mt-6 space-y-3">
            <h2 className="font-display text-xl">Correction history</h2>
            {detail.corrections.map((c) => (
              <div key={c.id} className="story-panel rounded-xl p-4 text-sm">
                <p className="font-medium">{c.reason}</p>
                <p className="mt-1 text-muted-foreground">
                  {formatRelativeInstant(c.createdAt, timeZone)}
                </p>
              </div>
            ))}
          </section>
        )}

        {detail.library.length > 0 && detail.session.status === "scheduled" && !past && (
          <ToastForm
            action={shuffleSessionBooksAction}
            successMessage={`Picked ${Math.min(SESSION_BOOK_PICK_COUNT, detail.library.length)} new books`}
            className="story-panel mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl p-5"
          >
            <div>
              <h2 className="font-display text-xl">Shuffle tonight&apos;s books</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Replace the library picks on this night with a fresh random set.
              </p>
            </div>
            <input type="hidden" name="sessionId" value={id} />
            <Button type="submit" variant="secondary">
              Shuffle books
            </Button>
          </ToastForm>
        )}

        <ConfirmationForm
          title={
            detail.session.status === "cancelled"
              ? "Reactivate this session?"
              : "Cancel this session?"
          }
          description={
            detail.session.status === "cancelled"
              ? `This session will be reopened with your changes. ${past ? "No calendar invitations will be sent for this past session." : "Calendar invitations will be sent again."}`
              : "This night will be marked as canceled and its calendar invite will be canceled."
          }
          confirmLabel={
            detail.session.status === "cancelled"
              ? "Reactivate session"
              : "Cancel session"
          }
          confirmVariant={
            detail.session.status === "cancelled" ? "default" : "destructive"
          }
          whenField={{
            name: "status",
            value:
              detail.session.status === "cancelled"
                ? ["scheduled", "completed"]
                : "cancelled",
          }}
          action={updateSessionAction}
          className="story-panel mt-6 space-y-4 rounded-2xl p-5 animate-rise-delay"
        >
          <input type="hidden" name="sessionId" value={id} />
          <h2 className="font-display text-xl">
            {past ? "Correct this night" : "Edit this night"}
          </h2>

          <div className="space-y-2">
            <Label>Assigned readers</Label>
            <div className="flex flex-wrap gap-2">
              {detail.readers.map((reader) => (
                <ChoiceChip
                  key={reader.id}
                  name="memberIds"
                  value={reader.id}
                  defaultChecked={currentIds.has(reader.id)}
                >
                  {detail.memberNames[reader.id] ?? reader.displayName}
                </ChoiceChip>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Plan some books now and add more after reading. Keep any planned books you
              actually read selected.
            </p>
            <SessionBookPicker
              key={detail.session.id}
              books={detail.library
                .filter((book) => selectedBookIds.has(book.id))
                .map(({ id, title, coverUrl, isbn, format, publisher, editionYear }) => ({
                  id,
                  title,
                  coverUrl,
                  isbn,
                  format,
                  publisher,
                  editionYear,
                }))}
              selectedIds={[...selectedBookIds]}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="freeformTitles">Other book titles (one per line)</Label>
            <Textarea
              id="freeformTitles"
              name="freeformTitles"
              defaultValue={detail.books
                .filter((b) => b.titleFreeform)
                .map((b) => b.titleFreeform)
                .join("\n")}
            />
          </div>

          <details className="rounded-lg border border-border">
            <summary className="cursor-pointer rounded-lg px-3 py-2 text-sm font-medium text-primary focus-visible:outline-2 focus-visible:outline-ring">
              Notes{detail.session.notes ? " · saved" : ""}
            </summary>
            <div className="space-y-2 px-3 pb-3">
              <Label htmlFor="notes" className="sr-only">
                Notes
              </Label>
              <Textarea
                id="notes"
                name="notes"
                defaultValue={detail.session.notes ?? ""}
              />
            </div>
          </details>

          <div className="space-y-2">
            <Label htmlFor="status">Status</Label>
            <FormSelect
              id="status"
              name="status"
              defaultValue={shownStatus}
              options={statusOptions}
            />
          </div>

          {(past || detail.session.status === "completed") && (
            <div className="space-y-2">
              <Label htmlFor="reason">Correction reason</Label>
              <Textarea
                id="reason"
                name="reason"
                placeholder="Why are you changing the past record?"
                required={past}
              />
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            <Button type="submit">Save changes</Button>
          </div>
        </ConfirmationForm>

        {detail.session.status !== "cancelled" && <CancelSessionForm sessionId={id} />}
      </main>
    </div>
  );
}
