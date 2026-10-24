import { unauthorized, voterEmail } from "../../../lib/server/auth";
import { db } from "../../../lib/server/db";
import { getQr, toTeam } from "../../../lib/server/team";
import { isVotingClosed, votingClosedResponse } from "../../../lib/server/voting";

// GET  /api/collection  -> the voter's collected teams, with their private notes
// POST /api/collection  -> add a team by its QR code ("Scan a team"). Body: { "code": "<qr code>" }
//   -> { kind: "added" | "already", team, count }, { kind: "own-team", team },
//      { kind: "unlinked" } for a sticker no team has linked yet (never claims it),
//      404 { kind: "unknown-code" }, or 403 { kind: "voting-closed" } after voting closes
// Both need the header `Authorization: Bearer <voter code>`.

const selectCollection = db.prepare(`
  SELECT teams.id, teams.name, teams.members, collections.note
  FROM collections
  JOIN teams ON teams.id = collections.team_id
  WHERE collections.voter_email = ? AND teams.active = 1
  ORDER BY collections.scanned_at
`);

const selectTeamByQr = db.prepare(`
  SELECT teams.id, teams.name, teams.members
  FROM qr_codes
  JOIN teams ON teams.id = qr_codes.team_id
  WHERE qr_codes.code = ? AND teams.active = 1
`);

const isMember = db.prepare(`
  SELECT 1 FROM team_members WHERE team_id = ? AND lower(email) = ?
`);

// OR IGNORE: scanning a team you already have does nothing instead of erroring.
const insertCollection = db.prepare(`
  INSERT OR IGNORE INTO collections (voter_email, team_id, note, scanned_at)
  VALUES (?, ?, '', ?)
`);

const countCollection = db.prepare(`
  SELECT COUNT(*) AS count FROM collections WHERE voter_email = ?
`);

function isScanBody(value: unknown): value is { code: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "code" in value &&
    typeof value.code === "string" &&
    value.code.length > 0
  );
}

export async function GET({ request }: { request: Request }) {
  const email = await voterEmail(request);
  if (email === null) return unauthorized();

  const collection = selectCollection.all(email).flatMap((row) => {
    const team = toTeam(row);
    if (team === null) return [];
    return [{ team, note: typeof row.note === "string" ? row.note : "" }];
  });
  return Response.json(collection);
}

export async function POST({ request }: { request: Request }) {
  const email = await voterEmail(request);
  if (email === null) return unauthorized();
  if (isVotingClosed()) return votingClosedResponse();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }
  if (!isScanBody(body)) return Response.json({ error: "body must be { code }" }, { status: 400 });

  const qr = getQr(body.code);
  if (qr === null) return Response.json({ kind: "unknown-code" }, { status: 404 });
  if (qr.teamId === null) return Response.json({ kind: "unlinked" });

  const row = selectTeamByQr.get(body.code);
  const team = row === undefined ? null : toTeam(row);
  if (team === null) return Response.json({ kind: "unknown-code" }, { status: 404 });

  if (isMember.get(team.id, email) !== undefined) {
    return Response.json({ kind: "own-team", team });
  }

  const result = insertCollection.run(email, team.id, new Date().toISOString());
  const countRow = countCollection.get(email);
  const count = typeof countRow?.count === "number" ? countRow.count : 0;
  if (result.changes === 0) return Response.json({ kind: "already", team, count });
  return Response.json({ kind: "added", team, count }, { status: 201 });
}
