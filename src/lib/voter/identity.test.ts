import { strictEqual } from "node:assert";
import { test } from "node:test";
import { isValidCode } from "./identity.ts";

void test("accepts normal voting codes", () => {
  strictEqual(isValidCode("7KQ-P2X"), true);
  strictEqual(isValidCode("a1b2c3d4e5f6"), true);
  strictEqual(isValidCode("abc_DEF-123"), true);
});

void test("rejects broken or suspicious codes", () => {
  strictEqual(isValidCode(""), false);
  strictEqual(isValidCode("abc"), false);
  strictEqual(isValidCode("has space"), false);
  strictEqual(isValidCode("slash/inside"), false);
  strictEqual(isValidCode("x".repeat(129)), false);
});
