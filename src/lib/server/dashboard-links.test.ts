import { test } from "node:test";
import { strictEqual, notStrictEqual } from "node:assert";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { dashboardRecords, ensureVoterLinks, setTeamSubmission } from "./dashboard.ts";
import { hashCode } from "./voter-code.ts";

void test("missing voter links are saved once with names and valid credentials", async () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(readFileSync(new URL("./schema.sql", import.meta.url), "utf8"));
    db.exec(`INSERT INTO hackers (email, name) VALUES ('a@example.com', 'Alice');
      INSERT INTO voters VALUES ('a@example.com', 'old-hash', 'now');`);
    await ensureVoterLinks(db, "https://vote.example.com");
    const voter = dashboardRecords(db).voters[0];
    strictEqual(voter.name, "Alice");
    const url = new URL(String(voter.url));
    strictEqual(url.origin, "https://vote.example.com");
    const hash = db.prepare("SELECT token_hash FROM voters").get()?.token_hash;
    strictEqual(hash, await hashCode(url.pathname.slice(3)));
    notStrictEqual(hash, "old-hash");
    await ensureVoterLinks(db, "https://vote.example.com");
    strictEqual(dashboardRecords(db).voters[0].url, voter.url);
    strictEqual(db.prepare("SELECT count(*) AS n FROM settings").get()?.n, 1);
  } finally {
    db.close();
  }
});

void test("team disqualification hides every member and reinstatement restores their links", async () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(readFileSync(new URL("./schema.sql", import.meta.url), "utf8"));
    db.exec(`INSERT INTO teams (id, response_id, name, members, updated_at)
      VALUES ('t', 'r', 'Team', 'Alice, Bob', 'now');
      INSERT INTO hackers (email, name) VALUES ('a@example.com', 'Alice'), ('b@example.com', 'Bob');
      INSERT INTO team_members VALUES ('t', 'a@example.com'), ('t', 'b@example.com');
      INSERT INTO voters VALUES ('a@example.com', 'a-hash', 'now'), ('b@example.com', 'b-hash', 'now');`);
    await ensureVoterLinks(db, "https://vote.example.com");
    const before = dashboardRecords(db).voters;
    db.exec("INSERT INTO team_disqualifications VALUES ('t', 'Rule violation')");
    strictEqual(dashboardRecords(db).voters.length, 0);
    strictEqual(dashboardRecords(db).hackers.length, 0);
    await ensureVoterLinks(db, "https://vote.example.com");
    db.exec("DELETE FROM team_disqualifications");
    strictEqual(dashboardRecords(db).voters.length, 2);
    strictEqual(dashboardRecords(db).voters[0].url, before[0].url);
  } finally {
    db.close();
  }
});

void test("unsubmitted members and checked-in participants remain available as voters", async () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(readFileSync(new URL("./schema.sql", import.meta.url), "utf8"));
    db.exec(`INSERT INTO teams (id, response_id, name, members, updated_at)
      VALUES ('t', 'r', 'Team', 'Alice', 'now');
      INSERT INTO hackers (email, name, registered_at) VALUES ('a@example.com', 'Alice', 'now'), ('b@example.com', 'Bob', 'now');
      INSERT INTO team_members VALUES ('t', 'a@example.com');
      INSERT INTO voters VALUES ('a@example.com', 'old', 'now');`);
    setTeamSubmission(db, "t", false);
    await ensureVoterLinks(db, "https://vote.example.com");
    strictEqual(dashboardRecords(db).teams[0].status, "unsubmitted");
    strictEqual(dashboardRecords(db).voters.length, 1);
    strictEqual(dashboardRecords(db).hackers.length, 2);
    db.exec("INSERT INTO team_disqualifications VALUES ('t', 'Rule violation')");
    strictEqual(dashboardRecords(db).teams[0].status, "disqualified");
    strictEqual(dashboardRecords(db).voters.length, 0);
    db.exec("DELETE FROM team_disqualifications");
    setTeamSubmission(db, "t", true);
    strictEqual(dashboardRecords(db).teams[0].status, "eligible");
  } finally {
    db.close();
  }
});
