import { unauthorized, voterEmail } from "../../../../lib/server/auth";
import { getBallot } from "../../../../lib/server/ballot";
import { db } from "../../../../lib/server/db";
import { isVotingClosed, votingClosedResponse } from "../../../../lib/server/voting";

// POST /api/ballot/submit -> lock in the voter's draft. Final: it can't be changed after.
// Needs `Authorization: Bearer <voter code>`. No body. 403 { kind: "voting-closed" } after voting closes.

const submit = db.prepare(`
  UPDATE ballots
  SET status = 'submitted', submitted_at = ?
  WHERE voter_email = ? AND status = 'draft' AND rank_1 IS NOT NULL
`);

export async function POST({ request }: { request: Request }) {
  const email = await voterEmail(request);
  if (email === null) return unauthorized();
  if (isVotingClosed()) return votingClosedResponse();

  const result = submit.run(new Date().toISOString(), email);
  if (result.changes === 0) {
    const current = getBallot(email);
    if (current.status === "submitted") {
      return Response.json({ error: "ballot is already submitted" }, { status: 409 });
    }
    return Response.json({ error: "rank at least one team before submitting" }, { status: 400 });
  }
  return Response.json(getBallot(email));
}
