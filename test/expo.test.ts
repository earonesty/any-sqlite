import { open } from "../src/expo-sqlite";
import * as SQLite from "expo-sqlite";

jest.mock("expo-sqlite", () => ({ openDatabase: jest.fn() }));

let db: ReturnType<typeof open>;
let native: any;
let queued: Array<{ sql: string; args: any[]; success?: Function }>;
let commit: Function;
let fail: Function;

beforeEach(() => {
  queued = [];
  native = {
    transaction: jest.fn((callback, error, success) => {
      fail = error;
      commit = success;
      callback({
        executeSql: (sql, args, success) => queued.push({ sql, args, success }),
      });
    }),
    closeAsync: jest.fn().mockResolvedValue(undefined),
    deleteAsync: jest.fn().mockResolvedValue(undefined),
  };
  (SQLite.openDatabase as jest.Mock).mockReturnValue(native);
  db = open("test.db");
});

function result(rows: any[]) {
  queued[0].success?.({}, { rows: { _array: rows, length: rows.length } });
}

test.each([
  "CREATE TABLE foo (id)",
  "INSERT INTO foo VALUES (1)",
  "SELECT * FROM foo",
])("%s resolves empty results after commit", async (sql) => {
  const operation = db.execute(sql);
  let settled = false;
  operation.then(() => {
    settled = true;
  });
  result([]);
  await Promise.resolve();
  expect(settled).toBe(false);
  commit();
  await expect(operation).resolves.toEqual([]);
});

test("returns rows and forwards bindings", async () => {
  const operation = db.execute("SELECT ?", [42, null, "text"]);
  expect(queued[0].args).toEqual([42, null, "text"]);
  result([{ id: 42 }]);
  commit();
  await expect(operation).resolves.toEqual([{ id: 42 }]);
});

test.each([{ rows: [] }, { rows: [{ id: 1 }] }])(
  "get handles $rows",
  async ({ rows }) => {
    const operation = db.get("SELECT * FROM foo");
    result(rows);
    commit();
    await expect(operation).resolves.toEqual(rows[0]);
  }
);

test("rejects a transaction error even after a statement succeeds", async () => {
  const operation = db.execute("INSERT INTO foo VALUES (1)");
  result([]);
  const error = new Error("commit failed");
  fail(error);
  await expect(operation).rejects.toBe(error);
});

test.each([
  { commands: [] },
  {
    commands: [
      ["INSERT INTO foo VALUES (?)", [1]],
      ["INSERT INTO foo VALUES (?)", [2]],
    ],
  },
])(
  "batch queues $commands synchronously and waits for commit",
  async ({ commands }) => {
    const operation = db.batch(commands as [string, any[]][]);
    expect(queued.map(({ sql, args }) => [sql, args])).toEqual(commands);
    let settled = false;
    operation.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    commit();
    await expect(operation).resolves.toBeUndefined();
  }
);

test("batch rejects transaction failure", async () => {
  const operation = db.batch([["invalid SQL", []]]);
  const error = new Error("SQL error");
  fail(error);
  await expect(operation).rejects.toBe(error);
});

test("rejects synchronous native errors", async () => {
  native.transaction.mockImplementation(() => {
    throw new Error("closed");
  });
  await expect(db.execute("SELECT 1")).rejects.toThrow("closed");
  await expect(db.batch([])).rejects.toThrow("closed");
});

test("delete waits for close and deletion", async () => {
  let finishClose: Function;
  let finishDelete: Function;
  native.closeAsync.mockReturnValue(
    new Promise((resolve) => {
      finishClose = resolve;
    })
  );
  native.deleteAsync.mockReturnValue(
    new Promise((resolve) => {
      finishDelete = resolve;
    })
  );
  const operation = db.delete();
  let settled = false;
  Promise.resolve(operation).then(() => {
    settled = true;
  });
  expect(native.deleteAsync).not.toHaveBeenCalled();
  finishClose!();
  await new Promise((resolve) => setImmediate(resolve));
  expect(native.deleteAsync).toHaveBeenCalledTimes(1);
  expect(settled).toBe(false);
  finishDelete!();
  await expect(operation).resolves.toBeUndefined();
});

test("close forwards rejection and delete stops on close failure", async () => {
  native.closeAsync.mockRejectedValue(new Error("close failed"));
  await expect(db.close()).rejects.toThrow("close failed");
  await expect(db.delete()).rejects.toThrow("close failed");
  expect(native.deleteAsync).not.toHaveBeenCalled();
});

test("delete forwards deletion failure", async () => {
  native.deleteAsync.mockRejectedValue(new Error("delete failed"));
  await expect(db.delete()).rejects.toThrow("delete failed");
});
