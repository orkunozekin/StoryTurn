import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { beforeAll, afterAll, expect, it } from "vitest";
let db: PGlite;
const owner = "00000000-0000-0000-0000-000000000001";
const reader = "00000000-0000-0000-0000-000000000002";
const outsider = "00000000-0000-0000-0000-000000000003";
let rid: string;
let outsiderMemberId: string;
async function as(uid: string) {
  await db.query("select set_config('test.uid',$1,false)", [uid]);
}
async function relationOf(id: string) {
  return (
    await db.query<{ relation_to_children: string }>(
      "select relation_to_children from family_members where id = $1",
      [id],
    )
  ).rows[0].relation_to_children;
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    `create schema auth; create table auth.users(id uuid primary key, email text); create role authenticated; create role service_role; create role anon; create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;`,
  );
  for (const file of readdirSync("supabase/migrations").sort()) {
    await db.exec(
      readFileSync(`supabase/migrations/${file}`, "utf8").replace(
        'create extension if not exists "pgcrypto";',
        "",
      ),
    );
  }
  await db.query(
    "insert into auth.users values($1,'owner@example.com'),($2,'reader@example.com'),($3,'outsider@example.com')",
    [owner, reader, outsider],
  );
  await as(owner);
  const fid = (
    await db.query<{ id: string }>("select create_family('Family','Parent') as id")
  ).rows[0].id;
  rid = (
    await db.query<{ id: string }>(
      "insert into family_members(family_id,user_id,display_name,email,role) values($1,$2,'Nana','reader@example.com','reader') returning id",
      [fid, reader],
    )
  ).rows[0].id;
  await as(outsider);
  await db.query("select create_family('Other family','Outsider')");
  outsiderMemberId = (
    await db.query<{ id: string }>("select id from family_members where user_id = $1", [
      outsider,
    ])
  ).rows[0].id;
}, 20000);
afterAll(async () => {
  await db?.close();
});
it("stores the relation picked when creating or joining a family", async () => {
  await as(owner);
  const ownerMember = (
    await db.query<{ id: string; family_id: string }>(
      "select id, family_id from family_members where user_id = $1",
      [owner],
    )
  ).rows[0];
  expect(await relationOf(ownerMember.id)).toBe("parent");
  await db.query(
    "insert into invite_codes(family_id,code,created_by_member_id) values($1,'JOINME',$2)",
    [ownerMember.family_id, ownerMember.id],
  );
  const joiner = "00000000-0000-0000-0000-000000000004";
  const creator = "00000000-0000-0000-0000-000000000005";
  await db.query(
    "insert into auth.users values($1,'aunt@example.com'),($2,'sitter@example.com')",
    [joiner, creator],
  );
  await as(joiner);
  await expect(db.query("select join_family('JOINME','Aunt','cousin')")).rejects.toThrow(
    /Invalid relation/,
  );
  await db.query("select join_family('JOINME','Aunt','aunt_uncle')");
  await as(creator);
  await db.query("select create_family('Sitter family','Sitter','caregiver')");
  const relations = await db.query<{ user_id: string; relation_to_children: string }>(
    "select user_id, relation_to_children from family_members where user_id in ($1,$2)",
    [joiner, creator],
  );
  expect(
    Object.fromEntries(relations.rows.map((r) => [r.user_id, r.relation_to_children])),
  ).toEqual({ [joiner]: "aunt_uncle", [creator]: "caregiver" });
});
it("lets a parent update a reader's relation to the kids", async () => {
  await as(owner);
  await db.query("select update_family_member_relation($1,'grandparent')", [rid]);
  expect(await relationOf(rid)).toBe("grandparent");
});
it("rejects invalid relations, non-owners, and other families' members", async () => {
  await as(owner);
  await expect(
    db.query("select update_family_member_relation($1,'cousin')", [rid]),
  ).rejects.toThrow(/Invalid relation/);
  await expect(
    db.query("select update_family_member_relation($1,'parent')", [outsiderMemberId]),
  ).rejects.toThrow(/Reader not found/);
  await as(reader);
  await expect(
    db.query("select update_family_member_relation($1,'parent')", [rid]),
  ).rejects.toThrow(/owner/);
  expect(await relationOf(rid)).toBe("grandparent");
  expect(await relationOf(outsiderMemberId)).toBe("parent");
});
