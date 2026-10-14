import { db } from "./db";
import { findColumns, type ParsedTeam, parseRow } from "./parse";

// New response_id -> insert with a fresh id. Existing -> update fields, keep the same id.
const upsertTeam = db.prepare(`
  INSERT INTO teams (id, response_id, name, members, repo_url, slides_url, video_url, active, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
  ON CONFLICT(response_id) DO UPDATE SET
    name = excluded.name,
    members = excluded.members,
    repo_url = excluded.repo_url,
    slides_url = excluded.slides_url,
    video_url = excluded.video_url,
    active = 1,
    updated_at = excluded.updated_at
  RETURNING id
`);
const clearMembers = db.prepare("DELETE FROM team_members WHERE team_id = ?");
const addMember = db.prepare("INSERT OR IGNORE INTO team_members (team_id, email) VALUES (?, ?)");

// Save one team, then replace its member list so it exactly matches the Sheet
function saveTeam(t: ParsedTeam, now: string): void {
  const result = upsertTeam.get(
    crypto.randomUUID(),
    t.responseId,
    t.name,
    t.members,
    t.repoUrl,
    t.slidesUrl,
    t.videoUrl,
    now,
  );
  const id = result?.id;
  if (typeof id !== "string") throw new Error("Team upsert did not return an id");

  clearMembers.run(id);
  for (const email of t.emails) addMember.run(id, email);
}

// Run fn in one transaction: commit if it succeeds, roll back if it throws
function inTransaction<T>(fn: () => T): T {
  db.exec("BEGIN");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

// Takes all Sheet rows (header first) and updates teams + team_members
export function syncTeams(rows: string[][]): { synced: number } {
  if (rows.length === 0) return { synced: 0 };
  const [header, ...data] = rows;
  const cols = findColumns(header);

  // Safety: if key columns are missing, stop. Otherwise every team would get hidden.
  if (cols.name < 0 || cols.timestamp < 0) {
    throw new Error("Sheet is missing the Timestamp or Team Name column");
  }
  const now = new Date().toISOString();

  return inTransaction(() => {
    // Hide all teams, then reactivate each one still in the Sheet.
    // Teams removed from the Sheet stay hidden instead of being deleted.
    db.exec("UPDATE teams SET active = 0");
    let synced = 0;
    for (const row of data) {
      const t = parseRow(row, cols);
      if (t === null) continue;
      saveTeam(t, now);
      synced++;
    }
    return { synced };
  });
}
