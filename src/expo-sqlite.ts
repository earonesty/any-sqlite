import type { WebSQLDatabase } from "expo-sqlite";
import * as SQLite from "expo-sqlite";
import { Database, primitive } from "./types";
export { Database } from "./types";

const live = new Map<string, Db>();

class Db implements Database {
  private tail: Promise<unknown> = Promise.resolve();
  private closing = false;
  private failed = false;
  private closePromise?: Promise<void>;
  private deletePromise?: Promise<void>;

  constructor(private db: WebSQLDatabase, private name: string) {}

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.tail.then(operation);
    this.tail = result.catch(() => {});
    return result;
  }

  private exec(sql: string, args: primitive[] = []): Promise<any[]> {
    return new Promise((resolve, reject) => {
      this.db.exec([{ sql, args }], false, (error, results) => {
        if (error) return reject(error);
        const result = results?.[0];
        if (!result) return reject(new Error("Expo SQLite returned no result"));
        if ("error" in result) return reject(result.error);
        resolve(result.rows);
      });
    });
  }

  /** Serialize transactions and inspect native BEGIN, statement and COMMIT errors. */
  private transaction(cmds: Array<[string, primitive[]]>): Promise<any[]> {
    if (this.closing || this.failed) {
      return Promise.reject(
        new Error("The SQLite database is closed or unavailable")
      );
    }
    return this.enqueue(async () => {
      if (this.failed) throw new Error("The SQLite database is unavailable");
      try {
        await this.exec("BEGIN;");
      } catch (error) {
        this.failed = true;
        throw error;
      }
      try {
        let rows: any[] = [];
        for (const [sql, args] of cmds) rows = await this.exec(sql, args);
        await this.exec("COMMIT;");
        return rows;
      } catch (error) {
        try {
          await this.exec("ROLLBACK;");
        } catch (rollbackError) {
          // Do not reuse a connection whose transaction state is unknown.
          this.failed = true;
          const failure = new Error(
            "Expo SQLite transaction and rollback failed"
          );
          Object.assign(failure, { cause: error, rollbackError });
          throw failure;
        }
        throw error;
      }
    });
  }

  execute(sql: string, args: primitive[] = []): Promise<any[]> {
    return this.transaction([[sql, args]]);
  }

  async get(sql: string, args?: primitive[]): Promise<any | undefined> {
    return (await this.execute(sql, args))[0];
  }

  async batch(cmds: Array<[sql: string, args: primitive[]]>): Promise<void> {
    await this.transaction(cmds);
  }

  /** Wait for queued work, close once, then delete while retaining name ownership. */
  delete(): Promise<void> {
    if (!this.deletePromise) {
      const owner = live.get(this.name);
      if (owner && owner !== this) {
        return Promise.reject(
          new Error(`SQLite database '${this.name}' has been reopened`)
        );
      }
      live.set(this.name, this);
      this.deletePromise = this.close().then(async () => {
        await this.db.deleteAsync();
        if (live.get(this.name) === this) live.delete(this.name);
      });
    }
    return this.deletePromise;
  }

  /** Stop accepting work immediately and close after accepted transactions finish. */
  close(): Promise<void> {
    if (!this.closePromise) {
      this.closing = true;
      this.closePromise = this.enqueue(async () => {
        await this.db.closeAsync();
        if (!this.deletePromise && live.get(this.name) === this)
          live.delete(this.name);
      });
    }
    return this.closePromise;
  }
}

/** Open one live adapter per name; native Expo connections may be shared by name. */
export function open(name: string, _opts?: any): Database {
  if (live.has(name))
    throw new Error(`SQLite database '${name}' is already open`);
  const db = new Db(SQLite.openDatabase(name), name);
  live.set(name, db);
  return db;
}
