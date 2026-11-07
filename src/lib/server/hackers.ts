import type { DatabaseSync } from "node:sqlite";
import { EMAIL_PATTERN, inTransaction } from "./organizer.ts";

// Called inside the team sync transaction. Blank names never erase a saved name.
export function saveCheckInHackers(
  db: DatabaseSync,
  hackers: { email: string; name: string }[],
  timestamp: string,
): void {
  const save = db.prepare(`INSERT INTO hackers (email, name, registered_at) VALUES (?, ?, ?)
    ON CONFLICT(email) DO UPDATE SET name = excluded.name, registered_at = excluded.registered_at`);
  for (const { email, name } of hackers) {
    if (EMAIL_PATTERN.test(email) && name.trim() && name.length <= 200) {
      save.run(email, name.trim(), timestamp);
    }
  }
}

export function syncHackers(db: DatabaseSync, rows: string[][]): { synced: number } {
  const [header = [], ...records] = rows;
  const columns = header.map((cell) => cell.trim().toLowerCase());
  const nameColumn = columns.indexOf("full name");
  const emailColumn = columns.indexOf("email address");
  const timestampColumn = columns.indexOf("timestamp");
  if (nameColumn < 0 || emailColumn < 0 || timestampColumn < 0)
    throw new Error("Sheet needs Full Name, Email Address, and Timestamp columns.");
  const hackers = new Map<string, { name: string; registeredAt: string }>();
  for (const [index, row] of records.entries()) {
    if (row.every((cell) => !cell.trim())) continue;
    const email = (row[emailColumn] ?? "").trim().toLowerCase();
    const name = (row[nameColumn] ?? "").trim();
    const registeredAt = (row[timestampColumn] ?? "").trim();
    if (!EMAIL_PATTERN.test(email) || !name || name.length > 200)
      throw new Error(`Row ${index + 2} needs a valid email and name (up to 200 characters).`);
    if (!registeredAt) throw new Error(`Row ${index + 2} needs a registration timestamp.`);
    if (hackers.has(email) && hackers.get(email)?.name !== name)
      throw new Error(`Row ${index + 2} has a conflicting name for the same email.`);
    hackers.set(email, { name, registeredAt });
  }
  return inTransaction(db, () => {
    const save = db.prepare(`INSERT INTO hackers (email, name, registered_at) VALUES (?, ?, ?)
      ON CONFLICT(email) DO UPDATE SET name = excluded.name, registered_at = excluded.registered_at`);
    for (const [email, { name, registeredAt }] of hackers) save.run(email, name, registeredAt);
    return { synced: hackers.size };
  });
}
