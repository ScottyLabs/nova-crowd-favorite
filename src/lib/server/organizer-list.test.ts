import { deepStrictEqual, strictEqual } from "node:assert";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { listOrganizerRecords } from "./organizer.ts";

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
    method: "GET",
    headers: {
      "x-timestamp": timestamp,
      "x-signature": Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join(""),
    },
  });
}

void test("organizer listings require signatures and return empty arrays", async () => {
  const db = database();
  try {
    await Promise.all(
      (["voters", "teams", "ballots"] as const).map(async (resource) => {
        const unsigned = new Request(origin);
        strictEqual((await listOrganizerRecords(db, unsigned, secret, resource)).status, 401);
        const request = await signed("");
        const get = new Request(origin, { headers: request.headers });
        strictEqual((await listOrganizerRecords(db, get, "", resource)).status, 401);
        strictEqual(
          (await listOrganizerRecords(db, await signed("", "0"), secret, resource)).status,
          401,
        );
        const response = await listOrganizerRecords(db, get, secret, resource);
        strictEqual(response.status, 200);
        strictEqual(response.headers.get("cache-control"), "no-store");
        deepStrictEqual(await response.json(), { [resource]: [] });
      }),
    );
  } finally {
    db.close();
  }
});

function seedListings(db: DatabaseSync): void {
  db.exec(`
      INSERT INTO voters VALUES ('z@example.com', 'private-hash', '2026-01-01');
      INSERT INTO voters VALUES ('a@example.com', NULL, '2026-01-02');
      INSERT INTO teams (id, response_id, name, members, active, updated_at)
        VALUES ('t1', 'r1', 'Inactive team', 'Member', 0, '2026-01-01');
      INSERT INTO team_disqualifications VALUES ('t1', 'Rule violation');
      INSERT INTO ballots (voter_email, rank_1, status, submitted_at)
        VALUES ('z@example.com', 't1', 'submitted', '2026-01-03');
      INSERT INTO ballots (voter_email, status, submitted_at)
        VALUES ('a@example.com', 'draft', '2026-01-02');
    `);
}

void test("organizer listings include inactive teams and drafts without exposing credentials", async () => {
  const db = database();
  try {
    seedListings(db);
    const voters = await listOrganizerRecords(db, await signed(""), secret, "voters");
    deepStrictEqual(await voters.json(), {
      voters: [
        { email: "a@example.com", createdAt: "2026-01-02" },
        { email: "z@example.com", createdAt: "2026-01-01" },
      ],
    });
    const teams = await listOrganizerRecords(db, await signed(""), secret, "teams");
    deepStrictEqual(await teams.json(), {
      teams: [
        {
          id: "t1",
          responseId: "r1",
          name: "Inactive team",
          members: "Member",
          repoUrl: null,
          slidesUrl: null,
          videoUrl: null,
          active: false,
          disqualified: true,
          disqualificationReason: "Rule violation",
          updatedAt: "2026-01-01",
        },
      ],
    });
    const ballots = await listOrganizerRecords(db, await signed(""), secret, "ballots");
    deepStrictEqual(await ballots.json(), {
      ballots: [
        {
          voterEmail: "a@example.com",
          status: "draft",
          updatedAt: "2026-01-02",
          ranked: [],
        },
        {
          voterEmail: "z@example.com",
          status: "submitted",
          updatedAt: "2026-01-03",
          ranked: ["t1"],
        },
      ],
    });
  } finally {
    db.close();
  }
});
