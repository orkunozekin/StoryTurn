# Rotation cascade / swap + child relations

Family owners can insert a one-off reader (cascade) or swap two nights, and every adult member stores how they relate to the kids.

## Status

| Field | Value |
|-------|-------|
| Status | in-progress (implementation complete; awaiting PR) |
| Owner session | cloud agent |
| Last updated | 2026-10-18 |
| Related PR / branch | `cursor/rotation-cascade-swap-45ac` |

## Goals (v1)

- **Cascade insert** — Owner picks a future night and a fill-in reader (e.g. grandparent). That night becomes the fill-in; the displaced reader and every later scheduled night shift forward one day so the original rotation order is preserved (wife tonight → tomorrow; husband tomorrow → following night).
- **Swap nights** — Owner exchanges current readers between two future scheduled nights without shifting the rest of the calendar.
- **AuthZ** — Only family `owner` role (family admin) can cascade or swap.
- **Relation to children** — Each `family_members` row stores `relationToChildren` (`parent` | `grandparent` | `aunt_uncle` | `sibling` | `caregiver` | `other`). Collected on create/join; editable by owners on the family page; shown next to reader names.
- **Out of scope for v1:** Per-kid different relations; automatic ICS re-send batching UI polish beyond existing invite helper; non-owner self-service cascade; undo history beyond existing session corrections.

## Todos

1. Domain helpers: cascade insert + swap algorithms with unit tests.
2. Types + demo seed: `relationToChildren` on members; migration SQL.
3. Demo store + server actions for cascade, swap, and relation updates (owner-only).
4. UX: schedule page cascade/swap controls; family/onboarding relation fields; show relation labels.
5. Update bedtime-readers plan handoff pointer; run lint/tests/build.

## Current state

- Rotation is a fixed ordered list on [`schedules.readerRotationMemberIds`](../../src/lib/types.ts); nights are generated in [`src/lib/domain/sessions.ts`](../../src/lib/domain/sessions.ts).
- Single-night reassignment exists via [`updateSession`](../../src/lib/demo/store.ts) / corrections, but does **not** shift later nights.
- Members have `role` (`owner` | `reader`) only; no relation-to-kids field.
- Schedule UI is owner-gated in store (`saveSchedule`); page itself does not yet offer cascade/swap.

## Design

### Cascade insert

Given ordered future `scheduled` sessions from an anchor night inclusive, with current reader ids `[r0, r1, …, rn]`, and fill-in `f`:

1. Assign `f` to session 0.
2. Assign `r0` to session 1, `r1` to session 2, …, `r(n-1)` to session n.
3. Ensure one extra day exists for displaced `rn` (call `ensureUpcomingSessions` / generate next empty date) and assign `rn` there.
4. Preserve original assignment rows via existing `applyReassignment` (`is_original` / `is_current`).
5. Re-send ICS REQUEST for each changed future night (reuse `sendSessionInvite`).

Past or cancelled nights are never cascaded.

### Swap

Given two distinct future scheduled session ids, exchange their current reader member ids (single current reader per night in v1). Re-send ICS for both.

### Relation to children

| Value | Label |
|-------|-------|
| `parent` | Parent |
| `grandparent` | Grandparent |
| `aunt_uncle` | Aunt / Uncle |
| `sibling` | Sibling |
| `caregiver` | Caregiver |
| `other` | Other |

- Default for family creator: `parent`.
- Join / invite accept: required select (default `other` if omitted in auto-join paths, then editable).
- Display: badge or muted text beside display name on family + schedule lists.

### Data model

- Demo `FamilyMember.relationToChildren`
- SQL: `alter table family_members add column relation_to_children text not null default 'other' check (...)`

## Critical decisions

- Cascade shifts **session assignments**, not the schedule’s `readerRotationMemberIds` array (rotation rule stays; calendar nights move).
- Only **owners** may cascade/swap (matches “family admins”).
- One current reader per night assumed for cascade/swap v1 (matches generated schedule).

## Files to touch

| Path | Change |
|------|--------|
| `src/lib/types.ts` | Relation type + member field |
| `src/lib/domain/relations.ts` | Labels / parse helpers |
| `src/lib/domain/cascade.ts` | Cascade + swap pure logic |
| `src/lib/demo/store.ts` | Owner actions + seed fields |
| `src/lib/demo/seed.ts` | Seed relations |
| `src/app/actions.ts` | Server actions |
| `src/app/(app)/schedule/page.tsx` | Cascade / swap UI |
| `src/app/(app)/family/page.tsx` | Show + edit relations |
| `src/app/onboarding/page.tsx` | Relation on create/join |
| `supabase/migrations/003_member_relation.sql` | Column + check |
| `tests/*.test.ts` | Domain + store coverage |
| `docs/features/*` | This plan + bedtime handoff note |

## Acceptance criteria

- [x] Owner can cascade-insert a fill-in on tonight; wife moves to tomorrow; husband to the next night.
- [x] Owner can swap two future nights’ readers without shifting others.
- [x] Non-owners cannot cascade or swap.
- [x] Every member has a relation-to-children; shown in family UI; settable on join/create and editable by owner.
- [x] Unit tests cover cascade/swap edge cases; `npm test`, `npm run lint`, `npm run build` pass.

## Handoff

> Updated by `/handoff`. `/feature-context` reads this first.

### Done so far

- Requirements captured; plan written.
- Domain: `cascade.ts`, `relations.ts` + unit tests.
- Demo store: `cascadeInsertReader`, `swapSessionReaders`, `updateMemberRelation`, seed relations.
- UI: schedule cascade/swap (owners), family relation edit, onboarding relation select.
- SQL: `supabase/migrations/003_member_relation.sql`.

### Remaining work

- Manual smoke on schedule cascade/swap + family relation labels after deploy.
- When Supabase is live: apply migration `003_member_relation.sql` and map columns in queries.

### Blockers / risks

- Auto-join invite path defaults relation to `other` until edited (v1 OK).

### Pointers for the next agent

- Start at: wire Supabase column `relation_to_children` when leaving demo mode.
- Do not: mutate `readerRotationMemberIds` on cascade; do not let non-owners cascade/swap.
- Verify with: `npm test`, `npm run lint`, `npm run build`; cascade demo (Nana tonight → parents shift).
