"use client";

import { editionLabel } from "@/lib/book-edition";
import { useEffect, useState } from "react";
import { BookOpen, Check, Plus, X } from "lucide-react";
import { searchLibraryBooksAction } from "@/app/library-picker-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import type { LibraryBook, LibraryPage } from "@/lib/domain/library-page";

export function SessionBookPicker({
  books,
  selectedIds,
}: {
  books: LibraryBook[];
  selectedIds: string[];
}) {
  const [selected, setSelected] = useState(selectedIds);
  const [bookDetails, setBookDetails] = useState<Record<string, LibraryBook>>(() =>
    Object.fromEntries(books.map((book) => [book.id, book])),
  );
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<LibraryPage | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!open) return;
    let active = true;
    const timer = setTimeout(async () => {
      try {
        const next = await searchLibraryBooksAction(query, page);
        if (!active) return;
        setResult(next);
        setBookDetails((existing) => ({
          ...existing,
          ...Object.fromEntries(next.items.map((book) => [book.id, book])),
        }));
      } catch {
        if (active) setError("Could not load your library. Please try again.");
      } finally {
        if (active) setLoading(false);
      }
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [open, query, page, retry]);

  function startLoading() {
    setLoading(true);
    setError("");
  }

  return (
    <div className="space-y-3">
      {selected.map((id) => (
        <input key={id} type="hidden" name="bookIds" value={id} />
      ))}
      <Button
        type="button"
        variant="outline"
        onClick={() => {
          startLoading();
          setOpen(true);
        }}
      >
        <Plus aria-hidden="true" /> Add books from library
      </Button>
      {selected.length > 0 && (
        <ul className="space-y-2" aria-label="Selected books">
          {selected.map((id) => (
            <li
              key={id}
              className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-1.5 text-sm"
            >
              <div className="flex min-w-0 items-center gap-3">
                <BookCover
                  book={bookDetails[id] ?? { id, title: "Selected book" }}
                  thumbnail
                />
                <span className="min-w-0 break-words">
                  {bookDetails[id]?.title ?? "Selected book"}
                  {editionLabel(bookDetails[id] ?? {}) && (
                    <span className="block text-xs text-muted-foreground">
                      {editionLabel(bookDetails[id] ?? {})}
                    </span>
                  )}
                </span>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Remove ${bookDetails[id]?.title ?? "selected book"}`}
                onClick={() => setSelected((ids) => ids.filter((value) => value !== id))}
              >
                <X aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (next) startLoading();
          setOpen(next);
        }}
      >
        <DialogContent className="sm:max-w-xl max-h-[85dvh] overflow-y-auto">
          <DialogTitle>Add books from your library</DialogTitle>
          <DialogDescription>
            Choose books for this night. Your selections stay selected across searches and
            pages.
          </DialogDescription>
          <Input
            aria-label="Search library books"
            placeholder="Search by title"
            value={query}
            onChange={(event) => {
              startLoading();
              setQuery(event.target.value);
              setPage(1);
            }}
          />
          <div aria-live="polite" role="status">
            {loading
              ? "Searching your library…"
              : error ||
                (result
                  ? `${result.total} ${result.total === 1 ? "book" : "books"} · ${selected.length} selected`
                  : "")}
          </div>
          {error && (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                startLoading();
                setRetry((value) => value + 1);
              }}
            >
              Try again
            </Button>
          )}
          {loading && (
            <div aria-hidden="true" className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {[0, 1, 2, 3, 4, 5].map((tile) => (
                <div
                  key={tile}
                  className="flex flex-col items-center gap-3 rounded-xl border-2 border-border p-3"
                >
                  <Skeleton className="h-36 w-full rounded-lg" />
                  <Skeleton className="h-4 w-full" />
                </div>
              ))}
            </div>
          )}
          {!loading && !error && result && (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {result.items.length ? (
                  result.items.map((book) => (
                    <button
                      key={book.id}
                      type="button"
                      aria-pressed={selected.includes(book.id)}
                      aria-label={`${book.title}${editionLabel(book) ? ` (${editionLabel(book)})` : ""}`}
                      onClick={() =>
                        setSelected((ids) =>
                          ids.includes(book.id)
                            ? ids.filter((id) => id !== book.id)
                            : [...ids, book.id],
                        )
                      }
                      className={`group relative flex flex-col items-center gap-3 rounded-xl border-2 p-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${selected.includes(book.id) ? "border-primary bg-primary/10" : "border-border bg-background hover:border-primary/50 hover:bg-secondary/50"}`}
                    >
                      <BookCover book={book} />
                      <span className="w-full text-sm font-medium leading-snug">
                        {book.title}
                        {editionLabel(book) && (
                          <span className="block text-xs text-muted-foreground">
                            {editionLabel(book)}
                          </span>
                        )}
                      </span>
                      {selected.includes(book.id) && (
                        <span
                          aria-hidden="true"
                          className="absolute right-2 top-2 flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm"
                        >
                          <Check className="size-4" />
                        </span>
                      )}
                    </button>
                  ))
                ) : (
                  <p className="col-span-full py-4 text-muted-foreground">
                    {query.trim()
                      ? "No books match your search."
                      : "Your library is empty. Add books in Library or enter a title below."}
                  </p>
                )}
              </div>
              {result.pageCount > 1 && (
                <nav
                  aria-label="Library pages"
                  className="flex items-center justify-between gap-2"
                >
                  <Button
                    type="button"
                    variant="outline"
                    disabled={result.page <= 1}
                    onClick={() => {
                      startLoading();
                      setPage(result.page - 1);
                    }}
                  >
                    Previous
                  </Button>
                  <span className="text-sm">
                    Page {result.page} of {result.pageCount}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={result.page >= result.pageCount}
                    onClick={() => {
                      startLoading();
                      setPage(result.page + 1);
                    }}
                  >
                    Next
                  </Button>
                </nav>
              )}
            </>
          )}
          <Button type="button" onClick={() => setOpen(false)}>
            Done · {selected.length} selected
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function BookCover({
  book,
  thumbnail = false,
}: {
  book: LibraryBook;
  thumbnail?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <span
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-lg bg-secondary/60 ${thumbnail ? "h-10 w-7" : "h-36 w-full"}`}
    >
      {book.coverUrl && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={book.coverUrl}
          alt=""
          loading="lazy"
          className="h-full max-w-full rounded object-contain shadow-sm"
          onError={() => setFailed(true)}
        />
      ) : (
        <BookOpen
          aria-hidden="true"
          className={`${thumbnail ? "size-5" : "size-10"} text-primary/50`}
        />
      )}
    </span>
  );
}
