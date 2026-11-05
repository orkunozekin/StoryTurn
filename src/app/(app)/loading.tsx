import { ButtonSkeleton, PageSkeleton } from "@/components/page-skeletons";
import { Skeleton } from "@/components/ui/skeleton";

/** Tonight. Also the fallback for any signed-in route without its own skeleton. */
export default function TonightLoading() {
  return (
    <PageSkeleton label="Loading tonight">
      <div className="max-w-2xl space-y-3">
        <Skeleton className="h-8 w-64 max-w-full rounded-lg" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>
      <section className="story-panel mt-6 rounded-2xl p-6 md:p-8">
        <Skeleton className="h-6 w-28 rounded-full" />
        <Skeleton className="mt-4 h-10 w-72 max-w-full rounded-lg" />
        <Skeleton className="mt-3 h-5 w-48" />
        <Skeleton className="mt-4 h-4 w-full max-w-md" />
        <div className="mt-6 flex flex-wrap gap-3">
          <ButtonSkeleton />
          <ButtonSkeleton className="w-40" />
        </div>
      </section>
    </PageSkeleton>
  );
}
