import { unauthorized, voterEmail } from "../../../lib/server/auth";
import { getBallot, MAX_RANKED } from "../../../lib/server/ballot";
import { db } from "../../../lib/server/db";

// GET /api/ballot -> { ranked: [teamId, ...], status, submittedAt }
// PUT /api/ballot -> save the draft ranking. Body: { "ranked": [teamId, ...] } (best first)
// Both need `Authorization: Bearer <voter code>`.

const collectedTeams = db.prepare(`
  SELECT team_id FROM collections WHERE voter_email = ?
`);

const ownTeams = db.prepare(`
  SELECT team_id FROM team_members WHERE lower(email) = ?
`);

// submitted_at holds the time of the latest draft save until the ballot is submitted.
// The WHERE on the update means a submitted ballot is never changed.
const saveDraft = db.prepare(`
  INSERT INTO ballots (voter_email, rank_1, rank_2, rank_3, rank_4, rank_5, status, submitted_at)
  VALUES (?, ?, ?, ?, ?, ?, 'draft', ?)
  ON CONFLICT(voter_email) DO UPDATE SET
    rank_1 = excluded.rank_1,
    rank_2 = excluded.rank_2,
    rank_3 = excluded.rank_3,
    rank_4 = excluded.rank_4,
    rank_5 = excluded.rank_5,
    submitted_at = excluded.submitted_at
  WHERE ballots.status = 'draft'
`);

function isRankedBody(value: unknown): value is { ranked: string[] } {
  return (
    typeof value === "object" &&
    value !== null &&
    "ranked" in value &&
    Array.isArray(value.ranked) &&
    value.ranked.every((id: unknown) => typeof id === "string")
  );
}

function teamIds(rows: Record<string, unknown>[]): Set<string> {
  return new Set(rows.flatMap((row) => (typeof row.team_id === "string" ? [row.team_id] : [])));
}

/** Why this ranking is not allowed, or null if it is fine. */
function rankingProblem(email: string, ranked: string[]): string | null {
  if (ranked.length > MAX_RANKED) return `rank at most ${MAX_RANKED} teams`;
  if (new Set(ranked).size !== ranked.length) return "a team can only be ranked once";
  const collected = teamIds(collectedTeams.all(email));
  if (ranked.some((id) => !collected.has(id))) return "you can only rank teams in your collection";
  const own = teamIds(ownTeams.all(email));
  if (ranked.some((id) => own.has(id))) return "you can't rank your own team";
  return null;
}

export async function GET({ request }: { request: Request }) {
  const email = await voterEmail(request);
  if (email === null) return unauthorized();
  return Response.json(getBallot(email));
}

export async function PUT({ request }: { request: Request }) {
  const email = await voterEmail(request);
  if (email === null) return unauthorized();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }
  if (!isRankedBody(body))
    return Response.json({ error: "body must be { ranked }" }, { status: 400 });

  const problem = rankingProblem(email, body.ranked);
  if (problem !== null) return Response.json({ error: problem }, { status: 400 });

  const r = body.ranked;
  const result = saveDraft.run(
    email,
    r[0] ?? null,
    r[1] ?? null,
    r[2] ?? null,
    r[3] ?? null,
    r[4] ?? null,
    new Date().toISOString(),
  );
  if (result.changes === 0) {
    return Response.json({ error: "ballot is already submitted" }, { status: 409 });
  }
  return Response.json(getBallot(email));
}
