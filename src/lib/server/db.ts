import { realpathSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import schema from "./schema.sql?raw";

// Opens the database file, creating it if it doesn't exist.
// devenv shell and kennel both set DATABASE_PATH
const databasePath = process.env.DATABASE_PATH ?? "nova.db";
// Resolve systemd's symlinked state directory before opening SQLite.
export const db = new DatabaseSync(
  join(realpathSync(dirname(databasePath)), basename(databasePath)),
);

// Lets reads and writes overlap (many voters saving at once don't block each other)
db.exec("PRAGMA journal_mode = WAL");

// Need foreign key relations
db.exec("PRAGMA foreign_keys = ON");

// Create tables in schema.sql
db.exec(schema);
