import { BackLink } from "@/components/back-link";
import {
  ButtonSkeleton,
  HeadingSkeleton,
  ListRowsSkeleton,
  PageSkeleton,
  PanelSkeleton,
} from "@/components/page-skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function ScheduleLoading() {
  return (
    <PageSkeleton label="Loading schedule">
      <BackLink hiddenWithTabs />
      <HeadingSkeleton />
      <PanelSkeleton lines={2} className="mt-6">
        <div className="grid gap-4 pt-2 sm:grid-cols-2">
          <Skeleton className="h-9 w-full rounded-lg" />
          <Skeleton className="h-9 w-full rounded-lg" />
        </div>
        <ButtonSkeleton />
      </PanelSkeleton>
      <section className="mt-6">
        <Skeleton className="h-6 w-36 rounded-lg" />
        <div className="mt-3 flex gap-2">
          {[0, 1, 2, 3].map((chip) => (
            <Skeleton key={chip} className="h-8 w-20 rounded-full" />
          ))}
        </div>
        <ListRowsSkeleton rows={6} />
      </section>
    </PageSkeleton>
  );
}
