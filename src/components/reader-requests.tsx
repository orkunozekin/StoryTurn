"use client";

import Link from "next/link";
import { HandHeart } from "lucide-react";
import {
  decideReaderRequestAction,
  requestToReadAction,
  withdrawReaderRequestAction,
} from "@/app/actions";
import { ReaderRequestBadge } from "@/components/session-status";
import { ToastForm } from "@/components/toast-form";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { READER_REQUEST_NOTE_MAX } from "@/lib/domain/reader-requests";
import type { SessionReaderRequestStatus } from "@/lib/types";

export interface MyRequestView {
  id: string;
  status: SessionReaderRequestStatus;
  note: string | null;
}

/**
 * What a reader who is not on this night sees: their own request state, and the
 * "Ask to read this night" form when they can ask (again).
 */
export function AskToReadPanel({
  sessionId,
  nightLabel,
  myRequest,
  canRequest,
  compact = false,
}: {
  sessionId: string;
  nightLabel: string;
  myRequest: MyRequestView | null;
  canRequest: boolean;
  compact?: boolean;
}) {
  if (myRequest?.status === "pending") {
    return (
      <ToastForm
        action={withdrawReaderRequestAction}
        successMessage="Request withdrawn"
        className={
          compact
            ? "flex flex-wrap items-center gap-2"
            : "story-panel mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl p-5"
        }
      >
        <div className="min-w-0 space-y-1">
          <ReaderRequestBadge status="pending" />
          {myRequest.note && !compact && (
            <p className="break-words text-sm text-muted-foreground">
              “{myRequest.note}”
            </p>
          )}
        </div>
        <input type="hidden" name="requestId" value={myRequest.id} />
        <input type="hidden" name="sessionId" value={sessionId} />
        <Button type="submit" variant="cancel" size={compact ? "sm" : "default"}>
          Withdraw
        </Button>
      </ToastForm>
    );
  }

  const closed = myRequest && myRequest.status !== "approved" && (
    <ReaderRequestBadge status={myRequest.status} />
  );
  if (!canRequest) return closed || null;

  if (compact) {
    return (
      <ToastForm
        action={requestToReadAction}
        successMessage="Request sent to a parent"
        className="flex flex-wrap items-center gap-2"
      >
        {closed}
        <input type="hidden" name="sessionId" value={sessionId} />
        <Button
          type="submit"
          variant="outline"
          size="sm"
          aria-label={`Ask to read ${nightLabel}`}
        >
          <HandHeart aria-hidden="true" />
          Ask to read
        </Button>
      </ToastForm>
    );
  }

  return (
    <ToastForm
      action={requestToReadAction}
      successMessage="Request sent to a parent"
      className="story-panel mt-6 space-y-3 rounded-2xl p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-xl">Want this night?</h2>
        {closed}
      </div>
      <p className="text-sm text-muted-foreground">
        Ask to read this night. A parent will approve or decline.
      </p>
      <input type="hidden" name="sessionId" value={sessionId} />
      <div className="space-y-2">
        <Label htmlFor="request-note">Note (optional)</Label>
        <Textarea
          id="request-note"
          name="note"
          maxLength={READER_REQUEST_NOTE_MAX}
          placeholder="Can I take Saturday? I'm in town."
        />
      </div>
      <Button type="submit" className="w-full sm:w-auto">
        <HandHeart aria-hidden="true" />
        Ask to read this night
      </Button>
    </ToastForm>
  );
}

export interface PendingRequestView {
  id: string;
  sessionId: string;
  requesterName: string;
  requesterRelation: string;
  note: string | null;
  nightLabel: string;
  currentReader: string;
}

/** Approve / Decline controls for parents. */
export function PendingRequestList({
  requests,
  title = "Requests to read",
  showNight = true,
  className = "story-panel mt-6 space-y-3 rounded-2xl border-accent/50 p-5",
}: {
  requests: PendingRequestView[];
  title?: string;
  showNight?: boolean;
  className?: string;
}) {
  if (requests.length === 0) return null;
  return (
    <section aria-labelledby="reader-requests-heading" className={className}>
      <div>
        <h2 id="reader-requests-heading" className="font-display text-xl">
          {title}{" "}
          <span className="text-base text-muted-foreground">({requests.length})</span>
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Approving makes them the reader for that night and sends calendar updates.
        </p>
      </div>
      <ul className="space-y-3">
        {requests.map((request) => (
          <li
            key={request.id}
            className="rounded-xl border border-border bg-card/60 p-3"
          >
            <ToastForm
              action={decideReaderRequestAction}
              successMessage={(result) =>
                (result as { decision?: string } | undefined)?.decision === "approve"
                  ? `${request.requesterName} is now reading that night`
                  : "Request declined"
              }
              className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0 space-y-1">
                <p className="break-words font-medium">
                  {request.requesterName}{" "}
                  <span className="font-normal text-muted-foreground">
                    ({request.requesterRelation})
                  </span>{" "}
                  wants{" "}
                  {showNight ? (
                    <Link
                      href={`/sessions/${request.sessionId}`}
                      className="text-primary underline-offset-4 hover:underline"
                    >
                      {request.nightLabel}
                    </Link>
                  ) : (
                    "this night"
                  )}
                </p>
                <p className="text-sm text-muted-foreground">
                  Currently: {request.currentReader || "no reader"}
                </p>
                {request.note && (
                  <p className="break-words text-sm">“{request.note}”</p>
                )}
              </div>
              <input type="hidden" name="requestId" value={request.id} />
              <input type="hidden" name="sessionId" value={request.sessionId} />
              <div className="flex shrink-0 gap-2">
                <Button
                  type="submit"
                  name="decision"
                  value="approve"
                  className="flex-1 sm:flex-none"
                  aria-label={`Approve ${request.requesterName} for ${request.nightLabel}`}
                >
                  Approve
                </Button>
                <Button
                  type="submit"
                  name="decision"
                  value="decline"
                  variant="cancel"
                  className="flex-1 sm:flex-none"
                  aria-label={`Decline ${request.requesterName} for ${request.nightLabel}`}
                >
                  Decline
                </Button>
              </div>
            </ToastForm>
          </li>
        ))}
      </ul>
    </section>
  );
}
