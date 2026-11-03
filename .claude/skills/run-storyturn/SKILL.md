---
name: run-storyturn
description: Run, start, launch, drive, or screenshot the StoryTurn (bedtime-readers) Next.js app locally in demo mode, log in as a demo user, visit pages, and run its tests/lint.
---

# Run StoryTurn

Next.js 16 app (bedtime reading rotation). Locally it runs in **demo mode** (in-memory
seed family, no Supabase needed). Agents drive it with the Playwright script
`.claude/skills/run-storyturn/driver.mjs`. Paths are relative to the repo root.

## Setup

```bash
npm ci
```

## Run (agent path)

Start the dev server in the background (port 3456 is baked into `npm run dev`):

```bash
FORCE_DEMO_MODE=1 nohup npm run dev > /tmp/storyturn-dev.log 2>&1 &
for i in $(seq 60); do curl -s -o /dev/null -w "%{http_code}\n" localhost:3456/login | grep -q 200 && break; sleep 2; done
```

Log in and screenshot pages (default: `/ /schedule /library /family`; pass any paths):

```bash
node .claude/skills/run-storyturn/driver.mjs
node .claude/skills/run-storyturn/driver.mjs /library /family
```

Output: one line per page (`status path -> png | first heading`), PNGs in
`/tmp/storyturn-shots/` (override with `OUT=`). Phone viewport 390x844.
`EMAIL=jordan@example.com` / `nana@example.com` logs in as the other demo members
(owner is `alex@example.com`; any email works, password `demo`). Browser
`pageerror`s print as `PAGEERROR ...`. Extend the script for clicks/forms.

Stop: `pkill -f "next dev"`.

## Test

```bash
npm test
npm run lint
```

(286 tests pass, ~30s.) CI also runs `npm run build`.

## Gotchas

- Demo state is in-memory in the dev server process: restart the server to reset it;
  writes from one driver run persist into the next.
- Demo mode also turns on automatically when Supabase env vars are absent;
  `FORCE_DEMO_MODE=1` just makes it explicit even if `.env.local` exists.
- The first request to each route compiles it (~4s), so the driver uses `networkidle`
  and a 30s login wait.
- Screenshots show the Next.js dev-tools "N" badge bottom-left; that's not app UI.
- `chromium-cli` isn't installed in the cloud container; the driver uses the
  preinstalled global `playwright` module directly.
- `AGENTS.md` warns that Next 16 APIs differ: read `node_modules/next/dist/docs/` before changing code.
