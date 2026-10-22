import { db } from "../../../../lib/server/db";

function isNoteBody(value: unknown): value is { token: string; note: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "token" in value &&
    "note" in value &&
    typeof value.token === "string" &&
    typeof value.note === "string"
  );
}

export async function PATCH({
  request,
  params,
}: {
  request: Request;
  params: { team_id: string };
}) {
  const body: unknown = await request.json();

  if (!isNoteBody(body)) {
    return Response.json({ error: "Invalid body" }, { status: 400 });
  }

  const token = body.token;
  const note = body.note;

  const voter = db.prepare("SELECT email FROM voters WHERE token_hash = ?").get(token);

  if (voter === undefined || typeof voter.email !== "string") {
    return Response.json({ error: "Invalid token" }, { status: 401 });
  }

  db.prepare(`
        UPDATE collections
        SET note = ?
        WHERE voter_email = ? AND team_id = ?
    `).run(note, voter.email, params.team_id);
  return Response.json({ ok: true }, { status: 201 });
}
