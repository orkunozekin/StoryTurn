export const dynamic = "force-dynamic";
import { redirect } from "next/navigation";
import { BookModal } from "@/components/book-modal";
import { getBook, getCurrentMember, getCurrentUser } from "@/lib/data";

/** Opening a book from the shelf shows it in a modal; a direct link still renders the full page. */
export default async function LibraryBookModal({ params }: PageProps<"/library/[id]">) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const member = await getCurrentMember();
  if (!member) redirect("/onboarding");

  const { id } = await params;
  const book = await getBook(id);
  if (!book) return null;

  return <BookModal book={book} />;
}
