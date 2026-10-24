import { unauthorized, voterEmail } from "../../../../lib/server/auth";
import { db } from "../../../../lib/server/db";

// PATCH /api/collection/<team_id>  -> save the voter's private note on a team.
// Body: { "note": "..." }. Needs `Authorization: Bearer <voter code>`.

const NOTE_LIMIT = 500;

const updateNote = db.prepare(`
  UPDATE collections SET note = ? WHERE voter_email = ? AND team_id = ?
`);

function isNoteBody(value: unknown): value is { note: string } {
  return (
    typeof value === "object" && value !== null && "note" in value && typeof value.note === "string"
  );
}

export async function PATCH({
  request,
  params,
}: {
  request: Request;
  params: { team_id: string };
}) {
  const email = await voterEmail(request);
  if (email === null) return unauthorized();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }
  if (!isNoteBody(body)) return Response.json({ error: "body must be { note }" }, { status: 400 });
  if (body.note.length > NOTE_LIMIT) {
    return Response.json(
      { error: `note is longer than ${NOTE_LIMIT} characters` },
      { status: 400 },
    );
  }

  const result = updateNote.run(body.note, email, params.team_id);
  if (result.changes === 0) {
    return Response.json({ error: "team is not in your collection" }, { status: 404 });
  }
  return Response.json({ ok: true });
}
