import { test } from "node:test";
import { strictEqual, notStrictEqual } from "node:assert";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { dashboardRecords, ensureVoterLinks } from "./dashboard.ts";
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
