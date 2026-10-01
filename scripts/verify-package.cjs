// Verify a clean install of the actual tarball with lifecycle scripts disabled.
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "any-sqlite-package-"));
try {
  const packed = JSON.parse(
    execFileSync(
      "npm",
      ["pack", "--json", "--ignore-scripts", "--pack-destination", temporary],
      { cwd: root, encoding: "utf8" }
    )
  );
  const tarball = path.join(temporary, packed[0].filename);
  for (const fixture of ["app", "workspace/packages/app"]) {
    const app = path.join(temporary, fixture);
    fs.mkdirSync(app, { recursive: true });
    fs.writeFileSync(
      path.join(app, "package.json"),
      JSON.stringify({ name: "fixture", version: "1.0.0", private: true })
    );
    execFileSync(
      "npm",
      [
        "install",
        tarball,
        "--ignore-scripts",
        "--offline",
        "--no-audit",
        "--no-fund",
        "--package-lock=false",
      ],
      { cwd: app, stdio: "pipe" }
    );
    execFileSync(
      process.execPath,
      [
        "-e",
        `
            const assert = require('assert');
            const fs = require('fs');
            const Module = require('module');
            const originalLoad = Module._load;
            let selected;
            Module._load = function(name, ...args) {
                if (name === 'expo-sqlite') {
                    selected = 'expo';
                    return { openDatabase: () => ({}) };
                }
                if (name === 'react-native-quick-sqlite') {
                    selected = 'quick';
                    return { open: () => ({}) };
                }
                return originalLoad.call(this, name, ...args);
            };
            require('any-sqlite/lib/expo-sqlite').open('app.db');
            assert.equal(selected, 'expo');
            require('any-sqlite/lib/react-native-quick-sqlite').open('app.db');
            assert.equal(selected, 'quick');
            require('any-sqlite/lib/choose.android').open('app.db');
            require('any-sqlite/lib/choose.ios').open('app.db');
            for (const entry of ['expo-sqlite', 'react-native-quick-sqlite', 'react-native']) {
                const declaration = require.resolve('any-sqlite/lib/' + entry + '.d.ts');
                assert.match(fs.readFileSync(declaration, 'utf8'), /Database/);
            }
            assert.equal(typeof require('any-sqlite').open, 'function');
        `,
      ],
      { cwd: app, stdio: "pipe" }
    );
  }
  console.log(
    "Package entry points and declarations passed in clean and nested installs without scripts."
  );
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
