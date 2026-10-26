import { deepStrictEqual, match, ok, strictEqual } from "node:assert";
import { createHmac } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { exportOrganizerData } from "./organizer-export.ts";

const secret = "export-test-secret";

function signed(timestamp = String(Date.now()), body = ""): Request {
  return new Request("https://example.com", {
    headers: {
      "x-timestamp": timestamp,
      "x-signature": createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex"),
    },
  });
}

function database(path = ":memory:"): DatabaseSync {
  const db = new DatabaseSync(path);
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(readFileSync(new URL("./schema.sql", import.meta.url), "utf8"));
  return db;
}

function seed(db: DatabaseSync): void {
  db.exec(`
    INSERT INTO voters VALUES ('v@example.com', 'private-hash', '2026-01-01');
    INSERT INTO voters VALUES ('draft@example.com', NULL, '2026-01-01');
    INSERT INTO voters VALUES ('unsaved@example.com', NULL, '2026-01-01');
    INSERT INTO teams (id, response_id, name, members, active, updated_at) VALUES
      ('t1', 'r1', 'Team one', 'Member', 1, '2026-01-01'),
      ('t2', 'r2', 'Inactive team', 'Member', 0, '2026-01-01');
    INSERT INTO team_members VALUES ('t1', 'v@example.com');
    INSERT INTO qr_codes VALUES ('sticker', 't1', 'v@example.com', '2026-01-01');
    INSERT INTO collections VALUES ('v@example.com', 't2', 'Private note', '2026-01-01');
    INSERT INTO ballots (voter_email, rank_1, rank_2, status, submitted_at) VALUES
      ('v@example.com', 't2', 't1', 'submitted', '2026-01-02'),
      ('draft@example.com', 't1', NULL, 'draft', '2026-01-01');
    INSERT INTO team_disqualifications VALUES ('t2', 'Rule violation');
    INSERT INTO settings VALUES ('voting_closes_at', '2026-12-01T00:00:00Z');
  `);
}

void test("exports reject unsigned, expired, incorrect and missing-secret requests", async () => {
  const db = database();
  // Rejected requests must not access the database or create snapshots.
  db.close();
  await Promise.all(
    (["ballots", "database"] as const).map(async (format) => {
      const requests = [
        new Request("https://example.com"),
        signed("0"),
        signed(undefined, "wrong"),
      ];
      const responses = await Promise.all(
        requests.map((request) => exportOrganizerData(db, request, secret, format)),
      );
      responses.push(await exportOrganizerData(db, signed(), "", format));
      for (const response of responses) {
        strictEqual(response.status, 401);
        strictEqual(response.headers.get("cache-control"), "no-store");
      }
    }),
  );
});

void test("CSV exports all saved ballots in stable order with rank metadata and no credentials", async () => {
  const db = database();
  try {
    seed(db);
    const response = await exportOrganizerData(db, signed(), secret, "ballots");
    strictEqual(response.status, 200);
    strictEqual(response.headers.get("content-type"), "text/csv; charset=utf-8");
    strictEqual(response.headers.get("cache-control"), "no-store");
    strictEqual(response.headers.get("content-disposition"), 'attachment; filename="ballots.csv"');
    const csv = await response.text();
    const lines = csv.trimEnd().split("\r\n");
    strictEqual(lines.length, 3);
    match(lines[1], /^"draft@example.com","draft","2026-01-01","t1","Team one","true","false"/u);
    match(
      lines[2],
      /^"v@example.com","submitted","2026-01-02","t2","Inactive team","false","true","t1","Team one","true","false"/u,
    );
    ok(lines[2].endsWith(',"","","","","","","","","","","",""'));
    ok(!csv.includes("private-hash"));
    ok(!csv.includes("Private note"));
    ok(!csv.includes("unsaved@example.com"));
  } finally {
    db.close();
  }
});

void test("CSV quotes commas, quotes and newlines and neutralizes spreadsheet formulas", async () => {
  const db = database();
  try {
    seed(db);
    db.prepare("UPDATE teams SET name = ? WHERE id = 't1'").run('A, "quoted"\nteam');
    db.prepare("UPDATE teams SET name = ? WHERE id = 't2'").run(' =HYPERLINK("url")');
    const response = await exportOrganizerData(db, signed(), secret, "ballots");
    const csv = await response.text();
    ok(csv.includes('"A, ""quoted""\nteam"'));
    ok(csv.includes('"\' =HYPERLINK(""url"")"'));
  } finally {
    db.close();
  }
});

void test("empty CSV has a header and no data rows", async () => {
  const db = database();
  try {
    const response = await exportOrganizerData(db, signed(), secret, "ballots");
    const csv = await response.text();
    strictEqual(csv.split("\r\n").length, 2);
    match(csv, /^voter_email,status,updated_at,rank_1_team_id,/u);
    ok(csv.endsWith("rank_5_team_disqualified\r\n"));
  } finally {
    db.close();
  }
});

void test("database export restores all tables including committed WAL data", async () => {
  const directory = mkdtempSync(join(tmpdir(), "nova-export-test-"));
  const sourcePath = join(directory, "source.db");
  const db = database(sourcePath);
  try {
    db.exec("PRAGMA journal_mode = WAL; PRAGMA wal_autocheckpoint = 0");
    seed(db);
    ok(statSync(`${sourcePath}-wal`).size > 0);
    const response = await exportOrganizerData(db, signed(), secret, "database");
    strictEqual(response.status, 200);
    strictEqual(response.headers.get("cache-control"), "no-store");
    strictEqual(response.headers.get("content-type"), "application/vnd.sqlite3");
    strictEqual(response.headers.get("content-disposition"), 'attachment; filename="nova.db"');
    const restoredPath = join(directory, "restored.db");
    writeFileSync(restoredPath, new Uint8Array(await response.arrayBuffer()));
    const restored = new DatabaseSync(restoredPath);
    try {
      strictEqual(restored.prepare("PRAGMA integrity_check").get()?.integrity_check, "ok");
      deepStrictEqual(restored.prepare("PRAGMA foreign_key_check").all(), []);
      const tables = [
        "voters",
        "teams",
        "team_members",
        "qr_codes",
        "collections",
        "ballots",
        "settings",
        "team_disqualifications",
        "ballot_resets",
      ];
      for (const table of tables) {
        deepStrictEqual(
          restored.prepare(`SELECT * FROM ${table} ORDER BY 1`).all(),
          db.prepare(`SELECT * FROM ${table} ORDER BY 1`).all(),
        );
      }
    } finally {
      restored.close();
    }
  } finally {
    db.close();
    rmSync(directory, { recursive: true });
  }
});
