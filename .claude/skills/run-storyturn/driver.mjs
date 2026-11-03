// Usage: node .claude/skills/run-storyturn/driver.mjs [path ...]
// Logs in (demo mode) as $EMAIL (default alex@example.com), visits each path,
// screenshots to $OUT (default /tmp/storyturn-shots). Needs dev server on $BASE.
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch { pw = require("/opt/node22/lib/node_modules/playwright"); }
const BASE = process.env.BASE ?? "http://localhost:3456";
const EMAIL = process.env.EMAIL ?? "alex@example.com";
const OUT = process.env.OUT ?? "/tmp/storyturn-shots";
const paths = process.argv.slice(2).length ? process.argv.slice(2) : ["/", "/schedule", "/library", "/family"];
mkdirSync(OUT, { recursive: true });
const browser = await pw.chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
page.on("pageerror", (e) => console.log("PAGEERROR", e.message));
await page.goto(BASE + "/login");
await page.fill('input[name="email"]', EMAIL);
await page.fill('input[name="password"]', "demo");
await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30000 }), page.click('button[type="submit"]')]);
console.log("logged in ->", page.url());
for (const p of paths) {
  const res = await page.goto(BASE + p, { waitUntil: "networkidle" });
  const file = `${OUT}/${p === "/" ? "home" : p.replace(/\//g, "_").replace(/^_/, "")}.png`;
  await page.screenshot({ path: file, fullPage: true });
  console.log(res?.status(), p, "->", file, "|", (await page.locator("h1,h2").first().textContent().catch(() => ""))?.trim());
}
await browser.close();
