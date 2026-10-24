import { strictEqual } from "node:assert";
import { test } from "node:test";
import { codeFromRequest, hashCode } from "./voter-code.ts";

function withAuth(value: string | null): Request {
  const headers = new Headers();
  if (value !== null) headers.set("authorization", value);
  return new Request("http://localhost/api/ballot", { headers });
}

void test("hashCode matches the standard SHA-256 hex", async () => {
  // Known value: sha256("abc")
  strictEqual(
    await hashCode("abc"),
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  );
});

void test("codeFromRequest reads a Bearer code", () => {
  strictEqual(codeFromRequest(withAuth("Bearer 7KQ-P2X_abc")), "7KQ-P2X_abc");
});

void test("codeFromRequest rejects missing or malformed headers", () => {
  strictEqual(codeFromRequest(withAuth(null)), null);
  strictEqual(codeFromRequest(withAuth("7KQ-P2X")), null);
  strictEqual(codeFromRequest(withAuth("Bearer bad code")), null);
  strictEqual(codeFromRequest(withAuth("Bearer a/b")), null);
});
