# Agent lessons

Durable lessons from PR review and production misses. `/start` loads `AGENT_CONTEXT.md`, not this file — promote recurring or high-severity themes there.

## Lessons

### 2026-10-04 — Preserve cancellation intent

- **Source:** PR #3 · Greptile
- **Gap:** Individual cancellations and schedule cancellations shared one status, so edits could retain the wrong cancellations or reopen nights intentionally skipped by a parent.
- **Going forward:** Persist cancellation provenance and test forward/backward schedule edits plus delete/restore cycles with individual cancellations.
- **Pointers:** `supabase/migrations/004_schedule_cancellation_intent.sql`, `tests/database-management.test.ts`, `tests/schedule-feedback.test.ts`

### 2026-10-04 — Notify removed calendar attendees

- **Source:** PR #3 · Greptile
- **Gap:** Reassignment discarded the previous current readers before notifications were built, leaving their original calendar invitations active.
- **Going forward:** Capture previous attendees and event time inside the mutation, send cancellations to removed readers, then send requests to current readers. Test recipients as well as persisted assignments.
- **Pointers:** `manage_schedule`, `src/lib/supabase/repository.ts`, `tests/supabase-repository.test.ts`

### 2026-10-04 — Use the schedule calendar day throughout the workflow

- **Source:** PR #3 and PR #6 · Greptile
- **Gap:** Home labels used a local calendar date while generation and demo schedule edits used UTC, skipping or failing to update tonight after UTC midnight.
- **Going forward:** Derive generation bounds and future-night filters in each schedule's timezone. Test generation, edits, and deletion across UTC/local date boundaries in both data paths.
- **Pointers:** `src/lib/domain/calendar-date.ts`, `tests/schedule-feedback.test.ts`, `tests/supabase-repository.test.ts`

### 2026-10-04 — Test the form that submits replacement lists

- **Source:** PR #4 · Greptile
- **Gap:** A store-only test resubmitted planned books manually and could not catch the session form dropping checked library books or prefilled freeform titles.
- **Going forward:** When saving replaces a collection, test the rendered form through its server action and assert retained entries after submission.
- **Pointers:** `tests/session-book-form.test.ts`, `src/app/(app)/sessions/[id]/page.tsx`, `updateSessionAction`

### 2026-10-04 — Keep timezone forms usable before hydration

- **Source:** PR #5 · Greptile
- **Gap:** Browser-only timezone detection left a required server-rendered select empty, so new schedules lacked a usable default before hydration. Label formatting also repeated for every zone on each selection.
- **Going forward:** Test server-rendered form validity alongside client detection, preserve explicit saved choices, and cache supported-zone labels independently of selection state.
- **Pointers:** `src/components/timezone-picker.tsx`, `tests/timezone-picker.test.ts`, `tests/timezone-options.test.ts`

### 2026-10-04 — Paginate before the database API row limit

- **Source:** PR #6 · Greptile
- **Gap:** Slicing a capped database response made older sessions unreachable and understated the total page count.
- **Going forward:** Use an exact database count and a stable ordered range for each page, then load assignments for only that page. Test records beyond the API row cap and confirm family scoping.
- **Pointers:** `getFamilySessionPage`, `tests/supabase-repository.test.ts`, `tests/session-pages.test.ts`

### 2026-10-04 — Pending invites need lifecycle cleanup

- **Source:** PR #2 · Greptile
- **Gap:** An invite cookie survived sign-out and demo account switches, and enrolled recipients lost invite context in a redirect without explanation.
- **Going forward:** Preserve pending invites through initial authentication, clear them on sign-out, account switches, and completed family setup, and provide an explicit outcome when membership prevents accepting an invite. Test both new and enrolled recipients and account transitions.
- **Pointers:** `src/app/join/route.ts`, `src/app/actions.ts`, `tests/invite-account-lifecycle.test.ts`

### 2026-10-04 — Persist calendar revisions

- **Source:** PR #3 · Greptile
- **Gap:** A restored reader received REQUEST sequence 0 after CANCEL sequence 1 for the same calendar UID, causing clients to reject the restoration.
- **Going forward:** Persist and atomically increment each session's calendar revision across edits, cancellations, and restorations. Test remove-and-restore cycles even when the clock does not advance.
- **Pointers:** `supabase/migrations/005_calendar_sequence.sql`, `src/lib/session-mail.ts`, `tests/schedule-feedback.test.ts`

### 2026-10-04 — Generate complete nights atomically

- **Source:** PR #12 · Greptile
- **Gap:** Separate inserts left a saved session without its random books after assignment failure, and retries skipped the existing night.
- **Going forward:** Create a generated session and its dependent assignments in one database transaction. Test failure rollback and retry, and lock selected books against concurrent deletion.
- **Pointers:** `supabase/migrations/007_atomic_session_generation.sql`, `generate_schedule_night`, `tests/database-management.test.ts`

### 2026-10-04 — Verify rendered pagination

