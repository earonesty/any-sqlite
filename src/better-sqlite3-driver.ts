import type { Database as BetterDb, Statement } from 'better-sqlite3';
import { Database, primitive } from './types';
import fs from 'fs/promises'

interface BetterDbConstructor {
    new (name: string, opts: any): BetterDb;
}

class Db implements Database {
    db: BetterDb;
    prepMap: Map<string, Statement>;
    constructor(db: BetterDbConstructor, name: string, opts: any) {
        this.db = new db(name, opts)
        this.prepMap = new Map<string, Statement>() 
    }

    execute(sql: string, args?: primitive[]): Promise<object[]> {
        let prep = this.prep(sql);
        if (prep.reader)
            return new Promise((res, rej)=>{try {res(prep!.all(...(args||[])) as object[])} catch (e) {rej(e)}})
        return new Promise((res, rej)=>{try {res([prep!.run(...(args||[]))])} catch (e) {rej(e)}})
    }
    
    private prep(sql: string): Statement {
        let prep = this.prepMap.get(sql);
        if (!this.prepMap.has(sql)) {
            prep = this.db.prepare(sql);
            this.prepMap.set(sql, prep);
        }
        return prep as Statement;
    }

    get(sql: string, args?: primitive[]): Promise<object|undefined> {
        let prep = this.prep(sql);
        return new Promise((res, rej)=>{try {res(prep!.get(...(args||[])) as object[])} catch (e) {rej(e)}})
    }

    batch(cmds:  Array<[sql: string, args: primitive[]]>): Promise<void> {
        this.db.transaction(()=>{
            for (const [val, args] of cmds) {
                const prep = this.prep(val)
                prep?.run(...(args||[]))
            }
        })()
        return new Promise((res)=>{res()})
    }

    delete(): void {
        this.db.name
        this.close()
        fs.unlink(this.db.name)
    }

    close(): void {
        this.db.close()
    }
}

export default function open(DBMaker: BetterDbConstructor, name: string, opts: any) {
    return new Db(DBMaker, name, opts)
}