import { db } from "../../../lib/server/db";
import { verifySignature } from "../../../lib/server/hmac";

// Receives voter codes from the Nova email sender script.
// The script makes one random code per email, emails the link /v/<code>,
// and POSTs only the SHA-256 hash of each code here. Signed like /api/sync.
//
// Body: { "voters": [{ "email": "...", "token_hash": "<64 hex chars>" }] }
// Sending a new hash for an email that already exists replaces the old one,
// so that voter's old link stops working.

interface VoterInput {
  email: string;
  token_hash: string;
}

const HASH_PATTERN = /^[0-9a-f]{64}$/u;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+$/u;

function isVoterInput(value: unknown): value is VoterInput {
  return (
    typeof value === "object" &&
    value !== null &&
    "email" in value &&
    "token_hash" in value &&
    typeof value.email === "string" &&
    typeof value.token_hash === "string" &&
    EMAIL_PATTERN.test(value.email.trim()) &&
    HASH_PATTERN.test(value.token_hash)
  );
}

function extractVoters(raw: string): unknown {
  const parsed: unknown = JSON.parse(raw);
  if (typeof parsed === "object" && parsed !== null && "voters" in parsed) {
    return parsed.voters;
  }
  return undefined;
}

const upsertVoter = db.prepare(`
  INSERT INTO voters (email, token_hash, created_at)
  VALUES (?, ?, ?)
  ON CONFLICT(email) DO UPDATE SET token_hash = excluded.token_hash
`);

export async function POST({ request }: { request: Request }) {
  // Read the raw body first; the signature covers these exact bytes
  const raw = await request.text();

  const ok = await verifySignature(
    raw,
    request.headers.get("x-timestamp"),
    request.headers.get("x-signature"),
    process.env.SYNC_HMAC_SECRET ?? "",
  );
  if (!ok) return Response.json({ error: "invalid signature" }, { status: 401 });

  let voters: unknown;
  try {
    voters = extractVoters(raw);
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }
  if (
    !Array.isArray(voters) ||
    !voters.every((voter): voter is VoterInput => isVoterInput(voter))
  ) {
    return Response.json(
      { error: "voters must be a list of { email, token_hash }" },
      { status: 400 },
    );
  }

  const now = new Date().toISOString();
  db.exec("BEGIN");
  try {
    for (const voter of voters) {
      upsertVoter.run(voter.email.trim().toLowerCase(), voter.token_hash, now);
    }
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    console.error("[voters] save failed", e);
    return Response.json({ error: "save failed" }, { status: 500 });
  }

  return Response.json({ saved: voters.length });
}