- **Source:** PR #10 · Greptile
- **Gap:** Helper tests did not verify numbered navigation, ellipses, or the current-page indicator in the rendered page.
- **Going forward:** Test the rendered navigation and its accessible labels as well as page bounds and data retrieval.
- **Pointers:** `tests/session-pages.test.ts`, `src/app/(app)/schedule/page.tsx`

### 2026-10-04 — Preserve select functionality before hydration

- **Source:** PR #9 · Greptile
- **Gap:** Replacing native selects with JavaScript menus prevented choosing parent invitations before hydration or without JavaScript.
- **Going forward:** Provide a usable server-rendered native select, upgrade after hydration, and test that a choice made during page load survives the upgrade.
- **Pointers:** `src/components/form-select.tsx`, `tests/form-select.test.ts`

### 2026-10-04 — Cover automatic search states

- **Source:** PR #11 · Greptile
- **Gap:** Debounced search lacked a minimum term length and tests for visible loading and failure states.
- **Going forward:** Guard short automatic searches and test loading, success, failure, and stale responses together.
- **Pointers:** `src/components/book-search.tsx`, `tests/book-search.test.ts`

### 2026-10-04 — Include foreign-key locks in concurrency review

- **Source:** PR #12 · Greptile
- **Gap:** Night generation locked a schedule before its family foreign-key check, while editing held an incompatible family lock before updating the schedule.
- **Going forward:** Account for implicit foreign-key KEY SHARE locks alongside explicit row locks. Use NO KEY UPDATE when serializing edits that do not change parent keys, and verify overlapping transactions.
- **Pointers:** `supabase/migrations/009_schedule_generation_lock.sql`, `manage_schedule`, `generate_schedule_night`

### 2026-10-04 — Preserve mobile navigation before hydration

- **Source:** PR #13 · Greptile
- **Gap:** A collapsed, inert mobile menu made every navigation route depend on JavaScript. Resizing also retained expanded mobile state.
- **Going forward:** Keep navigation links accessible in server HTML and test hydration fallback and breakpoint changes alongside toggle behavior.
- **Pointers:** `src/components/app-nav.tsx`, `tests/app-nav.test.ts`

### 2026-10-04 — Limit initial data for paginated pickers

- **Source:** PR #13 · Greptile
- **Gap:** The paginated book modal still fetched the full family library to render the session edit page.
- **Going forward:** Query only selected records for the initial view while preserving the broader lookup needed by mutation audit history. Test both paths.
- **Pointers:** `getSessionDetail`, `tests/supabase-repository.test.ts`

### 2026-10-04 — Preserve parallel queries in alternate read paths

- **Source:** PR #13 · Greptile
- **Gap:** Limiting the edit page's initial library fetch inadvertently serialized the full-library query used by saves and cancellations.
- **Going forward:** Keep independent queries in the same Promise.all when adding a dependent optimized path. Test concurrency with a blocked dependency.
- **Pointers:** `getSessionDetail`, `tests/supabase-repository.test.ts`

### 2026-10-05 — Cover alternate reactivation paths

- **Source:** PR #15 · Greptile
- **Gap:** The status selector reopened canceled sessions without confirmation, and reusing the edit mutation could duplicate non-original reader assignments.
- **Going forward:** Test every UI path that changes session status and preserve assignment rows when the requested readers match current readers.
- **Pointers:** `ConfirmationForm`, `applyReassignment`, `persistAssignments`, `tests/session-book-form.test.ts`

### 2026-10-07 — Scope ephemeral state to its owning session

- **Source:** PR #18 · Greptile
- **Gap:** Starting another tab's scan invalidated the first tab's server session, while a failed finish discarded queued ISBNs without a retry path.
- **Going forward:** Keep independent tabs' session tokens independent. Preserve recoverable queue entries until a terminal transition succeeds, and test failed transitions as well as successful cleanup in demo and live paths.
- **Pointers:** `start_book_scan`, `BookScanner.finish`, `tests/book-editions-database.test.ts`, `tests/book-scanner.test.ts`

### 2026-10-07 — Keep mutation outcomes tenant-scoped

- **Source:** PR #18 · Greptile
- **Gap:** The security-definer removal RPC distinguished a foreign book UUID from an absent UUID using an unscoped existence check.
- **Going forward:** Authorize and scope lookups before building outcomes. Foreign and absent identifiers must be indistinguishable; test both responses while asserting foreign records remain untouched.
- **Pointers:** `remove_library_books`, `removeLibraryBooks`, `tests/book-editions-database.test.ts`, `tests/book-editions-demo.test.ts`

### 2026-10-07 — Dismissal must preserve recovery paths

- **Source:** PR #19 · Greptile
- **Gap:** Dismissing a failed scan removed its retry button but retained its ISBN in the duplicate-suppression set, silently blocking another attempt.
- **Going forward:** When dismissing recoverable failures, release associated deduplication state and test retry by re-entering the dismissed value. Keep successful scans protected against repeats.
- **Pointers:** `BookScanner`, `tests/book-scanner.test.ts`

### 2026-10-07 — Check consumers when removing metadata fallbacks

