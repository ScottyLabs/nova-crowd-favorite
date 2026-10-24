import { dev } from "$app/env";
import { db } from "../../../../lib/server/db";
import { hashCode } from "../../../../lib/server/voter-code";

// DEV ONLY: open http://localhost:5173/api/dev/seed while running `deno task dev`.
// Fills the local database with test teams, QR codes and a test voter, then sends
// you to that voter's link. The voter's own team ("Own Team") starts unlinked, and
// stickers qr-dev-new-1 and qr-dev-new-2 are free to link with "Scan my team".
// Returns 404 in production builds, so it can't touch the real event database.
// the real event database.

const VOTER_EMAIL = "dev-voter@example.com";
const VOTER_CODE = "dev-voter-code-0001";

const TEAMS: [string, string, string][] = [
  ["dev-t1", "Own Team", "You, Sam Park"],
  ["dev-t2", "Dreamloom", "Ann Lee, Bob Kim"],
  ["dev-t3", "Echo Chamber", "Cara Diaz"],
  ["dev-t4", "Sous-Chef.exe", "Dev Patel, Eli Ng"],
  ["dev-t5", "Lumen", "Fay Wu, Gus Ito, Hal Ruiz"],
  ["dev-t6", "Hum2Track", "Ivy Cho"],
];

export async function GET() {
  if (!dev) return new Response("Not found", { status: 404 });

  const now = new Date().toISOString();
  const upsertTeam = db.prepare(`
    INSERT INTO teams (id, response_id, name, members, active, updated_at)
    VALUES (?, ?, ?, ?, 1, ?)
    ON CONFLICT(id) DO UPDATE SET name = excluded.name, members = excluded.members, active = 1
  `);
  const upsertQr = db.prepare(`
    INSERT INTO qr_codes (code, team_id) VALUES (?, ?)
    ON CONFLICT(code) DO UPDATE SET team_id = excluded.team_id
  `);
  const collect = db.prepare(`
    INSERT INTO collections (voter_email, team_id, note, scanned_at) VALUES (?, ?, '', ?)
  `);

  for (const [id, name, members] of TEAMS) {
    upsertTeam.run(id, `dev-response-${id}`, name, members, now);
  }
  // Unlink every dev sticker first, so relinking below can't hit the one-code-per-team rule.
  db.prepare(`
    UPDATE qr_codes SET team_id = NULL, claimed_by = NULL, claimed_at = NULL
    WHERE code LIKE 'qr-dev-%'
  `).run();
  for (const [id] of TEAMS.slice(1)) upsertQr.run(`qr-${id}`, id);
  db.prepare("DELETE FROM qr_codes WHERE code = 'qr-dev-t1'").run();
  db.prepare(
    "INSERT OR IGNORE INTO qr_codes (code) VALUES ('qr-dev-new-1'), ('qr-dev-new-2')",
  ).run();

  db.prepare("INSERT OR IGNORE INTO team_members (team_id, email) VALUES (?, ?)").run(
    "dev-t1",
    VOTER_EMAIL,
  );
  db.prepare(`
    INSERT INTO voters (email, token_hash, created_at) VALUES (?, ?, ?)
    ON CONFLICT(email) DO UPDATE SET token_hash = excluded.token_hash
  `).run(VOTER_EMAIL, await hashCode(VOTER_CODE), now);

  // Reset the test voter: 5 collected teams (not their own), nothing ranked yet.
  db.prepare("DELETE FROM collections WHERE voter_email = ?").run(VOTER_EMAIL);
  db.prepare("DELETE FROM ballots WHERE voter_email = ?").run(VOTER_EMAIL);
  for (const [id] of TEAMS.slice(1)) collect.run(VOTER_EMAIL, id, now);

  return new Response(null, { status: 303, headers: { location: `/v/${VOTER_CODE}` } });
}
