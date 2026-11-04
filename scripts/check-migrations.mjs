#!/usr/bin/env node
// Validates supabase/migrations against a base git ref (usually the PR's target branch).
//
// Rules:
//   1. Every file is named NNN_snake_case.sql (three-digit prefix).
//   2. No two files share a numeric prefix.
//   3. Files that exist on the base ref are immutable: no edits, renames, or deletions.
//      `--allow-edits` (set by the `allow-migration-edit` PR label) downgrades this to a warning,
//      for fixing a migration that failed and was rolled back, so production never recorded it.
//   4. New files continue the sequence: the next one is (highest base prefix + 1), then +2, ...
//      (A new file may also fill a number that was missing on the base ref.)
//   5. The full set is contiguous from 001 with no gaps.
//
// Usage: node scripts/check-migrations.mjs <base-ref> [--allow-edits]

import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const MIGRATIONS_DIR = "supabase/migrations";
const NAME_PATTERN = /^(\d{3})_[a-z0-9]+(?:_[a-z0-9]+)*\.sql$/;

/** @param {string} file */
function prefixOf(file) {
  const match = NAME_PATTERN.exec(file);
  return match ? Number(match[1]) : null;
}

/**
 * @param {{
 *   baseFiles: string[];
 *   headFiles: string[];
 *   changes: { status: string; file: string }[];
 *   allowEdits?: boolean;
 * }} input
 *   `baseFiles` / `headFiles` are bare file names in the migrations directory on each side.
 *   `changes` is `git diff --name-status` output for that directory (status letter + bare file
 *   name of the base-side path).
 * @returns {{ errors: string[]; warnings: string[]; added: string[] }}
 */
export function checkMigrations({ baseFiles, headFiles, changes, allowEdits = false }) {
  /** @type {string[]} */
  const errors = [];
  /** @type {string[]} */
  const warnings = [];
  const base = new Set(baseFiles);

  for (const file of headFiles) {
    if (prefixOf(file) === null) {
      errors.push(
        `${file}: name must match NNN_snake_case.sql (e.g. 024_add_reading_streaks.sql).`,
      );
    }
  }

  /** @type {Map<number, string[]>} */
  const byPrefix = new Map();
  for (const file of headFiles) {
    const prefix = prefixOf(file);
    if (prefix === null) continue;
    byPrefix.set(prefix, [...(byPrefix.get(prefix) ?? []), file]);
  }
  for (const [prefix, files] of byPrefix) {
    if (files.length > 1) {
      errors.push(
        `Duplicate migration number ${String(prefix).padStart(3, "0")}: ${files.join(", ")}.`,
      );
    }
  }

  for (const { status, file } of changes) {
    if (!base.has(file)) continue;
    if (status.startsWith("A")) continue;
    const verb = status.startsWith("D")
      ? "deleted"
      : status.startsWith("R")
        ? "renamed"
        : "modified";
    const message = `${file}: existing migrations are immutable but this one was ${verb}.`;
    if (allowEdits) {
      warnings.push(
        `${message} Allowed by the allow-migration-edit label: production must not have recorded it.`,
      );
    } else {
      errors.push(
        `${message} Add a new migration instead (see docs/database-migrations.md).`,
      );
    }
  }

  const basePrefixes = baseFiles.map(prefixOf).filter((p) => p !== null);
  const baseMax = basePrefixes.length ? Math.max(...basePrefixes) : 0;
  const basePrefixSet = new Set(basePrefixes);
  const added = headFiles.filter((file) => !base.has(file)).sort();

  let expected = baseMax + 1;
  for (const file of added) {
    const prefix = prefixOf(file);
    if (prefix === null) continue;
    if (prefix <= baseMax) {
      if (basePrefixSet.has(prefix)) continue; // already reported as a duplicate
      warnings.push(
        `${file}: fills number ${String(prefix).padStart(3, "0")}, which was missing on the base branch. ` +
          "Only do this to restore a migration production already recorded.",
      );
      continue;
    }
    if (prefix !== expected) {
      errors.push(
        `${file}: expected the next migration number to be ${String(expected).padStart(3, "0")}, got ${String(prefix).padStart(3, "0")}.`,
      );
    }
    expected = Math.max(expected, prefix) + 1;
  }

  const allPrefixes = [...byPrefix.keys()].sort((a, b) => a - b);
  const max = allPrefixes.length ? allPrefixes[allPrefixes.length - 1] : 0;
  const missing = [];
  for (let n = 1; n <= max; n++)
    if (!byPrefix.has(n)) missing.push(String(n).padStart(3, "0"));
  if (missing.length)
    errors.push(`Migration numbers are not contiguous; missing: ${missing.join(", ")}.`);

  return { errors, warnings, added };
}

/** @param {string[]} args */
function git(args) {
  return execFileSync("git", args, { encoding: "utf8" });
}

function main() {
  const args = process.argv.slice(2);
  const allowEdits = args.includes("--allow-edits");
  const baseRef = args.find((arg) => !arg.startsWith("--"));
  if (!baseRef) {
    console.error("Usage: node scripts/check-migrations.mjs <base-ref> [--allow-edits]");
    process.exit(2);
  }
  const baseFiles = git(["ls-tree", "--name-only", `${baseRef}:${MIGRATIONS_DIR}`])
    .split("\n")
    .filter(Boolean);
  const headFiles = readdirSync(MIGRATIONS_DIR).sort();
  const changes = git([
    "diff",
    "--name-status",
    "-M",
    `${baseRef}...HEAD`,
    "--",
    MIGRATIONS_DIR,
  ])
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [status, from] = line.split("\t");
      return { status, file: path.basename(from) };
    });

  const { errors, warnings, added } = checkMigrations({
    baseFiles,
    headFiles,
    changes,
    allowEdits,
  });
  console.log(
    added.length ? `New migrations: ${added.join(", ")}` : "No new migrations.",
  );
  for (const warning of warnings) console.log(`::warning::${warning}`);
  for (const error of errors) console.log(`::error::${error}`);
  if (errors.length) process.exit(1);
  console.log("Migration files look good.");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  main();
