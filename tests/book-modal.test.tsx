// @vitest-environment jsdom
import { createElement } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { BookModal } from "@/components/book-modal";

vi.mock("next/navigation", () => ({ useRouter: () => ({ back: vi.fn() }) }));

afterEach(cleanup);

const book = {
  id: "a",
  title: "The Gruffalo",
  authors: ["Julia Donaldson"],
  familyId: "family",
  isbn: null,
  openLibraryKey: null,
  coverUrl: null,
  createdAt: "",
};

it("keeps Tab focus inside the dialog", () => {
  window.matchMedia = vi
    .fn()
    .mockReturnValue({ matches: true }) as unknown as typeof window.matchMedia;
  Element.prototype.animate = vi.fn(() => ({
    finished: Promise.resolve(),
    cancel: vi.fn(),
  })) as never;
  render(createElement("button", null, "Outside"));
  render(createElement(BookModal, { book }));
  const close = screen.getByRole("button", { name: "Close" });
  const details = screen.getByRole("link", { name: "Full details" });
  close.focus();
  fireEvent.keyDown(document, { key: "Tab" });
  expect(document.activeElement).toBe(details);
  fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
  expect(document.activeElement).toBe(close);
  screen.getByRole("button", { name: "Outside" }).focus();
  fireEvent.keyDown(document, { key: "Tab" });
  expect(document.activeElement).toBe(details);
});

it("shows a fallback when there is no cover", () => {
  render(createElement(BookModal, { book }));
  expect(screen.getByRole("img", { name: "No cover image" })).toBeTruthy();
});

it("returns focus to the originating book when closed", () => {
  window.matchMedia = vi
    .fn()
    .mockReturnValue({ matches: true }) as unknown as typeof window.matchMedia;
  render(
    createElement("a", { href: "/library/a", "data-book-id": "a" }, "The Gruffalo spine"),
  );
  render(createElement(BookModal, { book }));
  fireEvent.click(screen.getByRole("button", { name: "Close" }));
  expect(document.activeElement).toBe(screen.getByText("The Gruffalo spine"));
});
