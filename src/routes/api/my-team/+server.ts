import { unauthorized, voterEmail } from "../../../lib/server/auth";
import { voterTeam } from "../../../lib/server/team";

// GET /api/my-team -> { team: { id, name, members } | null, linked: boolean }
// team is null for voters who are not on a team (judges, organizers).
// linked is false until someone on the team links a QR code with "Scan my team".
// Needs `Authorization: Bearer <voter code>`.

export async function GET({ request }: { request: Request }) {
  const email = await voterEmail(request);
  if (email === null) return unauthorized();

  const mine = voterTeam(email);
  return Response.json({ team: mine?.team ?? null, linked: mine?.linked ?? false });
}
