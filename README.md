# any-sqlite
react native or node sqlite with a common interface

```ts
import { open } from "any-sqlite";

async main() {
  const db = await open("yo.db")
  await db.execute("create table foo (bar, baz)")
  await db.execute("insert into foo (bar, baz) values (?, ?)", [1, 2])
  await db.batch([
        ["insert into foo (bar, baz) values (?, ?)", [1, 2]],
        ["insert into foo (bar, baz) values (?, ?)", [2, 3]]
    ])
  let rows = await db.execute("select * from foo")
}
```

## Choosing a React Native driver

The default React Native entry uses `react-native-quick-sqlite`:

```ts
import { open, Database } from 'any-sqlite';
```

Install and configure `react-native-quick-sqlite` in your native app. To select
Expo instead, install `expo-sqlite` and import its entry explicitly:

```ts
import { open, Database } from 'any-sqlite/lib/expo-sqlite';

const db = open('app.db');
await db.execute('CREATE TABLE IF NOT EXISTS items (id INTEGER)');
await db.batch([['INSERT INTO items VALUES (?)', [1]]]);
await db.close();
```

The explicit Quick SQLite entry is `any-sqlite/lib/react-native-quick-sqlite`.
Use one entry consistently in your app. Metro can then bundle only the selected
native driver; no `package.json` driver configuration, postinstall scripts, or
changes to installed files are needed. Node's default entry remains unchanged.
Native drivers are supplied by the consuming app, not installed automatically.

The Expo adapter targets the **Expo SQLite 11.1.x WebSQL API** (`openDatabase`,
`transaction`, `closeAsync`, `deleteAsync`), not the newer Expo SQLite API.
Select an Expo SDK/native build compatible with that version. Newer Expo SDKs
need a separate adapter; this package does not claim compatibility with them.

`execute()` returns rows (an empty array for writes and empty queries); `get()`
returns the first row or `undefined`. Expo operations use the public `exec` API
with checked BEGIN, COMMIT and ROLLBACK results, resolving only after commit.
`batch()` runs statements sequentially in one transaction, aborting on a failed
statement. Operations on a connection are serialized. Bind parameters
are strings, numbers, or null; convert booleans to 0/1 explicitly.

Always `await db.close()` and `await db.delete()` so asynchronous drivers finish
and errors propagate. Expo deletion closes the connection before deleting.
Close and delete stop accepting operations immediately and wait for accepted
transactions to finish. Repeated cleanup calls share their completion promise.
Only one live Expo adapter per database name is allowed; duplicate opens throw.
The name can be reopened after successful close or deletion. Do not use another
Expo connection to the same name while the adapter owns it, or issue transaction
control statements through `execute()`/`batch()`; the adapter owns transaction
boundaries. A failed BEGIN or rollback disables further queries. Failed cleanup
keeps the name reserved because the native connection or file state is uncertain.
