import { BackLink } from "@/components/back-link";
import { PageSkeleton } from "@/components/page-skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function BookLoading() {
  return (
    <PageSkeleton label="Loading book" width="max-w-3xl">
      <BackLink href="/library" label="Back to library" />
      <article className="story-panel grid gap-6 rounded-2xl p-5 sm:grid-cols-[minmax(0,16rem)_minmax(0,1fr)] sm:p-8">
        <Skeleton className="mx-auto aspect-[2/3] w-40 rounded-xl sm:mx-0" />
        <div className="space-y-3">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-10 w-3/4 rounded-lg" />
          <Skeleton className="h-5 w-1/2" />
          <div className="flex flex-wrap gap-2 pt-2">
            <Skeleton className="h-8 w-28 rounded-full" />
            <Skeleton className="h-8 w-24 rounded-full" />
          </div>
        </div>
      </article>
    </PageSkeleton>
  );
}
