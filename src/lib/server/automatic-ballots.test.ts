import { strictEqual, deepStrictEqual } from "node:assert";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { reconcileAutomaticBallots } from "./automatic-ballots.ts";

void test("deadline submits saved drafts once and reopening restores only automatic submissions", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(readFileSync(new URL("./schema.sql", import.meta.url), "utf8"));
    db.exec(`INSERT INTO teams (id,response_id,name,members,updated_at) VALUES ('t','r','Team','','now');
      INSERT INTO hackers (email) VALUES ('draft'),('manual'),('empty'),('dq');
      INSERT INTO voters SELECT email, email, 'now' FROM hackers;
      INSERT INTO ballots (voter_email,rank_1,status,submitted_at) VALUES
        ('draft','t','draft','2026-01-01'),('manual','t','submitted','2026-01-02'),
        ('empty',NULL,'draft','2026-01-03'),('dq','t','draft','2026-01-04');
      INSERT INTO team_members VALUES ('t','dq');
      INSERT INTO team_disqualifications VALUES ('t','Rule violation');
      INSERT INTO settings VALUES ('voting_closes_at','2026-02-01T00:00:00.000Z');`);
    const get = (email: string) =>
      db.prepare("SELECT status, submitted_at FROM ballots WHERE voter_email = ?").get(email);
    reconcileAutomaticBallots(db, Date.parse("2026-01-31"));
    strictEqual(get("draft")?.status, "draft");
    reconcileAutomaticBallots(db, Date.parse("2026-02-01"));
    strictEqual(get("draft")?.status, "submitted");
    strictEqual(get("draft")?.submitted_at, "2026-02-01T00:00:00.000Z");
    strictEqual(get("empty")?.status, "draft");
    strictEqual(get("dq")?.status, "draft");
    const closed = db.prepare("SELECT * FROM ballots ORDER BY voter_email").all();
    reconcileAutomaticBallots(db, Date.parse("2026-02-02"));
    deepStrictEqual(db.prepare("SELECT * FROM ballots ORDER BY voter_email").all(), closed);
    db.exec("DELETE FROM settings WHERE key = 'voting_closes_at'");
    reconcileAutomaticBallots(db);
    strictEqual(get("draft")?.status, "draft");
    strictEqual(get("draft")?.submitted_at, "2026-01-01");
    strictEqual(get("manual")?.status, "submitted");
    strictEqual(get("manual")?.submitted_at, "2026-01-02");
    db.exec(
      "UPDATE ballots SET status = 'submitted', submitted_at = '2026-02-03' WHERE voter_email = 'draft'; INSERT INTO settings VALUES ('voting_closes_at','2026-02-04')",
    );
    reconcileAutomaticBallots(db, Date.parse("2026-02-05"));
    db.exec("DELETE FROM settings WHERE key = 'voting_closes_at'");
    reconcileAutomaticBallots(db);
    strictEqual(get("draft")?.status, "submitted");
  } finally {
    db.close();
  }
});

void test("rescheduling to the future reverses auto-submission and closing again submits latest saved ranking", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(readFileSync(new URL("./schema.sql", import.meta.url), "utf8"));
    db.exec(`INSERT INTO hackers (email) VALUES ('draft');
      INSERT INTO voters VALUES ('draft','hash','now');
      INSERT INTO teams (id,response_id,name,members,updated_at) VALUES ('a','a','A','','now'), ('b','b','B','','now');
      INSERT INTO ballots (voter_email,rank_1,status,submitted_at) VALUES ('draft','a','draft','first');
      INSERT INTO settings VALUES ('voting_closes_at','2026-02-01');`);
    reconcileAutomaticBallots(db, Date.parse("2026-02-02"));
    db.exec("UPDATE settings SET value = '2026-03-01' WHERE key = 'voting_closes_at'");
    reconcileAutomaticBallots(db, Date.parse("2026-02-02"));
    strictEqual(db.prepare("SELECT status FROM ballots").get()?.status, "draft");
    db.exec("UPDATE ballots SET rank_1 = 'b', submitted_at = 'second'");
    reconcileAutomaticBallots(db, Date.parse("2026-03-01"));
    strictEqual(db.prepare("SELECT status FROM ballots").get()?.status, "submitted");
    strictEqual(db.prepare("SELECT rank_1 FROM ballots").get()?.rank_1, "b");
    db.exec("DELETE FROM settings WHERE key = 'voting_closes_at'");
    reconcileAutomaticBallots(db, Date.parse("2026-03-02"));
    strictEqual(db.prepare("SELECT submitted_at FROM ballots").get()?.submitted_at, "second");
  } finally {
    db.close();
  }
});
