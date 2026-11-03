import { describe, expect, it } from "vitest";
import {
  bookCodeKey,
  bookMetadataScore,
  checkForDuplicate,
  isLikelySameBook,
  mergeKeptBook,
  normalizeTitleKey,
  recommendKeep,
  type BookInput,
} from "@/lib/domain/book-duplicates";
import type { Book } from "@/lib/types";

function book(overrides: Partial<Book> = {}): Book {
  return {
    id: "book_1",
    familyId: "fam_1",
    title: "Goodnight Moon",
    authors: ["Margaret Wise Brown"],
    openLibraryKey: null,
    coverUrl: null,
    isbn: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function input(overrides: Partial<BookInput> = {}): BookInput {
  return {
    title: "Goodnight Moon",
    authors: ["Margaret Wise Brown"],
    openLibraryKey: null,
    coverUrl: null,
    isbn: null,
    ...overrides,
  };
}

describe("bookCodeKey", () => {
  it("maps ISBN-10, ISBN-13, and hyphenated forms to one ISBN-13", () => {
    expect(bookCodeKey("0-316-76948-7")).toBe("9780316769488");
    expect(bookCodeKey("9780316769488")).toBe("9780316769488");
    expect(bookCodeKey("978-0-316-76948-8")).toBe("9780316769488");
  });

  it("keeps non-Bookland UPCs as scanned", () => {
    expect(bookCodeKey("012345678905")).toBe("012345678905");
  });

  it("ignores provider ids that are not barcodes", () => {
    expect(bookCodeKey("UOM:39015012345678")).toBeNull();
    expect(bookCodeKey(null)).toBeNull();
  });
});

describe("mergeKeptBook", () => {
  it("keeps the chosen copy and fills gaps from the other", () => {
    expect(
      mergeKeptBook(
        input({ coverUrl: "https://x/new.jpg", authors: [] }),
        input({ isbn: "9780060775858", openLibraryKey: "/works/OL1W" }),
      ),
    ).toEqual(
      input({
        coverUrl: "https://x/new.jpg",
        isbn: "9780060775858",
        openLibraryKey: "/works/OL1W",
        description: null,
      }),
    );
  });
});

describe("normalizeTitleKey", () => {
  it("ignores case, punctuation, leading articles, subtitles, and editions", () => {
    expect(normalizeTitleKey("The Very Hungry Caterpillar")).toBe(
      normalizeTitleKey("very hungry caterpillar (Board Book)"),
    );
    expect(normalizeTitleKey("Goodnight Moon: 75th Anniversary Edition")).toBe(
      "goodnight moon",
    );
    expect(normalizeTitleKey("Frog & Toad")).toBe("frog and toad");
  });
});

describe("isLikelySameBook", () => {
  it("matches same title with matching author in another format", () => {
    expect(isLikelySameBook(book(), input({ authors: ["Brown, Margaret Wise"] }))).toBe(
      true,
    );
    expect(isLikelySameBook(book(), input({ authors: ["Margaret Brown"] }))).toBe(true);
  });

  it("does not match same title by a different author", () => {
    expect(
      isLikelySameBook(
        book({ title: "Home", authors: ["Carson Ellis"] }),
        input({ title: "Home", authors: ["Matt de la Peña"] }),
      ),
    ).toBe(false);
  });

  it("matches on title alone when either side has no authors", () => {
    expect(isLikelySameBook(book({ authors: [] }), input())).toBe(true);
  });
});

describe("recommendKeep", () => {
  it("prefers the copy with a cover thumbnail", () => {
    expect(
      recommendKeep(
        book({ isbn: "9780060775858" }),
        input({ coverUrl: "https://x/c.jpg" }),
      ),
    ).toBe("incoming");
    expect(
      recommendKeep(
        book({ coverUrl: "https://x/c.jpg" }),
        input({ isbn: "9780060775858" }),
      ),
    ).toBe("existing");
  });

  it("keeps the existing book on a tie", () => {
    expect(recommendKeep(book(), input())).toBe("existing");
  });

  it("prefers a copy that adds a description when other details match", () => {
    expect(recommendKeep(book(), input({ description: "A bunny says goodnight." }))).toBe(
      "incoming",
    );
  });

  it("fills a missing description from the other copy", () => {
    expect(
      mergeKeptBook(input(), input({ description: "A bunny says goodnight." }))
        .description,
    ).toBe("A bunny says goodnight.");
  });

  it("scores cover above ISBN, authors, description, and Open Library key combined", () => {
    expect(bookMetadataScore(input({ coverUrl: "c", authors: [] }))).toBeGreaterThan(
      bookMetadataScore(
        input({
          isbn: "9780060775858",
          openLibraryKey: "/works/OL1W",
          description: "A bunny says goodnight.",
        }),
      ),
    );
  });
});

describe("checkForDuplicate", () => {
  it("flags same barcode against the earliest matching book", () => {
    const library = [
      book({ id: "later", isbn: "9780316769488", createdAt: "2026-02-01T00:00:00.000Z" }),
      book({ id: "earlier", isbn: "0316769487", createdAt: "2026-01-01T00:00:00.000Z" }),
    ];
    const result = checkForDuplicate(
      library,
      input({ title: "Anything", isbn: "9780316769488" }),
    );
    expect(result).toEqual({ kind: "same_isbn", existing: library[1] });
  });

  it("returns title candidates when the barcode differs", () => {
    const existing = book({ isbn: "9780060775858" });
    const result = checkForDuplicate([existing], input({ isbn: "9780694003617" }));
    expect(result).toEqual({
      kind: "same_title",
      candidates: [{ existing, recommended: "existing" }],
    });
  });

  it("treats identical non-barcode provider ids as the same book", () => {
    const existing = book({ isbn: "UOM:39015012345678" });
    expect(
      checkForDuplicate(
        [existing],
        input({ title: "Other", isbn: " UOM:39015012345678 " }),
      ),
    ).toEqual({ kind: "same_isbn", existing });
  });

  it("returns none for a new book", () => {
    expect(
      checkForDuplicate([book()], input({ title: "Corduroy", authors: ["Don Freeman"] })),
    ).toEqual({
      kind: "none",
    });
  });
});
