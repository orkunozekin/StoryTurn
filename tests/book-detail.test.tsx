// @vitest-environment jsdom
import { createElement } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { BookDetail } from "@/components/book-detail";
import type { Book } from "@/lib/types";

afterEach(cleanup);

function book(overrides: Partial<Book> = {}): Book {
  return {
    id: "book_moon",
    familyId: "fam_demo",
    title: "Goodnight Moon",
    authors: ["Margaret Wise Brown"],
    openLibraryKey: "/works/OL45804W",
    coverUrl: "https://covers.openlibrary.org/b/id/8739161-M.jpg",
    isbn: "9780060775858",
    format: "Hardcover",
    publisher: "Harper",
    editionYear: "1947",
    editionKey: "/books/OL1M",
    description: "A little bunny says goodnight.",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

it("shows the cover, edition details, and description", () => {
  const { container } = render(createElement(BookDetail, { book: book() }));
  expect(screen.getByRole("heading", { level: 1, name: "Goodnight Moon" })).toBeTruthy();
  expect(screen.getByText("Margaret Wise Brown")).toBeTruthy();
  expect(screen.getByText("Harper")).toBeTruthy();
  expect(screen.getByText("9780060775858")).toBeTruthy();
  expect(screen.getByText("A little bunny says goodnight.")).toBeTruthy();
  expect(container.querySelector("img")?.getAttribute("src")).toContain("8739161-M.jpg");
});

it("explains when no description was saved", () => {
  render(
    createElement(BookDetail, { book: book({ description: null, coverUrl: null }) }),
  );
  expect(screen.getByText("No description was saved for this book.")).toBeTruthy();
  expect(screen.queryByRole("img")).toBeNull();
  expect(screen.getByText("G")).toBeTruthy();
});
