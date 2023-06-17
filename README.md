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
