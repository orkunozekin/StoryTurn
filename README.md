# StoryTurn

Know whose night it is for bedtime reading. StoryTurn helps parents (and grandparents or other caregivers) rotate reading nights, keep a shared family book library, log what you read, and send calendar invites for each session.

## Features (v1)

- Email/password-style auth UI with Google + password-reset hooks for Supabase Auth
- Create a family or join with an invite code (parents, grandparents, other readers)
- Add kids; shared family book library via Open Library search
- Alternating reader schedule for nights with both kids together
- Home page shows **your** next upcoming reading session
- Edit future sessions, cancel sessions, correct past sessions with audit trail
- ICS calendar invites via Plunk
- Dashboard: books read recently / all-time, filter by reader or whole family
- QStash-ready cron endpoint to generate upcoming sessions
- Vitest unit suite + GitHub Actions CI (`lint`, `test`, `build`)

Shelf scanning supports ISBN barcodes and typed ISBNs, exact edition lookup, immediate saving with session-only Undo, and confirmed bulk removal. Migrations `011_book_editions.sql` and `012_scan_session_safety.sql` are required before deploying this feature (applied to StoryTurn on 2026-10-07). It preserves the already-deployed wishlist operations while replacing work-only uniqueness with edition identity. Legacy records retain their references and are labeled as unverified editions; no automatic identity backfill or merge is performed. Set `OPEN_LIBRARY_CONTACT` to a real contact address if available.

Camera verification still requires physical iPhone Safari and Android Chrome testing over HTTPS. Reload and tab-close warnings are browser-controlled and may be skipped on mobile; confirmed books remain saved. Scan state is not restored after navigation or reload.

Product plan: [`docs/features/bedtime-readers-feature-plan.md`](docs/features/bedtime-readers-feature-plan.md)

## Stack

- Next.js (App Router) + TypeScript + Tailwind CSS + shadcn/ui
- Supabase (Postgres + Auth) when configured
- Plunk (email + ICS)
- Upstash QStash (cron)
- Open Library (book search)
- Vitest + GitHub Actions
- Vercel hosting

## Database migrations

Schema changes go in `supabase/migrations/NNN_name.sql` (next three-digit number). They deploy to production automatically when merged to `main`, via GitHub Actions and `supabase db push`, and the Vercel production deploy waits for them. See [`docs/database-migrations.md`](docs/database-migrations.md) for how deploys work, adding a migration, re-running, recovery, and one-time setup.

## Demo mode

If Supabase env vars are missing, or `FORCE_DEMO_MODE=1`, the app runs against an in-memory demo family:

| Email                | Role                 |
| -------------------- | -------------------- |
| `alex@example.com`   | Parent / owner       |
| `jordan@example.com` | Parent / reader      |
| `nana@example.com`   | Grandparent / reader |

Invite code in the seed data: `RIVERA24`

## Local development

```bash
npm install
cp .env.example .env.local
npm run dev -- --port 3456
```

Open [http://localhost:3456](http://localhost:3456).

```bash
npm test
npm run lint
npm run build
```

## Environment

See [`.env.example`](.env.example).

1. Create a Supabase project; enable Email + Google providers and password recovery.
2. Apply all files in `supabase/migrations/` in numeric order. Existing deployments must apply migrations 003–012 before using parent invitations or schedule management.
3. Set the Supabase, Plunk, and QStash keys in `.env.local`, then set `FORCE_DEMO_MODE=0` to use the live database.
4. Configure QStash to `POST /api/cron/generate-sessions` daily (or call with `x-cron-secret: $CRON_SECRET` locally).
5. Deploy on Vercel. Production uses `https://www.storyturn.app` (`storyturn.app` redirects to `www`). Set `NEXT_PUBLIC_APP_URL` to that URL and `FORCE_DEMO_MODE=0`. Auth callbacks use `${NEXT_PUBLIC_APP_URL}/auth/callback`, which must be allowed in the Supabase redirect list.

## CI / merge requirements

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs lint, unit tests, and production build on every pull request and on `main`.

After you create the GitHub repo, enable branch protection on `main` and **require the `lint-test-build` check to pass** before merge.
