import type { Book } from "@/lib/types";

/** Spine colours: deep, saturated tones that keep white text readable in both themes. */
const SPINE_COLORS = [
  "#6b4f9e",
  "#2f6f8f",
  "#9e4f4f",
  "#4f8f6b",
  "#8f7a2f",
  "#3f4f8f",
  "#7a3f6b",
  "#2f7d7a",
  "#8f5a2f",
  "#5a6b2f",
] as const;

const hash = (value: string) => {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

export type SpineLook = {
  color: string;
  /** Spine length in px on the upright shelf (also the book's width in the phone pile). */
  length: number;
  /** Horizontal nudge in px for the phone pile. */
  offsetX: number;
  /** Small tilt in degrees for the phone pile. */
  tilt: number;
};

/** Stable per-book look, so a book keeps its colour and size between visits. */
export const spineLook = (book: Pick<Book, "id" | "title">): SpineLook => {
  const h = hash(book.id || book.title);
  return {
    color: SPINE_COLORS[h % SPINE_COLORS.length] ?? SPINE_COLORS[0],
    length: 150 + (h % 70),
    offsetX: ((h >>> 8) % 21) - 10,
    tilt: (((h >>> 16) % 41) - 20) / 10,
  };
};

/** Books lean this many degrees on the tablet and desktop shelf. */
export const SHELF_LEAN_DEG = 15;

export const matchesQuery = (book: Pick<Book, "title" | "authors">, query: string) => {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    book.title.toLowerCase().includes(q) ||
    book.authors.some((author) => author.toLowerCase().includes(q))
  );
};

/** Where the user tapped, so the book modal can grow out of that spine. */
export type ShelfOrigin = {
  bookId: string;
  /** Visual centre of the spine on screen, and its untransformed size. */
  centerX: number;
  centerY: number;
  width: number;
  height: number;
  /** True when the book lies flat (phone pile). */
  flat: boolean;
  /** Rotation of the spine in degrees as drawn on screen. */
  angle: number;
};

let lastOrigin: ShelfOrigin | null = null;

export const setShelfOrigin = (origin: ShelfOrigin | null) => {
  lastOrigin = origin;
};

export const takeShelfOrigin = (bookId: string) => {
  const origin = lastOrigin?.bookId === bookId ? lastOrigin : null;
  lastOrigin = null;
  return origin;
};
