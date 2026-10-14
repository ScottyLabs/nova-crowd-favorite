// Requests older than this are rejected, so a captured request can't be replayed later
const MAX_AGE_MS = 5 * 60 * 1000;
const enc = new TextEncoder();

// "a1b2..." -> bytes. Returns null if it isn't valid hex.
function hexToBytes(hex: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[0-9a-f]+$/iu.test(hex) || hex.length % 2 !== 0) return null;
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

// Checks the request was signed with our secret, wasn't changed, and is recent.
export async function verifySignature(
  rawBody: string,
  timestamp: string | null,
  signatureHex: string | null,
  secret: string,
): Promise<boolean> {
  // Missing anything (including the secret itself) -> reject. Fails closed.
  if (timestamp === null || timestamp === "") return false;
  if (signatureHex === null || signatureHex === "") return false;
  if (secret === "") return false;

  // Too old or in the future -> reject (blocks replays)
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > MAX_AGE_MS) return false;

  const sig = hexToBytes(signatureHex);
  if (sig === null) return false;

  // Recompute the signature over "timestamp.body" and compare.
  // crypto.subtle.verify compares in constant time, so it doesn't leak timing hints.
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  return crypto.subtle.verify("HMAC", key, sig, enc.encode(`${timestamp}.${rawBody}`));
}