- **Source:** PR #19 · Greptile
- **Gap:** Removing the unknown-format fallback left empty metadata elements and parentheses in collection checkbox labels.
- **Going forward:** Treat optional display labels as optional throughout their consumers, including accessible names. Cover records with no metadata in rendered tests.
- **Pointers:** `editionLabel`, `LibraryCollection`, `SessionBookPicker`, `tests/library-collection.test.ts`

### 2026-10-18 — Relative session days must use family timezone

- **Source:** PR #4 · Bugbot
- **Gap:** `formatRelativeDay` defaulted “today” via UTC `formatDateOnly(new Date())` while session nights store family-local calendar days, so after UTC midnight a still-tonight session could label as “Yesterday”.
- **Going forward:** Compare and label session days with the family’s schedule IANA timezone (`formatDateOnlyInTimeZone` / `getFamilyTimezone`). Never use UTC date-only as “today” for bedtime UI.
- **Pointers:** `src/lib/domain/dates.ts`, schedule `timezone` field
- **Promoted:** AGENT_CONTEXT.md → Timezones for session calendar days

### 2026-10-18 — Upcoming book actions must use family timezone

- **Source:** PR #5 · Bugbot
- **Gap:** `upcomingScheduledSessions` used UTC “today”, so schedule UI (family TZ) and add/shuffle-upcoming CTAs could disagree near day boundaries.
- **Going forward:** Any “upcoming nights” helper must use the same family-timezone today as the schedule page.
- **Pointers:** `src/lib/demo/store.ts` `upcomingScheduledSessions`
- **Promoted:** AGENT_CONTEXT.md → Timezones for session calendar days

### 2026-10-18 — Shuffle must not rewrite completed history

- **Source:** PR #5 · Bugbot
- **Gap:** `shuffleSessionBooks` allowed replacing books on completed/past nights without a correction record, silently changing logged history and dashboard stats.
- **Going forward:** Book-shuffle / convenience mutators only target future `scheduled` nights; past edits go through `updateSession` + correction reason.
- **Pointers:** `shuffleSessionBooks`, session detail shuffle CTA
- **Promoted:** AGENT_CONTEXT.md → Corrections vs silent edits

### 2026-10-18 — Preserve scanned ISBN on Google Books hits

- **Source:** PR #6 · Bugbot
- **Gap:** `lookupBookByCode` returned Google volumes even when `industryIdentifiers` was missing, so `addBookAction` saved books without the ISBN the user just scanned.
- **Going forward:** On code/barcode lookup success, if the provider omits ISBN, backfill from the normalized query ISBN (same as Open Library’s ISBN mapper).
- **Pointers:** `src/lib/book-search.ts` `lookupBookByCode`
- **Promoted:** AGENT_CONTEXT.md → ISBN / barcode lookup

### 2026-10-19 — Do not mask shelf-scan provider failures as misses

- **Source:** PR #27 · Bugbot
- **Gap:** `lookupScanEdition` swallowed Open Library / Google / pacing errors and returned `null`, so `scanBookAction` always showed “No ISBN match” for transient outages.
- **Going forward:** Only return a miss when a provider successfully responds with no match. Provider or pacing failures must throw so the action returns `kind: "lookup"`.
- **Pointers:** `src/app/book-actions.ts` `lookupScanEdition`, `tests/scan-book-action.test.ts`
- **Promoted:** AGENT_CONTEXT.md → ISBN / barcode lookup

### 2026-10-19 — Prefer scanned ISBN over Google identifiers on shelf scan

- **Source:** PR #27 · Bugbot
- **Gap:** Google fallback saved `hit.isbn` ahead of the validated barcode, so volumes with `OTHER` industry identifiers could store a non-barcode value.
- **Going forward:** Shelf-scan Google hits always persist the `parseScannedBookCode` ISBN-13, not provider identifier metadata.
- **Pointers:** `src/app/book-actions.ts` `lookupScanEdition`, `tests/scan-book-action.test.ts`
- **Promoted:** AGENT_CONTEXT.md → ISBN / barcode lookup

### 2026-10-20 — Shelf scan should be Google-first like library search

- **Source:** human · product direction
- **Gap:** Shelf scan tried Open Library before Google even though Google’s catalog is larger and library search was already Google-first.
- **Going forward:** When `GOOGLE_BOOKS_API_KEY` is set, shelf scan and code lookup both try Google Books before Open Library.
- **Pointers:** `src/app/book-actions.ts` `lookupScanEdition`, `src/lib/book-search.ts` `lookupBookByCode`
- **Promoted:** AGENT_CONTEXT.md → ISBN / barcode lookup

### 2026-10-20 — Do not let an earlier miss mask a later provider failure

- **Source:** PR #28 · Bugbot
- **Gap:** `sawSuccessfulMiss` from a Google empty response made a subsequent Open Library error return `null` / “No ISBN match”.
- **Going forward:** Open Library is the terminal shelf-scan provider — OL success-with-null is a miss; OL/pacing failure always throws `lookup` even after a Google miss.
- **Pointers:** `src/app/book-actions.ts` `lookupScanEdition`, `tests/scan-book-action.test.ts`
- **Promoted:** AGENT_CONTEXT.md → ISBN / barcode lookup
