import type { DatabaseSync } from "node:sqlite";
import { inTransaction } from "./organizer.ts";

export function dashboardRecords(db: DatabaseSync) {
  const teams = db
    .prepare(`SELECT t.id, t.name, t.members, t.active, d.reason,
		(SELECT group_concat(email, ', ') FROM team_members WHERE team_id = t.id) AS emails
		FROM teams t LEFT JOIN team_disqualifications d ON d.team_id = t.id ORDER BY t.name`)
    .all();
  const voters = db
    .prepare(`SELECT v.email, b.status,
		(SELECT group_concat(t.name, ', ') FROM teams t JOIN team_members m ON m.team_id = t.id
		WHERE lower(m.email) = v.email AND t.active = 1) AS team
		FROM voters v LEFT JOIN ballots b ON b.voter_email = v.email ORDER BY v.email`)
    .all();
  const ballots = db
    .prepare(`SELECT b.voter_email AS email, b.status, b.submitted_at AS updated,
		t1.name AS rank1, t2.name AS rank2, t3.name AS rank3, t4.name AS rank4, t5.name AS rank5
		FROM ballots b LEFT JOIN teams t1 ON t1.id = b.rank_1 LEFT JOIN teams t2 ON t2.id = b.rank_2
		LEFT JOIN teams t3 ON t3.id = b.rank_3 LEFT JOIN teams t4 ON t4.id = b.rank_4
		LEFT JOIN teams t5 ON t5.id = b.rank_5 ORDER BY b.voter_email`)
    .all();
  const stickers = db
    .prepare(`SELECT q.code, t.name AS team, q.claimed_by AS email
		FROM qr_codes q LEFT JOIN teams t ON t.id = q.team_id ORDER BY q.rowid`)
    .all();
  const deadline = db.prepare("SELECT value FROM settings WHERE key = 'voting_closes_at'").get();
  return {
    teams,
    voters,
    ballots,
    stickers,
    deadline: typeof deadline?.value === "string" ? deadline.value : null,
  };
}

export function updateTeamName(db: DatabaseSync, id: string, name: string): void {
  if (!name.trim() || name.length > 200)
    throw new Error("Enter a team name (up to 200 characters).");
  inTransaction(db, () => {
    if (
      db
        .prepare("UPDATE teams SET name = ?, updated_at = ? WHERE id = ?")
        .run(name.trim(), new Date().toISOString(), id).changes === 0
    )
      throw new Error("Team not found.");
    db.prepare(
      "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    ).run(`team_name:${id}`, name.trim());
  });
}
