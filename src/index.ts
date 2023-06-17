import { Database } from './types'
export { Database } from './types'

let openFunc: (dbCon: object, name: string, opts: any) => Promise<Database>
let dbCon: object

export async function open(name: string, opts?: any) {
    if (openFunc)
        return await openFunc(dbCon, name, opts)

    try {
        const { open }  = await import("react-native-quick-sqlite")
        dbCon = open
        openFunc = require("./react-native-quick-driver").default
        return await openFunc(dbCon, name, opts)
    } catch {
    }

    try {
        const imp = await import("better-sqlite3")
        dbCon = imp.default
        openFunc = require("./better-sqlite3-driver").default
        return await openFunc(dbCon, name, opts)
    } catch (e) {
        console.log(e)
    }

    
   throw Error("no supported driver is available, install react-native-quick-sqlite or better-sqlite3")
}
