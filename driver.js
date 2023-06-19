const path = require('node:path')

async function main() {
    const {readPackageUpSync}  = await import('read-pkg-up');
    const fs = require('node:fs');

    const dn = path.dirname(__filename)

    const pkg = readPackageUpSync({cwd: dn})

    const cfg = pkg["any-sqlite"]

    const file = cfg && cfg.driver ? cfg.driver : "react-native-quick-sqlite"  

    console.log("# any-sqlite react driver:", file)

    fs.copyFileSync(dn + "/lib/" + file + ".js", dn + "/lib/react-native.js")
}

main()
