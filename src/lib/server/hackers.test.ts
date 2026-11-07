import { deepStrictEqual, strictEqual, throws } from "node:assert";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { saveCheckInHackers, syncHackers } from "./hackers.ts";
import { migrateHackers } from "./migrations.ts";

const schema = readFileSync(new URL("./schema.sql", import.meta.url), "utf8");

void test("check-in saves names for existing and new hackers without altering voter links", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(schema);
    db.exec(`INSERT INTO hackers VALUES ('alex@example.com', 'Old', 'old-date');
      INSERT INTO voters VALUES ('alex@example.com', 'existing-link', 'created');`);
    const people = [
      { email: "alex@example.com", name: "Alex" },
      { email: "sam@example.com", name: "Sam" },
    ];
    saveCheckInHackers(db, people, "check-in-date");
    saveCheckInHackers(db, people, "check-in-date");
    saveCheckInHackers(db, [{ email: "alex@example.com", name: "" }], "later");
    deepStrictEqual(
      db
        .prepare("SELECT * FROM hackers ORDER BY email")
        .all()
        .map((row) => ({ email: row.email, name: row.name, registered_at: row.registered_at })),
      [
        { email: "alex@example.com", name: "Alex", registered_at: "check-in-date" },
        { email: "sam@example.com", name: "Sam", registered_at: "check-in-date" },
      ],
    );
    strictEqual(db.prepare("SELECT token_hash FROM voters").get()?.token_hash, "existing-link");
  } finally {
    db.close();
  }
});

void test("startup adds registration timestamps without changing existing hackers or voters", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(schema.replace("name TEXT,\n  registered_at TEXT", "name TEXT"));
    db.exec(`INSERT INTO hackers VALUES ('alex@example.com', 'Alex');
      INSERT INTO voters VALUES ('alex@example.com', 'existing-link', '2026-11-01');`);
    migrateHackers(db);
    migrateHackers(db);
    deepStrictEqual(
      { ...db.prepare("SELECT * FROM hackers").get() },
      {
        email: "alex@example.com",
        name: "Alex",
        registered_at: null,
      },
    );
    strictEqual(db.prepare("SELECT token_hash FROM voters").get()?.token_hash, "existing-link");
    deepStrictEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
  } finally {
    db.close();
  }
});

void test("sync saves Sheet timestamps, updates existing hackers, and rejects incomplete rows atomically", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(schema);
    db.exec("INSERT INTO hackers (email, name) VALUES ('alex@example.com', 'Old Name')");
    const header = ["Timestamp", "Email Address", "Full Name"];
    const rows = [header, ["10/4/2026 16:30:55", "Alex@Example.com", "Alex"]];
    deepStrictEqual(syncHackers(db, rows), { synced: 1 });
    deepStrictEqual(syncHackers(db, rows), { synced: 1 });
    deepStrictEqual(
      { ...db.prepare("SELECT * FROM hackers").get() },
      {
        email: "alex@example.com",
        name: "Alex",
        registered_at: "10/4/2026 16:30:55",
      },
    );
    throws(() => syncHackers(db, [header, rows[1], ["", "sam@example.com", "Sam"]]), /timestamp/u);
    strictEqual(db.prepare("SELECT COUNT(*) AS count FROM hackers").get()?.count, 1);
    throws(() => syncHackers(db, [["Email Address", "Full Name"]]), /Timestamp/u);
  } finally {
    db.close();
  }
});
