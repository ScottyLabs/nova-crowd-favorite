import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { Cookies } from "@sveltejs/kit";

const cookie = "organizer";
const lifetime = 8 * 60 * 60;
const attempts = new Map<string, { count: number; until: number }>();

const hash = (value: string) => createHash("sha256").update(value).digest();

function equal(left: string, right: string): boolean {
  return timingSafeEqual(hash(left), hash(right));
}

export function passwordMatches(value: string, password: string): boolean {
  return password.length > 0 && equal(value, password);
}

export function allowLogin(address: string): boolean {
  const now = Date.now();
  for (const [key, attempt] of attempts) if (attempt.until <= now) attempts.delete(key);
  const attempt = attempts.get(address) ?? { count: 0, until: now + 60_000 };
  if (attempts.size >= 1000 && !attempts.has(address)) return false;
  attempts.set(address, attempt);
  return ++attempt.count <= 10;
}

function signature(value: string, password: string): string {
  return createHmac("sha256", password).update(`organizer-session:${value}`).digest("hex");
}

export function signedIn(cookies: Cookies, password: string): boolean {
  const token = cookies.get(cookie) ?? "";
  const [expires, nonce, mac] = token.split(".");
  return (
    password.length > 0 &&
    Number(expires) > Date.now() &&
    typeof nonce === "string" &&
    typeof mac === "string" &&
    equal(mac, signature(`${expires}.${nonce}`, password))
  );
}

export function signIn(cookies: Cookies, password: string, secure: boolean): void {
  const value = `${Date.now() + lifetime * 1000}.${randomBytes(24).toString("hex")}`;
  cookies.set(cookie, `${value}.${signature(value, password)}`, {
    path: "/organizer",
    httpOnly: true,
    sameSite: "strict",
    secure,
    maxAge: lifetime,
  });
}

export function signOut(cookies: Cookies): void {
  cookies.delete(cookie, { path: "/organizer" });
}

/** Keep the existing HMAC API private; only the server signs dashboard requests. */
export function apiRequest(method = "GET", payload?: unknown): RequestInit {
  const secret = process.env.SYNC_HMAC_SECRET;
  if (secret === undefined || secret.length === 0)
    throw new Error("SYNC_HMAC_SECRET is not configured");
  const body = method === "GET" ? "" : JSON.stringify(payload);
  const timestamp = String(Date.now());
  return {
    method,
    body: method === "GET" ? undefined : body,
    headers: {
      "content-type": "application/json",
      "x-timestamp": timestamp,
      "x-signature": createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex"),
    },
  };
}
