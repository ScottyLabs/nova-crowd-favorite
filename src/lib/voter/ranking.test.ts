import { deepStrictEqual as assertEquals } from "node:assert";
import { test } from "node:test";
import { insertAtRank, moveItem, rankOf, unrank } from "./ranking.ts";

void test("insert into an empty spot appends", () => {
  assertEquals(insertAtRank(["a", "b"], "c", 3), { ranked: ["a", "b", "c"], bumped: null });
});

void test("insert into a taken spot pushes the others down", () => {
  assertEquals(insertAtRank(["a", "b", "c"], "d", 1), {
    ranked: ["d", "a", "b", "c"],
    bumped: null,
  });
});

void test("insert into a full list bumps the last team", () => {
  assertEquals(insertAtRank(["a", "b", "c", "d", "e"], "f", 2), {
    ranked: ["a", "f", "b", "c", "d"],
    bumped: "e",
  });
});

void test("re-ranking a team already in the list moves it", () => {
  assertEquals(insertAtRank(["a", "b", "c"], "c", 1), { ranked: ["c", "a", "b"], bumped: null });
});

void test("rank past the end lands at the end", () => {
  assertEquals(insertAtRank(["a"], "b", 5).ranked, ["a", "b"]);
});

void test("moveItem and unrank", () => {
  assertEquals(moveItem(["a", "b", "c"], 2, 0), ["c", "a", "b"]);
  assertEquals(unrank(["a", "b", "c"], "b"), ["a", "c"]);
  assertEquals(rankOf(["a", "b"], "b"), 2);
  assertEquals(rankOf(["a", "b"], "z"), null);
});
