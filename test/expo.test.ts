import { open } from "../src/expo-sqlite";
import * as SQLite from "expo-sqlite";

jest.mock("expo-sqlite", () => ({ openDatabase: jest.fn() }));
let db: ReturnType<typeof open>;
let native: any;
let name: string;
let nextName = 0;

beforeEach(() => {
  name = `mock-${nextName++}.db`;
  native = {
    exec: jest.fn((queries, _readOnly, callback) =>
      callback(
        null,
        queries.map(() => ({ rows: [], rowsAffected: 0 }))
      )
    ),
    closeAsync: jest.fn().mockResolvedValue(undefined),
    deleteAsync: jest.fn().mockResolvedValue(undefined),
  };
  (SQLite.openDatabase as jest.Mock).mockReturnValue(native);
  db = open(name);
});

afterEach(async () => {
  await Promise.resolve(db.close()).catch(() => {});
});

function sqlCalls() {
  return native.exec.mock.calls.map(([queries]) => queries[0].sql);
}

function failAt(sql: string, error: Error, backend = false) {
  native.exec.mockImplementation(([query], _readOnly, callback) => {
    if (query.sql === sql) {
      if (backend) callback(error);
      else callback(null, [{ error }]);
    } else callback(null, [{ rows: [], rowsAffected: 0 }]);
  });
}

test.each([
  "CREATE TABLE foo (id)",
  "INSERT INTO foo VALUES (1)",
  "SELECT * FROM foo",
])("%s returns empty rows after commit", async (sql) => {
  await expect(db.execute(sql)).resolves.toEqual([]);
  expect(sqlCalls()).toEqual(["BEGIN;", sql, "COMMIT;"]);
});

test("returns rows and forwards bindings", async () => {
  native.exec.mockImplementation(([query], _readOnly, callback) =>
    callback(null, [
      { rows: query.sql === "SELECT ?" ? [{ id: 42 }] : [], rowsAffected: 0 },
    ])
  );
  await expect(db.execute("SELECT ?", [42, null, "text"])).resolves.toEqual([
    { id: 42 },
  ]);
  expect(native.exec.mock.calls[1][0][0].args).toEqual([42, null, "text"]);
  await expect(db.get("SELECT ?")).resolves.toEqual({ id: 42 });
  await expect(db.get("SELECT empty")).resolves.toBeUndefined();
});

test("waits for native commit completion", async () => {
  let commit: Function;
  native.exec.mockImplementation(([query], _readOnly, callback) => {
    if (query.sql === "COMMIT;") commit = callback;
    else callback(null, [{ rows: [], rowsAffected: 0 }]);
  });
  let settled = false;
  const operation = db.execute("INSERT");
  operation.then(() => {
    settled = true;
  });
  await new Promise((resolve) => setImmediate(resolve));
  expect(settled).toBe(false);
  commit!(null, [{ rows: [], rowsAffected: 0 }]);
  await expect(operation).resolves.toEqual([]);
});

test.each([false, true])(
  "rejects commit error and rolls back (backend=%s)",
  async (backend) => {
    const error = new Error("commit failed");
    failAt("COMMIT;", error, backend);
    await expect(db.execute("INSERT")).rejects.toBe(error);
    expect(sqlCalls()).toEqual(["BEGIN;", "INSERT", "COMMIT;", "ROLLBACK;"]);
  }
);

test("failed statement stops batch and rolls back", async () => {
  const error = new Error("statement failed");
  failAt("bad", error);
  await expect(
    db.batch([
      ["good", []],
      ["bad", []],
      ["skipped", []],
    ])
  ).rejects.toBe(error);
  expect(sqlCalls()).toEqual(["BEGIN;", "good", "bad", "ROLLBACK;"]);
});

test("serializes batches and closes only after accepted work", async () => {
  const first = db.batch([
    ["first", []],
    ["second", []],
  ]);
  const second = db.batch([["third", []]]);
  const close = db.close();
  await expect(db.execute("late")).rejects.toThrow("closed");
  await expect(db.batch([])).rejects.toThrow("closed");
  expect(native.closeAsync).not.toHaveBeenCalled();
  await Promise.all([first, second, close]);
  expect(sqlCalls()).toEqual([
    "BEGIN;",
    "first",
    "second",
    "COMMIT;",
    "BEGIN;",
    "third",
    "COMMIT;",
  ]);
  expect(native.closeAsync).toHaveBeenCalledTimes(1);
  await db.close();
  await expect(db.execute("closed")).rejects.toThrow("closed");
});

test("empty batches commit", async () => {
  await expect(db.batch([])).resolves.toBeUndefined();
  expect(sqlCalls()).toEqual(["BEGIN;", "COMMIT;"]);
});

test("rejects duplicate live opens but permits distinct names and reopen after close", async () => {
  expect(() => open(name)).toThrow("already open");
  const other = open(`${name}-other`);
  await other.close();
  await db.close();
  const reopened = open(name);
  await expect(db.delete()).rejects.toThrow("reopened");
  await reopened.close();
});

test("delete waits for close and deletion, blocking reopen until deletion completes", async () => {
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
  await new Promise((resolve) => setImmediate(resolve));
  expect(native.deleteAsync).not.toHaveBeenCalled();
  expect(() => open(name)).toThrow("already open");
  finishClose!();
  await new Promise((resolve) => setImmediate(resolve));
  expect(native.deleteAsync).toHaveBeenCalledTimes(1);
  expect(() => open(name)).toThrow("already open");
  finishDelete!();
  await operation;
  await db.delete();
  const reopened = open(name);
  await reopened.close();
});

test("close rejection prevents deletion and reuse", async () => {
  native.closeAsync.mockRejectedValue(new Error("close failed"));
  await expect(db.delete()).rejects.toThrow("close failed");
  expect(native.deleteAsync).not.toHaveBeenCalled();
  await expect(db.execute("SELECT 1")).rejects.toThrow("closed");
  expect(() => open(name)).toThrow("already open");
});

test("delete forwards failure and keeps the name reserved", async () => {
  native.deleteAsync.mockRejectedValue(new Error("delete failed"));
  await expect(db.delete()).rejects.toThrow("delete failed");
  expect(() => open(name)).toThrow("already open");
});

test("synchronous exec errors reject rather than hang", async () => {
  native.exec.mockImplementation(() => {
    throw new Error("native failure");
  });
  await expect(db.execute("SELECT 1")).rejects.toThrow("native failure");
});

test("BEGIN failure does not run statements or roll back another transaction", async () => {
  failAt("BEGIN;", new Error("already in transaction"));
  await expect(db.execute("INSERT")).rejects.toThrow("already in transaction");
  await expect(db.execute("INSERT")).rejects.toThrow("unavailable");
  expect(sqlCalls()).toEqual(["BEGIN;"]);
});

test("rollback failure rejects queued operations and preserves both errors", async () => {
  const cause = new Error("commit failed");
  const rollbackError = new Error("rollback failed");
  native.exec.mockImplementation(([query], _readOnly, callback) => {
    const error =
      query.sql === "COMMIT;"
        ? cause
        : query.sql === "ROLLBACK;"
        ? rollbackError
        : null;
    callback(null, [error ? { error } : { rows: [], rowsAffected: 0 }]);
  });
  const first = db.execute("INSERT");
  const second = db.execute("queued");
  await expect(first).rejects.toMatchObject({ cause, rollbackError });
  await expect(second).rejects.toThrow("unavailable");
  expect(sqlCalls()).not.toContain("queued");
});
