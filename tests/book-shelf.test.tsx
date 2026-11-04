// @vitest-environment jsdom
import { createElement } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { BookShelf } from "@/components/book-shelf";
import { SHELF_PAGE_SIZE, matchesQuery, spineAuthor, spineLook } from "@/lib/shelf";
import type { Book } from "@/lib/types";

vi.mock("@/app/book-actions", () => ({
  removeBooksAction: vi.fn(),
  correctFormatAction: vi.fn(),
}));

afterEach(cleanup);

const book = (
  id: string,
  title: string,
  authors: string[],
  format: string | null = null,
): Book => ({
  id,
  title,
  authors,
  format,
  familyId: "family",
  isbn: null,
  openLibraryKey: null,
  coverUrl: null,
  createdAt: "",
});

const books = [
  book("a", "The Gruffalo", ["Julia Donaldson"], "Board book"),
  book("b", "Owl Babies", ["Martin Waddell"], "Paperback"),
  book("c", "Stick Man", ["Julia Donaldson"], "Paperback"),
];

const spine = (title: string) =>
  screen.getByText(title).closest("a") as HTMLAnchorElement;

it("matches titles and authors case-insensitively", () => {
  expect(matchesQuery(books[0]!, "gruff")).toBe(true);
  expect(matchesQuery(books[0]!, "JULIA")).toBe(true);
  expect(matchesQuery(books[1]!, "julia")).toBe(false);
  expect(matchesQuery(books[1]!, "  ")).toBe(true);
});

it("gives each book a stable spine look", () => {
  expect(spineLook(books[0]!)).toEqual(spineLook(books[0]!));
  const { length, tilt } = spineLook(books[1]!);
  expect(length).toBeGreaterThanOrEqual(170);
  expect(length).toBeLessThan(230);
  expect(Math.abs(tilt)).toBeLessThanOrEqual(2);
});

it("fades books that do not match the search and keeps them out of the tab order", () => {
  render(createElement(BookShelf, { books }));
  fireEvent.change(screen.getByLabelText("Search your shelf"), {
    target: { value: "julia" },
  });
  expect(spine("The Gruffalo").className).not.toContain("is-dimmed");
  expect(spine("Stick Man").className).not.toContain("is-dimmed");
  expect(spine("Owl Babies").className).toContain("is-dimmed");
  expect(spine("Owl Babies").tabIndex).toBe(-1);
});

it("combines format chips with the search and explains an empty result", () => {
  render(createElement(BookShelf, { books }));
  fireEvent.click(screen.getByRole("button", { name: "Paperback" }));
  expect(spine("The Gruffalo").className).toContain("is-dimmed");
  fireEvent.change(screen.getByLabelText("Search your shelf"), {
    target: { value: "gruffalo" },
  });
  expect(screen.getByRole("status").textContent).toContain(
    "No “gruffalo” on your shelf yet.",
  );
});

it("links each spine to its book and switches to the list view", () => {
  render(createElement(BookShelf, { books }));
  expect(spine("Owl Babies").getAttribute("href")).toBe("/library/b");
  fireEvent.click(screen.getByRole("button", { name: "List" }));
  expect(screen.getByRole("checkbox", { name: /Select Owl Babies/ })).toBeTruthy();
});

it("shows an empty-shelf message", () => {
  render(createElement(BookShelf, { books: [] }));
  expect(screen.getByText(/Your shelf is empty/)).toBeTruthy();
});

it("clears list selections when the filter changes so hidden books are never removed", () => {
  render(createElement(BookShelf, { books }));
  fireEvent.click(screen.getByRole("button", { name: "List" }));
  fireEvent.click(screen.getByRole("checkbox", { name: /Select Owl Babies/ }));
  expect(screen.getByRole("button", { name: /Remove selected \(1\)/ })).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Search your shelf"), {
    target: { value: "julia" },
  });
  expect(screen.queryByRole("button", { name: /Remove selected/ })).toBeNull();
});

