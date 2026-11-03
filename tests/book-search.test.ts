// @vitest-environment jsdom
import { createElement } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BookSearch } from "@/components/book-search";
import { CopyInviteLink } from "@/components/copy-invite-link";
import { searchBooksAction } from "@/app/actions";
import { lookupBookByCode, searchBooks } from "@/lib/book-search";

vi.mock("@/app/actions", () => ({ addBookAction: vi.fn(), searchBooksAction: vi.fn() }));
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  delete process.env.GOOGLE_BOOKS_API_KEY;
});

it("requires a concrete edition before adding a work search result", async () => {
  vi.mocked(searchBooksAction).mockResolvedValue([
    {
      sourceId: "/works/OL1W",
      source: "openlibrary",
      openLibraryKey: "/works/OL1W",
      googleBooksId: null,
      title: "Book",
      authors: [],
      coverUrl: null,
      isbn: null,
      year: null,
      description: null,
    },
  ]);
  render(createElement(BookSearch, { collectionKeys: [] }));
  fireEvent.change(screen.getByRole("textbox", { name: "Search books" }), {
    target: { value: "book" },
  });
  await screen.findByRole("button", { name: "Choose edition" });
  expect(screen.queryByRole("button", { name: "Add to library" })).toBeNull();
});

it("copies a full invite URL and reports clipboard failures", async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });
  render(createElement(CopyInviteLink, { code: "FAMILY24" }));
  fireEvent.click(screen.getByRole("button", { name: "Copy invite link" }));
  await screen.findByRole("button", { name: "Copied!" });
  expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/join?code=FAMILY24`);
  writeText.mockRejectedValue(new Error("Denied"));
  fireEvent.click(screen.getByRole("button", { name: "Copied!" }));
  await screen.findByText("Could not copy. Please try again.");
});

it("debounces typing and ignores stale responses after clearing the input", async () => {
  vi.useFakeTimers();
  vi.mocked(searchBooksAction).mockClear();
  let resolve!: (books: Awaited<ReturnType<typeof searchBooksAction>>) => void;
  vi.mocked(searchBooksAction).mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  try {
    render(createElement(BookSearch, { collectionKeys: [] }));
    const input = screen.getByRole("textbox", { name: "Search books" });
    fireEvent.change(input, { target: { value: "cat" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    fireEvent.change(input, { target: { value: "cats" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(349);
    });
    expect(searchBooksAction).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(searchBooksAction).toHaveBeenCalledExactlyOnceWith("cats");
    expect(screen.getByRole("status").textContent).toBe("Searching…");
    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
    expect((input as HTMLInputElement).value).toBe("");
    expect(document.activeElement).toBe(input);
    await act(async () => {
      resolve([
        {
          sourceId: "/works/stale",
          source: "openlibrary",
          openLibraryKey: "/works/stale",
          googleBooksId: null,
          title: "Stale",
          authors: [],
          coverUrl: null,
          isbn: null,
          year: null,
          description: null,
        },
      ]);
    });
    expect(screen.queryByText("Stale")).toBeNull();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(350);
    });
    expect(searchBooksAction).toHaveBeenCalledTimes(1);
  } finally {
    vi.useRealTimers();
  }
});

it("skips short searches and displays errors after loading", async () => {
  vi.useFakeTimers();
  vi.mocked(searchBooksAction).mockClear();
  let reject!: (error: Error) => void;
  vi.mocked(searchBooksAction).mockImplementation(
    () =>
      new Promise((_, fail) => {
        reject = fail;
      }),
  );
  try {
    render(createElement(BookSearch, { collectionKeys: [] }));
    const input = screen.getByRole("textbox", { name: "Search books" });
    fireEvent.change(input, { target: { value: " a " } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(350);
    });
    expect(searchBooksAction).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: " ab " } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(350);
    });
    expect(searchBooksAction).toHaveBeenCalledExactlyOnceWith("ab");
    expect(screen.getByRole("status").textContent).toBe("Searching…");
    await act(async () => {
      reject(new Error("Search service unavailable"));
    });
    expect(screen.getByText("Search service unavailable")).toBeTruthy();
    expect(screen.queryByRole("status")).toBeNull();
  } finally {
    vi.useRealTimers();
  }
});

describe("lookupBookByCode waterfall", () => {
  it("prefers Google Books when an API key is configured", async () => {
    process.env.GOOGLE_BOOKS_API_KEY = "test-key";
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [
          {
            id: "g1",
            volumeInfo: {
              title: "Modern Kids Book",
              authors: ["A Author"],
              industryIdentifiers: [
                { type: "ISBN_13", identifier: "9780060775858" },
              ],
            },
          },
        ],
      }),
    });

    const book = await lookupBookByCode("9780060775858", { fetchImpl });
    expect(book?.source).toBe("google");
    expect(book?.title).toBe("Modern Kids Book");
    expect(book?.googleBooksId).toBe("g1");
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(String(fetchImpl.mock.calls[0]?.[0])).toContain("googleapis.com");
  });

  it("falls back to Open Library ISBN when Google is unset", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        "ISBN:9780060775858": {
          title: "Goodnight Moon",
          authors: [{ name: "Margaret Wise Brown" }],
          key: "/books/OL1M",
          identifiers: { isbn_13: ["9780060775858"] },
        },
      }),
    });

    const book = await lookupBookByCode("978-0-06-077585-8", {
      fetchImpl,
      googleApiKey: null,
    });
    expect(book?.source).toBe("openlibrary");
    expect(book?.title).toBe("Goodnight Moon");
    expect(String(fetchImpl.mock.calls[0]?.[0])).toContain(
      "openlibrary.org/api/books",
    );
  });

  it("falls back to Open Library text search after ISBN miss", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          docs: [
            {
              key: "/works/OL1W",
              title: "Goodnight Moon",
              author_name: ["Margaret Wise Brown"],
              isbn: ["9780060775858"],
            },
          ],
        }),
      });

    const book = await lookupBookByCode("9780060775858", {
      fetchImpl,
      googleApiKey: null,
    });
    expect(book?.title).toBe("Goodnight Moon");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(String(fetchImpl.mock.calls[1]?.[0])).toContain("search.json");
  });

  it("normalizes ISBN-10 before Google lookup", async () => {
    process.env.GOOGLE_BOOKS_API_KEY = "test-key";
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ items: [] }),
    });

    await lookupBookByCode("0060775854", { fetchImpl });
    expect(String(fetchImpl.mock.calls[0]?.[0])).toContain(
      "isbn%3A9780060775858",
    );
  });
});

describe("searchBooks routing", () => {
  it("routes barcode queries through code lookup", async () => {
    process.env.GOOGLE_BOOKS_API_KEY = "test-key";
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [
          {
            id: "g2",
            volumeInfo: { title: "From Barcode", authors: ["X"] },
          },
        ],
      }),
    });

    const results = await searchBooks("9780060775858", { fetchImpl });
    expect(results).toHaveLength(1);
    expect(results[0]?.title).toBe("From Barcode");
    expect(String(fetchImpl.mock.calls[0]?.[0])).toContain("isbn%3A");
  });

  it("backfills the scanned ISBN when Google omits industryIdentifiers", async () => {
    process.env.GOOGLE_BOOKS_API_KEY = "test-key";
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [
          {
            id: "g-no-isbn",
            volumeInfo: { title: "Missing Identifiers", authors: ["Z"] },
          },
        ],
      }),
    });

    const book = await lookupBookByCode("978-0-06-077585-8", { fetchImpl });
    expect(book?.source).toBe("google");
    expect(book?.title).toBe("Missing Identifiers");
    expect(book?.isbn).toBe("9780060775858");
  });

  it("uses Open Library text search without a Google key", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        docs: [{ key: "/works/OL1W", title: "Goodnight Moon" }],
      }),
    });

    const results = await searchBooks("goodnight moon", {
      fetchImpl,
      googleApiKey: null,
    });
    expect(results[0]?.title).toBe("Goodnight Moon");
    expect(String(fetchImpl.mock.calls[0]?.[0])).toContain("search.json");
  });

  it("prefers Google text search when configured", async () => {
    process.env.GOOGLE_BOOKS_API_KEY = "test-key";
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [
          {
            id: "g3",
            volumeInfo: { title: "Google Hit", authors: ["Y"] },
          },
        ],
      }),
    });

    const results = await searchBooks("goodnight moon", { fetchImpl });
    expect(results[0]?.source).toBe("google");
    expect(results[0]?.title).toBe("Google Hit");
  });
});
