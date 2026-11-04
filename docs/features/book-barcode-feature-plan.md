# Book barcode scanning

Let a reader scan a whole shelf during setup, look up each ISBN online, and add the matched books to the shared family library. Implementation is authorized and present locally. Physical-device camera verification and representative metadata coverage remain release checks.

## Status

| Field               | Value                          |
| ------------------- | ------------------------------ |
| Status              | in-progress                    |
| Last updated        | 2026-10-07                     |
| Related PR / branch | `codex/shelf-barcode-scanning` |

## Goals (v1)

- Scan a book's ISBN barcode using a phone browser and rear camera.
- Support typed ISBN-10 or ISBN-13 when scanning is unavailable.
- Keep the camera open between books and collect a session list showing title, authors, cover, and lookup status.
- Save each successfully matched book immediately and offer Undo in its session row. No end-of-session confirmation is required.
- Let readers resolve unknown books later without blocking the next scan.
- Offer bulk removal from the family library with explicit selection, confirmation, and family authorization.
- Let users correct missing format metadata in v1 without changing edition identity.
- Keep scan sessions in memory only; require deliberate confirmation before leaving an active session.
- Keep hardcover, paperback, and other distinct editions separate; display format and edition details in scan results and library entries.
- Keep title/author search available when lookup fails.
- **Out of scope for v1:** arbitrary retail UPC lookup, OCR, native apps, paid metadata providers, and tracking multiple physical copies of the same edition.

## Current state

- Library exposes continuous shelf scanning with ZXing, typed ISBN input, bounded queue, immediate saves, session-only Undo, departure confirmation, bulk removal, and missing-format correction.
- Exact Open Library edition lookup retains validated scanned ISBNs; title search selects concrete editions. Library, reading-book pickers, and dashboard history show edition details.
- Demo and live data paths use edition-aware save results and authorized reference-safe removal. Migration `011_book_editions.sql` adds nullable metadata, uniqueness indexes, atomic RPCs, scan ownership, and shared request pacing.
- Legacy entries are preserved and visibly marked as unverified. Existing ISBNs are not backfilled into authoritative identity because they came from arbitrary work-search results. A newly verified edition may therefore coexist with an older ambiguous entry; readers can deliberately remove unreferenced legacy entries.
- Migration 011 has been tested locally using PGlite and applied to the StoryTurn Supabase project on 2026-10-07. Production schema and migration history were inspected; merchant or family data was not queried.

## Viability and sources

