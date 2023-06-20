import type {WebSQLDatabase} from "expo-sqlite";
import * as SQLite from "expo-sqlite";

import { Database, primitive } from './types';

class Db implements Database {
    db: WebSQLDatabase;
    constructor(name: string, _opts: any) {
        this.db = SQLite.openDatabase(name)
    }

    async execute(sql: string, args?: primitive[]): Promise<any[]> {
        return new Promise((res, rej)=>{
                this.db.transaction(
                    (tx)=>{
                        tx.executeSql(sql, args, (_, qr)=>{
                            if (qr.rows?.length) {
                                res(qr.rows._array)
                            }
                        }, (err)=>{
                            rej(err)
                            return false
                        })
                    }, 
                    (err)=>{
                        rej(err)
                        return false
                    }
                )
            }
        )
    }
    
    async get(sql: string, args?: primitive[]): Promise<any|undefined> {
        const qr = await this.execute(sql, args)
        return qr[0]
    }

    async batch(cmds:  Array<[sql: string, args: primitive[]]>): Promise<void> {
        return new Promise((res, rej)=>{
                this.db.transaction(
                    (tx)=>{
                        cmds.forEach(async (ent)=>{
                            const [sql, args] = ent
                            await new Promise((rej, res) => {
                                tx.executeSql(sql, args, (_, qr)=>{
                                    if (qr.rows?.length) {
                                        res(qr.rows._array)
                                    }
                                }, (err)=>{
                                    rej(err)
                                    return false
                                })
                            })
                        })
                    }, 
                    (err)=>{
                        rej(err)
                        return false
                    }
                )
            }
        )
    }

    async delete(): Promise<void> {
        await this.close()
        this.db.deleteAsync()
    }

    async close(): Promise<void> {
        this.db.closeAsync()
    }
}

export function open(name: string, opts: any) {
    return new Db(name, opts)
}
