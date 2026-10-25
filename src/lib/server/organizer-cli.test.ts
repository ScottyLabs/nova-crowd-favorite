import { match, strictEqual } from "node:assert";
import { spawnSync } from "node:child_process";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

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