it("falls back to All when the selected format no longer exists", () => {
  const { rerender } = render(createElement(BookShelf, { books }));
  fireEvent.click(screen.getByRole("button", { name: "Board Book" }));
  expect(spine("Owl Babies").className).toContain("is-dimmed");
  rerender(createElement(BookShelf, { books: books.filter((b) => b.id !== "a") }));
  expect(spine("Owl Babies").className).not.toContain("is-dimmed");
  expect(spine("Stick Man").className).not.toContain("is-dimmed");
});

it("treats formats with different capitalisation or spacing as one", () => {
  const mixed = [
    book("a", "Wacky Wednesday", [], "paperback"),
    book("b", "Don't Trust Fish!", [], "Paperback"),
    book("c", "Together", [], " PAPERBACK "),
    book("d", "Animal Families", [], "hardcover"),
  ];
  render(createElement(BookShelf, { books: mixed }));
  const chips = screen.getAllByRole("button").filter((b) => b.className.includes("chip"));
  expect(chips.map((c) => c.textContent)).toEqual(["All", "Hardcover", "Paperback"]);
  fireEvent.click(screen.getByRole("button", { name: "Paperback" }));
  expect(spine("Wacky Wednesday").className).not.toContain("is-dimmed");
  expect(spine("Don't Trust Fish!").className).not.toContain("is-dimmed");
  expect(spine("Together").className).not.toContain("is-dimmed");
  expect(spine("Animal Families").className).toContain("is-dimmed");
});

it("prints the first author's surname on the spine", () => {
  expect(spineAuthor(["Julia Donaldson", "Axel Scheffler"])).toBe("Donaldson");
  expect(spineAuthor(["Dr. Seuss "])).toBe("Seuss");
  expect(spineAuthor([])).toBe("");
});

const many = Array.from({ length: SHELF_PAGE_SIZE + 5 }, (_, i) =>
  book(`m${i}`, `Book ${i}`, [i === SHELF_PAGE_SIZE + 2 ? "Late Author" : "Someone"]),
);

it("pages through a long shelf", () => {
  render(createElement(BookShelf, { books: many }));
  expect(screen.getByText("Book 0")).toBeTruthy();
  expect(screen.queryByText(`Book ${SHELF_PAGE_SIZE}`)).toBeNull();
  expect(screen.getByText(`1–${SHELF_PAGE_SIZE} of ${many.length} books`)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  expect(screen.queryByText("Book 0")).toBeNull();
  expect(screen.getByText(`Book ${SHELF_PAGE_SIZE}`)).toBeTruthy();
  expect(
    screen.getByRole("button", { name: "Page 2" }).getAttribute("aria-current"),
  ).toBe("page");
});

it("hides pagination when everything fits on one page", () => {
  render(createElement(BookShelf, { books }));
  expect(screen.queryByRole("navigation", { name: "Shelf pages" })).toBeNull();
});

it("jumps to the page holding the first match when searching the shelf", () => {
  render(createElement(BookShelf, { books: many }));
  fireEvent.change(screen.getByLabelText("Search your shelf"), {
    target: { value: "late author" },
  });
  const match = spine(`Book ${SHELF_PAGE_SIZE + 2}`);
  expect(match.className).not.toContain("is-dimmed");
  expect(
    screen.getByRole("button", { name: "Page 2" }).getAttribute("aria-current"),
  ).toBe("page");
});

it("pages only the matching books in the list view", () => {
  render(createElement(BookShelf, { books: many }));
  fireEvent.click(screen.getByRole("button", { name: "List" }));
  expect(screen.getByRole("navigation", { name: "Shelf pages" })).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Search your shelf"), {
    target: { value: "late author" },
  });
  expect(screen.queryByRole("navigation", { name: "Shelf pages" })).toBeNull();
  expect(
    screen.getByRole("checkbox", {
      name: new RegExp(`Select Book ${SHELF_PAGE_SIZE + 2}`),
    }),
  ).toBeTruthy();
});
