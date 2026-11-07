import { deepStrictEqual, strictEqual, throws } from "node:assert";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { cleanRegistrationRemnants } from "./checkin-cleanup.ts";
import { dashboardRecords } from "./dashboard.ts";

const schema = readFileSync(new URL("./schema.sql", import.meta.url), "utf8");

void test("cleanup preserves registered participants without submissions and historical activity", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(schema);
    db.exec(`PRAGMA foreign_keys = ON;
      INSERT INTO teams VALUES ('team', 'response', 'Team', 'Angela', NULL, NULL, NULL, 1, 'now');
      INSERT INTO hackers VALUES ('angelaw3@andrew.cmu.edu', 'Angela Wang', 'check-in');
      INSERT INTO hackers VALUES ('angelawa@andrew.cmu.edu', 'angela wang', 'registration');
      INSERT INTO hackers VALUES ('angelaw3', NULL, NULL);
      INSERT INTO hackers VALUES ('ballot@example.com', 'Ballot', 'registration');
      INSERT INTO hackers VALUES ('collection@example.com', 'Collection', 'registration');
      INSERT INTO hackers VALUES ('claim@example.com', 'Claim', 'registration');
      INSERT INTO hackers VALUES ('reset@example.com', 'Reset', 'registration');
      INSERT INTO team_members VALUES ('team', 'angelaw3@andrew.cmu.edu');
      INSERT INTO voters SELECT email, email || '-token', 'now' FROM hackers;
      INSERT INTO ballots (voter_email, status, submitted_at) VALUES ('ballot@example.com', 'draft', 'now');
      INSERT INTO collections VALUES ('collection@example.com', 'team', 'note', 'now');
      INSERT INTO qr_codes VALUES ('qr', 'team', 'claim@example.com', 'now');
      INSERT INTO ballot_resets (voter_email, status, submitted_at, reset_at)
        VALUES ('reset@example.com', 'draft', 'now', 'later');`);
    let backups = 0;
    cleanRegistrationRemnants(db, () => {
      backups++;
    });
    cleanRegistrationRemnants(db, () => {
      backups++;
    });
    strictEqual(backups, 1);
    strictEqual(db.prepare("SELECT COUNT(*) AS count FROM hackers").get()?.count, 6);
    strictEqual(db.prepare("SELECT COUNT(*) AS count FROM voters").get()?.count, 6);
    strictEqual(
      db.prepare("SELECT token_hash FROM voters WHERE email = 'angelaw3@andrew.cmu.edu'").get()
        ?.token_hash,
      "angelaw3@andrew.cmu.edu-token",
    );
    deepStrictEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
    const hackers = dashboardRecords(db).hackers;
    strictEqual(hackers.length, 6);
    const checkedIn = hackers.find((row) => row.email === "angelaw3@andrew.cmu.edu");
    strictEqual(checkedIn?.checkedInAt, "check-in");
  } finally {
    db.close();
  }
});

void test("cleanup waits for check-in and leaves data untouched if the recovery copy fails", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(schema);
    db.exec("INSERT INTO hackers VALUES ('legacy@example.com', 'Legacy', 'registration')");
    cleanRegistrationRemnants(db, () => {
      throw new Error("Must not back up an empty check-in");
    });
    strictEqual(db.prepare("SELECT COUNT(*) AS count FROM hackers").get()?.count, 1);
    db.exec(`INSERT INTO teams VALUES ('team', 'response', 'Team', '', NULL, NULL, NULL, 1, 'now');
      INSERT INTO team_members VALUES ('team', 'legacy@example.com');`);
    throws(() => {
      cleanRegistrationRemnants(db, () => {
        throw new Error("backup failed");
      });
    }, /backup failed/u);
    strictEqual(db.prepare("SELECT COUNT(*) AS count FROM hackers").get()?.count, 1);
    strictEqual(db.prepare("SELECT COUNT(*) AS count FROM settings").get()?.count, 0);
  } finally {
    db.close();
  }
});
