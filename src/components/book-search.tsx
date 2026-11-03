"use client";

import { X } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { addBookAction, searchBooksAction } from "@/app/actions";
import { BookEditions } from "@/components/book-editions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import type {
  BookInput,
  DuplicateKeep,
  TitleDuplicateCandidate,
} from "@/lib/domain/book-duplicates";
import type { AddBookResolution, AddBookResult } from "@/lib/domain/book-duplicates";
import type { BookSearchResult } from "@/lib/open-library";

interface PendingDuplicate {
  incoming: BookInput;
  candidates: TitleDuplicateCandidate[];
}

function toBookInput(book: BookSearchResult): BookInput {
  return {
    title: book.title,
    authors: book.authors,
    openLibraryKey: book.openLibraryKey,
    coverUrl: book.coverUrl,
    isbn: book.isbn,
    description: book.description,
  };
}

function toFormData(input: BookInput, resolution?: AddBookResolution): FormData {
  const formData = new FormData();
  formData.set("title", input.title);
  formData.set("authors", input.authors.join(", "));
  formData.set("openLibraryKey", input.openLibraryKey ?? "");
  formData.set("coverUrl", input.coverUrl ?? "");
  formData.set("isbn", input.isbn ?? "");
  formData.set("description", input.description ?? "");
  if (resolution) {
    formData.set("resolution", resolution.action);
    if (resolution.action === "replace") {
      formData.set("existingBookId", resolution.existingBookId);
    }
  }
  return formData;
}

function BookCover({ coverUrl, label }: { coverUrl: string | null; label: string }) {
  return coverUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={coverUrl} alt="" className="h-16 w-12 rounded object-cover" />
  ) : (
    <div className="flex h-16 w-12 items-center justify-center rounded bg-secondary px-1 text-center text-xs leading-tight text-muted-foreground">
      {label}
    </div>
  );
}

