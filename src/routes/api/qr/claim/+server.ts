import { unauthorized, voterEmail } from "../../../../lib/server/auth";
import { db } from "../../../../lib/server/db";
import { getQr, getTeam, voterTeam } from "../../../../lib/server/team";

// POST /api/qr/claim -> link a printed QR sticker to the voter's own team ("Scan my team").
// Body: { "code": "<qr code>" }. Needs `Authorization: Bearer <voter code>`.
//
// Responses (200 unless noted), matching Figma screens 2c/2d:
//   { kind: "claimed", team }        linked now
//   { kind: "already-yours", team }  this sticker was already linked to your team
//   { kind: "team-has-code", team }  your team is linked to a different sticker
//   { kind: "taken", team }          this sticker belongs to another team
//   { kind: "no-team" }              your email is not on any team
//   404 { kind: "unknown-code" }     not one of our stickers

// Only links a sticker that is still free, so two people can't both claim it.
const claim = db.prepare(`
  UPDATE qr_codes SET team_id = ?, claimed_by = ?, claimed_at = ?
  WHERE code = ? AND team_id IS NULL
`);

const teamHasCode = db.prepare(`
  SELECT 1 FROM qr_codes WHERE team_id = ?
`);

function isClaimBody(value: unknown): value is { code: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "code" in value &&
    typeof value.code === "string" &&
    value.code.length > 0
  );
}

/** What to tell the voter about a sticker that is already linked to a team. */
function linkedResponse(stickerTeamId: string, myTeamId: string): Response {
  const team = getTeam(stickerTeamId);
  if (stickerTeamId === myTeamId) return Response.json({ kind: "already-yours", team });
  return Response.json({ kind: "taken", team });
}

export async function POST({ request }: { request: Request }) {
  const email = await voterEmail(request);
  if (email === null) return unauthorized();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }
  if (!isClaimBody(body)) return Response.json({ error: "body must be { code }" }, { status: 400 });

  const qr = getQr(body.code);
  if (qr === null) return Response.json({ kind: "unknown-code" }, { status: 404 });

  const mine = voterTeam(email);
  if (mine === null) return Response.json({ kind: "no-team" });

  if (qr.teamId !== null) return linkedResponse(qr.teamId, mine.team.id);
  if (teamHasCode.get(mine.team.id) !== undefined) {
    return Response.json({ kind: "team-has-code", team: mine.team });
  }

  try {
    const result = claim.run(mine.team.id, email, new Date().toISOString(), qr.code);
    if (result.changes === 1) return Response.json({ kind: "claimed", team: mine.team });
  } catch {
    // A teammate linked a different sticker at the same moment (team_id is UNIQUE).
    return Response.json({ kind: "team-has-code", team: mine.team });
  }

  // Someone else linked this sticker between our check and the update.
  const latest = getQr(qr.code);
  if (latest === null || latest.teamId === null) {
    return Response.json({ error: "could not link this code, try again" }, { status: 500 });
  }
  return linkedResponse(latest.teamId, mine.team.id);
}
