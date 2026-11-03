import { plainBookDescription } from "@/lib/book-description";

export type BookSource = "openlibrary" | "google";

export interface OpenLibraryDoc {
  key: string;
  title: string;
  author_name?: string[];
  cover_i?: number;
  isbn?: string[];
  first_publish_year?: number;
}

export interface BookSearchResult {
  /** Stable id for UI keys / forms (OL work key or google:volumeId). */
  sourceId: string;
  source: BookSource;
  openLibraryKey: string | null;
  googleBooksId: string | null;
  title: string;
  authors: string[];
  coverUrl: string | null;
  isbn: string | null;
  year: number | null;
  description: string | null;
}

interface OpenLibraryBooksApiEntry {
  title?: string;
  authors?: Array<{ name?: string }>;
  publish_date?: string;
  cover?: { medium?: string; large?: string; small?: string };
  identifiers?: {
    isbn_13?: string[];
    isbn_10?: string[];
    openlibrary?: string[];
  };
  key?: string;
}

export function mapOpenLibraryDoc(doc: OpenLibraryDoc): BookSearchResult {
  return {
    sourceId: doc.key,
    source: "openlibrary",
    openLibraryKey: doc.key,
    googleBooksId: null,
    title: doc.title,
    authors: doc.author_name ?? [],
    coverUrl: doc.cover_i
      ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg`
      : null,
    isbn: doc.isbn?.[0] ?? null,
    year: doc.first_publish_year ?? null,
    description: null,
  };
}

function parsePublishYear(publishDate?: string): number | null {
  if (!publishDate) return null;
  const match = publishDate.match(/(\d{4})/);
  return match ? Number(match[1]) : null;
}

export function mapOpenLibraryBooksApiEntry(
  isbn: string,
  entry: OpenLibraryBooksApiEntry,
): BookSearchResult {
  const openLibraryKey =
    entry.key ?? entry.identifiers?.openlibrary?.[0] ?? `isbn:${isbn}`;
  return {
    sourceId: openLibraryKey,
    source: "openlibrary",
    openLibraryKey,
    googleBooksId: null,
    title: entry.title ?? "Untitled",
    authors: (entry.authors ?? [])
      .map((a) => a.name?.trim())
      .filter((name): name is string => Boolean(name)),
    coverUrl: entry.cover?.medium ?? entry.cover?.large ?? entry.cover?.small ?? null,
    isbn: entry.identifiers?.isbn_13?.[0] ?? entry.identifiers?.isbn_10?.[0] ?? isbn,
    year: parsePublishYear(entry.publish_date),
    description: null,
  };
}

export async function searchOpenLibrary(
  query: string,
  options?: {
    limit?: number;
    fetchImpl?: typeof fetch;
    beforeRequest?: () => Promise<void>;
  },
): Promise<BookSearchResult[]> {
  const q = query.trim();
  if (!q) return [];
  const limit = options?.limit ?? 10;
  const fetchImpl = options?.fetchImpl ?? fetch;
  const url = new URL("https://openlibrary.org/search.json");
  url.searchParams.set("q", q);
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("fields", "key,title,author_name,cover_i,isbn,first_publish_year");

  await options?.beforeRequest?.();
  const response = await fetchImpl(url.toString(), {
    headers: {
      Accept: "application/json",
      ...(process.env.OPEN_LIBRARY_CONTACT
        ? { "User-Agent": `StoryTurn (${process.env.OPEN_LIBRARY_CONTACT})` }
        : {}),
    },
    signal: AbortSignal.timeout(10000),
    next: { revalidate: 3600 },
  } as RequestInit);

  if (!response.ok) {
    throw new Error(`Open Library search failed (${response.status})`);
  }

  const data = (await response.json()) as { docs?: OpenLibraryDoc[] };
  return (data.docs ?? []).map(mapOpenLibraryDoc);
}

export interface OpenLibraryEdition {
  key: string;
  title: string;
  authors?: { key: string }[];
  works?: { key: string }[];
  covers?: number[];
  isbn_13?: string[];
  isbn_10?: string[];
  physical_format?: string;
  publishers?: string[];
  publish_date?: string;
  description?: unknown;
}
export type EditionResult = BookSearchResult &
  import("@/lib/book-edition").EditionMetadata & { editionKey: string };
export type EditionSummary = {
  editionKey: string;
  title: string;
  format: string | null;
  publisher: string | null;
  editionYear: string | null;
  isbn: string | null;
};
type LookupOptions = { fetchImpl?: typeof fetch; beforeRequest?: () => Promise<void> };
async function libraryJson(path: string, options: LookupOptions) {
  await options.beforeRequest?.();
  const response = await (options.fetchImpl ?? fetch)(`https://openlibrary.org${path}`, {
    headers: {
      Accept: "application/json",
      ...(process.env.OPEN_LIBRARY_CONTACT
        ? { "User-Agent": `StoryTurn (${process.env.OPEN_LIBRARY_CONTACT})` }
        : {}),
    },
    next: { revalidate: 86400 },
    signal: AbortSignal.timeout(10000),
  } as RequestInit);
  if (response.status === 404) return null;
  if (!response.ok)
    throw new Error("Book lookup is temporarily unavailable. Please retry.");
  return response.json();
}
export async function mapEdition(
  edition: OpenLibraryEdition,
  options: LookupOptions,
  scannedIsbn?: string,
): Promise<EditionResult> {
  if (!/^\/books\/OL\d+M$/.test(edition.key) || typeof edition.title !== "string")
    throw new Error("Book metadata is incomplete. Try title search.");
  let authors = edition.authors ?? [];
  let description = plainBookDescription(edition.description);
  const workKey = edition.works?.find((w) => /^\/works\/OL\d+W$/.test(w.key))?.key ?? "";
  if (workKey && (authors.length === 0 || !description)) {
    const work = await libraryJson(`${workKey}.json`, options);
    if (authors.length === 0) {
      authors =
        work?.authors?.map((entry: { author: { key: string } }) => entry.author) ?? [];
    }
    description = description ?? plainBookDescription(work?.description);
  }
  const names: string[] = [];
  for (const author of authors.slice(0, 4)) {
    if (!/^\/authors\/OL\d+A$/.test(author.key)) continue;
    const data = await libraryJson(`${author.key}.json`, options);
    if (typeof data?.name === "string") names.push(data.name);
  }
  const { normalizeIsbn } = await import("@/lib/isbn");
  const isbn =
    scannedIsbn ??
    [...(edition.isbn_13 ?? []), ...(edition.isbn_10 ?? [])]
      .map(normalizeIsbn)
      .find(Boolean) ??
    null;
  return {
    sourceId: edition.key,
    source: "openlibrary" as const,
    googleBooksId: null,
    title: edition.title,
    authors: names,
    openLibraryKey: workKey,
    editionKey: edition.key,
    isbn,
    coverUrl: edition.covers?.find((id) => id > 0)
      ? `https://covers.openlibrary.org/b/id/${edition.covers.find((id) => id > 0)}-M.jpg`
      : null,
    year: null,
    format: edition.physical_format?.trim() || null,
    publisher: edition.publishers?.join(", ") || null,
    editionYear: edition.publish_date || null,
    description,
  };
}
export async function lookupIsbn(
  value: string,
  options: LookupOptions = {},
): Promise<EditionResult | null> {
  const { normalizeIsbn } = await import("@/lib/isbn");
  const isbn = normalizeIsbn(value);
  if (!isbn) throw new Error("Enter a valid ISBN-10 or ISBN-13.");
  const edition = await libraryJson(`/isbn/${isbn}.json`, options);
  return edition ? mapEdition(edition, options, isbn) : null;
}
export async function getWorkEditions(
  workKey: string,
  offset = 0,
  options: LookupOptions = {},
): Promise<{ entries: EditionSummary[]; hasMore: boolean }> {
  if (
    !/^\/works\/OL\d+W$/.test(workKey) ||
    !Number.isInteger(offset) ||
    offset < 0 ||
    offset > 1000
  )
    throw new Error("Invalid edition request");
  const data = await libraryJson(
    `${workKey}/editions.json?limit=10&offset=${offset}`,
    options,
  );
  return {
    entries: (data?.entries ?? [])
      .map((e: OpenLibraryEdition) => ({
        editionKey: e.key,
        title: e.title,
        format: e.physical_format || null,
        publisher: e.publishers?.join(", ") || null,
        editionYear: e.publish_date || null,
        isbn: e.isbn_13?.[0] ?? e.isbn_10?.[0] ?? null,
      }))
      .filter((e: { editionKey: string }) => /^\/books\/OL\d+M$/.test(e.editionKey)),
    hasMore: offset + 10 < (data?.size ?? 0),
  };
}
export async function lookupEdition(key: string, options: LookupOptions = {}) {
  if (!/^\/books\/OL\d+M$/.test(key)) throw new Error("Choose a valid edition");
  const data = await libraryJson(`${key}.json`, options);
  return data ? mapEdition(data, options) : null;
}

/** Lookup a single edition by ISBN via Open Library Books API. */
export async function lookupOpenLibraryByIsbn(
  isbn: string,
  options?: { fetchImpl?: typeof fetch },
): Promise<BookSearchResult | null> {
  const cleaned = isbn.trim();
  if (!cleaned) return null;
  const fetchImpl = options?.fetchImpl ?? fetch;
  const url = new URL("https://openlibrary.org/api/books");
  url.searchParams.set("bibkeys", `ISBN:${cleaned}`);
  url.searchParams.set("format", "json");
  url.searchParams.set("jscmd", "data");

  const response = await fetchImpl(url.toString(), {
    headers: { Accept: "application/json" },
    next: { revalidate: 3600 },
  } as RequestInit);

  if (!response.ok) {
    throw new Error(`Open Library ISBN lookup failed (${response.status})`);
  }

  const data = (await response.json()) as Record<
    string,
    OpenLibraryBooksApiEntry | undefined
  >;
  const entry = data[`ISBN:${cleaned}`];
  if (!entry?.title) return null;
  return mapOpenLibraryBooksApiEntry(cleaned, entry);
}
