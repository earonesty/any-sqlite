import type { QuickSQLiteConnection } from 'react-native-quick-sqlite';
import { open as OpenFunc } from 'react-native-quick-sqlite';
import { Database, primitive } from './types';

interface DbConstructor {
    new (name: string, opts: any): QuickSQLiteConnection;
}

class Db implements Database {
    db: QuickSQLiteConnection;
    constructor(db: typeof OpenFunc, name: string, opts: any) {
        this.db = db({name})
    }

    async execute(sql: string, args?: primitive[]): Promise<object[]> {
        const qr = await this.db.executeAsync(sql, args)
        if (qr.rows?.length) {
            return qr.rows._array
        }
        return []
    }
    
    async get(sql: string, args?: primitive[]): Promise<object|undefined> {
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

export default function open(DBMaker: typeof OpenFunc, name: string, opts: any) {
    return new Db(DBMaker, name, opts)
}
