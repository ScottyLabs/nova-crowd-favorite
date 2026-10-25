import { deepStrictEqual, strictEqual, ok } from "node:assert";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { addVoters, registerQrCodes, setVotingDeadline } from "./organizer.ts";
import { hashCode } from "./voter-code.ts";

const secret = "organizer-test-secret";
const origin = "https://example.com";
const enc = new TextEncoder();

function database(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(readFileSync(new URL("./schema.sql", import.meta.url), "utf8"));
  return db;
}

async function signed(body: unknown, timestamp = String(Date.now())): Promise<Request> {
  const raw = typeof body === "string" ? body : JSON.stringify(body);
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, enc.encode(`${timestamp}.${raw}`)),
  );
  return new Request(origin, {
    method: "POST",
    body: raw,
    headers: {
      "x-timestamp": timestamp,
      "x-signature": Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join(""),
    },
  });
}

void test("organizer operations reject unsigned, expired and malformed requests", async () => {
  const db = database();
  try {
    await Promise.all(
      [
        (r: Request, key: string) => addVoters(db, r, origin, key),
        (r: Request, key: string) => registerQrCodes(db, r, origin, key),
        (r: Request, key: string) => setVotingDeadline(db, r, key),
      ].map(async (action) => {
        strictEqual(
          (await action(new Request(origin, { method: "POST", body: "{}" }), secret)).status,
          401,
        );
        strictEqual((await action(await signed({}), "")).status, 401);
        strictEqual((await action(await signed({}, "0"), secret)).status, 401);
        strictEqual((await action(await signed("{"), secret)).status, 400);
      }),
    );
    strictEqual(db.prepare("SELECT count(*) AS n FROM voters").get()?.n, 0);
    strictEqual(db.prepare("SELECT count(*) AS n FROM qr_codes").get()?.n, 0);
    strictEqual(db.prepare("SELECT count(*) AS n FROM settings").get()?.n, 0);
  } finally {
    db.close();
  }
});

void test("voter links are hashed and emails are normalized", async () => {
  const db = database();
  try {
    const response = await addVoters(
      db,
      await signed({ emails: [" Person@Example.com ", "person@example.com"] }),
      origin,
      secret,
    );
    strictEqual(response.status, 201);
    strictEqual(response.headers.get("cache-control"), "no-store");
    const result: unknown = await response.json();
    ok(
      typeof result === "object" &&
        result !== null &&
        "voters" in result &&
        Array.isArray(result.voters),
    );
    const voter: unknown = result.voters[0];
    ok(
      typeof voter === "object" &&
        voter !== null &&
        "url" in voter &&
        typeof voter.url === "string",
    );
    deepStrictEqual(result, { voters: [{ email: "person@example.com", url: voter.url }] });
    const code = new URL(voter.url).pathname.slice(3);
    strictEqual(
      db.prepare("SELECT token_hash FROM voters").get()?.token_hash,
      await hashCode(code),
    );
  } finally {
    db.close();
  }
});

void test("existing voters reject the whole batch and preserve credentials and ballots", async () => {
  const db = database();
  try {
    const code = "old-voter-code";
    db.prepare("INSERT INTO voters (email, token_hash, created_at) VALUES (?, ?, ?)").run(
      "person@example.com",
      await hashCode(code),
      "2026-01-01",
    );
    db.exec(
      "INSERT INTO ballots (voter_email, status, submitted_at) VALUES ('person@example.com', 'submitted', '2026-01-01')",
    );
    const conflict = await addVoters(
      db,
      await signed({ emails: ["new@example.com", "person@example.com"] }),
      origin,
      secret,
    );
    strictEqual(conflict.status, 409);
    strictEqual(db.prepare("SELECT count(*) AS n FROM voters").get()?.n, 1);
    strictEqual(
      db.prepare("SELECT token_hash FROM voters").get()?.token_hash,
      await hashCode(code),
    );
    strictEqual(db.prepare("SELECT status FROM ballots").get()?.status, "submitted");
  } finally {
    db.close();
  }
});

void test("invalid voter batches do not partially add voters", async () => {
  const db = database();
  try {
    strictEqual(
      (await addVoters(db, await signed({ emails: ["new@example.com", "bad"] }), origin, secret))
        .status,
      400,
    );
    strictEqual(db.prepare("SELECT count(*) AS n FROM voters").get()?.n, 0);
  } finally {
    db.close();
  }
});

