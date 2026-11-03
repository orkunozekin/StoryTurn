import { describe, expect, it } from "vitest";
import { plainBookDescription } from "@/lib/book-description";
import { mapGoogleBooksVolume } from "@/lib/google-books";

describe("plainBookDescription", () => {
  it("strips HTML and keeps paragraph breaks", () => {
    expect(
      plainBookDescription("<p>A bunny says goodnight.</p><p>The room is green.</p>"),
    ).toBe("A bunny says goodnight.\n\nThe room is green.");
  });

  it("reads Open Library description objects and decodes entities", () => {
    expect(plainBookDescription({ type: "/type/text", value: "Moon &amp; room" })).toBe(
      "Moon & room",
    );
  });

  it("returns null for empty markup", () => {
    expect(plainBookDescription("<p> </p>")).toBeNull();
    expect(plainBookDescription(null)).toBeNull();
  });
});

describe("mapGoogleBooksVolume", () => {
  it("keeps a plain description with the other mapped fields", () => {
    expect(
      mapGoogleBooksVolume({
        id: "vol1",
        volumeInfo: {
          title: "Goodnight Moon",
          authors: ["Margaret Wise Brown"],
          description: "<p>A bunny says goodnight.</p>",
          publishedDate: "1947-09",
          imageLinks: { thumbnail: "http://books.google.com/cover.jpg" },
          industryIdentifiers: [{ type: "ISBN_13", identifier: "9780060775858" }],
        },
      }),
    ).toMatchObject({
      source: "google",
      googleBooksId: "vol1",
      title: "Goodnight Moon",
      description: "A bunny says goodnight.",
      year: 1947,
      isbn: "9780060775858",
      coverUrl: "https://books.google.com/cover.jpg",
    });
  });
});
