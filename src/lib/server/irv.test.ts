import { deepStrictEqual, strictEqual } from "node:assert";
import { test } from "node:test";
import { tallyIrv } from "./irv.ts";

function copies(count: number, ranked: string[]): string[][] {
  return Array.from({ length: count }, () => [...ranked]);
}

void test("a strict majority selects first place, then a fresh election selects second", () => {
  const result = tallyIrv([["a"], ["a", "b"], ["b"]]);
  strictEqual(result.status, "winner");
  strictEqual(result.winnerId, "a");
  deepStrictEqual(result.ranking, [
    { rank: 1, teamId: "a" },
    { rank: 2, teamId: "b" },
  ]);
  deepStrictEqual(result.unrankedTeamIds, []);
  deepStrictEqual(
    result.elections.map((election) => election.rounds.length),
    [1, 1],
  );
  deepStrictEqual(result.elections[1].rounds[0].counts, [{ teamId: "b", votes: 2 }]);
  strictEqual(result.elections[1].rounds[0].exhaustedBallots, 1);
});

void test("elimination transfers votes and eliminated teams return for later places", () => {
  const ballots = [...copies(4, ["a"]), ...copies(3, ["b"]), ...copies(2, ["c", "b"])];
  const original = structuredClone(ballots);
  const result = tallyIrv(ballots);
  strictEqual(result.winnerId, "b");
  deepStrictEqual(result.ranking, [
    { rank: 1, teamId: "b" },
    { rank: 2, teamId: "a" },
    { rank: 3, teamId: "c" },
  ]);
  deepStrictEqual(
    result.elections[0].rounds.map((round) => round.eliminatedTeamId),
    ["c", null],
  );
  deepStrictEqual(result.elections[0].rounds[1].counts, [
    { teamId: "a", votes: 4 },
    { teamId: "b", votes: 5 },
  ]);
  deepStrictEqual(result.elections[1].rounds[0].counts, [
    { teamId: "a", votes: 4 },
    { teamId: "c", votes: 2 },
  ]);
  deepStrictEqual(ballots, original);
  deepStrictEqual(tallyIrv(ballots.toReversed()), result);
});

void test("exhausted ballots leave the majority denominator", () => {
  const result = tallyIrv([...copies(4, ["a"]), ...copies(3, ["b"]), ["c"], []]);
  strictEqual(result.winnerId, "a");
  deepStrictEqual(
    result.elections[0].rounds.map((round) => [round.continuingBallots, round.exhaustedBallots]),
    [
      [8, 1],
      [7, 2],
    ],
  );
  strictEqual(result.elections[0].rounds[0].eliminatedTeamId, "c");
});

void test("half the continuing votes is not a majority and ties do not invent a ranking", () => {
  const result = tallyIrv([...copies(2, ["a"]), ["b"], ["c"]]);
  strictEqual(result.status, "elimination-tie");
  strictEqual(result.winnerId, null);
  deepStrictEqual(result.ranking, []);
  deepStrictEqual(result.tiedTeamIds, ["b", "c"]);
  deepStrictEqual(result.unrankedTeamIds, ["a", "b", "c"]);
  strictEqual(result.elections[0].rounds[0].eliminatedTeamId, null);
});

void test("final equal counts and tied zero-vote candidates are not broken arbitrarily", () => {
  deepStrictEqual(
    tallyIrv([
      ["b", "a"],
      ["a", "b"],
    ]).tiedTeamIds,
    ["a", "b"],
  );
  deepStrictEqual(
    tallyIrv([
      ["a", "c"],
      ["b", "d"],
    ]).tiedTeamIds,
    ["c", "d"],
  );
});

void test("no eligible preferences produces an empty ranking", () => {
  const expected = {
    status: "no-votes",
    winnerId: null,
    tiedTeamIds: [],
    ranking: [],
    unrankedTeamIds: [],
    elections: [],
  };
  deepStrictEqual(tallyIrv([]), expected);
  deepStrictEqual(tallyIrv([[], []]), expected);
});

void test("a single candidate wins and each ballot counts only once", () => {
  const result = tallyIrv([["a", "a"], ["a"], []]);
  strictEqual(result.winnerId, "a");
  deepStrictEqual(result.ranking, [{ rank: 1, teamId: "a" }]);
  deepStrictEqual(result.elections[0].rounds[0].counts, [{ teamId: "a", votes: 2 }]);
  strictEqual(result.elections[0].rounds[0].exhaustedBallots, 1);
});

void test("successive rounds skip every eliminated preference within an election", () => {
  const result = tallyIrv([
    ...copies(5, ["a"]),
    ...copies(4, ["b"]),
    ...copies(2, ["c", "b"]),
    ["d", "c", "b"],
  ]);
  strictEqual(result.winnerId, "b");
  deepStrictEqual(
    result.elections[0].rounds.map((round) => round.eliminatedTeamId),
    ["d", "c", null],
  );
  deepStrictEqual(result.elections[0].rounds[2].counts, [
    { teamId: "a", votes: 5 },
    { teamId: "b", votes: 7 },
  ]);
});

void test("each place is selected by IRV rather than reversing the first elimination order", () => {
  const result = tallyIrv([
    ...copies(6, ["a", "c", "b"]),
    ...copies(3, ["b", "c", "a"]),
    ...copies(2, ["c", "b", "a"]),
  ]);
  deepStrictEqual(result.ranking, [
    { rank: 1, teamId: "a" },
    { rank: 2, teamId: "c" },
    { rank: 3, teamId: "b" },
  ]);
  deepStrictEqual(
    result.elections.map((election) => election.winnerId),
    ["a", "c", "b"],
  );
  deepStrictEqual(result.elections[1].rounds[0].counts, [
    { teamId: "b", votes: 3 },
    { teamId: "c", votes: 8 },
  ]);
});

void test("a tie for a later place preserves earlier winners and stops there", () => {
  const result = tallyIrv([...copies(5, ["a"]), ...copies(2, ["b"]), ...copies(2, ["c"]), ["d"]]);
  strictEqual(result.status, "elimination-tie");
  strictEqual(result.winnerId, "a");
  deepStrictEqual(result.ranking, [{ rank: 1, teamId: "a" }]);
  deepStrictEqual(result.tiedTeamIds, ["b", "c"]);
  deepStrictEqual(result.unrankedTeamIds, ["b", "c", "d"]);
  strictEqual(result.elections[1].rank, 2);
  deepStrictEqual(
    result.elections[1].rounds.map((round) => round.eliminatedTeamId),
    ["d", null],
  );
});
