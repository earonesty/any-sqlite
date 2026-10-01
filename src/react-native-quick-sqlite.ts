import type { QuickSQLiteConnection } from "react-native-quick-sqlite";
import { open as OpenFunc } from "react-native-quick-sqlite";
import { Database, primitive } from "./types";
export { Database } from "./types";

class Db implements Database {
  db: QuickSQLiteConnection;
  /** Open the app-supplied Quick SQLite driver; options are reserved for compatibility. */
  constructor(name: string, opts: any) {
    this.db = OpenFunc({ name });
  }

  /** Execute a bound statement and return rows, or an empty array for writes. */
  async execute(sql: string, args?: primitive[]): Promise<any[]> {
    const qr = await this.db.executeAsync(sql, args);
    if (qr.rows?.length) {
      return qr.rows._array;
    }
    return [];
  }

  /** Return the first result row, or undefined when the query returns no rows. */
  async get(sql: string, args?: primitive[]): Promise<any | undefined> {
    const qr = await this.db.executeAsync(sql, args);
    if (qr.rows?.length) {
      return qr.rows.item(0);
    }
    return undefined;
  }

  /** Delegate an atomic batch of bound statements to Quick SQLite. */
  async batch(cmds: Array<[sql: string, args: primitive[]]>): Promise<void> {
    await this.db.executeBatchAsync(cmds);
  }

  /** Close this connection before deleting its database file. */
  delete(): void {
    this.close();
    this.db.delete();
  }

  /** Close the native Quick SQLite connection synchronously. */
  close(): void {
    this.db.close();
  }
}

/** Open a database with Quick SQLite; the consuming app must install the driver. */
export function open(name: string, opts?: any) {
  return new Db(name, opts);
}
