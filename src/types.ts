/** Supported SQL bind values; convert booleans to numeric 0 or 1. */
export type primitive = string | number | null;

/** Shared database API; await lifecycle methods to support asynchronous drivers. */
export interface Database {
  /** Execute a bound statement and return its result rows. */
  execute(sql: string, args?: primitive[]): Promise<any[]>;
  /** Return the first result row, or undefined when there are no rows. */
  get(sql: string, args?: primitive[]): Promise<any | undefined>;
  /** Execute a group of bound statements in one transaction. */
  batch(cmds: [sql: string, args: primitive[]][]): Promise<void>;
  /** Close and delete the database; await completion and handle driver errors. */
  delete(): void | Promise<void>;
  /** Close the connection; await completion when using an asynchronous driver. */
  close(): void | Promise<void>;
}
