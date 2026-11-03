// @vitest-environment jsdom
import { createElement } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { LibraryCollection } from "@/components/library-collection";
import { BookEditions } from "@/components/book-editions";
import {
  removeBooksAction,
  correctFormatAction,
  editionsAction,
  addEditionAction,
} from "@/app/book-actions";
vi.mock("@/app/book-actions", () => ({
  removeBooksAction: vi.fn(),
  correctFormatAction: vi.fn(),
  editionsAction: vi.fn(),
  addEditionAction: vi.fn(),
}));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
const books = [
  {
    id: "one",
    title: "First",
    authors: [],
    familyId: "family",
    isbn: null,
    openLibraryKey: null,
    coverUrl: null,
    createdAt: "",
  },
  {
    id: "two",
    title: "Second",
    authors: [],
    familyId: "family",
    isbn: null,
    openLibraryKey: null,
    coverUrl: null,
    createdAt: "",
  },
];
it("requires confirmation for bulk removal and explains books retained for history", async () => {
  vi.mocked(removeBooksAction).mockResolvedValue([
    { id: "one", status: "removed" },
    { id: "two", status: "referenced" },
  ]);
  render(createElement(LibraryCollection, { books }));
  fireEvent.click(screen.getByRole("button", { name: "Select all" }));
  fireEvent.click(screen.getByRole("button", { name: "Remove selected (2)" }));
  expect(removeBooksAction).not.toHaveBeenCalled();
  fireEvent.click(await screen.findByRole("button", { name: "Remove books" }));
  await waitFor(() => expect(removeBooksAction).toHaveBeenCalledWith(["one", "two"]));
  await screen.findByText(/Kept because used in reading sessions: Second/);
});
it("lets a user fill missing format without sending identity fields", async () => {
  vi.mocked(correctFormatAction).mockResolvedValue(undefined);
  render(createElement(LibraryCollection, { books: [books[0]] }));
  expect(screen.queryByRole("textbox", { name: "Format for First" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Edit format for First" }));
  fireEvent.change(await screen.findByRole("textbox", { name: "Format for First" }), {
    target: { value: "Paperback" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Set format" }));
  await waitFor(() =>
    expect(correctFormatAction).toHaveBeenCalledWith("one", "Paperback"),
  );
});
it("adds concrete editions separately and keeps failed saves retryable", async () => {
  vi.mocked(editionsAction).mockResolvedValue({
    entries: [
      {
        editionKey: "/books/OL1M",
        title: "Book",
        format: "Hardcover",
        publisher: null,
        editionYear: null,
        isbn: null,
      },
      {
        editionKey: "/books/OL2M",
        title: "Book",
        format: "Paperback",
        publisher: null,
        editionYear: null,
        isbn: null,
      },
    ],
    hasMore: false,
  });
  vi.mocked(addEditionAction).mockResolvedValue({ ok: false, error: "Try again" });
  render(
    createElement(BookEditions, {
      workKey: "/works/OL1W",
      collectionKeys: ["/books/OL1M"],
    }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Choose edition" }));
  await screen.findByText("Paperback");
  fireEvent.click(screen.getByRole("button", { name: "Collapse editions" }));
  expect(screen.queryByText("Paperback")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Show editions" }));
  expect(editionsAction).toHaveBeenCalledTimes(1);
  expect(
    (screen.getByRole("button", { name: "In collection" }) as HTMLButtonElement).disabled,
  ).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Add to library" }));
  await screen.findByText("Try again");
  expect(addEditionAction).toHaveBeenCalledWith("/books/OL2M");
  expect(
    (screen.getByRole("button", { name: "Add to library" }) as HTMLButtonElement)
      .disabled,
  ).toBe(false);
});

it("omits empty metadata and empty parentheses from collection labels", () => {
  const { container } = render(createElement(LibraryCollection, { books: [books[0]] }));
  expect(
    screen.getByRole("checkbox", { name: "Select First" }),
  ).toBeTruthy();
  expect(screen.getByRole("link", { name: /First/ }).getAttribute("href")).toBe(
    "/library/one",
  );
  expect(
    [...container.querySelectorAll("p")].every((line) => !!line.textContent?.trim()),
  ).toBe(true);
});
