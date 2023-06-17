import type { QuickSQLiteConnection } from 'react-native-quick-sqlite';
import { open as OpenFunc } from 'react-native-quick-sqlite';
import { Database, primitive } from './types';

class Db implements Database {
    db: QuickSQLiteConnection;
    constructor(name: string, opts: any) {
        this.db = OpenFunc({name})
    }

    async execute(sql: string, args?: primitive[]): Promise<any[]> {
        const qr = await this.db.executeAsync(sql, args)
        if (qr.rows?.length) {
            return qr.rows._array
        }
        return []
    }
    
    async get(sql: string, args?: primitive[]): Promise<any|undefined> {
        const qr = await this.db.executeAsync(sql, args)
        if (qr.rows?.length) {
            return qr.rows.item(0)
        }
        return undefined
    }

    async batch(cmds:  Array<[sql: string, args: primitive[]]>): Promise<void> {
        await this.db.executeBatchAsync(cmds)
    }

    delete(): void {
        this.close()
        this.db.delete()
    }

    close(): void {
        this.db.close()
    }
}

export function open(name: string, opts: any) {
    return new Db(name, opts)
}
