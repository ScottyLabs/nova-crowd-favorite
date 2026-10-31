import type { DatabaseSync } from "node:sqlite";
import { inTransaction } from "./organizer.ts";

/** Add draft support without reopening ballots saved before draft support existed. */
export function migrateBallots(db: DatabaseSync): void {
  db.exec("BEGIN IMMEDIATE");
  try {
    const columns = db.prepare("PRAGMA table_info(ballots)").all();
    if (!columns.some((column) => column.name === "status")) {
      db.exec("ALTER TABLE ballots ADD COLUMN status TEXT NOT NULL DEFAULT 'draft'");
      db.exec("UPDATE ballots SET status = 'submitted'");
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

/** Link existing voters and team memberships without changing their email identities. */
export function migrateHackers(db: DatabaseSync): void {
  const definitions = {
    voters: `email TEXT PRIMARY KEY REFERENCES hackers(email),
      token_hash TEXT UNIQUE, created_at TEXT NOT NULL`,
    team_members: `team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      email TEXT NOT NULL REFERENCES hackers(email), PRIMARY KEY (team_id, email)`,
  };
  const tables = (["voters", "team_members"] as const).filter(
    (table) =>
      !db
        .prepare(`PRAGMA foreign_key_list("${table}")`)
        .all()
        .some((key) => key.table === "hackers"),
  );
  if (tables.length === 0) return;
  // SQLite requires rebuilding a table to add a foreign key. Disable enforcement
  // outside the transaction, then check every reference before committing.
  db.exec("PRAGMA foreign_keys = OFF");
  try {
    inTransaction(db, () => {
      db.exec(`INSERT OR IGNORE INTO hackers (email)
      SELECT email FROM voters UNION SELECT email FROM team_members`);
      for (const table of tables) {
        db.exec(`CREATE TABLE "${table}_new" (${definitions[table]});
        INSERT INTO "${table}_new" SELECT * FROM "${table}";
        DROP TABLE "${table}";
        ALTER TABLE "${table}_new" RENAME TO "${table}";`);
      }
      if (db.prepare("PRAGMA foreign_key_check").all().length > 0)
        throw new Error("Hacker migration has broken references.");
    });
  } finally {
    db.exec("PRAGMA foreign_keys = ON");
  }
}
