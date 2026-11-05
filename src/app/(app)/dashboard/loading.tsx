import { BackLink } from "@/components/back-link";
import {
  HeadingSkeleton,
  PageSkeleton,
  PanelSkeleton,
} from "@/components/page-skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardLoading() {
  return (
    <PageSkeleton label="Loading dashboard">
      <BackLink />
      <HeadingSkeleton />
      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        {[0, 1, 2].map((stat) => (
          <div key={stat} className="story-panel space-y-3 rounded-2xl p-5">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-9 w-16 rounded-lg" />
          </div>
        ))}
      </div>
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <PanelSkeleton lines={4} />
        <PanelSkeleton lines={4} />
      </div>
    </PageSkeleton>
  );
}
