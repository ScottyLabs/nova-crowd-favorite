import process from "node:process";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { restoreDatabase } from "../src/lib/server/database-restore.ts";

const [backup, target, offline, ...extra] = process.argv.slice(2);
if (backup === undefined || target === undefined || offline !== "--offline" || extra.length > 0) {
  throw new Error("Stop the app, then run: deno task restore BACKUP DATABASE_PATH --offline");
}
if (resolve(backup) === resolve(target))
  throw new Error("Backup and database paths must be different.");
if (existsSync(target) && !lstatSync(target).isFile())
  throw new Error("DATABASE_PATH must be a regular file.");
const temporary = join(dirname(target), `.nova-restore-${crypto.randomUUID()}.db`);
const db = new DatabaseSync(temporary);
try {
  chmodSync(temporary, 0o600);
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(readFileSync(new URL("../src/lib/server/schema.sql", import.meta.url), "utf8"));
  restoreDatabase(db, readFileSync(backup));
  const saved = `${target}.before-restore-${Date.now()}`;
  mkdirSync(saved, { mode: 0o700 });
  const moved: string[] = [];
  try {
    // --offline means no process may still have these files open.
    for (const suffix of ["", "-wal", "-shm"]) {
      if (!existsSync(target + suffix)) continue;
      renameSync(target + suffix, join(saved, `nova.db${suffix}`));
      moved.push(suffix);
    }
    renameSync(temporary, target);
  } catch (cause) {
    for (const suffix of moved.toReversed())
      renameSync(join(saved, `nova.db${suffix}`), target + suffix);
    throw cause;
  }
  console.log(`Restored ${target}. Previous files saved in ${saved}. Restart the app.`);
} finally {
  db.close();
  rmSync(temporary, { force: true });
}
