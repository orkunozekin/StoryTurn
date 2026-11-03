import { BackLink } from "@/components/back-link";
export const dynamic = "force-dynamic";
import { redirect } from "next/navigation";
import { AppNav } from "@/components/app-nav";
import { BookDetail } from "@/components/book-detail";
import { getBook, getCurrentMember, getCurrentUser } from "@/lib/data";

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

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <AppNav displayName={member.displayName} />
      <main className="mx-auto w-full max-w-3xl px-4 py-8">
        <BackLink href="/library" label="Back to library" />
        <div className="animate-rise">
          <BookDetail book={book} />
        </div>
      </main>
    </div>
  );
}
