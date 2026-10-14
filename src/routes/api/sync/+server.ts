import { verifySignature } from "../../../lib/server/hmac";
import { syncTeams } from "../../../lib/server/sync";

// Checks the shape AND tells TypeScript the type, so no `as` is needed
function isRows(value: unknown): value is string[][] {
  return (
    Array.isArray(value) &&
    value.every((r) => Array.isArray(r) && r.every((c) => typeof c === "string"))
  );
}

// Pulls `rows` out of the parsed JSON without trusting its shape
function extractRows(raw: string): unknown {
  const parsed: unknown = JSON.parse(raw);
  if (typeof parsed === "object" && parsed !== null && "rows" in parsed) {
    return parsed.rows;
  }
  return undefined;
}

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

  let rows: unknown;
  try {
    rows = extractRows(raw);
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }
  if (!isRows(rows)) {
    return Response.json({ error: "rows must be string[][]" }, { status: 400 });
  }

  try {
    return Response.json(syncTeams(rows));
  } catch (e) {
    console.error("[sync] failed", e);
    return Response.json({ error: "sync failed" }, { status: 500 });
  }
}
