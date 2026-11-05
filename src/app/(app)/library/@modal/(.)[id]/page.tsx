export const dynamic = "force-dynamic";
import { redirect } from "next/navigation";
import { BookModal } from "@/components/book-modal";
import { bookHistorySummary } from "@/components/book-history";
import {
  getBook,
  getBookHistory,
  getCurrentMember,
  getCurrentUser,
  getHomeContext,
} from "@/lib/data";
import { DEFAULT_FAMILY_TIMEZONE, formatDateOnlyInTimeZone } from "@/lib/domain/dates";

/** Opening a book from the shelf shows it in a modal; a direct link still renders the full page. */
export default async function LibraryBookModal({ params }: PageProps<"/library/[id]">) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const member = await getCurrentMember();
  if (!member) redirect("/onboarding");

  const { id } = await params;
  const book = await getBook(id);
  if (!book) return null;

  const timeZone = (await getHomeContext()).timezone ?? DEFAULT_FAMILY_TIMEZONE;
  const today = formatDateOnlyInTimeZone(new Date(), timeZone);
  const history = await getBookHistory(book.id, today);
  const summary = history ? bookHistorySummary(history, today, timeZone) : undefined;

  return <BookModal book={book} summary={summary} />;
}
