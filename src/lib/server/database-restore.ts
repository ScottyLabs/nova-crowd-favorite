import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { inTransaction } from "./organizer.ts";

function tables(db: DatabaseSync): string[] {
  return db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )
    .all()
    .map((row) => String(row.name));
}

function columns(db: DatabaseSync, table: string): string {
  return JSON.stringify(
    db
      .prepare(`PRAGMA table_info("${table}")`)
      .all()
      .map(({ name, type, notnull, pk }) => ({ name, type, notnull, pk }))
      .toSorted((left, right) => String(left.name).localeCompare(String(right.name))),
  );
}

function validate(source: DatabaseSync, target: DatabaseSync): string[] {
  const names = tables(target);
  if (
    JSON.stringify(tables(source)) !== JSON.stringify(names) ||
    names.some((name) => columns(source, name) !== columns(target, name))
  ) {
    throw new Error("Backup schema does not match this version of the app.");
  }
  const integrity = source.prepare("PRAGMA integrity_check").get();
  if (
    integrity?.integrity_check !== "ok" ||
    source.prepare("PRAGMA foreign_key_check").all().length > 0
  ) {
    throw new Error("Backup is damaged or has broken references.");
  }
  return names;
}

/** Restore rows rather than replacing a file that the running app still has open. */
export function restoreDatabase(target: DatabaseSync, bytes: Uint8Array): void {
  if (
    bytes.length > 50 * 1024 * 1024 ||
    new TextDecoder().decode(bytes.slice(0, 16)) !== "SQLite format 3\0"
  ) {
    throw new Error("Choose a SQLite backup smaller than 50 MB.");
  }
  const directory = mkdtempSync(join(tmpdir(), "nova-restore-"));
  try {
    const path = join(directory, "backup.db");
    writeFileSync(path, bytes, { mode: 0o600 });
    const source = new DatabaseSync(path, { readOnly: true });
    try {
      copyDatabase(source, target, validate(source, target));
    } finally {
      source.close();
    }
  } finally {
    rmSync(directory, { recursive: true });
  }
}

function copyDatabase(source: DatabaseSync, target: DatabaseSync, names: string[]): void {
  inTransaction(target, () => {
    target.exec("PRAGMA defer_foreign_keys = ON");
    for (const table of names) target.exec(`DELETE FROM "${table}"`);
    for (const table of names) {
      const fields = target
        .prepare(`PRAGMA table_info("${table}")`)
        .all()
        .map((row) => String(row.name));
      const insert = target.prepare(
        `INSERT INTO "${table}" VALUES (${fields.map(() => "?").join(",")})`,
      );
      for (const row of source.prepare(`SELECT * FROM "${table}"`).all())
        insert.run(...fields.map((field) => row[field]));
    }
    if (target.prepare("PRAGMA foreign_key_check").all().length > 0)
      throw new Error("Backup has broken references.");
  });
}
