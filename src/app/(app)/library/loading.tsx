import { HeadingSkeleton, PageSkeleton } from "@/components/page-skeletons";
import { BackLink } from "@/components/back-link";
import { Skeleton } from "@/components/ui/skeleton";

export default function LibraryLoading() {
  return (
    <PageSkeleton label="Loading shelf">
      <BackLink hiddenWithTabs />
      <HeadingSkeleton />
      <section className="story-panel mt-6 space-y-4 rounded-2xl p-5">
        <Skeleton className="h-6 w-32 rounded-lg" />
        <Skeleton className="h-8 w-36 rounded-lg" />
        <Skeleton className="h-9 w-full rounded-lg" />
        <Skeleton className="h-4 w-3/4" />
      </section>
      <section className="mt-6">
        <Skeleton className="h-6 w-28 rounded-lg" />
        <div className="mt-4 flex items-end gap-1.5 overflow-hidden rounded-xl border border-border p-4">
          {[10, 12, 9, 11, 13, 8, 12, 10, 11, 9, 12, 10].map((height, book) => (
            <Skeleton
              key={book}
              className="w-7 shrink-0 rounded-sm sm:w-8"
              style={{ height: `${height}rem` }}
            />
          ))}
        </div>
      </section>
    </PageSkeleton>
  );
}
