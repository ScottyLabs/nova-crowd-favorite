import type { DatabaseSync } from "node:sqlite";
import { EMAIL_PATTERN, inTransaction, isRecord, json, readBody } from "./organizer.ts";

function isTeam(
  value: unknown,
): value is { name: string; members: { name: string; email: string }[] } {
  return (
    isRecord(value) &&
    typeof value.name === "string" &&
    value.name.trim().length > 0 &&
    value.name.length <= 200 &&
    Array.isArray(value.members) &&
    value.members.length > 0 &&
    value.members.length <= 20 &&
    value.members.every(
      (member: unknown) =>
        isRecord(member) &&
        typeof member.name === "string" &&
        member.name.trim().length > 0 &&
        member.name.length <= 200 &&
        typeof member.email === "string" &&
        EMAIL_PATTERN.test(member.email.trim()),
    )
  );
}

/** Add one submitted team without resyncing or replacing any existing teams. */
export async function addOrganizerTeam(
  db: DatabaseSync,
  request: Request,
  secret: string,
): Promise<Response> {
  const input = await readBody(request, secret);
  if (input instanceof Response) return input;
  if (!isTeam(input.body))
    return json({ error: "Provide a team name and 1-20 members with names and emails" }, 400);
  const name = input.body.name.trim();
  const members = input.body.members.map((member) => ({
    name: member.name.trim(),
    email: member.email.trim().toLowerCase(),
  }));
  if (new Set(members.map((member) => member.email)).size !== members.length)
    return json({ error: "Member emails must be unique" }, 400);
  return inTransaction(db, () => {
    const existing = db
      .prepare("SELECT id FROM teams WHERE lower(trim(name)) = lower(?)")
      .get(name);
    if (existing) return json({ error: "Team already exists", teamId: existing.id }, 409);
    const id = crypto.randomUUID();
    db.prepare(
      "INSERT INTO teams (id, response_id, name, members, active, updated_at) VALUES (?, ?, ?, ?, 1, ?)",
    ).run(
      id,
      `organizer:${id}`,
      name,
      members.map((member) => member.name).join(", "),
      new Date().toISOString(),
    );
    for (const member of members) {
      db.prepare(`INSERT INTO hackers (email, name) VALUES (?, ?)
        ON CONFLICT(email) DO UPDATE SET name = COALESCE(hackers.name, excluded.name)`).run(
        member.email,
        member.name,
      );
      db.prepare("INSERT INTO team_members (team_id, email) VALUES (?, ?)").run(id, member.email);
    }
    return json({ team: { id, name, status: "eligible" } }, 201);
  });
}
