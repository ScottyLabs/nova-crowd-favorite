import { DatabaseSync } from "node:sqlite";
import schema from "./schema.sql?raw";

// Opens the database file, creating it if it doesn't exist.
// devenv shell and kennel both set DATABASE_PATH
export const db = new DatabaseSync(process.env.DATABASE_PATH ?? "nova.db");

// Lets reads and writes overlap (many voters saving at once don't block each other)
db.exec("PRAGMA journal_mode = WAL");

// Need foreign key relations
db.exec("PRAGMA foreign_keys = ON");

// Create tables in schema.sql
db.exec(schema);
