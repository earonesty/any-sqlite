import { open } from "../src";
import { Database } from "../src/types";
import fs from 'fs/promises'

let db: Database

beforeEach(async () => {
  try {
    await fs.unlink("yo.db")
  } catch {
    // ok
  }
  db = open("yo.db")
});

afterEach(async () => {
  db?.close();
  db?.delete();
});

test("can sql", async () => {
    await db.execute("create table foo (bar, baz)")
    await db.execute("insert into foo (bar, baz) values (?, ?)", [1, 2])
    await db.execute("insert into foo (bar, baz) values (?, ?)", [2, 3])
    let rows = await db.execute("select * from foo")
    expect(rows).toEqual([{bar: 1, baz: 2}, {bar: 2, baz: 3}])
});

test("can batch", async () => {
    await db.execute("create table foo (bar, baz)")
    await db.batch([
        ["insert into foo (bar, baz) values (?, ?)", [1, 2]],
        ["insert into foo (bar, baz) values (?, ?)", [2, 3]]
    ])
    let rows = await db.execute("select * from foo")
    expect(rows).toEqual([{bar: 1, baz: 2}, {bar: 2, baz: 3}])
});
