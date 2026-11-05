import { BackLink } from "@/components/back-link";
import {
  ButtonSkeleton,
  HeadingSkeleton,
  PageSkeleton,
  PanelSkeleton,
} from "@/components/page-skeletons";
import { Skeleton } from "@/components/ui/skeleton";

function MemberRowsSkeleton({ rows }: { rows: number }) {
  return (
    <ul className="space-y-3 pt-2">
      {Array.from({ length: rows }, (_, row) => (
        <li
          key={row}
          className="flex items-center gap-3 rounded-xl border border-border p-3"
        >
          <Skeleton className="size-10 shrink-0 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3 w-1/4" />
          </div>
        </li>
      ))}
    </ul>
  );
}

export default function FamilyLoading() {
  return (
    <PageSkeleton label="Loading family">
      <BackLink hiddenWithTabs />
      <HeadingSkeleton />
      <div className="mt-6 grid items-start gap-4 xl:grid-cols-2">
        <PanelSkeleton lines={1}>
          <MemberRowsSkeleton rows={2} />
        </PanelSkeleton>
        <PanelSkeleton lines={1}>
          <MemberRowsSkeleton rows={2} />
        </PanelSkeleton>
      </div>
      <PanelSkeleton lines={2} className="mt-6">
        <ButtonSkeleton />
      </PanelSkeleton>
    </PageSkeleton>
  );
}
