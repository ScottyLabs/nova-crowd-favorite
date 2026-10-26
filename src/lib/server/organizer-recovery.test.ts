import { deepStrictEqual, notStrictEqual, ok, rejects, strictEqual } from "node:assert";
import { createHmac, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import {
  reissueVoter,
  resetBallot,
  setDisqualification,
  unlinkQrCode,
} from "./organizer-recovery.ts";
import { hashCode } from "./voter-code.ts";

const secret = randomBytes(32).toString("hex");
const origin = "https://example.com";

function signed(body: unknown, timestamp = String(Date.now())): Request {
  const raw = typeof body === "string" ? body : JSON.stringify(body);
  return new Request(origin, {
    method: "POST",
    body: raw,
    headers: {
      "x-timestamp": timestamp,
      "x-signature": createHmac("sha256", secret).update(`${timestamp}.${raw}`).digest("hex"),
    },
  });
}

function database(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(readFileSync(new URL("./schema.sql", import.meta.url), "utf8"));
  db.exec(`
    INSERT INTO voters VALUES ('person@example.com', 'old-hash', '2026-01-01');
    INSERT INTO teams (id, response_id, name, members, updated_at) VALUES
      ('t1', 'r1', 'Own team', 'Member', '2026-01-01'),
      ('t2', 'r2', 'Other team', 'Member', '2026-01-01');
    INSERT INTO team_members VALUES ('t1', 'person@example.com');
    INSERT INTO qr_codes VALUES ('sticker', 't1', 'person@example.com', '2026-01-01');
    INSERT INTO collections VALUES ('person@example.com', 't2', 'Note', '2026-01-01');
    INSERT INTO ballots (voter_email, rank_1, status, submitted_at)
      VALUES ('person@example.com', 't2', 'submitted', '2026-01-02');
  `);
  return db;
}

void test("all recovery operations reject unsigned, expired, invalid JSON and missing secrets", async () => {
  const db = database();
  try {
    const actions = [
      (r: Request, key: string) => reissueVoter(db, r, origin, key),
      (r: Request, key: string) => resetBallot(db, r, key),
      (r: Request, key: string) => unlinkQrCode(db, r, key),
      (r: Request, key: string) => setDisqualification(db, r, key),
    ];
    await Promise.all(
      actions.map(async (action) => {
        strictEqual(
          (await action(new Request(origin, { method: "POST", body: "{}" }), secret)).status,
          401,
        );
        strictEqual((await action(signed({}, "0"), secret)).status, 401);
        strictEqual((await action(signed({}), "")).status, 401);
        strictEqual((await action(signed("{"), secret)).status, 400);
        strictEqual((await action(signed({}), secret)).status, 400);
      }),
    );
    strictEqual(db.prepare("SELECT token_hash FROM voters").get()?.token_hash, "old-hash");
    strictEqual(db.prepare("SELECT status FROM ballots").get()?.status, "submitted");
    strictEqual(db.prepare("SELECT team_id FROM qr_codes").get()?.team_id, "t1");
    strictEqual(db.prepare("SELECT count(*) AS n FROM team_disqualifications").get()?.n, 0);
  } finally {
    db.close();
  }
});

void test("reissuing rotates credentials while preserving ballots, collections and claims", async () => {
  const db = database();
  try {
    const before = ["ballots", "collections", "qr_codes"].map((t) =>
      db.prepare(`SELECT * FROM ${t}`).all(),
    );
    const response = await reissueVoter(
      db,
      signed({ email: " Person@Example.com " }),
      origin,
      secret,
    );
    strictEqual(response.status, 200);
    strictEqual(response.headers.get("cache-control"), "no-store");
    const body: unknown = await response.json();
    ok(typeof body === "object" && body !== null && "url" in body && typeof body.url === "string");
    deepStrictEqual(body, { email: "person@example.com", url: body.url });
    const hash = db.prepare("SELECT token_hash FROM voters").get()?.token_hash;
    strictEqual(hash, await hashCode(new URL(body.url).pathname.slice(3)));
    notStrictEqual(hash, "old-hash");
    deepStrictEqual(
      ["ballots", "collections", "qr_codes"].map((t) => db.prepare(`SELECT * FROM ${t}`).all()),
      before,
    );
    strictEqual(
      (await reissueVoter(db, signed({ email: "missing@example.com" }), origin, secret)).status,
      404,
    );
    strictEqual((await reissueVoter(db, signed({ email: "bad" }), origin, secret)).status, 400);
    strictEqual(
      (await reissueVoter(db, signed({ email: "person@example.com" }), undefined, secret)).status,
      500,
    );
    strictEqual(db.prepare("SELECT token_hash FROM voters").get()?.token_hash, hash);
  } finally {
    db.close();
  }
});

void test("reset archives the exact ballot, preserves voter data and does not reopen voting", async () => {
  const db = database();
  try {
    db.exec("INSERT INTO settings VALUES ('voting_closes_at', '2020-01-01T00:00:00Z')");
    const ballot = db.prepare("SELECT * FROM ballots").get();
    const response = await resetBallot(db, signed({ email: "PERSON@example.com" }), secret);
    strictEqual(response.status, 200);
    deepStrictEqual(await response.json(), { email: "person@example.com", resetId: 1 });
    const saved = db.prepare("SELECT * FROM ballot_resets").get();
    ok(saved !== undefined);
    const { id, reset_at, ...original } = saved;
    strictEqual(id, 1);
    ok(typeof reset_at === "string" && Number.isFinite(Date.parse(reset_at)));
    deepStrictEqual(original, { ...ballot });
    strictEqual(db.prepare("SELECT count(*) AS n FROM ballots").get()?.n, 0);
    strictEqual(db.prepare("SELECT count(*) AS n FROM collections").get()?.n, 1);
    strictEqual(db.prepare("SELECT token_hash FROM voters").get()?.token_hash, "old-hash");
    strictEqual(db.prepare("SELECT value FROM settings").get()?.value, "2020-01-01T00:00:00Z");
    strictEqual(
      (await resetBallot(db, signed({ email: "person@example.com" }), secret)).status,
      404,
    );
    strictEqual(db.prepare("SELECT count(*) AS n FROM ballot_resets").get()?.n, 1);
  } finally {
    db.close();
  }
});

void test("a failed ballot reset rolls back both the archive and deletion", async () => {
  const db = database();
  try {
    db.exec(
      "CREATE TRIGGER deny_reset BEFORE DELETE ON ballots BEGIN SELECT RAISE(ABORT, 'denied'); END",
    );
    await rejects(resetBallot(db, signed({ email: "person@example.com" }), secret), /denied/u);
    strictEqual(db.prepare("SELECT count(*) AS n FROM ballots").get()?.n, 1);
    strictEqual(db.prepare("SELECT count(*) AS n FROM ballot_resets").get()?.n, 0);
  } finally {
    db.close();
  }
});

void test("unlinking frees a sticker without changing existing collections or ballots", async () => {
  const db = database();
  try {
    const before = db.prepare("SELECT * FROM ballots").all();
    const response = await unlinkQrCode(db, signed({ code: "sticker" }), secret);
    strictEqual(response.status, 200);
    deepStrictEqual(await response.json(), {
      code: "sticker",
      previous: {
        teamId: "t1",
        claimedBy: "person@example.com",
        claimedAt: "2026-01-01",
      },
    });
    deepStrictEqual(
      { ...db.prepare("SELECT * FROM qr_codes").get() },
      {
        code: "sticker",
        team_id: null,
        claimed_by: null,
        claimed_at: null,
      },
    );
    deepStrictEqual(db.prepare("SELECT * FROM ballots").all(), before);
    strictEqual(db.prepare("SELECT count(*) AS n FROM collections").get()?.n, 1);
    const retry = await unlinkQrCode(db, signed({ code: "sticker" }), secret);
    deepStrictEqual(await retry.json(), {
      code: "sticker",
      previous: { teamId: null, claimedBy: null, claimedAt: null },
    });
    strictEqual((await unlinkQrCode(db, signed({ code: "unknown" }), secret)).status, 404);
    strictEqual((await unlinkQrCode(db, signed({ code: "bad/code" }), secret)).status, 400);
  } finally {
    db.close();
  }
});

void test("disqualification is reversible and preserves team activity and ballot references", async () => {
  const db = database();
  try {
    const ballot = db.prepare("SELECT * FROM ballots").get();
    const response = await setDisqualification(
      db,
      signed({ teamId: "t2", disqualified: true, reason: "Rule violation" }),
      secret,
    );
    strictEqual(response.status, 200);
    deepStrictEqual(await response.json(), {
      teamId: "t2",
      disqualified: true,
      reason: "Rule violation",
    });
    strictEqual(
      db.prepare("SELECT reason FROM team_disqualifications WHERE team_id = 't2'").get()?.reason,
      "Rule violation",
    );
    strictEqual(db.prepare("SELECT active FROM teams WHERE id = 't2'").get()?.active, 1);
    deepStrictEqual(db.prepare("SELECT * FROM ballots").get(), ballot);
    const restore = await setDisqualification(
      db,
      signed({ teamId: "t2", disqualified: false }),
      secret,
    );
    deepStrictEqual(await restore.json(), { teamId: "t2", disqualified: false, reason: null });
    strictEqual(db.prepare("SELECT count(*) AS n FROM team_disqualifications").get()?.n, 0);
    strictEqual(
      (await setDisqualification(db, signed({ teamId: "missing", disqualified: true }), secret))
        .status,
      404,
    );
    strictEqual(
      (await setDisqualification(db, signed({ teamId: "t2", disqualified: "true" }), secret))
        .status,
      400,
    );
  } finally {
    db.close();
  }
});