function DuplicateOption({
  heading,
  book,
  recommended,
  disabled,
  onKeep,
}: {
  heading: string;
  book: BookInput;
  recommended: boolean;
  disabled: boolean;
  onKeep: () => void;
}) {
  return (
    <div
      className={`flex flex-1 flex-col gap-2 rounded-xl border p-3 ${
        recommended ? "border-primary/60 bg-primary/5" : "border-border/80"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {heading}
        </p>
        {recommended ? <Badge>Recommended</Badge> : null}
      </div>
      <div className="flex gap-3">
        <BookCover coverUrl={book.coverUrl} label="No cover" />
        <div className="min-w-0">
          <p className="font-medium">{book.title}</p>
          <p className="text-sm text-muted-foreground">
            {book.authors.join(", ") || "Unknown author"}
          </p>
          <p className="text-xs text-muted-foreground">
            {book.isbn ? `ISBN ${book.isbn}` : "No ISBN"}
          </p>
        </div>
      </div>
      <Button
        type="button"
        size="sm"
        variant={recommended ? "default" : "secondary"}
        disabled={disabled}
        onClick={onKeep}
      >
        Keep this one
      </Button>
    </div>
  );
}

export function BookSearch({ collectionKeys }: { collectionKeys: string[] }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<BookSearchResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [adding, startAdding] = useTransition();
  const [duplicate, setDuplicate] = useState<PendingDuplicate | null>(null);
  const toast = useToast();

  useEffect(() => {
    let active = true;
    const term = query.trim();
    const timer = setTimeout(async () => {
      setError(null);
      setResults([]);
      if (term.length < 2) {
        setPending(false);
        return;
      }
      setPending(true);
      try {
        const next = await searchBooksAction(term);
        if (active) setResults(next);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "Search failed");
      } finally {
        if (active) setPending(false);
      }
    }, 350);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query]);

  function handleAddResult(result: AddBookResult) {
    switch (result.status) {
      case "added":
        setDuplicate(null);
        toast.success(`Added "${result.book.title}" to the library`);
        return;
      case "replaced":
        setDuplicate(null);
        toast.success(`Updated "${result.book.title}" with the new details`);
        return;
      case "already_in_library":
        setDuplicate(null);
        toast.message({
          title: `"${result.existing.title}" is already in your library`,
          description: "Same ISBN / barcode, so we kept the one you added first.",
        });
        return;
      case "possible_duplicate":
        setDuplicate({ incoming: result.incoming, candidates: result.candidates });
        return;
    }
  }

  function addBook(input: BookInput, resolution?: AddBookResolution) {
    startAdding(async () => {
      try {
        handleAddResult(await addBookAction(toFormData(input, resolution)));
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not add book");
      }
    });
  }

  function keepExisting(title: string) {
    setDuplicate(null);
    toast.message(`Kept the "${title}" already in your library`);
  }

  return (
    <div className="space-y-4">
      <div className="relative">
        <Input
          ref={inputRef}
          className="pr-11"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setResults([]);
            setError(null);
            setPending(false);
          }}
          placeholder="Title, author, or ISBN / barcode"
          aria-label="Search books"
          aria-describedby="book-search-hint"
        />
        {query && (
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label="Clear search"
            className="absolute right-1 top-1/2 -translate-y-1/2"
            onClick={() => {
              setQuery("");
              setResults([]);
              setError(null);
              setPending(false);
              inputRef.current?.focus();
            }}
          >
            <X aria-hidden="true" />
          </Button>
        )}
      </div>
      <p id="book-search-hint" className="text-sm text-muted-foreground">
        Type at least two characters to search (debounced). ISBN and barcode queries use
        Google Books when configured, then Open Library.
      </p>
      {pending && (
        <p role="status" className="text-sm text-muted-foreground">
          Searching…
        </p>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
      <ul className="grid items-start gap-2 lg:grid-cols-2">
        {results.map((book) => (
          <li
            key={book.sourceId}
            className="grid grid-cols-[3rem_minmax(0,1fr)] items-start gap-x-3 gap-y-2 rounded-xl border border-border/80 bg-card/70 p-3 sm:grid-cols-[3rem_minmax(0,1fr)_auto]"
          >
            <div className="contents">
              <BookCover coverUrl={book.coverUrl} label="No cover" />
              <div className="min-w-0 break-words">
                <p className="font-medium leading-snug">{book.title}</p>
                <p className="text-sm text-muted-foreground">
                  {book.authors.join(", ") || "Unknown author"}
                  {book.year ? ` · ${book.year}` : ""}
                </p>
              </div>
              {book.openLibraryKey ? (
                <BookEditions
                  workKey={book.openLibraryKey}
                  collectionKeys={collectionKeys}
                />
              ) : (
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={adding}
                  className="col-start-1 row-start-2 sm:col-start-3 sm:row-start-1 sm:justify-self-end"
                  onClick={() => addBook(toBookInput(book))}
                >
                  Add to library
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>

      <Dialog
        open={duplicate !== null}
        onOpenChange={(open) => {
          if (!open) setDuplicate(null);
        }}
      >
        {duplicate ? (
          <DialogContent className="sm:max-w-xl">
            <DialogHeader>
              <DialogTitle>This looks like a book you already have</DialogTitle>
              <DialogDescription>
                Same title and author, different ISBN. Pick which copy to keep. We
                recommend the one with more details, like a cover picture.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              {duplicate.candidates.map(({ existing, recommended }) => {
                const pick = (keep: DuplicateKeep) => keep === recommended;
                return (
                  <div key={existing.id} className="flex flex-col gap-3 sm:flex-row">
                    <DuplicateOption
                      heading="In your library"
                      book={existing}
                      recommended={pick("existing")}
                      disabled={adding}
                      onKeep={() => keepExisting(existing.title)}
                    />
                    <DuplicateOption
                      heading="Just found"
                      book={duplicate.incoming}
                      recommended={pick("incoming")}
                      disabled={adding}
                      onKeep={() =>
                        addBook(duplicate.incoming, {
                          action: "replace",
                          existingBookId: existing.id,
                        })
                      }
                    />
                  </div>
                );
              })}
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={adding}
                onClick={() => addBook(duplicate.incoming, { action: "keep_both" })}
              >
                Keep both
              </Button>
            </DialogFooter>
          </DialogContent>
        ) : null}
      </Dialog>
    </div>
  );
}
