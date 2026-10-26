import { deepStrictEqual, ok, strictEqual } from "node:assert";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { tallyVotes } from "./organizer-tally.ts";

const secret = "tally-test-secret";

function signed(timestamp = String(Date.now()), body = ""): Request {
  return new Request("https://example.com", {
    headers: {
      "x-timestamp": timestamp,
      "x-signature": createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex"),
    },
  });
}

function database(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(readFileSync(new URL("./schema.sql", import.meta.url), "utf8"));
  db.exec(`
    INSERT INTO teams (id, response_id, name, members, active, updated_at) VALUES
      ('a', 'r1', 'Inactive team', 'Member', 0, '2026-01-01'),
      ('b', 'r2', 'Disqualified team', 'Member', 1, '2026-01-01'),
      ('c', 'r3', 'Unranked team', 'Member', 1, '2026-01-01');
    INSERT INTO team_disqualifications VALUES ('b', 'Rule violation');
    INSERT INTO voters VALUES ('submitted@example.com', 'private-hash', '2026-01-01');
    INSERT INTO voters VALUES ('exhausted@example.com', NULL, '2026-01-01');
    INSERT INTO voters VALUES ('draft@example.com', NULL, '2026-01-01');
    INSERT INTO voters VALUES ('reset@example.com', NULL, '2026-01-01');
    INSERT INTO ballots (voter_email, rank_1, rank_2, status, submitted_at) VALUES
      ('submitted@example.com', 'b', 'a', 'submitted', '2026-01-01'),
      ('exhausted@example.com', 'b', NULL, 'submitted', '2026-01-01'),
      ('draft@example.com', 'c', NULL, 'draft', '2026-01-01');
    INSERT INTO ballot_resets (voter_email, rank_1, status, submitted_at, reset_at)
      VALUES ('reset@example.com', 'c', 'submitted', '2026-01-01', '2026-01-02');
  `);
  return db;
}

void test("tally rejects unsigned, expired, incorrect and missing-secret requests before reading data", async () => {
  const db = database();
  db.close();
  const responses = await Promise.all([
    tallyVotes(db, new Request("https://example.com"), secret),
    tallyVotes(db, signed("0"), secret),
    tallyVotes(db, signed(undefined, "wrong-body"), secret),
    tallyVotes(db, signed(), ""),
  ]);
  for (const response of responses) {
    strictEqual(response.status, 401);
    strictEqual(response.headers.get("cache-control"), "no-store");
  }
});

void test("tally counts submitted ballots, skips disqualifications, preserves inactive teams and data", async () => {
  const db = database();
  try {
    const before = db.prepare("SELECT * FROM ballots ORDER BY voter_email").all();
    const response = await tallyVotes(db, signed(), secret);
    strictEqual(response.status, 200);
    strictEqual(response.headers.get("cache-control"), "no-store");
    const result: unknown = await response.json();
    ok(typeof result === "object" && result !== null && "generatedAt" in result);
    ok(typeof result.generatedAt === "string" && Number.isFinite(Date.parse(result.generatedAt)));
    deepStrictEqual(result, {
      generatedAt: result.generatedAt,
      provisional: true,
      submittedBallots: 2,
      candidates: [{ id: "a", name: "Inactive team", active: false }],
      disqualifiedTeams: [{ id: "b", name: "Disqualified team", reason: "Rule violation" }],
      status: "winner",
      winnerId: "a",
      tiedTeamIds: [],
      ranking: [{ rank: 1, teamId: "a", name: "Inactive team" }],
      unrankedTeamIds: [],
      elections: [
        {
          rank: 1,
          status: "winner",
          winnerId: "a",
          tiedTeamIds: [],
          rounds: [
            {
              number: 1,
              counts: [{ teamId: "a", votes: 1 }],
              continuingBallots: 1,
              exhaustedBallots: 1,
              eliminatedTeamId: null,
            },
          ],
        },
      ],
    });
    deepStrictEqual(db.prepare("SELECT * FROM ballots ORDER BY voter_email").all(), before);
  } finally {
    db.close();
  }
});

void test("closed voting produces final results and reopening produces provisional results", async () => {
  const db = database();
  try {
    db.exec("INSERT INTO settings VALUES ('voting_closes_at', '2020-01-01T00:00:00Z')");
    const closed: unknown = await (await tallyVotes(db, signed(), secret)).json();
    ok(typeof closed === "object" && closed !== null && "provisional" in closed);
    strictEqual(closed.provisional, false);
    db.exec("UPDATE settings SET value = '2999-01-01T00:00:00Z'");
    const future: unknown = await (await tallyVotes(db, signed(), secret)).json();
    ok(typeof future === "object" && future !== null && "provisional" in future);
    strictEqual(future.provisional, true);
    db.exec("DELETE FROM settings");
    const reopened: unknown = await (await tallyVotes(db, signed(), secret)).json();
    ok(typeof reopened === "object" && reopened !== null && "provisional" in reopened);
    strictEqual(reopened.provisional, true);
  } finally {
    db.close();
  }
});

void test("no submitted eligible preferences returns no-votes", async () => {
  const db = database();
  try {
    db.exec("INSERT INTO team_disqualifications VALUES ('a', 'Rule violation')");
    const response = await tallyVotes(db, signed(), secret);
    const result: unknown = await response.json();
    ok(
      typeof result === "object" &&
        result !== null &&
        "status" in result &&
        "winnerId" in result &&
        "elections" in result,
    );
    strictEqual(result.status, "no-votes");
    strictEqual(result.winnerId, null);
    deepStrictEqual(result.elections, []);
  } finally {
    db.close();
  }
});
