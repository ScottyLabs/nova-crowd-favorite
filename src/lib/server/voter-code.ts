// Voter codes: the voting link is /v/<code>. The browser sends the code as
// `Authorization: Bearer <code>`. Only a SHA-256 hash of each code is stored
// (voters.token_hash), so a leaked database does not leak working links.

const CODE_PATTERN = /^[A-Za-z0-9_-]{4,128}$/u;
const enc = new TextEncoder();

/** SHA-256 of the code as lowercase hex. Must match Python's hashlib.sha256(code.encode()).hexdigest(). */
export async function hashCode(code: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(code));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** The code from `Authorization: Bearer <code>`, or null if missing or malformed. */
export function codeFromRequest(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (header === null) return null;
  const match = /^Bearer (?<code>\S+)$/u.exec(header.trim());
  const code = match?.groups?.code;
  if (code === undefined || !CODE_PATTERN.test(code)) return null;
  return code;
}