void test("QR registration can be retried without clearing team claims", async () => {
  const db = database();
  try {
    db.exec(`
      INSERT INTO teams (id, response_id, name, members, updated_at) VALUES ('t1', 'r1', 'Team', '', '2026-01-01');
      INSERT INTO voters (email, created_at) VALUES ('member@example.com', '2026-01-01');
      INSERT INTO qr_codes VALUES ('existing-code', 't1', 'member@example.com', '2026-01-01');
    `);
    const before = db.prepare("SELECT * FROM qr_codes WHERE code = 'existing-code'").get();
    const response = await registerQrCodes(
      db,
      await signed({ codes: ["existing-code", "new-code", "new-code"] }),
      origin,
      secret,
    );
    strictEqual(response.status, 200);
    deepStrictEqual(await response.json(), {
      created: 1,
      stickers: [
        { code: "existing-code", url: "https://example.com/t/existing-code" },
        { code: "new-code", url: "https://example.com/t/new-code" },
      ],
    });
    deepStrictEqual(
      db.prepare("SELECT * FROM qr_codes WHERE code = 'existing-code'").get(),
      before,
    );
    strictEqual(
      db.prepare("SELECT team_id FROM qr_codes WHERE code = 'new-code'").get()?.team_id,
      null,
    );
    strictEqual(
      (
        await registerQrCodes(
          db,
          await signed({ codes: ["valid-code", "bad/code"] }),
          origin,
          secret,
        )
      ).status,
      400,
    );
    strictEqual(db.prepare("SELECT count(*) AS n FROM qr_codes").get()?.n, 2);
  } finally {
    db.close();
  }
});

void test("deadline changes require a timezone and reopening preserves submitted ballots", async () => {
  const db = database();
  try {
    db.exec(`
      INSERT INTO voters (email, created_at) VALUES ('test@example.com', '2026-01-01');
      INSERT INTO ballots (voter_email, status, submitted_at) VALUES ('test@example.com', 'submitted', '2026-01-01');
    `);
    await Promise.all(
      [undefined, "invalid", "2026-01-01T12:00:00", 42].map(async (closesAt) => {
        strictEqual((await setVotingDeadline(db, await signed({ closesAt }), secret)).status, 400);
      }),
    );
    const close = await setVotingDeadline(
      db,
      await signed({ closesAt: "2020-01-01T12:00:00-05:00" }),
      secret,
    );
    strictEqual(close.status, 200);
    deepStrictEqual(await close.json(), { closesAt: "2020-01-01T17:00:00.000Z", closed: true });
    strictEqual(db.prepare("SELECT value FROM settings").get()?.value, "2020-01-01T17:00:00.000Z");
    const open = await setVotingDeadline(db, await signed({ closesAt: null }), secret);
    deepStrictEqual(await open.json(), { closesAt: null, closed: false });
    strictEqual(db.prepare("SELECT count(*) AS n FROM settings").get()?.n, 0);
    strictEqual(db.prepare("SELECT status FROM ballots").get()?.status, "submitted");
  } finally {
    db.close();
  }
});

void test("replaying a signed voter request never replaces a working link", async () => {
  const db = database();
  try {
    const request = await signed({ emails: ["person@example.com"] });
    const replay = request.clone();
    strictEqual((await addVoters(db, request, origin, secret)).status, 201);
    const hash = db.prepare("SELECT token_hash FROM voters").get()?.token_hash;
    strictEqual((await addVoters(db, replay, origin, secret)).status, 409);
    strictEqual(db.prepare("SELECT token_hash FROM voters").get()?.token_hash, hash);
  } finally {
    db.close();
  }
});

void test("link endpoints require APP_URL before changing the database", async () => {
  const db = database();
  try {
    await Promise.all(
      [undefined, ""].map(async (appUrl) => {
        strictEqual(
          (await addVoters(db, await signed({ emails: ["person@example.com"] }), appUrl, secret))
            .status,
          500,
        );
        strictEqual(
          (await registerQrCodes(db, await signed({ codes: ["sticker-test"] }), appUrl, secret))
            .status,
          500,
        );
      }),
    );
    strictEqual(db.prepare("SELECT count(*) AS n FROM voters").get()?.n, 0);
    strictEqual(db.prepare("SELECT count(*) AS n FROM qr_codes").get()?.n, 0);
  } finally {
    db.close();
  }
});

void test("invalid calendar dates and times leave the voting deadline unchanged", async () => {
  const db = database();
  try {
    db.exec("INSERT INTO settings VALUES ('voting_closes_at', '2030-01-01T00:00:00Z')");
    await Promise.all(
      [
        "2026-02-30T13:00:00-05:00",
        "2025-02-29T00:00:00Z",
        "2026-04-31T00:00:00Z",
        "2026-01-01T24:00:00Z",
        "2026-01-01T12:60:00Z",
      ].map(async (closesAt) => {
        strictEqual((await setVotingDeadline(db, await signed({ closesAt }), secret)).status, 400);
      }),
    );
    strictEqual(db.prepare("SELECT value FROM settings").get()?.value, "2030-01-01T00:00:00Z");
    const leapDay = await setVotingDeadline(
      db,
      await signed({ closesAt: "2028-02-29T23:00:00-05:00" }),
      secret,
    );
    strictEqual(leapDay.status, 200);
    strictEqual(db.prepare("SELECT value FROM settings").get()?.value, "2028-03-01T04:00:00.000Z");
  } finally {
    db.close();
  }
});