- Book ISBNs can be represented as barcodes; ISBN-13 prefixes are 978 or 979. A general UPC is not interchangeable with ISBN. Validate ISBN structure and checksum, reject unsupported codes, and ignore supplementary price codes. Sources: [ISBN bar coding](https://www.isbn-international.org/node/28), [ISBN structure](https://www.isbn-international.org/index.php/content/what-isbn/10).
- Open Library supports `/isbn/{isbn}.json` to resolve an edition. Its older `/api/books` endpoint is marked legacy. Source: [Books and ISBN APIs](https://openlibrary.org/dev/docs/api/books).
- Open Library requests should be cached and identify the application with a real contact address. Current documented limits are 1 request/second unidentified and 3 identified. Human book lookup is a supported use case; high-traffic commercial backend use is not. Source: [API usage guidance](https://openlibrary.org/developers/api).
- Native `BarcodeDetector` has limited browser support. Evaluate a client decoder such as ZXing instead of depending solely on native detection. Camera access requires permission and a secure context. Sources: [BarcodeDetector](https://developer.mozilla.org/en-US/docs/Web/API/BarcodeDetector), [camera API](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia), [ZXing browser project](https://github.com/zxing-js/browser).
- A local typed-ISBN browser smoke test saved ISBN 9780060775858 and verified that the book remained after ending the session. This is not a representative coverage benchmark. Open Library returned an unexpected author (Jean Little) for the Goodnight Moon edition and no format, so metadata quality needs explicit checking with real books. Physical camera speed and coverage remain unverified.
- Marketplace discovery was attempted for the searching category and retried during implementation but failed due to network/cache restrictions. No service was provisioned. The proposed lookup extends the existing Open Library integration.

## Design

| Area              | Proposed behavior                                                                                                                                                                                   |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Entry             | Add “Scan your shelf” alongside current search                                                                                                                                                      |
| Camera            | Start only after explicit tap; prefer rear camera; decode locally; do not upload frames                                                                                                             |
| Validation        | Normalize ISBN formatting, verify checksum, convert valid ISBN-10 to ISBN-13, retain scanned ISBN                                                                                                   |
| Lookup            | Authenticated server lookup of exact ISBN edition; resolve authors and parent work where available; timeout, cache, and controlled retries                                                          |
| Session           | Acknowledge each captured ISBN immediately; maintain a list of pending, matched, already collected, and unresolved books                                                                            |
| Save              | Automatically save each successfully matched book as its lookup completes; show Added only after the server confirms insertion                                                                      |
| Undo              | Offer Undo on each newly added session row; delete only the exact insertion created by that scan, subject to family authorization and reference checks                                              |
| Queue             | Bounded, paced lookup queue with backpressure; capture once per normalized ISBN, avoid parallel request bursts, allow retry of failed items                                                         |
| Finish            | Show added, undone, duplicate, unresolved, and failed counts; retry individual failed saves; confirm before closing an active session and explain any pending entries and loss of session-only Undo |
| Navigation        | Use an app confirmation modal for leaving an active scan session and the browser-provided warning for reload/tab close where supported; no session recovery after leaving                           |
| Bulk removal      | Select multiple library books and confirm removal; authorize each book and retain referenced books with clear per-book outcomes                                                                     |
| Format correction | Allow correction of missing format metadata; keep normalized ISBN and edition identity unchanged                                                                                                    |
| Identity          | Use normalized ISBN and Open Library edition identity for duplicate detection within a family; a shared work key alone does not make two books duplicates                                           |
| Duplicate         | Repeated scans of the same edition count as already collected; hardcover and paperback editions remain separate                                                                                     |
| Edition display   | Show format prominently with title/author, plus available publisher, publication year, and ISBN; use “Format unknown” when metadata is absent                                                       |
| Search            | Make title/author results edition-selectable so readers can knowingly add a specific format; compare collection membership by edition rather than work                                              |
| Failure           | Separate unsupported barcode, no match, upstream failure, and camera denial; offer typed ISBN or existing search                                                                                    |
| Cleanup           | Keep camera active between captures; stop tracks and decoder on finish, close, unmount, or backgrounding; ignore repeated frames of the same barcode and stale lookup results                       |

Save must return the inserted book ID and whether it was newly created or already present. Concurrent duplicate detection must never return an existing book as an undoable insertion. Undo is idempotent and family-scoped; if the book has since been referenced by a reading log or session, retain it and explain why it cannot be removed. After undo, suppress repeated camera detections of that ISBN for the rest of the session unless the reader explicitly chooses to add it again.

Preserve work keys as grouping metadata, not uniqueness keys. Store an edition identifier, normalized ISBN, physical format, publisher, and edition publication year separately from work-level metadata. Different ISBNs can sometimes identify the same edition, so match an exact normalized ISBN first and a reliable edition ID second; never merge merely on title/author or work ID. A format label alone is not edition identity. Do not infer binding from cover art.

Existing title search currently returns work-level results and arbitrary first ISBNs. Update that flow to choose a concrete edition, keeping the edition distinction consistent across both search and scan. Existing stored records may have ambiguous identity; preserve reading references and avoid silently assigning formats or merging records. Add nullable edition fields and a deliberate backfill strategy. Design family-scoped uniqueness after inspecting existing data; leave unresolved legacy identity explicit. Review other book selection and history surfaces for clear disambiguation when titles repeat.

## Critical decisions

- User confirmed distinct editions remain separate, including hardcover versus paperback, and the UI must make this clear. Same-edition physical-copy inventory is outside the proposed v1.
- Missing format metadata must be explicit. User correction of missing format metadata is included in v1; format is descriptive metadata, not edition identity.
- User confirmed whole-shelf scanning during setup as the primary workflow.
- User confirmed immediate saving of matched books with an undo option. Undo stays available on each newly added row only for the current scan session. Bulk removal is a separate library action after the session ends.
- Scan sessions do not survive reload/navigation. Confirm intentional in-app departures with a modal; use the browser-provided reload/close warning where supported. Explain that saved books remain, session-only Undo ends, and unresolved entries are lost. Define pending-request cancellation/settlement during implementation so a departure does not silently create unreported additions.
- Shelf setup is user-driven lookup, but larger sessions require paced requests and provider-policy review before launch.
- Test a representative sample of children's books before choosing any additional provider. Do not promise universal coverage or an unmeasured hit rate.
- Read bundled Next.js guides before coding. Keep demo/live behavior aligned, enforce family authorization server-side, and return safe lookup errors.

## Todos

1. [x] Confirm session-only Undo, no session recovery with departure guardrails, bulk library removal, and missing-format correction in v1.
2. [ ] Run a small spike on real iPhone Safari and Android Chrome and sample physical books; measure decode success, lookup accuracy, latency, and missing records separately.
3. [x] Add ISBN normalization and exact lookup adapter; retain edition identity, format, edition metadata, work grouping, and scanned ISBN. Plan nullable schema additions and legacy identity handling.
4. [x] Add continuous camera UI, bounded lookup/save queue, immediate-save feedback, per-row Undo, and typed ISBN fallback with cleanup, departure confirmation, and accessible feedback.
5. [x] Add family-scoped, race-safe duplicate handling and idempotent Undo with reference checks; return exact insertion identity from save.
6. [x] Add confirmed bulk library removal and missing-format correction; update title search to select editions and show edition labels in library and book-selection/history surfaces where duplicate titles need disambiguation.
7. [ ] Targeted tests, lint, TypeScript, and Webpack production build pass. Complete physical-device checks and a representative metadata sample before release.

## Files to touch

| Path                                                                                                                                                 | Change                                                                                                         |
| ---------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| [src/app/(app)/library/page.tsx](../../src/app/(app)/library/page.tsx)                                                                                           | Scanner entry, edition-aware collection identities, visible format labels, format correction, and bulk removal |
| [src/components/book-search.tsx](../../src/components/book-search.tsx)                                                                               | Edition selection, format labels, and ISBN entry integration                                                   |
| `src/components/book-scanner.tsx` (new)                                                                                                              | Camera and decoder lifecycle                                                                                   |
| `src/lib/isbn.ts` (new)                                                                                                                              | Normalization and validation                                                                                   |
| [src/lib/open-library.ts](../../src/lib/open-library.ts)                                                                                             | Exact edition lookup, format/publisher/year mapping, and work resolution                                       |
| [src/app/actions.ts](../../src/app/actions.ts)                                                                                                       | Authorized ISBN lookup, immediate save results, and Undo action                                                |
| [src/lib/data.ts](../../src/lib/data.ts), [demo store](../../src/lib/demo/store.ts), [live repository](../../src/lib/supabase/repository.ts)         | Consistent duplicate handling, insertion identity, and safe Undo                                               |
| [src/lib/types.ts](../../src/lib/types.ts), [Supabase mapping](../../src/lib/supabase/map.ts)                                                        | Nullable edition identifier, format, publisher, and edition year                                               |
| `supabase/migrations/`                                                                                                                               | Nullable edition metadata and family-scoped edition uniqueness after existing-data review                      |
| Book pickers and reading-history surfaces (locate during implementation)                                                                             | Disambiguate same-title editions with format and available edition details                                     |
| [tests/open-library.test.ts](../../tests/open-library.test.ts), [tests/book-search.test.ts](../../tests/book-search.test.ts), new scanner/ISBN tests | Exact lookup, duplicate, invalid input, and lifecycle coverage                                                 |
| [package.json](../../package.json)                                                                                                                   | Decoder dependency after spike                                                                                 |

## Acceptance criteria

- [ ] Supported ISBN barcode scans on agreed physical iPhone and Android devices.
- [x] Typed ISBN works without camera permission and accepts valid ISBN-10/13.
- [ ] A reader can scan a shelf without reopening the camera for every book (continuous decoding implemented; physical check pending).
- [x] Repeated frames of one barcode create only one session entry.
- [x] Exact scanned ISBN is retained; matched books save immediately without a confirmation step.
- [x] Added appears only after confirmed persistence; failed saves are retryable.
- [x] Undo removes only the newly inserted book and never an existing duplicate or another family’s book.
- [x] Undo preserves books referenced by reading logs or sessions and gives a useful explanation.
- [x] Undo is safe to retry; an undone ISBN is not automatically re-added from subsequent camera frames.
- [x] Pending lookups, duplicates, unknown books, and partial save failures have distinct session states.
- [x] Scanning cannot create an unbounded lookup queue or burst beyond the provider request budget.
- [x] Hardcover and paperback of the same work can both be added and are visibly distinguished.
- [x] Repeat scans of the same edition do not create duplicates, including concurrent requests.
- [x] Title search supports choosing a concrete edition and recognizes collection membership at edition level.
- [x] Missing format is labeled unknown; legacy records and reading references are preserved.
- [x] Unknown books and service failures offer a useful next step.
- [x] Camera stops when dismissed or inactive; no images leave the device.
- [x] Existing search and reading history continue to work in demo and live modes.
- [x] Undo ends when the scan session ends; saved books remain after reload/navigation.
- [x] In-app departure from an active session requires a confirmation modal; reload/tab close uses browser warnings where supported.
- [x] Departure explains lost session state, expired Undo, and pending work.
- [x] Bulk removal requires explicit selection and confirmation, enforces family authorization, and preserves referenced books with clear outcomes.
- [x] Users can correct missing format metadata without changing edition identity.
- [x] Relevant tests, lint, and build pass.

## Handoff

### Done so far

- User authorized implementation after confirming session-only Undo, bulk library removal, no recovery after reload/navigation with departure guards, and missing-format correction in v1.
- Added `src/lib/isbn.ts`, exact edition lookup and author/work resolution in `src/lib/open-library.ts`, nullable edition metadata and display labels.
- Added `src/components/book-scanner.tsx`: lazy-loaded ZXing rear camera, typed ISBN, repeated-frame suppression, five-entry waiting queue, immediate saves, retry, Undo, explicit Add again after Undo, and camera cleanup for close/unmount/backgrounding/late permission results.
- Added app departure and browser-back confirmation, browser reload/close warnings, and finish handling that discards waiting entries and settles the active save before closing. Sessions are not restored. Server scan tokens expire after four hours as a safety limit.
- Added concrete-edition title search, shared-library bulk selection/removal confirmation, missing-format correction, and edition labels in library, reading pickers, and dashboard history.
- Added demo/live save, removal, format, and scan APIs. Migration `011_book_editions.sql` serializes family mutations, enforces uniqueness, scopes Undo to scan insertions, preserves references, and paces lookups across instances at one request per 1.1 seconds.
- Kept legacy identity unresolved explicitly without automatic backfill, merging, or reference rewrites. Scan ownership and edition fields are restricted to authorized RPCs; legacy column grants preserve wishlist promotion.
- Found that production migration 010 is `family_library_wishlist`, renamed this feature migration to 011, and tested against the deployed SQL fixture. Replaced work-only uniqueness with edition identity while preserving wishlist operations and data.
- Verified 137 tests, lint, TypeScript, and Webpack production build. Local browser checked real ISBN lookup/save and finish confirmation/persistence. Turbopack build was blocked by environment port binding restrictions; Webpack passed.
- Updated README and `.env.example` with migration and optional real `OPEN_LIBRARY_CONTACT` configuration. Migration 011 was applied to StoryTurn on 2026-10-07; application code has not been deployed.

- Addressed all three Greptile review findings in PR #18: scans in separate tabs retain independent server sessions, failed finish leaves queued ISBNs retryable, and foreign/absent removal IDs have indistinguishable outcomes in demo and live paths.
- Applied additive migration `012_scan_session_safety.sql` to StoryTurn on 2026-10-07, keeping deployed migration 011 immutable. Added database, demo, and scanner regressions and two durable agent lessons. All 137 tests, lint, TypeScript, and Webpack build pass.

### Remaining work

1. Test physical iPhone Safari and Android Chrome over HTTPS: decode success, repeated captures, permission denial, backgrounding, close/back/reload guardrails, and a whole shelf session.
2. Sample representative physical children's books and compare exact ISBN, title, authors, format, publisher, edition date, cover, lookup latency, and unknown/error outcomes. A local Goodnight Moon lookup exposed unexpected author metadata; do not claim reliable coverage yet.
3. Review and merge the PR before deploying application code. Migrations 011 and 012 are already applied; inspect legacy duplicate/unverified entries deliberately and preserve reading references.

### Blockers / risks

- Physical decoding, mobile browser lifecycle behavior, and representative metadata coverage are unverified.
- Open Library metadata can be incorrect or missing. Unknown formats can be corrected; arbitrary author/title editing is not included.
- Browser reload/close warnings can be skipped on mobile lifecycle events. Saved books remain; scan lists and Undo are not restored.
- Legacy ISBNs remain unverified, so an old entry and a newly verified edition can coexist until deliberately reconciled.
- A process may end during an in-flight request. A retry can return an already-collected book without Undo; bulk removal remains available for unreferenced books.

### Pointers for the next agent

- Start at `src/components/book-scanner.tsx`, `src/app/book-actions.ts`, `src/lib/open-library.ts`, and migration `011_book_editions.sql`.
- Verify with `npm test`, `npm run lint`, and `npx next build --webpack` in this environment; the normal CI build remains unchanged.
- `tests/book-editions-database.test.ts` checks SQL identity, authorization, Undo, references, format correction, and pacing. Scanner tests cover queue settlement, repeated ISBNs, retries, camera denial, background cleanup, late permission cleanup, and departure guards.
- Do not infer format from cover art, promote arbitrary legacy ISBNs, or use a work key as edition uniqueness. Any further provider evaluation stays outside this implementation's scope.
