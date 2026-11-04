"use client";

import { BookOpen, LayoutList, Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { LibraryCollection } from "@/components/library-collection";
import { Button } from "@/components/ui/button";
import { sessionPageNumbers } from "@/lib/domain/session-presentation";
import {
  SHELF_LEAN_DEG,
  SHELF_PAGE_SIZE,
  formatKey,
  matchesQuery,
  setShelfOrigin,
  shelfFormats,
  shelfPage,
  shelfPageCount,
  spineAuthor,
  spineLook,
} from "@/lib/shelf";
import type { Book } from "@/lib/types";
import { cn } from "@/lib/utils";

type View = "shelf" | "list";

const ALL = "all";

const recordOrigin = (event: React.MouseEvent<HTMLAnchorElement>, bookId: string) => {
  const el = event.currentTarget;
  const box = el.getBoundingClientRect();
  const flat = getComputedStyle(el).getPropertyValue("--spine-flat").trim() === "1";
  const tilt = Number.parseFloat(el.style.getPropertyValue("--spine-tilt")) || 0;
  setShelfOrigin({
    bookId,
    centerX: box.left + box.width / 2,
    centerY: box.top + box.height / 2,
    width: el.offsetWidth,
    height: el.offsetHeight,
    flat,
    angle: flat ? tilt : SHELF_LEAN_DEG,
  });
};

function Spine({ book, dimmed }: { book: Book; dimmed: boolean }) {
  const look = spineLook(book);
  const author = spineAuthor(book.authors);
  return (
    <li className="shelf-slot">
      <Link
        href={`/library/${book.id}`}
        scroll={false}
        data-book-id={book.id}
        aria-label={`${book.title}${book.authors.length ? ` by ${book.authors.join(", ")}` : ""}`}
        aria-hidden={dimmed || undefined}
        tabIndex={dimmed ? -1 : undefined}
        onClick={(event) => recordOrigin(event, book.id)}
        className={cn("shelf-spine", dimmed && "is-dimmed")}
        data-trim={look.trim}
        style={
          {
            "--spine-color": look.color,
            "--spine-length": `${look.length}px`,
            "--spine-thickness": `${look.thickness}px`,
            "--spine-x": `${look.offsetX}px`,
            "--spine-tilt": `${look.tilt}deg`,
          } as React.CSSProperties
        }
      >
        <span className="shelf-spine-title">{book.title}</span>
        {author && (
          <span className="shelf-spine-author" aria-hidden="true">
            {author}
          </span>
        )}
      </Link>
    </li>
  );
}

function ShelfPagination({
  page,
  pageCount,
  total,
  onPage,
}: {
  page: number;
  pageCount: number;
  total: number;
  onPage: (page: number) => void;
}) {
  if (pageCount <= 1) return null;
  const first = (page - 1) * SHELF_PAGE_SIZE + 1;
  const last = Math.min(page * SHELF_PAGE_SIZE, total);
  return (
    <nav aria-label="Shelf pages" className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={page === 1}
        onClick={() => onPage(page - 1)}
      >
        Previous
      </Button>
      {sessionPageNumbers(page, pageCount).map((n, index) =>
        n === "ellipsis" ? (
          <span
            key={`gap-${index}`}
            className="px-1 text-muted-foreground"
            aria-hidden="true"
          >
            …
          </span>
        ) : (
          <Button
            key={n}
            type="button"
            variant={n === page ? "default" : "outline"}
            size="sm"
            aria-label={`Page ${n}`}
            aria-current={n === page ? "page" : undefined}
            onClick={() => onPage(n)}
          >
            {n}
          </Button>
        ),
      )}
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={page === pageCount}
        onClick={() => onPage(page + 1)}
      >
        Next
      </Button>
      <span className="text-sm text-muted-foreground">
        {first}–{last} of {total} books
      </span>
    </nav>
  );
}

export function BookShelf({ books }: { books: Book[] }) {
  const [query, setQuery] = useState("");
  const [format, setFormat] = useState(ALL);
  const [view, setView] = useState<View>("shelf");
  const formats = useMemo(() => shelfFormats(books), [books]);
  // A removed book can take the last of a format with it; fall back to All.
  const activeFormat =
    format === ALL || formats.some((f) => f.key === format) ? format : ALL;

  const matches = (book: Book) =>
    matchesQuery(book, query) &&
    (activeFormat === ALL ||
      (book.format != null && formatKey(book.format) === activeFormat));
  const matched = books.filter(matches);
  const matchCount = matched.length;

  // The shelf keeps every book in place and fades non-matches, so it pages through all
  // books; the list only shows matches, so it pages through those.
  const paged = view === "shelf" ? books : matched;
  const pageCount = shelfPageCount(paged.length);
  const filterKey = `${view}|${query.trim().toLowerCase()}|${activeFormat}`;
  const [page, setPage] = useState(1);
  const [pageFilterKey, setPageFilterKey] = useState(filterKey);
  if (pageFilterKey !== filterKey) {
    // A new search or filter jumps to the first page that has a match on it.
    setPageFilterKey(filterKey);
    const firstMatch = paged.findIndex(matches);
    setPage(firstMatch < 0 ? 1 : Math.floor(firstMatch / SHELF_PAGE_SIZE) + 1);
  }
  const currentPage = Math.min(page, pageCount);
  const pageBooks = shelfPage(paged, currentPage);
  const changePage = (next: number) => {
    setPage(next);
    document
      .getElementById("your-shelf")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  if (books.length === 0) {
    return (
      <p className="mt-4 flex items-center gap-2 text-muted-foreground">
        <BookOpen className="size-5" aria-hidden="true" />
        Your shelf is empty. Scan a barcode or search above to add your first book.
      </p>
    );
  }

  return (
    <div className="mt-4 flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className="shelf-search min-w-0 flex-1 basis-full sm:basis-auto">
          <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search titles or authors"
            aria-label="Search your shelf"
            autoComplete="off"
            className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground"
          />
        </label>
        <div
          role="group"
          aria-label="View"
          className="inline-flex rounded-full border border-border bg-card p-1"
        >
          {(
            [
              ["shelf", "Shelf", BookOpen],
              ["list", "List", LayoutList],
            ] as const
          ).map(([value, label, Icon]) => (
            <button
              key={value}
              type="button"
              aria-pressed={view === value}
              onClick={() => setView(value)}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-sm font-bold text-muted-foreground transition-colors aria-pressed:bg-secondary aria-pressed:text-primary focus-visible:outline-2 focus-visible:outline-ring"
            >
              <Icon className="size-4" aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {formats.length > 1 && (
        <div role="group" aria-label="Filter by format" className="chip-row">
          {[{ key: ALL, label: "All" }, ...formats].map(({ key, label }) => (
            <button
              key={key}
              type="button"
              aria-pressed={activeFormat === key}
              onClick={() => setFormat(key)}
              className="chip"
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {matchCount === 0 && (
        <p role="status" className="text-sm text-muted-foreground">
          {query.trim()
            ? `No “${query.trim()}” on your shelf yet. `
            : "No books match this filter. "}
          <a
            href="#find-book"
            className="font-bold text-primary underline-offset-2 hover:underline"
          >
            Find it to add it
          </a>
        </p>
      )}

      {view === "shelf" ? (
        <ul className="shelf" aria-label="Books on your shelf">
          {pageBooks.map((book) => (
            <Spine key={book.id} book={book} dimmed={!matches(book)} />
          ))}
        </ul>
      ) : (
        /* Remount on filter or page change so selections never include books that are hidden. */
        <LibraryCollection
          key={`${query.trim()}|${activeFormat}|${currentPage}`}
          books={pageBooks}
        />
      )}

      <ShelfPagination
        page={currentPage}
        pageCount={pageCount}
        total={paged.length}
        onPage={changePage}
      />
    </div>
  );
}
