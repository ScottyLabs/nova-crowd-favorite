import type { DatabaseSync } from "node:sqlite";
import {
  EMAIL_PATTERN,
  QR_CODE_PATTERN,
  inTransaction,
  isRecord,
  json,
  readBody,
} from "./organizer.ts";
import { hashCode } from "./voter-code.ts";

function isEmailBody(body: unknown): body is { email: string } {
  return isRecord(body) && typeof body.email === "string" && EMAIL_PATTERN.test(body.email.trim());
}

export async function reissueVoter(
  db: DatabaseSync,
  request: Request,
  origin: string | undefined,
  secret: string,
): Promise<Response> {
  const input = await readBody(request, secret);
  if (input instanceof Response) return input;
  if (!isEmailBody(input.body)) return json({ error: "provide email" }, 400);
  if (origin === undefined || origin.length === 0) {
    return json({ error: "APP_URL is not configured" }, 500);
  }
  const email = input.body.email.trim().toLowerCase();
  const code = crypto.randomUUID();
  const hash = await hashCode(code);
  const url = new URL(`/v/${code}`, origin).href;
  const result = db.prepare("UPDATE voters SET token_hash = ? WHERE email = ?").run(hash, email);
  if (result.changes === 0) return json({ error: "voter not found" }, 404);
  return json({ email, url });
}

export async function resetBallot(
  db: DatabaseSync,
  request: Request,
  secret: string,
): Promise<Response> {
  const input = await readBody(request, secret);
  if (input instanceof Response) return input;
  if (!isEmailBody(input.body)) return json({ error: "provide email" }, 400);
  const email = input.body.email.trim().toLowerCase();
  return inTransaction(db, () => {
    const saved = db
      .prepare(`
      INSERT INTO ballot_resets
        (voter_email, rank_1, rank_2, rank_3, rank_4, rank_5, status, submitted_at, reset_at)
      SELECT voter_email, rank_1, rank_2, rank_3, rank_4, rank_5, status, submitted_at, ?
      FROM ballots WHERE voter_email = ?
      RETURNING id
    `)
      .get(new Date().toISOString(), email);
    if (saved === undefined) return json({ error: "ballot not found" }, 404);
    db.prepare("DELETE FROM ballots WHERE voter_email = ?").run(email);
    return json({ email, resetId: saved.id });
  });
}

export async function unlinkQrCode(
  db: DatabaseSync,
  request: Request,
  secret: string,
): Promise<Response> {
  const input = await readBody(request, secret);
  if (input instanceof Response) return input;
  const body = input.body;
  if (!isRecord(body) || typeof body.code !== "string" || !QR_CODE_PATTERN.test(body.code)) {
    return json({ error: "provide code (URL-safe string, 4-128 characters)" }, 400);
  }
  const code = body.code;
  return inTransaction(db, () => {
    const previous = db
      .prepare(`
      SELECT team_id AS teamId, claimed_by AS claimedBy, claimed_at AS claimedAt
      FROM qr_codes WHERE code = ?
    `)
      .get(code);
    if (previous === undefined) return json({ error: "QR code not found" }, 404);
    db.prepare(`
      UPDATE qr_codes SET team_id = NULL, claimed_by = NULL, claimed_at = NULL WHERE code = ?
    `).run(code);
    return json({ code, previous });
  });
}

function isDisqualificationBody(body: unknown): body is {
  teamId: string;
  disqualified: boolean;
  reason?: string;
} {
  return (
    isRecord(body) &&
    typeof body.teamId === "string" &&
    body.teamId.length > 0 &&
    typeof body.disqualified === "boolean" &&
    (body.reason === undefined || (typeof body.reason === "string" && body.reason.length <= 1000))
  );
}

export async function setDisqualification(
  db: DatabaseSync,
  request: Request,
  secret: string,
): Promise<Response> {
  const input = await readBody(request, secret);
  if (input instanceof Response) return input;
  if (!isDisqualificationBody(input.body)) {
    return json(
      {
        error:
          "provide teamId, disqualified (boolean), and optional reason (up to 1000 characters)",
      },
      400,
    );
  }
  const { teamId, disqualified, reason = "" } = input.body;
  return inTransaction(db, () => {
    if (db.prepare("SELECT 1 FROM teams WHERE id = ?").get(teamId) === undefined) {
      return json({ error: "team not found" }, 404);
    }
    if (disqualified) {
      db.prepare(`
        INSERT INTO team_disqualifications (team_id, reason) VALUES (?, ?)
        ON CONFLICT(team_id) DO UPDATE SET reason = excluded.reason
      `).run(teamId, reason);
    } else {
      db.prepare("DELETE FROM team_disqualifications WHERE team_id = ?").run(teamId);
    }
    return json({ teamId, disqualified, reason: disqualified ? reason : null });
  });
}
