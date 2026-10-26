import { strictEqual } from "node:assert";
import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { createServer } from "node:http";
import process from "node:process";
import { test } from "node:test";

function run(args: string[], env: typeof process.env): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(process.execPath, args, { env }, (error, stdout) => {
      if (error instanceof Error) reject(error);
      else resolve(stdout);
    });
  });
}

const sampleResult = {
  generatedAt: "2026-10-26T00:00:00Z",
  provisional: false,
  submittedBallots: 7,
  ranking: [
    { rank: 1, teamId: "a", name: "Team Aurora" },
    { rank: 1, teamId: "b", name: "Team Beacon" },
    { rank: 3, teamId: "c", name: "Team Comet" },
  ],
};

void test("tally CLI prints shared places, provisional and empty results, and preserves raw JSON", async () => {
  let result = structuredClone(sampleResult);
  const server = createServer((request, response) => {
    strictEqual(request.method, "GET");
    strictEqual(request.url, "/api/organizer/tally");
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify(result));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("Expected local TCP server");
  const env = {
    ...process.env,
    APP_URL: `http://127.0.0.1:${address.port}`,
    SYNC_HMAC_SECRET: randomBytes(32).toString("hex"),
  };
  const tally = (...args: string[]) => run(["task", "organizer", "tally", ...args], env);
  try {
    strictEqual(
      await tally(),
      "Final results · 7 submitted ballots\n\nRank  Team\n1     Team Aurora\n1     Team Beacon\n3     Team Comet\n\nShared rank 1: Team Aurora, Team Beacon\n",
    );
    strictEqual(await tally("--json"), `${JSON.stringify(result, null, 2)}\n`);
    result.provisional = true;
    strictEqual(
      await tally(),
      "Provisional results · 7 submitted ballots\n\nRank  Team\n1     Team Aurora\n1     Team Beacon\n3     Team Comet\n\nShared rank 1: Team Aurora, Team Beacon\n\nVoting is still open. Results may change.\n",
    );
    result = {
      ...result,
      provisional: false,
      submittedBallots: 0,
      ranking: [],
    };
    strictEqual(
      await tally(),
      "Final results · 0 submitted ballots\n\nNo submitted ballots have eligible ranked teams.\n",
    );
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error instanceof Error) reject(error);
        else resolve();
      });
    });
  }
});
