# Agent context

Project rules for StoryTurn / bedtime-readers agents. Prefer this file over chat-only conventions.

## Local development

- Demo store is the default until Supabase credentials exist.
- Do not commit secrets.
- Optional `GOOGLE_BOOKS_API_KEY` enables Google-first ISBN/barcode and title search; without it, library search uses Open Library only.

## Timezones for session calendar days

Session `scheduledFor` values are **family-local wall times** (date + bedtime), not UTC instants.

- When labeling or filtering “today / upcoming / past” nights, use the active schedule’s IANA `timezone` via `formatDateOnlyInTimeZone` / `getFamilyTimezone`.
- Do **not** use UTC `formatDateOnly(new Date())` or `toISOString().slice(0, 10)` as “today” for bedtime UI or upcoming-session actions.

## Corrections vs silent edits

- Changing past or completed session assignments/books requires the correction audit path (`updateSession` with a reason).
- Convenience actions (e.g. shuffle books) must only target **future scheduled** nights.

## ISBN / barcode lookup

- Parse shelf scans with `parseScannedBookCode` (clear invalid-check-digit vs unsupported messages; Bookland UPC allowed).
- Normalize scanned UPC/EAN/ISBN-10 to ISBN-13 before provider calls.
- When a code lookup succeeds but the provider omits `isbn`, **backfill from the normalized query code** so the family library stores what was scanned.
- Shelf-scan Google hits must **prefer the validated scanned ISBN** over provider `industryIdentifiers` (Google may return `OTHER` / non-barcode values).
- Provider/pacing failures during shelf scan must surface as `kind: "lookup"` (retry), never as `kind: "unknown"` / “No ISBN match”. A Google empty response must not mask a later Open Library failure.
- Shelf scan matches library search: **Google Books first** (when configured), then Open Library. Set `GOOGLE_BOOKS_API_KEY` in deployed envs — many kids’ books are missing from Open Library by ISBN.
- Store a plain-text `description` (HTML stripped, 4000 characters) from Google Books `volumeInfo.description` and from Open Library edition or work text. The library book page at `/library/[id]` reads `books.description`.
- Mute ZXing `MultiFormatReader: non-ReaderException` warnings while the camera is live (empty-frame noise, not lookup failures).

## Library duplicates

- Compare and store book barcodes via `storedIsbnKey` (`src/lib/domain/book-duplicates.ts`), never raw `isbn` strings: ISBN-10, ISBN-13, and UPC forms of one book must collide.
- Same barcode in a family keeps the earlier book (no prompt). Same title + author with a different barcode prompts the user; recommend the copy with more metadata (cover first), ties keep the existing book.
- "Replace" updates the existing row in place so `session_books` links keep their `book_id`, filling any field the new copy lacks from the existing book.
