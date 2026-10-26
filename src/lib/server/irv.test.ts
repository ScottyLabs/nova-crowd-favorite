import { deepStrictEqual, strictEqual } from "node:assert";
import { test } from "node:test";
import { tallyIrv } from "./irv.ts";

function copies(count: number, ranked: string[]): string[][] {
  return Array.from({ length: count }, () => [...ranked]);
}

void test("an immediate strict majority wins without eliminating any team", () => {
  deepStrictEqual(tallyIrv([["a"], ["a", "b"], ["b"]]), {
    status: "winner",
    winnerId: "a",
    tiedTeamIds: [],
    rounds: [
      {
        number: 1,
        counts: [
          { teamId: "a", votes: 2 },
          { teamId: "b", votes: 1 },
        ],
        continuingBallots: 3,
        exhaustedBallots: 0,
        eliminatedTeamId: null,
      },
    ],
  });
});

void test("elimination transfers votes to the next remaining preference", () => {
  const ballots = [...copies(4, ["a"]), ...copies(3, ["b"]), ...copies(2, ["c", "b"])];
  const original = structuredClone(ballots);
  const result = tallyIrv(ballots);
  strictEqual(result.status, "winner");
  strictEqual(result.winnerId, "b");
  deepStrictEqual(
    result.rounds.map((round) => round.eliminatedTeamId),
    ["c", null],
  );
  deepStrictEqual(result.rounds[0].counts, [
    { teamId: "a", votes: 4 },
    { teamId: "b", votes: 3 },
    { teamId: "c", votes: 2 },
  ]);
  deepStrictEqual(result.rounds[1].counts, [
    { teamId: "a", votes: 4 },
    { teamId: "b", votes: 5 },
  ]);
  deepStrictEqual(ballots, original);
  deepStrictEqual(tallyIrv(ballots.toReversed()), result);
});

void test("exhausted ballots leave the majority denominator", () => {
  const result = tallyIrv([...copies(4, ["a"]), ...copies(3, ["b"]), ["c"], []]);
  strictEqual(result.winnerId, "a");
  deepStrictEqual(
    result.rounds.map((round) => [round.continuingBallots, round.exhaustedBallots]),
    [
      [8, 1],
      [7, 2],
    ],
  );
  strictEqual(result.rounds[0].eliminatedTeamId, "c");
});

void test("half the continuing votes is not a majority and a lowest-place tie is reported", () => {
  const result = tallyIrv([...copies(2, ["a"]), ["b"], ["c"]]);
  strictEqual(result.status, "elimination-tie");
  strictEqual(result.winnerId, null);
  deepStrictEqual(result.tiedTeamIds, ["b", "c"]);
  strictEqual(result.rounds.length, 1);
  strictEqual(result.rounds[0].eliminatedTeamId, null);
});

void test("final equal counts and tied zero-vote candidates are never broken arbitrarily", () => {
  const finalTie = tallyIrv([
    ["b", "a"],
    ["a", "b"],
  ]);
  strictEqual(finalTie.status, "elimination-tie");
  deepStrictEqual(finalTie.tiedTeamIds, ["a", "b"]);
  const zeroTie = tallyIrv([
    ["a", "c"],
    ["b", "d"],
  ]);
  strictEqual(zeroTie.status, "elimination-tie");
  deepStrictEqual(zeroTie.tiedTeamIds, ["c", "d"]);
});

void test("no eligible preferences produces no winner, including fully exhausted ballots", () => {
  const expected = { status: "no-votes", winnerId: null, tiedTeamIds: [], rounds: [] };
  deepStrictEqual(tallyIrv([]), expected);
  deepStrictEqual(tallyIrv([[], []]), expected);
});

void test("a single remaining candidate wins and each ballot counts only once", () => {
  const result = tallyIrv([["a", "a"], ["a"], []]);
  strictEqual(result.winnerId, "a");
  deepStrictEqual(result.rounds[0].counts, [{ teamId: "a", votes: 2 }]);
  strictEqual(result.rounds[0].exhaustedBallots, 1);
});

void test("successive rounds skip every eliminated preference", () => {
  const ballots = [
    ...copies(5, ["a"]),
    ...copies(4, ["b"]),
    ...copies(2, ["c", "b"]),
    ["d", "c", "b"],
  ];
  const result = tallyIrv(ballots);
  strictEqual(result.winnerId, "b");
  deepStrictEqual(
    result.rounds.map((round) => round.eliminatedTeamId),
    ["d", "c", null],
  );
  deepStrictEqual(result.rounds[2].counts, [
    { teamId: "a", votes: 5 },
    { teamId: "b", votes: 7 },
  ]);
});
