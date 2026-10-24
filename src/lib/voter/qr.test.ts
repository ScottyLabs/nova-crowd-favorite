import { strictEqual as assertEquals } from "node:assert";
import { test } from "node:test";
import { teamCodeFromQr } from "./qr.ts";

void test("reads the code from a team sticker link", () => {
  assertEquals(teamCodeFromQr("https://nova.example.org/t/abc123"), "abc123");
  assertEquals(teamCodeFromQr("http://192.168.1.23:5173/t/qr-dev-t3/"), "qr-dev-t3");
  assertEquals(teamCodeFromQr("  https://nova.example.org/t/a%2Db  "), "a-b");
});

void test("ignores QR codes that are not team stickers", () => {
  assertEquals(teamCodeFromQr("abc123"), null);
  assertEquals(teamCodeFromQr("https://nova.example.org/"), null);
  assertEquals(teamCodeFromQr("https://nova.example.org/t/"), null);
  assertEquals(teamCodeFromQr("https://nova.example.org/t/a/b"), null);
  assertEquals(teamCodeFromQr("https://nova.example.org/v/voter-code"), null);
  assertEquals(teamCodeFromQr("javascript:alert(1)"), null);
  assertEquals(teamCodeFromQr("https://nova.example.org/t/%E0%A4%A"), null);
});
