import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { SessionStatus } from "@/lib/types";

const colors: Record<SessionStatus, string> = {
  scheduled: "border-accent/45 bg-accent/15 text-status-scheduled",
  completed: "border-success/45 bg-success/15 text-status-completed",
  cancelled: "border-destructive/45 bg-destructive/15 text-status-cancelled",
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
