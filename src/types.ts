export type primitive = string | number | boolean | null

export interface Database {
    execute(sql: string, args?: primitive[]): Promise<any[]>;
    get(sql: string, args?: primitive[]): Promise<any|undefined>;
    batch(cmds: [sql: string, args: primitive[]][]): Promise<void>;
    delete(): void;
    close(): void;
}
