import type { DatabaseSync } from "node:sqlite";
import { EMAIL_PATTERN } from "./organizer.ts";

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
