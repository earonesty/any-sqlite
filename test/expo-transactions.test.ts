import { open } from "../src/expo-sqlite";
import * as SQLite from "expo-sqlite";
import BetterSQLite from "better-sqlite3";

jest.mock("expo-sqlite", () => ({ openDatabase: jest.fn() }));

// Expose Expo 11's public exec surface, backed by real SQLite on Node.
const customOpenDatabase = require("@expo/websql/custom");
let connection: BetterSQLite.Database;
let db: ReturnType<typeof open>;

beforeEach(() => {
  class Backend {
    constructor(_name: string) {
      connection = new BetterSQLite(":memory:");
      connection.pragma("foreign_keys = ON");
    }
    exec(queries: any[], _readOnly: boolean, callback: Function) {
      const results = queries.map(({ sql, args }) => {
        try {
          const statement = connection.prepare(sql);
          if (statement.reader) {
            return { rows: statement.all(...args), rowsAffected: 0 };
          }
          const result = statement.run(...args);
          return {
            rows: [],
            rowsAffected: result.changes,
            insertId: result.lastInsertRowid,
          };
        } catch (error) {
          return { error };
        }
      });
      callback(null, results);
    }
  }
  const openWebSQL = customOpenDatabase(Backend);
  (SQLite.openDatabase as jest.Mock).mockImplementation((name) => {
    const native = openWebSQL(name, "1", name, 1);
    // Expose the public methods exactly as Expo SQLite 11.1.x does.
    native.exec = native._db.exec.bind(native._db);
    native.closeAsync = async () => connection.close();
    native.deleteAsync = async () => {};
    return native;
  });
  db = open("test.db");
});

afterEach(async () => {
  await db.close();
});

test("writes, empty reads, batches and gets complete through Expo's public exec backend", async () => {
  await expect(
    db.execute("CREATE TABLE items (id INTEGER UNIQUE)")
  ).resolves.toEqual([]);
  await expect(db.get("SELECT * FROM items")).resolves.toBeUndefined();
  await db.batch([
    ["INSERT INTO items VALUES (?)", [1]],
    ["INSERT INTO items VALUES (?)", [2]],
  ]);
  await expect(db.execute("SELECT * FROM items ORDER BY id")).resolves.toEqual([
    { id: 1 },
    { id: 2 },
  ]);
  await expect(
    db.get("SELECT * FROM items WHERE id = ?", [2])
  ).resolves.toEqual({ id: 2 });
  await expect(db.batch([])).resolves.toBeUndefined();
});

test("a real deferred constraint failure at COMMIT rejects and rolls back", async () => {
  await db.execute("CREATE TABLE parent (id INTEGER PRIMARY KEY)");
  await db.execute(
    "CREATE TABLE child (parent_id INTEGER REFERENCES parent(id) DEFERRABLE INITIALLY DEFERRED)"
  );
  await expect(
    db.execute("INSERT INTO child VALUES (?)", [99])
  ).rejects.toMatchObject({
    code: "SQLITE_CONSTRAINT_FOREIGNKEY",
  });
  expect(connection.inTransaction).toBe(false);
  await expect(db.execute("SELECT * FROM child")).resolves.toEqual([]);
  await db.batch([
    ["INSERT INTO parent VALUES (?)", [99]],
    ["INSERT INTO child VALUES (?)", [99]],
  ]);
  await expect(db.get("SELECT * FROM child")).resolves.toEqual({
    parent_id: 99,
  });
});

test("concurrent failed and successful batches remain isolated", async () => {
  await db.execute("CREATE TABLE items (id INTEGER UNIQUE)");
  const failed = db.batch([
    ["INSERT INTO items VALUES (?)", [1]],
    ["INSERT INTO items VALUES (?)", [1]],
  ]);
  const succeeded = db.batch([
    ["INSERT INTO items VALUES (?)", [2]],
    ["INSERT INTO items VALUES (?)", [3]],
  ]);
  await expect(failed).rejects.toMatchObject({
    code: "SQLITE_CONSTRAINT_UNIQUE",
  });
  await succeeded;
  await expect(db.execute("SELECT * FROM items ORDER BY id")).resolves.toEqual([
    { id: 2 },
    { id: 3 },
  ]);
});

test("real SQLite close waits for queued writes and subsequent operations reject", async () => {
  await db.execute("CREATE TABLE items (id INTEGER)");
  const write = db.execute("INSERT INTO items VALUES (?)", [1]);
  const close = db.close();
  await write;
  await close;
  expect(connection.open).toBe(false);
  await expect(db.execute("SELECT * FROM items")).rejects.toThrow("closed");
  await expect(db.batch([])).rejects.toThrow("closed");
});

test("failed batch rolls back prior writes and permits later queries", async () => {
  await db.execute("CREATE TABLE items (id INTEGER UNIQUE)");
  await expect(
    db.batch([
      ["INSERT INTO items VALUES (?)", [1]],
      ["INSERT INTO items VALUES (?)", [1]],
      ["INSERT INTO items VALUES (?)", [2]],
    ])
  ).rejects.toMatchObject({ code: "SQLITE_CONSTRAINT_UNIQUE" });
  await expect(db.execute("SELECT * FROM items")).resolves.toEqual([]);
  await expect(db.execute("invalid SQL")).rejects.toMatchObject({
    code: "SQLITE_ERROR",
  });
  await db.execute("INSERT INTO items VALUES (?)", [3]);
  await expect(db.get("SELECT * FROM items")).resolves.toEqual({ id: 3 });
});
