import type { DatabaseSync } from "node:sqlite";
import { EMAIL_PATTERN, inTransaction } from "./organizer.ts";

export function syncHackers(db: DatabaseSync, rows: string[][]): { synced: number } {
  const [header = [], ...records] = rows;
  const columns = header.map((cell) => cell.trim().toLowerCase());
  const nameColumn = columns.indexOf("full name");
  const emailColumn = columns.indexOf("email address");
  if (nameColumn < 0 || emailColumn < 0)
    throw new Error("Sheet needs Full Name and Email Address columns.");
  const hackers = new Map<string, string>();
  for (const [index, row] of records.entries()) {
    if (row.every((cell) => !cell.trim())) continue;
    const email = (row[emailColumn] ?? "").trim().toLowerCase();
    const name = (row[nameColumn] ?? "").trim();
    if (!EMAIL_PATTERN.test(email) || !name || name.length > 200)
      throw new Error(`Row ${index + 2} needs a valid email and name (up to 200 characters).`);
    if (hackers.has(email) && hackers.get(email) !== name)
      throw new Error(`Row ${index + 2} has a conflicting name for the same email.`);
    hackers.set(email, name);
  }
  return inTransaction(db, () => {
    const save = db.prepare(`INSERT INTO hackers (email, name) VALUES (?, ?)
      ON CONFLICT(email) DO UPDATE SET name = excluded.name`);
    for (const [email, name] of hackers) save.run(email, name);
    return { synced: hackers.size };
  });
}
