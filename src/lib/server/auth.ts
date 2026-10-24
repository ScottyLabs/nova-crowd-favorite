import { db } from "./db";
import { codeFromRequest, hashCode } from "./voter-code";

const findVoter = db.prepare("SELECT email FROM voters WHERE token_hash = ?");

/** The voter's email for this request, or null if the code is missing or unknown. */
export async function voterEmail(request: Request): Promise<string | null> {
  const code = codeFromRequest(request);
  if (code === null) return null;
  const row = findVoter.get(await hashCode(code));
  if (row === undefined || typeof row.email !== "string") return null;
  return row.email;
}

/** Standard 401 response for a missing or unknown voter code. */
export function unauthorized(): Response {
  return Response.json({ error: "Invalid or missing voter code" }, { status: 401 });
}
