import { BackLink } from "@/components/back-link";
import { ButtonSkeleton, PageSkeleton, PanelSkeleton } from "@/components/page-skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function SessionLoading() {
  return (
    <PageSkeleton label="Loading reading night" width="max-w-3xl">
      <BackLink compact />
      <Skeleton className="h-6 w-24 rounded-full" />
      <Skeleton className="mt-3 h-9 w-64 max-w-full rounded-lg" />
      <Skeleton className="mt-3 h-5 w-48" />
      <PanelSkeleton lines={2} className="mt-6">
        <ButtonSkeleton />
      </PanelSkeleton>
      <PanelSkeleton lines={3} className="mt-6">
        <Skeleton className="h-9 w-full rounded-lg" />
        <ButtonSkeleton />
      </PanelSkeleton>
    </PageSkeleton>
  );
}
