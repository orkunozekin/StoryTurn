import { readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { checkMigrations } from "../scripts/check-migrations.mjs";

const base = ["001_init.sql", "002_family_bootstrap.sql", "003_family_management.sql"];

function run(headFiles: string[], changes: { status: string; file: string }[] = []) {
  return checkMigrations({ baseFiles: base, headFiles, changes });
}

describe("checkMigrations", () => {
  it("accepts the next migration number", () => {
    const result = run(
      [...base, "004_add_streaks.sql"],
      [{ status: "A", file: "004_add_streaks.sql" }],
    );
    expect(result.errors).toEqual([]);
    expect(result.added).toEqual(["004_add_streaks.sql"]);
  });

  it("accepts several consecutive new migrations", () => {
    expect(run([...base, "004_a.sql", "005_b.sql"]).errors).toEqual([]);
  });

  it("rejects a duplicate prefix", () => {
    const { errors } = run([...base, "003_other.sql"]);
    expect(errors.join("\n")).toMatch(/Duplicate migration number 003/);
  });

  it("rejects skipping a number", () => {
    const { errors } = run([...base, "005_skip.sql"]);
    expect(errors.join("\n")).toMatch(
      /expected the next migration number to be 004, got 005/,
    );
  });

  it("rejects names that break the NNN_name.sql convention", () => {
    for (const bad of [
      "4_short.sql",
      "20261104044752_ts.sql",
      "004-dash.sql",
      "004_Upper.sql",
      "004_x.txt",
    ]) {
      expect(run([...base, bad]).errors.join("\n")).toMatch(
        /must match NNN_snake_case\.sql/,
      );
    }
  });

  it("rejects edits, renames and deletions of existing migrations", () => {
    expect(
      run(base, [{ status: "M", file: "002_family_bootstrap.sql" }]).errors[0],
    ).toMatch(/was modified/);
    expect(
      run(base, [{ status: "R100", file: "002_family_bootstrap.sql" }]).errors[0],
    ).toMatch(/was renamed/);
    expect(
      run(
        ["001_init.sql", "003_family_management.sql"],
        [{ status: "D", file: "002_family_bootstrap.sql" }],
      ).errors.join("\n"),
    ).toMatch(/was deleted/);
  });

  it("downgrades edits to warnings when explicitly allowed", () => {
    const result = checkMigrations({
      baseFiles: base,
      headFiles: base,
      changes: [{ status: "M", file: "003_family_management.sql" }],
      allowEdits: true,
    });
    expect(result.errors).toEqual([]);
    expect(result.warnings[0]).toMatch(/allow-migration-edit/);
  });

  it("allows filling a gap that existed on the base branch, with a warning", () => {
    const result = checkMigrations({
      baseFiles: ["001_a.sql", "003_c.sql"],
      headFiles: ["001_a.sql", "002_b.sql", "003_c.sql"],
      changes: [{ status: "A", file: "002_b.sql" }],
    });
    expect(result.errors).toEqual([]);
    expect(result.warnings[0]).toMatch(/fills number 002/);
  });

  it("rejects gaps in the full sequence", () => {
    const result = checkMigrations({
      baseFiles: ["001_a.sql"],
      headFiles: ["001_a.sql", "003_c.sql"],
      changes: [],
    });
    expect(result.errors.join("\n")).toMatch(/missing: 002/);
  });

  it("passes for the repository's current migrations", () => {
    const files = readdirSync("supabase/migrations").sort();
    expect(
      checkMigrations({ baseFiles: files, headFiles: files, changes: [] }).errors,
    ).toEqual([]);
  });
});
