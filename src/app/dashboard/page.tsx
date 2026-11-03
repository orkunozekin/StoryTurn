import { BackLink } from "@/components/back-link";
export const dynamic = "force-dynamic";
import { redirect } from "next/navigation";
import { AppNav } from "@/components/app-nav";
import { Badge } from "@/components/ui/badge";
import { getCurrentMember, getCurrentUser, getDashboard } from "@/lib/data";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function StatTitle({
  book,
}: {
  book: { title: string; edition?: string; bookId: string | null };
}) {
  return (
    <span>
      {book.bookId ? (
        <Link
          href={`/library/${book.bookId}`}
          className="font-medium text-primary underline-offset-2 hover:underline"
        >
          {book.title}
        </Link>
      ) : (
        <span>{book.title}</span>
      )}
      {book.edition && (
        <span className="block text-xs text-muted-foreground">{book.edition}</span>
      )}
    </span>
  );
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const member = await getCurrentMember();
  if (!member) redirect("/onboarding");

  const params = await searchParams;
  const filterParam = params.filter ?? member.id;
  const filter =
    filterParam === "family"
      ? ({ type: "family" } as const)
      : ({ type: "member", memberId: filterParam } as const);

  const dash = await getDashboard(filter);
  if (!dash) redirect("/onboarding");

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <AppNav displayName={member.displayName} />
      <main className="mx-auto w-full max-w-5xl px-4 py-8">
        <BackLink />
        <section className="animate-rise">
          <h1 className="font-display text-3xl text-primary">Reading dashboard</h1>
          <p className="mt-1 text-muted-foreground">
            Books logged all-time and recently. Defaults to you; filter by any reader or
            the whole family.
          </p>
        </section>

        <div className="mt-5 flex flex-wrap gap-2 animate-rise-delay">
          <Link
            href={`/dashboard?filter=${member.id}`}
            className={cn(
              buttonVariants({
                size: "sm",
                variant:
                  filter.type === "member" && filter.memberId === member.id
                    ? "default"
                    : "outline",
              }),
            )}
          >
            Me
          </Link>
          {dash.readers
            .filter((r) => r.id !== member.id)
            .map((r) => (
              <Link
                key={r.id}
                href={`/dashboard?filter=${r.id}`}
                className={cn(
                  buttonVariants({
                    size: "sm",
                    variant:
                      filter.type === "member" && filter.memberId === r.id
                        ? "default"
                        : "outline",
                  }),
                )}
              >
                {r.displayName}
              </Link>
            ))}
          <Link
            href="/dashboard?filter=family"
            className={cn(
              buttonVariants({
                size: "sm",
                variant: filter.type === "family" ? "default" : "outline",
              }),
            )}
          >
            Whole family
          </Link>
        </div>

        <section className="mt-6 grid gap-4 sm:grid-cols-3">
          {[
            ["Sessions completed", dash.stats.sessionsCompleted],
            ["Books logged", dash.stats.totalBooksLogged],
            ["Unique titles", dash.stats.uniqueTitles],
          ].map(([label, value]) => (
            <div key={label as string} className="story-panel rounded-2xl p-5">
              <p className="text-sm text-muted-foreground">{label}</p>
              <p className="font-display mt-2 text-3xl">{value as number}</p>
            </div>
          ))}
        </section>

        <section className="mt-8 grid gap-6 md:grid-cols-2">
          <div className="story-panel rounded-2xl p-5">
            <h2 className="font-display text-xl">Recent</h2>
            <ul className="mt-4 space-y-3">
              {dash.stats.recent.length === 0 && (
                <li className="text-sm text-muted-foreground">No recent books.</li>
              )}
              {dash.stats.recent.map((book) => (
                <li
                  key={`${book.bookId}-${book.title}`}
                  className="flex items-center justify-between gap-3"
                >
                  <StatTitle book={book} />
                  <Badge variant="secondary">{book.readCount}×</Badge>
                </li>
              ))}
            </ul>
          </div>
          <div className="story-panel rounded-2xl p-5">
            <h2 className="font-display text-xl">All time</h2>
            <ul className="mt-4 space-y-3">
              {dash.stats.allTime.length === 0 && (
                <li className="text-sm text-muted-foreground">No books logged yet.</li>
              )}
              {dash.stats.allTime.map((book) => (
                <li
                  key={`${book.bookId}-${book.title}-all`}
                  className="flex items-center justify-between gap-3"
                >
                  <StatTitle book={book} />
                  <Badge variant="secondary">{book.readCount}×</Badge>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </main>
    </div>
  );
}
