import { open } from "../src/expo-sqlite";
import * as SQLite from "expo-sqlite";
import BetterSQLite from "better-sqlite3";

jest.mock("expo-sqlite", () => ({ openDatabase: jest.fn() }));

// Use the same transaction layer as Expo 11, backed by real SQLite on Node.
const customOpenDatabase = require("@expo/websql/custom");
let connection: BetterSQLite.Database;
let db: ReturnType<typeof open>;

beforeEach(() => {
  class Backend {
    constructor(_name: string) {
      connection = new BetterSQLite(":memory:");
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
  (SQLite.openDatabase as jest.Mock).mockImplementation((name) =>
    openWebSQL(name, "1", name, 1)
  );
  db = open("test.db");
});

afterEach(() => connection.close());

test("writes, empty reads, batches and gets complete through Expo transaction engine", async () => {
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
