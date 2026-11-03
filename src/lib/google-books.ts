import { plainBookDescription } from "@/lib/book-description";
import type { BookSearchResult } from "@/lib/open-library";

export interface GoogleBooksVolume {
  id: string;
  volumeInfo?: {
    title?: string;
    authors?: string[];
    publishedDate?: string;
    description?: string;
    imageLinks?: {
      thumbnail?: string;
      smallThumbnail?: string;
    };
    industryIdentifiers?: Array<{
      type?: string;
      identifier?: string;
    }>;
  };
}

function googleBooksApiKey(): string | undefined {
  const key = process.env.GOOGLE_BOOKS_API_KEY?.trim();
  return key || undefined;
}

export function isGoogleBooksConfigured(): boolean {
  return Boolean(googleBooksApiKey());
}

function pickIsbn(
  identifiers?: Array<{ type?: string; identifier?: string }>,
): string | null {
  if (!identifiers?.length) return null;
  const isbn13 = identifiers.find((id) => id.type === "ISBN_13")?.identifier;
  if (isbn13) return isbn13;
  const isbn10 = identifiers.find((id) => id.type === "ISBN_10")?.identifier;
  return isbn10 ?? identifiers[0]?.identifier ?? null;
}

function parseYear(publishedDate?: string): number | null {
  if (!publishedDate) return null;
  const match = publishedDate.match(/^(\d{4})/);
  return match ? Number(match[1]) : null;
}

export function mapGoogleBooksVolume(volume: GoogleBooksVolume): BookSearchResult {
  const info = volume.volumeInfo ?? {};
  const thumb = info.imageLinks?.thumbnail ?? info.imageLinks?.smallThumbnail ?? null;
  return {
    sourceId: `google:${volume.id}`,
    source: "google",
    openLibraryKey: null,
    googleBooksId: volume.id,
    title: info.title ?? "Untitled",
    authors: info.authors ?? [],
    coverUrl: thumb ? thumb.replace(/^http:/, "https:") : null,
    isbn: pickIsbn(info.industryIdentifiers),
    year: parseYear(info.publishedDate),
    description: plainBookDescription(info.description),
  };
}

async function fetchGoogleVolumes(
  q: string,
  options?: { limit?: number; fetchImpl?: typeof fetch; apiKey?: string | null },
): Promise<BookSearchResult[]> {
  const key = options?.apiKey === undefined ? googleBooksApiKey() : options.apiKey;
  if (!key) return [];

  const limit = options?.limit ?? 10;
  const fetchImpl = options?.fetchImpl ?? fetch;
  const url = new URL("https://www.googleapis.com/books/v1/volumes");
  url.searchParams.set("q", q);
  url.searchParams.set("maxResults", String(Math.min(limit, 40)));
  url.searchParams.set("key", key);

  const response = await fetchImpl(url.toString(), {
    headers: { Accept: "application/json" },
    next: { revalidate: 3600 },
  } as RequestInit);

  if (!response.ok) {
    throw new Error(`Google Books search failed (${response.status})`);
  }

  const data = (await response.json()) as { items?: GoogleBooksVolume[] };
  return (data.items ?? []).map(mapGoogleBooksVolume);
}

export async function lookupGoogleBooksByIsbn(
  isbn: string,
  options?: { limit?: number; fetchImpl?: typeof fetch; apiKey?: string | null },
): Promise<BookSearchResult[]> {
  const cleaned = isbn.trim();
  if (!cleaned) return [];
  return fetchGoogleVolumes(`isbn:${cleaned}`, options);
}

export async function searchGoogleBooks(
  query: string,
  options?: { limit?: number; fetchImpl?: typeof fetch; apiKey?: string | null },
): Promise<BookSearchResult[]> {
  const q = query.trim();
  if (!q) return [];
  return fetchGoogleVolumes(q, options);
}
