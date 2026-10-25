import { deepStrictEqual, strictEqual } from "node:assert";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { migrateBallots } from "./migrations.ts";

void test("legacy ballots keep their rankings, timestamps and submitted state", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(`
      CREATE TABLE ballots (
        voter_email TEXT PRIMARY KEY,
        rank_1 TEXT, rank_2 TEXT, rank_3 TEXT, rank_4 TEXT, rank_5 TEXT,
        submitted_at TEXT NOT NULL
      );
      INSERT INTO ballots VALUES ('test@example.com', 't1', 't2', 't3', 't4', 't5', '2026-10-01');
    `);
    migrateBallots(db);
    const expected = {
      voter_email: "test@example.com",
      rank_1: "t1",
      rank_2: "t2",
      rank_3: "t3",
      rank_4: "t4",
      rank_5: "t5",
      submitted_at: "2026-10-01",
      status: "submitted",
    };
    deepStrictEqual({ ...db.prepare("SELECT * FROM ballots").get() }, expected);
    db.exec(
      "INSERT INTO ballots (voter_email, submitted_at) VALUES ('new@example.com', '2026-10-02')",
    );
    migrateBallots(db);
    strictEqual(
      db.prepare("SELECT status FROM ballots WHERE voter_email = 'new@example.com'").get()?.status,
      "draft",
    );
    deepStrictEqual(
      { ...db.prepare("SELECT * FROM ballots WHERE voter_email = 'test@example.com'").get() },
      expected,
    );
  } finally {
    db.close();
  }
});

void test("current schema and existing drafts survive repeated startup", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(readFileSync(new URL("./schema.sql", import.meta.url), "utf8"));
    db.exec(`
      INSERT INTO voters (email, created_at) VALUES ('test@example.com', '2026-10-01');
      INSERT INTO ballots (voter_email, submitted_at) VALUES ('test@example.com', '2026-10-01');
    `);
    migrateBallots(db);
    migrateBallots(db);
    strictEqual(db.prepare("SELECT status FROM ballots").get()?.status, "draft");
    strictEqual(db.prepare("PRAGMA integrity_check").get()?.integrity_check, "ok");
  } finally {
    db.close();
  }
});
