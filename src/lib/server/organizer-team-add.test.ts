import { deepStrictEqual, strictEqual } from "node:assert";
import { createHmac, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { addOrganizerTeam } from "./organizer-team-add.ts";

const secret = randomBytes(32).toString("hex");
function signed(value: unknown): Request {
  const body = JSON.stringify(value);
  const timestamp = String(Date.now());
  return new Request("https://example.com/api/organizer/teams", {
    method: "POST",
    body,
    headers: {
      "x-timestamp": timestamp,
      "x-signature": createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex"),
    },
  });
}

void test("organizer can add submitted teams without replacing existing teams or credentials", async () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(readFileSync(new URL("./schema.sql", import.meta.url), "utf8"));
    db.exec(`PRAGMA foreign_keys = ON;
      INSERT INTO teams (id, response_id, name, members, updated_at) VALUES ('old', 'r', 'Existing team', 'Cole', 'now');
      INSERT INTO hackers VALUES ('cole@example.com', 'Saved name', 'checked-in');
      INSERT INTO voters VALUES ('cole@example.com', 'saved-hash', 'now');`);
    const team = {
      name: " casa bonita ",
      members: [{ name: "Cole Huang", email: " COLE@example.com " }],
    };
    strictEqual(
      (await addOrganizerTeam(db, new Request("https://example.com"), secret)).status,
      401,
    );
    strictEqual((await addOrganizerTeam(db, signed(team), secret)).status, 201);
    strictEqual(db.prepare("SELECT count(*) AS n FROM teams").get()?.n, 2);
    strictEqual(db.prepare("SELECT active FROM teams WHERE name = 'casa bonita'").get()?.active, 1);
    strictEqual(db.prepare("SELECT email FROM team_members").get()?.email, "cole@example.com");
    strictEqual(db.prepare("SELECT token_hash FROM voters").get()?.token_hash, "saved-hash");
    strictEqual(db.prepare("SELECT name FROM hackers").get()?.name, "Saved name");
    strictEqual((await addOrganizerTeam(db, signed(team), secret)).status, 409);
    strictEqual(db.prepare("SELECT count(*) AS n FROM teams").get()?.n, 2);
    deepStrictEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
  } finally {
    db.close();
  }
});

void test("invalid teams are rejected without partial records", async () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(readFileSync(new URL("./schema.sql", import.meta.url), "utf8"));
    const invalid = [
      { name: "", members: [] },
      { name: "Team", members: [{ name: "Cole", email: "bad" }] },
      {
        name: "Team",
        members: [
          { name: "Cole", email: "a@example.com" },
          { name: "Other", email: "A@example.com" },
        ],
      },
    ];
    const responses = await Promise.all(
      invalid.map((team) => addOrganizerTeam(db, signed(team), secret)),
    );
    for (const response of responses) strictEqual(response.status, 400);
    strictEqual(db.prepare("SELECT count(*) AS n FROM teams").get()?.n, 0);
    strictEqual(db.prepare("SELECT count(*) AS n FROM hackers").get()?.n, 0);
  } finally {
    db.close();
  }
});
