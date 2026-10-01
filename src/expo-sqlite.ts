import type { WebSQLDatabase } from "expo-sqlite";
import * as SQLite from "expo-sqlite";
import { Database, primitive } from "./types";
export { Database } from "./types";

class Db implements Database {
  constructor(private db: WebSQLDatabase) {}

  execute(sql: string, args?: primitive[]): Promise<any[]> {
    return new Promise((resolve, reject) => {
      let rows: any[] = [];
      this.db.transaction(
        (tx) => {
          tx.executeSql(sql, args || [], (_, result) => {
            rows = result.rows._array;
          });
        },
        reject,
        () => resolve(rows)
      );
    });
  }

  async get(sql: string, args?: primitive[]): Promise<any | undefined> {
    return (await this.execute(sql, args))[0];
  }

  batch(cmds: Array<[sql: string, args: primitive[]]>): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.transaction(
        (tx) => {
          for (const [sql, args] of cmds) {
            // Queue synchronously; a failed statement aborts the transaction.
            tx.executeSql(sql, args || []);
          }
        },
        reject,
        () => resolve()
      );
    });
  }

  async delete(): Promise<void> {
    await this.close();
    await this.db.deleteAsync();
  }

  async close(): Promise<void> {
    await this.db.closeAsync();
  }
}

export function open(name: string, _opts?: any): Database {
  return new Db(SQLite.openDatabase(name));
}
