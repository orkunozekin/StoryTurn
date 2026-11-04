import { BackLink } from "@/components/back-link";
export const dynamic = "force-dynamic";
import { redirect } from "next/navigation";
import { SiteNav } from "@/components/site-nav";
import { BookDetail } from "@/components/book-detail";
import { BookHistory } from "@/components/book-history";
import {
  getBook,
  getBookHistory,
  getCurrentMember,
  getCurrentUser,
  getHomeContext,
} from "@/lib/data";
import { DEFAULT_FAMILY_TIMEZONE, formatDateOnlyInTimeZone } from "@/lib/domain/dates";

export default async function LibraryBookPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const member = await getCurrentMember();
  if (!member) redirect("/onboarding");

  const { id } = await params;
  const book = await getBook(id);
  if (!book) redirect("/library");
  const timeZone = (await getHomeContext()).timezone ?? DEFAULT_FAMILY_TIMEZONE;
  const today = formatDateOnlyInTimeZone(new Date(), timeZone);
  const history = await getBookHistory(book.id, today);

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <SiteNav displayName={member.displayName} />
      <main className="mx-auto w-full max-w-3xl px-4 py-8">
        <BackLink href="/library" label="Back to library" />
        <div className="animate-rise">
          <BookDetail book={book} />
        </div>
        {history && <BookHistory history={history} today={today} timeZone={timeZone} />}
      </main>
    </div>
  );
}
