import Database from 'better-sqlite3';
import schema from './schema.sql?raw';

// Opens the database file, creating it if it doesn't exist.
// DATABASE_PATH lets the server use a different location later.
export const db = new Database(process.env.DATABASE_PATH ?? 'nova.db');

// Lets reads and writes overlap (many voters saving at once don't block each other)
db.pragma('journal_mode = WAL');

// Need foreign key relations
db.pragma('foreign_keys = ON');

// Create tables in schema.sql
db.exec(schema);