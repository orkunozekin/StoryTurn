import { compactBookCode, looksLikeBookCode, normalizeToIsbn13 } from "@/lib/isbn";
import type { Book } from "@/lib/types";

export interface BookInput {
  title: string;
  authors: string[];
  openLibraryKey: string | null;
  coverUrl: string | null;
  isbn: string | null;
  description?: string | null;
}

export type DuplicateKeep = "existing" | "incoming";

export interface TitleDuplicateCandidate {
  existing: Book;
  recommended: DuplicateKeep;
}

export type AddBookResolution =
  { action: "keep_both" } | { action: "replace"; existingBookId: string };

export type AddBookResult =
  | { status: "added"; book: Book }
  | { status: "already_in_library"; existing: Book }
  | {
      status: "possible_duplicate";
      incoming: BookInput;
      candidates: TitleDuplicateCandidate[];
    }
  | { status: "replaced"; book: Book };

export type DuplicateCheck =
  | { kind: "none" }
  | { kind: "same_isbn"; existing: Book }
  | { kind: "same_title"; candidates: TitleDuplicateCandidate[] };

/**
 * Comparable barcode key: ISBN-13 for Bookland codes, otherwise the compact
 * scanned code (non-Bookland UPCs are stored as scanned). Provider identifiers
 * that are not barcodes (e.g. Google `OTHER` ids) yield null.
 */
export function bookCodeKey(isbn: string | null | undefined): string | null {
  if (!isbn) return null;
  const isbn13 = normalizeToIsbn13(isbn);
  if (isbn13) return isbn13;
  return looksLikeBookCode(isbn) ? compactBookCode(isbn) : null;
}

/**
 * Value stored in `books.isbn` and compared for exact duplicates. Matches the
 * unique `(family_id, isbn)` index, so non-barcode provider ids dedupe too.
 */
export function storedIsbnKey(isbn: string | null | undefined): string | null {
  return bookCodeKey(isbn) ?? (isbn?.trim() || null);
}

/** Keep the chosen copy's metadata, but never drop a field only the other copy has. */
export function mergeKeptBook(kept: BookInput, other: BookInput): BookInput {
  return {
    title: kept.title || other.title,
    authors: kept.authors.length > 0 ? kept.authors : other.authors,
    openLibraryKey: kept.openLibraryKey ?? other.openLibraryKey,
    coverUrl: kept.coverUrl ?? other.coverUrl,
    isbn: kept.isbn ?? other.isbn,
    description: kept.description?.trim() || other.description?.trim() || null,
  };
}

const LEADING_ARTICLE = /^(the|a|an)\s+/;

function foldText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** Title key that ignores case, punctuation, subtitles, editions in parens, and a leading article. */
export function normalizeTitleKey(title: string): string {
  const main = title.split(":")[0].replace(/\([^)]*\)|\[[^\]]*\]/g, " ");
  return foldText(main).replace(LEADING_ARTICLE, "");
}

function authorTokens(name: string): Set<string> {
  return new Set(
    foldText(name)
      .split(" ")
      .filter((token) => token.length > 1),
  );
}

function sameAuthor(a: string, b: string): boolean {
  const left = authorTokens(a);
  const right = authorTokens(b);
  if (left.size === 0 || right.size === 0) return false;
  const [small, large] = left.size <= right.size ? [left, right] : [right, left];
  for (const token of small) {
    if (!large.has(token)) return false;
  }
  return true;
}

/**
 * Same title is only a duplicate when an author also matches, or when either
 * side has no authors to compare (two different books can share a title).
 */
export function isLikelySameBook(
  existing: Pick<Book, "title" | "authors">,
  incoming: Pick<BookInput, "title" | "authors">,
): boolean {
  const titleKey = normalizeTitleKey(incoming.title);
  if (!titleKey || normalizeTitleKey(existing.title) !== titleKey) return false;
  if (existing.authors.length === 0 || incoming.authors.length === 0) return true;
  return existing.authors.some((a) => incoming.authors.some((b) => sameAuthor(a, b)));
}

/** Higher means richer metadata; a cover thumbnail outweighs everything else. */
export function bookMetadataScore(
  book: Pick<
    BookInput,
    "coverUrl" | "isbn" | "authors" | "openLibraryKey" | "description"
  >,
): number {
  let score = 0;
  if (book.coverUrl) score += 9;
  if (bookCodeKey(book.isbn)) score += 4;
  if (book.authors.length > 0) score += 2;
  if (book.description?.trim()) score += 1;
  if (book.openLibraryKey) score += 1;
  return score;
}

/** Ties keep the book already in the library. */
export function recommendKeep(existing: Book, incoming: BookInput): DuplicateKeep {
  return bookMetadataScore(incoming) > bookMetadataScore(existing)
    ? "incoming"
    : "existing";
}

export function checkForDuplicate(library: Book[], incoming: BookInput): DuplicateCheck {
  const code = storedIsbnKey(incoming.isbn);
  if (code) {
    const sameCode = library
      .filter((book) => storedIsbnKey(book.isbn) === code)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
    if (sameCode) return { kind: "same_isbn", existing: sameCode };
  }

  const candidates = library
    .filter((book) => isLikelySameBook(book, incoming))
    .map((existing) => ({ existing, recommended: recommendKeep(existing, incoming) }));
  if (candidates.length > 0) return { kind: "same_title", candidates };

  return { kind: "none" };
}
