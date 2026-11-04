import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { readerRequestStatusLabel } from "@/lib/domain/reader-requests";
import type { SessionReaderRequestStatus, SessionStatus } from "@/lib/types";

const colors: Record<SessionStatus, string> = {
  scheduled: "border-accent/45 bg-accent/15 text-status-scheduled",
  completed: "border-success/45 bg-success/15 text-status-completed",
  cancelled: "border-destructive/45 bg-destructive/15 text-status-cancelled",
};

const labels: Record<SessionStatus, string> = {
  scheduled: "Coming up",
  completed: "Past",
  cancelled: "Canceled",
};

/** Pass the effective status (see `effectiveStatus`) so unlogged past nights read "Past". */
export function SessionStatusBadge({
  status,
  className,
}: {
  status: SessionStatus;
  className?: string;
}) {
  return <Badge className={cn(colors[status], className)}>{labels[status]}</Badge>;
}

const requestColors: Record<SessionReaderRequestStatus, string> = {
  pending: "bg-accent/20 text-accent-foreground",
  approved: "bg-secondary text-primary",
  declined: "bg-destructive/10 text-destructive",
  withdrawn: "bg-muted text-muted-foreground",
  expired: "bg-muted text-muted-foreground",
};

export function ReaderRequestBadge({
  status,
  className,
}: {
  status: SessionReaderRequestStatus;
  className?: string;
}) {
  return (
    <Badge className={cn(requestColors[status], "whitespace-normal", className)}>
      {readerRequestStatusLabel(status)}
    </Badge>
  );
}
