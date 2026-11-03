export const dynamic = "force-dynamic";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SiteNav } from "@/components/site-nav";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getHomeContext } from "@/lib/data";
import {
  currentReaderLabels,
  originalReaderLabels,
  wasCorrected,
} from "@/lib/domain/corrections";
import { upcomingSessionDay } from "@/lib/domain/session-presentation";

export default async function HomePage() {
  const home = await getHomeContext();
  if (!home.user) redirect("/login");
  if (!home.member) redirect("/onboarding");

  const memberNames = Object.fromEntries(home.readers.map((r) => [r.id, r.displayName]));

  const next = home.nextSession;
  const assignments = home.assignments;
  const books = home.sessionBooks;
  const corrected = next
    ? wasCorrected({
        assignments: home.assignments,
        corrections: home.corrections,
        sessionId: next.id,
      })
    : false;

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <SiteNav displayName={home.member.displayName} />
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 py-8">
        <section className="animate-rise max-w-2xl">
          <p className="font-display text-2xl text-primary md:text-3xl">
            Good evening, {home.member.displayName.split(" ")[0]}
          </p>
          <p className="mt-1 text-muted-foreground">
            {home.family?.name} · reading with{" "}
            {home.kids.map((k) => k.name).join(" & ") || "your kids"}
          </p>
        </section>

        <section className="story-panel animate-rise-delay mt-6 rounded-2xl p-6 md:p-8">
          {next ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="bg-primary text-primary-foreground hover:bg-primary">
                  Your next night
                </Badge>
                {corrected && <Badge variant="outline">Corrected record</Badge>}
              </div>
              <h1 className="font-display mt-4 text-3xl tracking-tight md:text-4xl">
                {upcomingSessionDay(next.scheduledFor, home.timezone)} at{" "}
                {next.scheduledFor.slice(11, 16)}
              </h1>
              <p className="mt-3 text-lg text-foreground/90">
                Reader:{" "}
                {currentReaderLabels({
                  assignments,
                  memberNames,
                  sessionId: next.id,
                }).join(", ")}
              </p>
              {corrected && (
                <p className="mt-2 text-sm text-muted-foreground">
                  Originally assigned:{" "}
                  {originalReaderLabels({
                    assignments,
                    memberNames,
                    sessionId: next.id,
                  }).join(", ")}
                </p>
              )}
              <p className="mt-4 text-muted-foreground">
                {books.length > 0
                  ? `Books lined up: ${books
                      .map(
                        (b) =>
                          b.titleFreeform ??
                          home.books.find((x) => x.id === b.bookId)?.title ??
                          "Untitled",
                      )
                      .join(", ")}`
                  : "Books can be chosen ahead of time or logged after reading."}
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link
                  href={`/sessions/${next.id}`}
                  className={cn(buttonVariants(), "animate-glow")}
                >
                  Open session
                </Link>
                <Link
                  href="/dashboard"
                  className={buttonVariants({ variant: "outline" })}
                >
                  View reading stats
                </Link>
              </div>
            </>
          ) : (
            <>
              <h1 className="font-display text-3xl tracking-tight">
                No upcoming night assigned to you
              </h1>
              <p className="mt-3 text-muted-foreground">
                Check the family schedule or ask an owner to add you to the rotation.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link href="/schedule" className={buttonVariants()}>
                  Review schedule
                </Link>
                <Link
                  href="/dashboard"
                  className={buttonVariants({ variant: "outline" })}
                >
                  View reading stats
                </Link>
              </div>
            </>
          )}
        </section>
      </main>
    </div>
  );
}
