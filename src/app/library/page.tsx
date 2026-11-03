import { BackLink } from "@/components/back-link";
export const dynamic = "force-dynamic";
import { redirect } from "next/navigation";
import { AppNav } from "@/components/app-nav";
import { BookScanner } from "@/components/book-scanner";
import { LibraryCollection } from "@/components/library-collection";
import { BookSearch } from "@/components/book-search";
import { getCurrentMember, getCurrentUser, getLibrary } from "@/lib/data";

export default async function LibraryPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const member = await getCurrentMember();
  if (!member) redirect("/onboarding");
  const books = await getLibrary();

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <AppNav displayName={member.displayName} />
      <main className="mx-auto w-full max-w-5xl px-4 py-8">
        <BackLink />
        <section className="animate-rise">
          <h1 className="font-display text-3xl text-primary">Family library</h1>
          <p className="mt-1 text-muted-foreground">
            Look up books and add them for every kid in the family.
          </p>
        </section>

        <section className="story-panel reveal mt-6 rounded-2xl p-5">
          <h2 className="font-display text-xl">Find a book</h2>
          <div className="mt-3">
            <BookScanner />
          </div>
          <div className="mt-4">
            <BookSearch
              collectionKeys={books.flatMap((book) =>
                book.editionKey ? [book.editionKey] : [],
              )}
            />
          </div>
        </section>

        <section className="reveal mt-6">
          <h2 className="font-display text-xl">In your collection</h2>
          <LibraryCollection books={books} />
        </section>
      </main>
    </div>
  );
}
