import type { Book } from "@/lib/types";

function metaRows(book: Book) {
  return [
    book.format ? { label: "Format", value: book.format } : null,
    book.publisher ? { label: "Publisher", value: book.publisher } : null,
    book.editionYear ? { label: "Published", value: book.editionYear } : null,
    book.isbn ? { label: "ISBN", value: book.isbn } : null,
  ].filter((row): row is { label: string; value: string } => row !== null);
}

export function BookDetail({ book }: { book: Book }) {
  const rows = metaRows(book);
  const initial = book.title.trim().slice(0, 1).toUpperCase() || "?";

  return (
    <article className="story-panel overflow-hidden rounded-2xl">
      <div className="grid gap-6 p-5 sm:grid-cols-[minmax(0,16rem)_minmax(0,1fr)] sm:items-start sm:p-8">
        <div className="flex justify-center sm:justify-start">
          {book.coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={book.coverUrl}
              alt=""
              className="max-h-72 w-auto max-w-full rounded-xl object-contain shadow-md"
            />
          ) : (
            <div className="flex aspect-[2/3] w-40 items-center justify-center rounded-xl bg-secondary font-display text-5xl text-primary">
              {initial}
            </div>
          )}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
            Family library
          </p>
          <h1 className="font-display mt-2 text-4xl text-balance text-primary">
            {book.title}
          </h1>
          <p className="mt-3 text-lg">{book.authors.join(", ") || "Unknown author"}</p>
          {rows.length > 0 && (
            <dl className="mt-5 flex flex-wrap gap-2">
              {rows.map((row) => (
                <div
                  key={row.label}
                  className="rounded-full bg-secondary px-3 py-1.5 text-sm"
                >
                  <dt className="inline text-muted-foreground">{row.label}</dt>{" "}
                  <dd className="inline font-medium">{row.value}</dd>
                </div>
              ))}
            </dl>
          )}
          {!book.editionKey && (
            <p className="mt-4 text-sm text-muted-foreground">
              Legacy entry: edition unverified
            </p>
          )}
        </div>
      </div>
      <div className="border-t border-border/70 px-5 py-6 sm:px-8">
        <h2 className="font-display text-xl">About this book</h2>
        {book.description ? (
          <p className="mt-3 max-w-prose text-base leading-relaxed whitespace-pre-line">
            {book.description}
          </p>
        ) : (
          <p className="mt-3 max-w-prose text-muted-foreground">
            No description was saved for this book.
          </p>
        )}
      </div>
    </article>
  );
}
