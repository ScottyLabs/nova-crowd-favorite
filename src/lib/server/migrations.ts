import type { DatabaseSync } from "node:sqlite";

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
