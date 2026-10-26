import type { DatabaseSync } from "node:sqlite";
import { verifySignature } from "./hmac.ts";
import { hashCode } from "./voter-code.ts";

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+$/u;
export const QR_CODE_PATTERN = /^[A-Za-z0-9_-]{4,128}$/u;
const DEADLINE_PATTERN =
  /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/u;
const MAX_BATCH_SIZE = 1000;

export function json(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

const organizerListings = {
  voters(db: DatabaseSync) {
    return db
      .prepare(`
      SELECT email, created_at AS createdAt FROM voters ORDER BY email
    `)
      .all();
  },
  teams(db: DatabaseSync) {
    return db
      .prepare(`
      SELECT id, response_id AS responseId, name, members,
        repo_url AS repoUrl, slides_url AS slidesUrl, video_url AS videoUrl,
        active, updated_at AS updatedAt,
        d.team_id IS NOT NULL AS disqualified, d.reason AS disqualificationReason
      FROM teams
      LEFT JOIN team_disqualifications d ON d.team_id = teams.id
      ORDER BY teams.id
    `)
      .all()
      .map((team) => ({
        id: team.id,
        responseId: team.responseId,
        name: team.name,
        members: team.members,
        repoUrl: team.repoUrl,
        slidesUrl: team.slidesUrl,
        videoUrl: team.videoUrl,
        active: team.active === 1,
        disqualified: team.disqualified === 1,
        disqualificationReason: team.disqualificationReason,
        updatedAt: team.updatedAt,
      }));
  },
  ballots(db: DatabaseSync) {
    return db
      .prepare(`
      SELECT voter_email AS voterEmail, rank_1, rank_2, rank_3, rank_4, rank_5,
        status, submitted_at AS updatedAt
      FROM ballots ORDER BY voter_email
    `)
      .all()
      .map((ballot) => ({
        voterEmail: ballot.voterEmail,
        status: ballot.status,
        updatedAt: ballot.updatedAt,
        ranked: [ballot.rank_1, ballot.rank_2, ballot.rank_3, ballot.rank_4, ballot.rank_5].filter(
          (id): id is string => typeof id === "string",
        ),
      }));
  },
};

/** Read-only organizer listings sign an empty request body. */
export async function listOrganizerRecords(
  db: DatabaseSync,
  request: Request,
  secret: string,
  resource: keyof typeof organizerListings,
): Promise<Response> {
  const valid = await verifySignature(
    "",
    request.headers.get("x-timestamp"),
    request.headers.get("x-signature"),
    secret,
  );
  if (!valid) return json({ error: "invalid signature" }, 401);
  return json({ [resource]: organizerListings[resource](db) });
}

export async function readBody(
  request: Request,
  secret: string,
): Promise<{ body: unknown } | Response> {
  const raw = await request.text();
  const ok = await verifySignature(
    raw,
    request.headers.get("x-timestamp"),
    request.headers.get("x-signature"),
    secret,
  );
  if (!ok) {
    return json({ error: "invalid signature" }, 401);
  }
  try {
    const body: unknown = JSON.parse(raw);
    return { body };
  } catch {
    return json({ error: "invalid JSON" }, 400);
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function inTransaction<T>(db: DatabaseSync, action: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = action();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function isVoterBody(body: unknown): body is { emails: string[] } {
  return (
    isRecord(body) &&
    Array.isArray(body.emails) &&
    body.emails.length > 0 &&
    body.emails.length <= MAX_BATCH_SIZE &&
    body.emails.every(
      (email: unknown) => typeof email === "string" && EMAIL_PATTERN.test(email.trim()),
    )
  );
}

export async function addVoters(
  db: DatabaseSync,
  request: Request,
  origin: string | undefined,
  secret: string,
): Promise<Response> {
  const input = await readBody(request, secret);
  if (input instanceof Response) return input;
  if (origin === undefined || origin.length === 0) {
    return json({ error: "APP_URL is not configured" }, 500);
  }
  const body = input.body;
  if (!isVoterBody(body)) {
    return json({ error: "provide emails (1-1000 addresses)" }, 400);
  }
  const emails = [...new Set(body.emails.map((email) => email.trim().toLowerCase()))];
  const voters = await Promise.all(
    emails.map(async (email) => {
      const code = crypto.randomUUID();
      return {
        email,
        hash: await hashCode(code),
        url: new URL(`/v/${code}`, origin).href,
      };
    }),
  );
  // Compute hashes before starting the SQLite transaction.
  const result = inTransaction(db, () => {
    const exists = db.prepare("SELECT 1 FROM voters WHERE email = ?");
    const existing = emails.filter((email) => exists.get(email) !== undefined);
    if (existing.length > 0) return { existing };
    const insert = db.prepare(`
      INSERT INTO voters (email, token_hash, created_at) VALUES (?, ?, ?)
    `);
    const now = new Date().toISOString();
    for (const voter of voters) insert.run(voter.email, voter.hash, now);
    return { voters: voters.map(({ email, url }) => ({ email, url })) };
  });
  if ("existing" in result) {
    return json(
      {
        error: "voters already exist",
        emails: result.existing,
      },
      409,
    );
  }
  return json(result, 201);
}

function isQrBody(value: unknown): value is { codes: string[] } {
  return (
    isRecord(value) &&
    Array.isArray(value.codes) &&
    value.codes.length > 0 &&
    value.codes.length <= MAX_BATCH_SIZE &&
    value.codes.every((code: unknown) => typeof code === "string" && QR_CODE_PATTERN.test(code))
  );
}

export async function registerQrCodes(
  db: DatabaseSync,
  request: Request,
  origin: string | undefined,
  secret: string,
): Promise<Response> {
  const input = await readBody(request, secret);
  if (input instanceof Response) return input;
  if (origin === undefined || origin.length === 0) {
    return json({ error: "APP_URL is not configured" }, 500);
  }
  const body = input.body;
  if (!isQrBody(body)) {
    return json(
      {
        error: "provide codes (1-1000 URL-safe strings, 4-128 characters each)",
      },
      400,
    );
  }
  const codes = [...new Set(body.codes)];
  const stickers = codes.map((code) => ({
    code,
    url: new URL(`/t/${code}`, origin).href,
  }));
  const created = inTransaction(db, () => {
    const insert = db.prepare(
      "INSERT INTO qr_codes (code) VALUES (?) ON CONFLICT(code) DO NOTHING",
    );
    let count = 0;
    for (const code of codes) count += Number(insert.run(code).changes);
    return count;
  });
  return json({ created, stickers });
}

function isDeadlineBody(value: unknown): value is { closesAt: string | null } {
  if (!isRecord(value)) return false;
  if (value.closesAt === null) return true;
  if (
    typeof value.closesAt !== "string" ||
    !DEADLINE_PATTERN.test(value.closesAt) ||
    !Number.isFinite(Date.parse(value.closesAt))
  ) {
    return false;
  }
  const day = value.closesAt.slice(0, 10);
  return new Date(day).toISOString().slice(0, 10) === day;
}

export async function setVotingDeadline(
  db: DatabaseSync,
  request: Request,
  secret: string,
): Promise<Response> {
  const input = await readBody(request, secret);
  if (input instanceof Response) return input;
  const body = input.body;
  if (!isDeadlineBody(body)) {
    return json(
      {
        error: "provide closesAt as an ISO timestamp with seconds and timezone, or null to reopen",
      },
      400,
    );
  }
  const closesAt = body.closesAt === null ? null : new Date(body.closesAt).toISOString();
  if (closesAt === null) {
    db.prepare("DELETE FROM settings WHERE key = 'voting_closes_at'").run();
  } else {
    db.prepare(`
      INSERT INTO settings (key, value) VALUES ('voting_closes_at', ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run(closesAt);
  }
  return json({
    closesAt,
    closed: closesAt !== null && Date.now() >= Date.parse(closesAt),
  });
}
