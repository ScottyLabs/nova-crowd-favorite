import type { DatabaseSync } from "node:sqlite";
import { inTransaction } from "./organizer.ts";

// Retire registration-only records once check-in membership is available.
// Keep every identity referenced by a team or any voter activity.
export function cleanRegistrationRemnants(db: DatabaseSync, backup: () => void): void {
  const key = "checkin_only_cleanup_v1";
  if (db.prepare("SELECT 1 FROM settings WHERE key = ?").get(key)) return;
  if (
    !db
      .prepare(`SELECT 1 FROM team_members m JOIN teams t ON t.id = m.team_id
    WHERE t.active = 1 LIMIT 1`)
      .get()
  )
    return;
  backup();
  inTransaction(db, () => {
    db.exec(`DELETE FROM voters
      WHERE NOT EXISTS (SELECT 1 FROM team_members m WHERE m.email = voters.email)
      AND NOT EXISTS (SELECT 1 FROM ballots b WHERE b.voter_email = voters.email)
      AND NOT EXISTS (SELECT 1 FROM collections c WHERE c.voter_email = voters.email)
      AND NOT EXISTS (SELECT 1 FROM qr_codes q WHERE q.claimed_by = voters.email)
      AND NOT EXISTS (SELECT 1 FROM ballot_resets r WHERE r.voter_email = voters.email);
      DELETE FROM hackers
      WHERE NOT EXISTS (SELECT 1 FROM team_members m WHERE m.email = hackers.email)
      AND NOT EXISTS (SELECT 1 FROM voters v WHERE v.email = hackers.email);`);
    db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run(
      key,
      new Date().toISOString(),
    );
  });
}
