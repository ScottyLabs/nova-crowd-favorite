import { eligibleVoterSql } from "./voter-eligibility.ts";
import type { DatabaseSync } from "node:sqlite";
import { hashCode } from "./voter-code.ts";
import { inTransaction } from "./organizer.ts";

/** Fill missing saved links once, preserving every link already available. */
export async function ensureVoterLinks(db: DatabaseSync, origin: string): Promise<void> {
  const missing = db
    .prepare(`SELECT v.email, v.token_hash FROM voters v
    LEFT JOIN settings l ON l.key = 'voter_link:' || v.token_hash
    WHERE l.value IS NULL AND ${eligibleVoterSql("v.email")}`)
    .all();
  const replacements = await Promise.all(
    missing.map(async (row) => {
      const code = crypto.randomUUID();
      return {
        email: row.email,
        previous: row.token_hash,
        hash: await hashCode(code),
        url: new URL(`/v/${code}`, origin).href,
      };
    }),
  );
  inTransaction(db, () => {
    for (const row of replacements) {
      const changed = db
        .prepare("UPDATE voters SET token_hash = ? WHERE email = ? AND token_hash IS ?")
        .run(row.hash, row.email, row.previous);
      if (changed.changes !== 0)
        db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run(
          `voter_link:${row.hash}`,
          row.url,
        );
    }
  });
}

export function dashboardRecords(db: DatabaseSync) {
  const hackers = db
    .prepare(
      `SELECT h.email, h.name, h.registered_at AS checkedInAt FROM hackers h
      WHERE (h.registered_at IS NOT NULL OR EXISTS (SELECT 1 FROM team_members m WHERE m.email = h.email))
      AND ${eligibleVoterSql("h.email")}
      ORDER BY h.name COLLATE NOCASE, h.email`,
    )
    .all();
  const teams = db
    .prepare(`SELECT t.id, t.name, t.members, t.active, d.reason,
        CASE WHEN d.team_id IS NOT NULL THEN 'disqualified'
          WHEN t.active = 0 OR EXISTS (SELECT 1 FROM settings s WHERE s.key = 'team_unsubmitted:' || t.id)
          THEN 'unsubmitted' ELSE 'eligible' END AS status,
		(SELECT group_concat(email, ', ') FROM team_members WHERE team_id = t.id) AS emails
		FROM teams t LEFT JOIN team_disqualifications d ON d.team_id = t.id ORDER BY t.name`)
    .all();
  const voters = db
    .prepare(`SELECT v.email, h.name, b.status, l.value AS url,
		(SELECT group_concat(t.name, ', ') FROM teams t JOIN team_members m ON m.team_id = t.id
		WHERE lower(m.email) = v.email AND t.active = 1) AS team
		FROM voters v LEFT JOIN hackers h ON h.email = v.email LEFT JOIN ballots b ON b.voter_email = v.email
        LEFT JOIN settings l ON l.key = 'voter_link:' || v.token_hash
        WHERE ${eligibleVoterSql("v.email")} ORDER BY v.email`)
    .all();
  const ballots = db
    .prepare(`SELECT b.voter_email AS email, b.status, b.submitted_at AS updated,
		t1.name AS rank1, t2.name AS rank2, t3.name AS rank3, t4.name AS rank4, t5.name AS rank5
		FROM ballots b LEFT JOIN teams t1 ON t1.id = b.rank_1 LEFT JOIN teams t2 ON t2.id = b.rank_2
		LEFT JOIN teams t3 ON t3.id = b.rank_3 LEFT JOIN teams t4 ON t4.id = b.rank_4
		LEFT JOIN teams t5 ON t5.id = b.rank_5
        WHERE ${eligibleVoterSql("b.voter_email")} ORDER BY b.voter_email`)
    .all();
  const stickers = db
    .prepare(`SELECT q.code, t.name AS team, q.claimed_by AS email
		FROM qr_codes q LEFT JOIN teams t ON t.id = q.team_id ORDER BY q.rowid`)
    .all();
  const deadline = db.prepare("SELECT value FROM settings WHERE key = 'voting_closes_at'").get();
  return {
    teams,
    voters,
    hackers,
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

export function setTeamSubmission(db: DatabaseSync, id: string, submitted: boolean): void {
  if (!db.prepare("SELECT id FROM teams WHERE id = ?").get(id)) throw new Error("Team not found.");
  inTransaction(db, () => {
    if (submitted) {
      db.prepare("DELETE FROM settings WHERE key = ?").run(`team_unsubmitted:${id}`);
      db.prepare("UPDATE teams SET active = 1 WHERE id = ?").run(id);
    } else {
      db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, 'true')").run(
        `team_unsubmitted:${id}`,
      );
    }
  });
}
