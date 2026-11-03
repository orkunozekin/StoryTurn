import type { BookInput } from "@/lib/book-edition";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { beforeAll, afterAll, expect, it } from "vitest";
let db: PGlite;
let family: string;
const user = "00000000-0000-0000-0000-000000000001";
let scan: string;
const metadata: BookInput = {
  title: "Book",
  authors: ["Author"],
  editionKey: "/books/OL1M",
  openLibraryKey: "/works/OL1W",
  isbn: "9780060775858",
  format: "Hardcover",
  coverUrl: null,
};
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    `create schema auth; create table auth.users(id uuid primary key, email text); create role authenticated; create role service_role; create role anon; create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;`,
  );
  for (const file of readdirSync("supabase/migrations").sort()) {
    if (file.startsWith("011"))
      await db.exec(readFileSync("tests/fixtures/family-library-wishlist.sql", "utf8"));
    await db.exec(
      readFileSync(`supabase/migrations/${file}`, "utf8").replace(
        'create extension if not exists "pgcrypto";',
        "",
      ),
    );
  }
  await db.query("insert into auth.users values($1,'parent@example.com')", [user]);
  await db.query("select set_config('test.uid',$1,false)", [user]);
  family = (
    await db.query<{ id: string }>("select create_family('Family','Parent') as id")
  ).rows[0].id;
  scan = (await db.query<{ id: string }>("select start_book_scan() as id")).rows[0].id;
}, 20000);
afterAll(async () => {
  await db?.close();
});
async function save(data = metadata, session: string | null = scan) {
  return (
    await db.query<{ book: { id: string }; created: boolean }>(
      "select * from save_book_edition($1,$2)",
      [JSON.stringify(data), session],
    )
  ).rows[0];
}
it("deduplicates validated ISBN and edition identity, but keeps different editions of one work", async () => {
  const first = await save();
  expect(first.created).toBe(true);
  expect(await save()).toEqual({ ...first, created: false });
  const sameEditionOtherIsbn = await save({ ...metadata, isbn: "9780804429573" });
  expect(sameEditionOtherIsbn.book.id).toBe(first.book.id);
  expect(sameEditionOtherIsbn.created).toBe(false);
  expect(
    (
      await save({
        ...metadata,
        editionKey: "/books/OL2M",
        isbn: "9780804429573",
        format: "Paperback",
      })
    ).created,
  ).toBe(true);
});
it("never lets Undo remove a pre-existing duplicate, and supports idempotent removal", async () => {
  const existing = await save();
  const otherScan = (await db.query<{ id: string }>("select start_book_scan() as id"))
    .rows[0].id;
  expect((await save(metadata, otherScan)).created).toBe(false);
  expect(
    (
      await db.query<{ status: string }>("select * from remove_library_books($1,$2)", [
        [existing.book.id],
        otherScan,
      ])
    ).rows[0].status,
  ).toBe("unavailable");
  const added = await save(
    { ...metadata, editionKey: "/books/OL3M", isbn: "9780140328721" },
    otherScan,
  );
  for (let i = 0; i < 2; i++)
    expect(
      (
        await db.query<{ status: string }>("select * from remove_library_books($1,$2)", [
          [added.book.id],
          otherScan,
        ])
      ).rows[0].status,
    ).toBe("removed");
  await db.query("select finish_book_scan($1)", [otherScan]);
  await expect(save(metadata, otherScan)).rejects.toThrow(/ended/);
  scan = (await db.query<{ id: string }>("select start_book_scan() as id")).rows[0].id;
});
it("preserves referenced books and legacy identity while removing unreferenced selections", async () => {
  const existing = await save();
  const night = (
    await db.query<{ id: string }>(
      "insert into reading_sessions(family_id,scheduled_for,status,ics_uid) values($1,now(),'completed','book-test') returning id",
      [family],
    )
  ).rows[0].id;
  await db.query("insert into session_books(session_id,book_id) values($1,$2)", [
    night,
    existing.book.id,
  ]);
  // Legacy row without edition identity; use a distinct ISBN so it does not
  // collide with books_family_isbn_unique from the duplicate-detection migration.
  const legacy = (
    await db.query<{ id: string }>(
      "insert into books(family_id,title,authors,isbn) values($1,'Legacy','{}','9780000000002') returning id",
      [family],
    )
  ).rows[0].id;
  const results = (
    await db.query<{ id: string; status: string }>(
      "select * from remove_library_books($1)",
      [[existing.book.id, legacy]],
    )
  ).rows;
  expect(results.find((r) => r.id === existing.book.id)?.status).toBe("referenced");
  expect(results.find((r) => r.id === legacy)?.status).toBe("removed");
});
it("enforces family and scan ownership and keeps format separate from identity", async () => {
  const added = await save({
    ...metadata,
    editionKey: "/books/OL4M",
    isbn: "9780140328721",
    format: "",
  });
  await db.query("select correct_book_format($1,'Paperback')", [added.book.id]);
  expect(
    (
      await db.query<{ format: string; edition_key: string }>(
        "select format,edition_key from books where id=$1",
        [added.book.id],
      )
    ).rows[0],
  ).toEqual({ format: "Paperback", edition_key: "/books/OL4M" });
  const foreign = "00000000-0000-0000-0000-000000000002";
  await db.query("insert into auth.users values($1,'other@example.com')", [foreign]);
  await db.query("select set_config('test.uid',$1,false)", [foreign]);
  await db.query("select create_family('Other','Other parent')");
  await expect(save(metadata, scan)).rejects.toThrow(/ended/);
  expect(
    (
      await db.query<{ status: string }>("select * from remove_library_books($1)", [
        [added.book.id],
      ])
    ).rows[0].status,
  ).toBe("removed");
  expect(
    (
      await db.query<{ status: string }>("select * from remove_library_books($1)", [
        ["00000000-0000-0000-0000-000000000099"],
      ])
    ).rows[0].status,
  ).toBe("removed");
  expect(
    (await db.query("select id from books where id=$1", [added.book.id])).rows,
  ).toHaveLength(1);
  await expect(
    db.query("select correct_book_format($1,'Hardcover')", [added.book.id]),
  ).rejects.toThrow(/unavailable/);
  await db.query("select set_config('test.uid',$1,false)", [user]);
});
it("rejects invalid ISBNs and gives shared requests separate paced slots", async () => {
  await expect(save({ ...metadata, isbn: "9780060775859" })).rejects.toThrow(
    /Invalid ISBN/,
  );
  const slots = (
    await db.query<{ delay: number }>(
      "select reserve_book_lookup() as delay from generate_series(1,3)",
    )
  ).rows.map((r) => r.delay);
  expect(slots[1] - slots[0]).toBeGreaterThan(900);
  expect(slots[2] - slots[1]).toBeGreaterThan(900);
});

