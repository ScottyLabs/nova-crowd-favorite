import { deepStrictEqual, ok, strictEqual } from "node:assert";
import { Buffer } from "node:buffer";
import { execFile } from "node:child_process";
import { createServer } from "node:http";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { verifySignature } from "./hmac.ts";

const secret = "export-cli-test-secret";
const files: Record<string, Buffer> = {
  "/api/organizer/export/ballots": Buffer.from(
    'voter_email,status\r\n"tést@example.com","draft"\r\n',
  ),
  "/api/organizer/export/database": Buffer.from(Array.from({ length: 262144 }, (_, i) => i % 256)),
};

function exportServer() {
  return createServer((request, response) => {
    const file = request.url === undefined ? undefined : files[request.url];
    if (file === undefined) {
      response.writeHead(404);
      response.end();
      return;
    }
    void verifySignature(
      "",
      String(request.headers["x-timestamp"]),
      String(request.headers["x-signature"]),
      secret,
    )
      .then((valid) => {
        if (!valid || request.method !== "GET") {
          response.writeHead(401, { "content-type": "application/json" });
          response.end(JSON.stringify({ error: "invalid request" }));
          return;
        }
        response.end(file);
      })
      .catch((error: Error) => {
        response.destroy(error);
      });
  });
}

function download(
  command: string,
  port: number,
  key = secret,
): Promise<{ error: Error | null; stdout: Buffer }> {
  const script = fileURLToPath(new URL("../../../scripts/organizer.ts", import.meta.url));
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      [
        "run",
        "--no-prompt",
        "--allow-env=APP_URL,SYNC_HMAC_SECRET",
        "--allow-net=127.0.0.1",
        script,
        command,
      ],
      {
        encoding: "buffer",
        env: {
          ...process.env,
          APP_URL: `http://127.0.0.1:${port}`,
          SYNC_HMAC_SECRET: key,
        },
      },
      (error, stdout) => {
        resolve({ error, stdout });
      },
    );
  });
}

void test("export CLI writes exact CSV and binary bytes to stdout and rejects failed requests", async () => {
  const server = exportServer();
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  ok(address !== null && typeof address === "object");
  try {
    const [csv, database] = await Promise.all([
      download("export-csv", address.port),
      download("export-db", address.port),
    ]);
    strictEqual(csv.error, null);
    strictEqual(database.error, null);
    deepStrictEqual(csv.stdout, files["/api/organizer/export/ballots"]);
    deepStrictEqual(database.stdout, files["/api/organizer/export/database"]);
    const failed = await download("export-db", address.port, "wrong-secret");
    ok(failed.error instanceof Error);
    deepStrictEqual(failed.stdout, Buffer.alloc(0));
    ok(failed.error.message.includes("HTTP 401"));
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }
});
