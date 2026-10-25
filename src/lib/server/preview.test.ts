import { test } from "node:test";
import { isPreview } from "./preview.ts";

void test("demo seeding is restricted to this project's HTTPS PR deployments", () => {
  if (!isPreview("https://nova-crowd-favorite-pr-7.scottylabs.net")) {
    throw new Error("PR preview should allow demo data");
  }
  for (const url of [
    undefined,
    "",
    "invalid",
    "https://nova-crowd-favorite.scottylabs.net",
    "http://nova-crowd-favorite-pr-7.scottylabs.net",
    "https://other-pr-7.scottylabs.net",
    "https://nova-crowd-favorite-pr-7.scottylabs.net.example.com",
  ]) {
    if (isPreview(url)) throw new Error(`Unexpected demo access for ${url}`);
  }
});
