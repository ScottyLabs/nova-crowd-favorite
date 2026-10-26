import { deepStrictEqual, match, ok, strictEqual } from "node:assert";
import { execFile, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { verifySignature } from "./hmac.ts";

void test("organizer command refuses a missing target before making any request", () => {
  const env: typeof process.env = { ...process.env, SYNC_HMAC_SECRET: "test-only-secret" };
  delete env.APP_URL;
  const script = fileURLToPath(new URL("../../../scripts/organizer.ts", import.meta.url));
  const args = ["run", "--allow-env=APP_URL,SYNC_HMAC_SECRET", script, "open"];
  // No network permission: this must fail on configuration, not on a request.
  for (const environment of [env, { ...env, APP_URL: "" }]) {
    const result = spawnSync(process.execPath, args, { env: environment, encoding: "utf8" });
    strictEqual(result.status, 1);
    match(result.stderr, /Set APP_URL to the deployment you want to update/u);
  }
});

function signingTestServer(secret: string) {
  const server = createServer((request, response) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk: string) => {
      body += chunk;
    });
    request.on("end", () => {
      void verifySignature(
        body,
        String(request.headers["x-timestamp"]),
        String(request.headers["x-signature"]),
        secret,
      )
        .then((valid) => {
          response.setHeader("content-type", "application/json");
          response.end(JSON.stringify({ method: request.method, path: request.url, body, valid }));
        })
        .catch((error: Error) => {
          response.destroy(error);
        });
    });
  });
  return server;
}

function runCommand(
  command: string,
  port: number,
  secret: string,
  args: string[] = [],
): Promise<string> {
  const script = fileURLToPath(new URL("../../../scripts/organizer.ts", import.meta.url));
  return new Promise<string>((resolve, reject) => {
    execFile(
      process.execPath,
      [
        "run",
        "--allow-env=APP_URL,SYNC_HMAC_SECRET",
        "--allow-net=127.0.0.1",
        script,
        command,
        ...args,
      ],
      {
        env: {
          ...process.env,
          APP_URL: `http://127.0.0.1:${port}`,
          SYNC_HMAC_SECRET: secret,
        },
      },
      (error, output) => {
        if (error instanceof Error) reject(error);
        else resolve(output);
      },
    );
  });
}

void test("list commands send signed GET requests without bodies", async () => {
  const secret = "test-only-secret";
  const server = signingTestServer(secret);
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  ok(address !== null && typeof address === "object");
  try {
    await Promise.all(
      ["voters", "teams", "ballots"].map(async (resource) => {
        const stdout = await runCommand(`list-${resource}`, address.port, secret);
        deepStrictEqual(JSON.parse(stdout), {
          method: "GET",
          path: `/api/organizer/${resource}`,
          body: "",
          valid: true,
        });
      }),
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

const recoveryCases = [
  {
    command: "reissue",
    args: ["person@example.com"],
    method: "POST",
    path: "/api/organizer/voters/reissue",
    body: { email: "person@example.com" },
  },
  {
    command: "reset-ballot",
    args: ["person@example.com"],
    method: "DELETE",
    path: "/api/organizer/ballots",
    body: { email: "person@example.com" },
  },
  {
    command: "unlink-qr",
    args: ["sticker"],
    method: "POST",
    path: "/api/organizer/qr-codes/unlink",
    body: { code: "sticker" },
  },
  {
    command: "disqualify",
    args: ["t1", "Rule violation"],
    method: "PUT",
    path: "/api/organizer/teams/disqualification",
    body: { teamId: "t1", disqualified: true, reason: "Rule violation" },
  },
  {
    command: "reinstate",
    args: ["t1"],
    method: "PUT",
    path: "/api/organizer/teams/disqualification",
    body: { teamId: "t1", disqualified: false },
  },
];

void test("recovery CLI signs each target and payload, including DELETE bodies", async () => {
  const secret = "test-only-secret";
  const server = signingTestServer(secret);
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  ok(address !== null && typeof address === "object");
  try {
    await Promise.all(
      recoveryCases.map(async ({ command, args, method, path, body }) => {
        const output = await runCommand(command, address.port, secret, args);
        deepStrictEqual(JSON.parse(output), {
          method,
          path,
          body: JSON.stringify(body),
          valid: true,
        });
      }),
    );
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }
});
