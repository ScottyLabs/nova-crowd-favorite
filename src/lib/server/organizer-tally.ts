import type { DatabaseSync } from "node:sqlite";
import { verifySignature } from "./hmac.ts";
import { tallyIrv } from "./irv.ts";
import { json } from "./organizer.ts";

function readElection(db: DatabaseSync) {
  db.exec("BEGIN");
  try {
    const teams = db
      .prepare(`
      SELECT teams.id, teams.name,
        d.team_id IS NOT NULL AS disqualified
      FROM teams LEFT JOIN team_disqualifications d ON d.team_id = teams.id
      ORDER BY teams.id
    `)
      .all();
    const ballots = db
      .prepare(`
      SELECT rank_1, rank_2, rank_3, rank_4, rank_5 FROM ballots WHERE status = 'submitted'
    `)
      .all();
    const deadline = db.prepare("SELECT value FROM settings WHERE key = 'voting_closes_at'").get();
    db.exec("COMMIT");
    return { teams, ballots, closesAt: deadline?.value };
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export async function tallyVotes(
  db: DatabaseSync,
  request: Request,
  secret: string,
): Promise<Response> {
  const valid = await verifySignature(
    "",
    request.headers.get("x-timestamp"),
    request.headers.get("x-signature"),
    secret,
  );
  if (!valid) return json({ error: "invalid signature" }, 401);
  const { teams, ballots, closesAt } = readElection(db);
  const eligible = new Set(
    teams.flatMap((team) =>
      typeof team.id === "string" && team.disqualified === 0 ? [team.id] : [],
    ),
  );
  const rankings = ballots.map((ballot) =>
    [ballot.rank_1, ballot.rank_2, ballot.rank_3, ballot.rank_4, ballot.rank_5].filter(
      (id): id is string => typeof id === "string" && eligible.has(id),
    ),
  );
  const result = tallyIrv(rankings);
  const names = new Map(teams.map((team) => [team.id, team.name]));
  return json({
    generatedAt: new Date().toISOString(),
    provisional: !(typeof closesAt === "string" && Date.now() >= Date.parse(closesAt)),
    submittedBallots: ballots.length,
    ranking: result.ranking.map((entry) => ({
      rank: entry.rank,
      teamId: entry.teamId,
      name: names.get(entry.teamId),
    })),
  });
}
