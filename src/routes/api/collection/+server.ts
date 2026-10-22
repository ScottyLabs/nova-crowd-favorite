import { db } from "../../../lib/server/db";

function isTokenBody(value: unknown): value is { token: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "token" in value &&
    typeof value.token === "string"
  );
}

function isCollectionBody(value: unknown): value is { token: string; code: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "token" in value &&
    "code" in value &&
    typeof value.token === "string" &&
    typeof value.code === "string"
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

  const collection = db
    .prepare(`
        SELECT 
            teams.id,
            teams.name,
            collections.note
        FROM collections
        JOIN teams ON teams.id = collections.team_id
        WHERE collections.voter_email = ?
    `)
    .all(voter.email);
  return Response.json(collection);
}

export async function POST({ request }: { request: Request }) {
  const body: unknown = await request.json();

  if (!isCollectionBody(body)) {
    return Response.json({ error: "Invalid body" }, { status: 400 });
  }

  const token = body.token;
  const code = body.code;

  const voter = db.prepare("SELECT email FROM voters WHERE token_hash = ?").get(token);

  const team = db.prepare("SELECT team_id FROM qr_codes WHERE code = ?").get(code);

  if (voter === undefined || typeof voter.email !== "string") {
    return Response.json({ error: "Invalid token" }, { status: 401 });
  }

  if (team === undefined || typeof team.team_id !== "string") {
    return Response.json({ error: "Invalid code" }, { status: 404 });
  }

  db.prepare(`
        INSERT INTO collections (voter_email, team_id, scanned_at)
        VALUES (?, ?, CURRENT_TIMESTAMP)    
    `).run(voter.email, team.team_id);

  return Response.json({ ok: true }, { status: 201 });
}
