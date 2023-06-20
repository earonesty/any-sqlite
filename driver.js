const path = require('node:path')

async function main() {
    const {readPackageUpSync}  = await import('read-pkg-up');
    const fs = require('node:fs');
    const findUp = (await import('find-up')).default;

    const pkgLoc = await findUp('package.json', {cwd: path.dirname(__filename)})
    
    const dn = path.dirname(pkgLoc)

    const pkg = readPackageUpSync({cwd: path.dirname(dn)})

    let file = "react-native-quick-sqlite"

    if (pkg && pkg.packageJson) {
        const cfg = pkg.packageJson["any-sqlite"]
        
        const file = cfg && cfg.driver ? cfg.driver : "react-native-quick-sqlite"  

        console.log("# any-sqlite react driver:", file)

        fs.copyFileSync(dn + "/lib/" + file + ".js", dn + "/lib/react-native.js")
    }
}

main()
