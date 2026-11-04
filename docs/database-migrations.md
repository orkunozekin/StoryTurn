# Database migrations

Production database: Supabase project **StoryTurn** (ref `hssqmbfunfyrnbwdzrql`, us-east-1).
Schema changes live in `supabase/migrations/NNN_name.sql` and are applied by GitHub Actions. Nobody applies them by hand.

## How deploys work

| When                                                | Workflow                                          | What it does                                                                                                                                                                                                                                             |
| --------------------------------------------------- | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PR touches `supabase/migrations/**`                 | `DB migrations check` (`db-migrations-check.yml`) | **Migration numbering** checks file names. **Production dry run** prints the migrations production would receive (`supabase db push --dry-run`), using a read-only role. The schema itself is tested by the PGlite suites in `npm test` (`CI` workflow). |
| Push to `main`                                      | `DB migrations` (`db-migrations.yml`)             | If `supabase/migrations/**` changed: prints `supabase migration list`, runs `supabase db push`, then prints the list again. Runs in the `production` GitHub Environment. One run at a time; later runs queue.                                            |
| Manual (**Actions → DB migrations → Run workflow**) | `DB migrations`                                   | Same deploy, regardless of what changed.                                                                                                                                                                                                                 |

`supabase db push` applies, in order, every local file whose version is not in production's `supabase_migrations.schema_migrations`, and records each one there. It refuses to run if production has a version with no local file, or if a new local file is numbered below the newest applied one. It never re-runs an applied migration. Each migration runs in its own transaction, so a failing file is rolled back and the files after it are not applied.

The Supabase CLI version (`SUPABASE_CLI_VERSION`) and every action are pinned in the workflow files. Upgrade them on purpose, in a PR.

### Ordering with Vercel

App code that needs a new column must not go live before its migration. Two rules together handle this:

1. **Vercel waits for the migration job.** Every push to `main` produces a check named **`Migrations deployed`**. It passes when migrations were applied or nothing changed. It fails when the deploy failed, or when migrations changed but the production secrets are missing. In Vercel, add it under **Project → Settings → Deployment Checks → Add Checks → GitHub**. Vercel then builds the production deployment as usual, but only points the production domain at it after the check passes. If the check fails, the previous deployment keeps serving.
2. **Migrations stay backward compatible (expand, then contract).** The app version that is already live keeps running while a migration applies. It also runs again after an Instant Rollback in Vercel. So a migration must not break the currently deployed code. Add columns as nullable or with defaults, and add new tables and functions alongside the old ones. Drop or rename things only in a later PR, after no deployed code uses them.

Trade-offs: production promotion waits for the migration job, usually 1–2 minutes, and longer if the `production` environment requires approval. Vercel's **Force Promote** bypasses the check, so use it only when you know the schema is ready. Deployment Checks gate production only, so preview deployments are not gated. The simpler alternative, relying only on rule 2, has no gate at all. It leaves a window where new code can reach production before its migration, which is why this repo uses both rules.

## Adding a migration

1. Create the next number: if the newest file is `023_…`, add `supabase/migrations/024_short_snake_name.sql`. Use three digits and lowercase snake_case. Don't use `supabase migration new`, because it creates timestamp names.
2. Never edit, rename, or delete a migration that is on `main`. Fix mistakes with a new migration.
3. Keep it backward compatible with the code currently in production (see above).
4. Add or extend a PGlite test in `tests/*-database.test.ts`. Those suites apply every file in `supabase/migrations/` in order.
5. Open the PR. **Migration numbering** must pass. **Production dry run** should list exactly your new file(s). If it says _Remote migration versions not found in local migrations directory_, your branch is missing a migration that `main` already deployed: rebase onto `main` and renumber.
6. Merge. Watch **Actions → DB migrations**. If the environment requires approval, approve the run. The Vercel production deploy is promoted after **Migrations deployed** passes.

If two open PRs both add `024_…`, the one merged second fails **Migration numbering** once rebased. Renumber it to `025_…`.

## Re-running a deploy

- **Actions → DB migrations → (the run) → Re-run failed jobs**, or
- **Actions → DB migrations → Run workflow** on `main`.

Re-running is safe: applied migrations are skipped.

## Recovering from a failed deploy

1. Open the failed run. The **Migration list (before)**, **Pending migrations (dry run)**, and **Apply migrations** logs show which file failed and the Postgres error. The failed file was rolled back. Files before it in the same run are applied and recorded. Files after it were not run.
2. The `Migrations deployed` check is red, so Vercel keeps serving the previous production deployment.
3. Fix forward with a PR:
   - **The SQL is wrong and was never applied** (it rolled back): this is the one case where changing or deleting the file is fine, because production never recorded it. First confirm it's absent from **Migration list (after)**. Then fix the file, or revert the PR that added it, in a new PR, and add the **`allow-migration-edit`** label. That label turns **Migration numbering**'s "existing migrations are immutable" error into a warning.
   - **Production data blocks it** (for example, rows that violate a new constraint): add a new migration before it that cleans up the data, or change the failing one as above.
