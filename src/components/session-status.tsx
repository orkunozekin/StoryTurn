import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { readerRequestStatusLabel } from "@/lib/domain/reader-requests";
import type { SessionReaderRequestStatus, SessionStatus } from "@/lib/types";

const colors: Record<SessionStatus, string> = {
  scheduled: "bg-accent/20 text-accent-foreground",
  completed: "bg-secondary text-primary",
  cancelled: "bg-destructive/10 text-destructive",
};

export function SessionStatusBadge({
  status,
  className,
}: {
  status: SessionStatus;
  className?: string;
}) {
  return (
    <Badge className={cn(colors[status], className)}>
      {status === "cancelled" ? "Canceled" : status[0].toUpperCase() + status.slice(1)}
    </Badge>
  );
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
