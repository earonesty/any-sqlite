import { Database } from './types'
export { Database } from './types'

let openFunc: (dbCon: object, name: string, opts: any) => Database
let dbCon: object

export function open(name: string, opts?: any) {
    if (openFunc)
        return openFunc(dbCon, name, opts)

    try {
        const { open }  = require("react-native-quick-sqlite")
        dbCon = open
        openFunc = require("./react-native-quick-sqlite").default
        return openFunc(dbCon, name, opts)
    } catch (e) {
        console.log(e)
    }

   throw Error("no supported driver is available, install react-native-quick-sqlite or better-sqlite3")
}