4. Merge, or **Run workflow**, and confirm **Migration list (after)** shows local and remote aligned.
5. Never fix production by running the SQL by hand. If you must, record it under the file's own version (`supabase migration repair --status applied NNN`), not a timestamp, or the next deploy will try to run it again.

If a run fails before applying anything (secrets, network, link), fix the cause and re-run.

## One-time setup (repo owner)

### 1. GitHub Environment `production`

**Settings → Environments → New environment → `production`**:

- **Deployment branches and tags → Selected branches → `main`**, so PR branches can never read the production secrets.
- Optional: **Required reviewers → you**, to approve each migration deploy by hand.

### 2. Secrets

Add these as **environment secrets** of `production`:

| Secret                  | Where to get it                                                                                                                                                                       |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SUPABASE_ACCESS_TOKEN` | Supabase Dashboard → your avatar → **Account preferences → Access Tokens → Generate new token** (name it `github-actions-storyturn`).                                                 |
| `SUPABASE_DB_PASSWORD`  | The `postgres` database password. If you don't have it: **Project StoryTurn → Database → Settings → Reset database password**. Resetting breaks anything else using the old password. |
| `SUPABASE_PROJECT_REF`  | `hssqmbfunfyrnbwdzrql` (**Project Settings → General → Project ID**).                                                                                                                 |

Optional, for the PR **Production dry run**, add as a **repository secret** (**Settings → Secrets and variables → Actions**):

| Secret                    | Value                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SUPABASE_DRY_RUN_DB_URL` | Connection string for the read-only `migration_reader` role below, via the **session pooler**. GitHub runners have no IPv6, so the direct `db.<ref>.supabase.co` host won't work. Copy the session-pooler URI from Dashboard → **Connect**, then replace the user with `migration_reader.hssqmbfunfyrnbwdzrql` and the password with the role's password. |

Create the role once in the SQL editor (this changes production, so only you run it):

```sql
create role migration_reader with login password '<generate a strong password>';
alter role migration_reader set default_transaction_read_only = on;
grant usage on schema supabase_migrations to migration_reader;
grant select on supabase_migrations.schema_migrations to migration_reader;
```

The dry run only issues `SELECT version FROM supabase_migrations.schema_migrations`, so this role is all it needs. It can't change anything even if a PR edits the workflow. Without this secret, the dry-run job skips with a notice.

The workflows never print secrets, and GitHub masks them in logs. When the secrets are missing, as on forks, both workflows skip with a clear message instead of failing. The one exception is a real `main` push that changes migrations, where **Migrations deployed** fails on purpose so the app isn't promoted ahead of its schema.

### 3. Vercel

Add **`Migrations deployed`** as a required check under **Project → Settings → Deployment Checks** (see [Ordering with Vercel](#ordering-with-vercel)).

## Migration history repair (one time, November 2026)

Before this automation existed, migrations were applied by hand. That left production's history out of line with the repo in two ways:

- **`010_family_library_wishlist`** was applied and recorded as `010`, but the file was missing from the repo. It existed only as a test fixture. This PR restores it as `supabase/migrations/010_family_library_wishlist.sql`, with the same SQL production recorded. No database change is needed for 010.
- **022 and 023** were applied through the Supabase MCP and recorded under timestamp versions: `20261104044752` = `022_session_reader_requests` and `20261104044940` = `023_schedule_weekday_plan`. Their SQL is fully applied. Without a repair, `supabase db push` stops with _Remote migration versions not found in local migrations directory_. If forced with `--include-all`, it would re-run 022/023 and fail (`relation "session_reader_requests" already exists`).

The repair only rewrites history rows and changes no schema. Run it once, from a checkout of this branch (or `main` after merge):

```bash
supabase link --project-ref hssqmbfunfyrnbwdzrql
supabase migration repair --status reverted 20261104044752 20261104044940
supabase migration repair --status applied 022 023
supabase migration list   # expect 001–023 on both sides, nothing extra
```

The equivalent SQL keeps the recorded statements:

```sql
begin;
update supabase_migrations.schema_migrations set version = '022' where version = '20261104044752';
update supabase_migrations.schema_migrations set version = '023' where version = '20261104044940';
commit;
```

Run the repair **before** merging the automation PR, or before adding the secrets. Otherwise the first deploy fails at the dry-run step. It applies nothing, so it would be harmless, but it would be red.

When applying a migration through the Supabase MCP or dashboard in future, which you shouldn't need to do, use the file's own version (`024`), never a timestamp.
