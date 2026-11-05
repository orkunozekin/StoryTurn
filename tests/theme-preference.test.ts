import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  demoLogin,
  demoLogout,
  getThemePreference,
  resetDemoStore,
  saveThemePreference,
} from "@/lib/demo/store";

describe("demo theme preference", () => {
  beforeEach(() => resetDemoStore());

  it("keeps each account's theme separately", () => {
    demoLogin("alex@example.com");
    expect(getThemePreference()).toBeNull();
    saveThemePreference("dark");
    expect(getThemePreference()).toBe("dark");

    demoLogin("jordan@example.com");
    expect(getThemePreference()).toBeNull();
    saveThemePreference("light");

    demoLogin("alex@example.com");
    expect(getThemePreference()).toBe("dark");
  });

  it("needs a signed-in account to save", () => {
    demoLogout();
    expect(getThemePreference()).toBeNull();
    expect(() => saveThemePreference("dark")).toThrow(/Not signed in/);
  });
});

describe("user_preferences table", () => {
  let db: PGlite;
  const alex = "00000000-0000-0000-0000-000000000001";
  const jordan = "00000000-0000-0000-0000-000000000002";
  const as = async (uid: string) => {
    await db.exec("reset role");
    await db.query("select set_config('test.uid',$1,false)", [uid]);
    await db.exec("set role authenticated");
  };
  const themeOf = async (uid: string) => {
    await db.exec("reset role");
    return (
      await db.query<{ theme: string }>(
        "select theme from user_preferences where user_id = $1",
        [uid],
      )
    ).rows[0]?.theme;
  };

  beforeAll(async () => {
    db = new PGlite();
    await db.exec(
      `create schema auth; create table auth.users(id uuid primary key, email text); create role authenticated; create role service_role; create role anon; create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$; grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;`,
    );
    for (const file of readdirSync("supabase/migrations").sort()) {
      await db.exec(
        readFileSync(`supabase/migrations/${file}`, "utf8").replace(
          'create extension if not exists "pgcrypto";',
          "",
        ),
      );
    }
    await db.exec("grant usage on schema public to authenticated");
    await db.query(
      "insert into auth.users values($1,'alex@example.com'),($2,'jordan@example.com')",
      [alex, jordan],
    );
  }, 20000);
  afterAll(async () => db?.close());

  const upsert = (uid: string, theme: string) =>
    db.query(
      "insert into user_preferences(user_id, theme) values($1,$2) on conflict (user_id) do update set theme = excluded.theme, updated_at = now()",
      [uid, theme],
    );

  it("lets a user save and change their own theme", async () => {
    await as(alex);
    await upsert(alex, "dark");
    expect(await themeOf(alex)).toBe("dark");
    await as(alex);
    await upsert(alex, "light");
    expect(await themeOf(alex)).toBe("light");
  });

  it("hides and protects other users' themes", async () => {
    await as(jordan);
    await upsert(jordan, "dark");
    await as(alex);
    expect(
      (await db.query("select * from user_preferences where user_id = $1", [jordan]))
        .rows,
    ).toHaveLength(0);
    await expect(upsert(jordan, "light")).rejects.toThrow();
    expect(await themeOf(jordan)).toBe("dark");
  });

  it("only stores light or dark", async () => {
    await as(alex);
    await expect(upsert(alex, "sepia")).rejects.toThrow();
    await db.exec("reset role");
  });
});
