import { db } from "../../../lib/server/db";

function isBallotBody(value: unknown): value is { token: string; ranking: string[] } {
  if (typeof value !== "object" || value === null) return false;
  if (!("token" in value) || !("ranking" in value)) return false;

  return (
    typeof value.token === "string" &&
    Array.isArray(value.ranking) &&
    value.ranking.every((item: unknown) => typeof item === "string")
  );
}

function isTokenBody(value: unknown): value is { token: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "token" in value &&
    typeof value.token === "string"
  );
}

export async function GET({ request }: { request: Request }) {
  const body: unknown = await request.json();

  if (!isTokenBody(body)) {
    return Response.json({ error: "Invalid body" }, { status: 400 });
  }

  const token = body.token;

  const voter = db.prepare("SELECT email FROM voters WHERE token_hash = ?").get(token);

  if (voter === undefined || typeof voter.email !== "string") {
    return Response.json({ error: "Invalid token" }, { status: 401 });
  }

  const ballot = db
    .prepare(`
        SELECT rank_1, rank_2, rank_3, rank_4, rank_5
        FROM ballots
        WHERE voter_email = ?    
    `)
    .get(voter.email);

  return Response.json(ballot ?? null);
}

export async function PUT({ request }: { request: Request }) {
  const body: unknown = await request.json();

  if (!isBallotBody(body)) {
    return Response.json({ error: "Invalid body" }, { status: 400 });
  }

  const token = body.token;
  const ranking = body.ranking;
  const voter = db.prepare("SELECT email FROM voters WHERE token_hash = ?").get(token);

  if (!voter || typeof voter.email !== "string") {
    return Response.json({ error: "Invalid token" }, { status: 401 });
  }

  const result = db
    .prepare(`
      INSERT INTO ballots (
        voter_email,
        rank_1,
        rank_2,
        rank_3,
        rank_4,
        rank_5,
        status
      )
      VALUES (?, ?, ?, ?, ?, ?, 'draft')
      ON CONFLICT(voter_email) DO UPDATE SET
        rank_1 = excluded.rank_1,
        rank_2 = excluded.rank_2,
        rank_3 = excluded.rank_3,
        rank_4 = excluded.rank_4,
        rank_5 = excluded.rank_5
      WHERE ballots.status = 'draft'
    `)
    .run(
      voter.email,
      ranking[0] ?? null,
      ranking[1] ?? null,
      ranking[2] ?? null,
      ranking[3] ?? null,
      ranking[4] ?? null,
    );

  if (result.changes === 0) {
    return Response.json({ error: "Ballot is already submitted" }, { status: 409 });
  }
  return Response.json({ ok: true }, { status: 200 });
}