it("preserves legacy wishlist promotion without granting scan ownership writes", async () => {
  await db.exec(
    "grant usage on schema public,auth to authenticated; grant select on family_members,books,families to authenticated; set role authenticated",
  );
  const wanted = (
    await db.query<{ id: string }>(
      "select save_family_book('Wishlist book','{}','/works/OL99W',null,null,'wishlist') as id",
    )
  ).rows[0].id;
  await db.query("select move_wishlist_book($1)", [wanted]);
  expect(
    (await db.query("select id from books where open_library_key='/works/OL99W'")).rows,
  ).toHaveLength(1);
  expect(
    (await db.query("select id from wishlist_books where id=$1", [wanted])).rows,
  ).toHaveLength(0);
  await expect(
    db.query(
      "update books set scan_session_id=$1 where open_library_key='/works/OL99W'",
      [scan],
    ),
  ).rejects.toThrow(/permission/);
  await db.exec("reset role");
});

it("stores a description for Google volume ids and still rejects unsafe edition keys", async () => {
  const saved = await save({
    ...metadata,
    editionKey: "google:zyTCAlFPjgYC",
    isbn: "9780694003617",
    description: "  A caterpillar eats through the week.  ",
  });
  expect(saved.created).toBe(true);
  const row = saved.book as { edition_key?: string; description?: string; isbn?: string };
  expect(row.edition_key).toBe("google:zyTCAlFPjgYC");
  expect(row.isbn).toBe("9780694003617");
  expect(row.description).toBe("A caterpillar eats through the week.");
  const again = await save({
    ...metadata,
    editionKey: "google:zyTCAlFPjgYC",
    isbn: "9780694003617",
    description: "This later blurb must not replace the first.",
  });
  expect(again.created).toBe(false);
  expect((again.book as { description?: string }).description).toBe(
    "A caterpillar eats through the week.",
  );
  const blank = await save({
    ...metadata,
    editionKey: "/books/OL91M",
    isbn: "9780064430173",
    description: null,
  });
  const filled = await save({
    ...metadata,
    editionKey: "/books/OL91M",
    isbn: "9780064430173",
    description: "A bunny says goodnight.",
  });
  expect(filled.created).toBe(false);
  expect(filled.book.id).toBe(blank.book.id);
  expect((filled.book as { description?: string }).description).toBe(
    "A bunny says goodnight.",
  );
  await expect(
    save({ ...metadata, editionKey: "google:../nope", isbn: null }),
  ).rejects.toThrow(/Invalid edition/);
});

it("lets a family member set a description without writing edition identity", async () => {
  const saved = await save({
    ...metadata,
    editionKey: "/books/OL90M",
    isbn: "9780142410387",
    description: null,
  });
  await db.exec(
    "grant usage on schema public,auth to authenticated; grant select on books to authenticated; set role authenticated",
  );
  await db.query("update books set description=$2 where id=$1", [
    saved.book.id,
    "A quiet story.",
  ]);
  await expect(
    db.query("update books set edition_key='google:hack' where id=$1", [saved.book.id]),
  ).rejects.toThrow(/permission/);
  await db.exec("reset role");
  expect(
    (
      await db.query<{ description: string }>(
        "select description from books where id=$1",
        [saved.book.id],
      )
    ).rows[0].description,
  ).toBe("A quiet story.");
});

it("keeps saves and Undo active in the first tab after starting a second scan", async () => {
  const first = (await db.query<{ id: string }>("select start_book_scan() as id")).rows[0]
    .id;
  const second = (await db.query<{ id: string }>("select start_book_scan() as id"))
    .rows[0].id;
  const added = await save(
    { ...metadata, editionKey: "/books/OL77M", isbn: null },
    first,
  );
  expect(added.created).toBe(true);
  await db.query("select finish_book_scan($1)", [second]);
  expect(
    (
      await db.query<{ status: string }>("select * from remove_library_books($1,$2)", [
        [added.book.id],
        first,
      ])
    ).rows[0].status,
  ).toBe("removed");
});
