import type { Book } from "@/lib/types";
export type EditionMetadata = {
  editionKey?: string | null;
  format?: string | null;
  publisher?: string | null;
  editionYear?: string | null;
};
export type BookInput = Pick<
  Book,
  "title" | "authors" | "openLibraryKey" | "coverUrl" | "isbn" | "description"
> &
  EditionMetadata;
export type SaveBookResult = { book: Book; created: boolean };
export type RemoveBookResult = {
  id: string;
  status: "removed" | "referenced" | "unavailable";
};
export function editionLabel(book: EditionMetadata & { isbn?: string | null }) {
  return [book.format, book.publisher, book.editionYear, book.isbn]
    .filter(Boolean)
    .join(" · ");
}
