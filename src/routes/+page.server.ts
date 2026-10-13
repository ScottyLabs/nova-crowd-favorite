import { db } from '../lib/server/db';

export function load() {
  const rows = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
    .all() as { name: string }[];
  return { tables: rows.map((r) => r.name) };
}