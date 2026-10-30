import { deepStrictEqual, strictEqual, throws } from "node:assert";
import { test } from "node:test";
import { IrvLimitError, tallyIrv } from "./irv.ts";

function copies(count: number, ranked: string[]): string[][] {
  return Array.from({ length: count }, () => [...ranked]);
}

function ranking(entries: [number, string][]) {
  return entries.map(([rank, teamId]) => ({ rank, teamId }));
}

void test("a strict majority selects first place, then a fresh election selects second", () => {
  const result = tallyIrv([["a"], ["a", "b"], ["b"]]);
  strictEqual(result.winnerId, "a");
  deepStrictEqual(
    result.ranking,
    ranking([
      [1, "a"],
      [2, "b"],
    ]),
  );
});

void test("elimination transfers votes and eliminated teams return for later places", () => {
  const result = tallyIrv([...copies(4, ["a"]), ...copies(3, ["b"]), ...copies(2, ["c", "b"])]);
  deepStrictEqual(
    result.ranking,
    ranking([
      [1, "b"],
      [2, "a"],
      [3, "c"],
    ]),
  );
});

void test("exhausted ballots leave the majority denominator", () => {
  const result = tallyIrv([...copies(4, ["a"]), ...copies(3, ["b"]), ["c"], []]);
  deepStrictEqual(
    result.ranking,
    ranking([
      [1, "a"],
      [2, "b"],
      [3, "c"],
    ]),
  );
});

void test("tied-lowest candidates transfer to the same winner instead of taking first place", () => {
  const result = tallyIrv([...copies(2, ["a"]), ["b", "a"], ["c", "a"]]);
  strictEqual(result.winnerId, "a");
  deepStrictEqual(
    result.ranking,
    ranking([
      [1, "a"],
      [2, "b"],
      [2, "c"],
    ]),
  );
});

void test("unsafe simultaneous elimination must consider every tied-lowest elimination", () => {
  const result = tallyIrv([...copies(2, ["a"]), ["b", "c"], ["c", "b"]]);
  strictEqual(result.winnerId, null);
  deepStrictEqual(result.tiedTeamIds, ["a", "b", "c"]);
  deepStrictEqual(
    result.ranking,
    ranking([
      [1, "a"],
      [1, "b"],
      [1, "c"],
    ]),
  );
});

void test("a genuine final tie shares first place", () => {
  const result = tallyIrv([
    ["b", "a"],
    ["a", "b"],
  ]);
  deepStrictEqual(
    result.ranking,
    ranking([
      [1, "a"],
      [1, "b"],
    ]),
  );
});

void test("zero-vote teams cannot win first but remain eligible in the next election", () => {
  const result = tallyIrv([
    ["a", "c"],
    ["b", "d"],
  ]);
  deepStrictEqual(
    result.ranking,
    ranking([
      [1, "a"],
      [1, "b"],
      [3, "c"],
      [3, "d"],
    ]),
  );
});

void test("each place reruns IRV rather than reversing the first elimination order", () => {
  const result = tallyIrv([
    ...copies(6, ["a", "c", "b"]),
    ...copies(3, ["b", "c", "a"]),
    ...copies(2, ["c", "b", "a"]),
  ]);
  deepStrictEqual(
    result.ranking,
    ranking([
      [1, "a"],
      [2, "c"],
      [3, "b"],
    ]),
  );
});

void test("a later tie removes the entire winning group before the next election", () => {
  const result = tallyIrv([...copies(5, ["a"]), ...copies(2, ["b"]), ...copies(2, ["c"]), ["d"]]);
  deepStrictEqual(
    result.ranking,
    ranking([
      [1, "a"],
      [2, "b"],
      [2, "c"],
      [4, "d"],
    ]),
  );
});

void test("the saved seven-ballot profile elects Team 04, then Team 25, then ties Teams 06 and 11", () => {
  const result = tallyIrv([
    ["25", "11", "21"],
    ["08", "21", "04", "25", "11"],
    ["06", "21", "04", "25"],
    ["06", "04", "21"],
    ["04", "25"],
    ["25", "04", "06", "11", "08"],
    ["04", "13", "11"],
  ]);
  deepStrictEqual(
    result.ranking,
    ranking([
      [1, "04"],
      [2, "25"],
      [3, "06"],
      [3, "11"],
      [5, "21"],
      [6, "08"],
      [7, "13"],
    ]),
  );
});

void test("no eligible preferences produces an empty ranking", () => {
  const expected = {
    status: "no-votes",
    winnerId: null,
    tiedTeamIds: [],
    ranking: [],
    unrankedTeamIds: [],
  };
  deepStrictEqual(tallyIrv([]), expected);
  deepStrictEqual(tallyIrv([[], []]), expected);
});

void test("duplicate preferences cannot count a ballot more than once", () => {
  deepStrictEqual(tallyIrv([["a", "a"], ["a"], []]).ranking, ranking([[1, "a"]]));
});

void test("results do not depend on ballot order or mutate the input", () => {
  const ballots = [
    ["a", "c"],
    ["b", "d"],
    ["b", "a"],
    ["c", "b"],
  ];
  const original = structuredClone(ballots);
  deepStrictEqual(tallyIrv(ballots), tallyIrv(ballots.toReversed()));
  deepStrictEqual(ballots, original);
});

void test("many tied bullet votes do not enumerate every elimination permutation", () => {
  const teams = Array.from({ length: 30 }, (_, i) => `team-${String(i).padStart(2, "0")}`);
  deepStrictEqual(
    tallyIrv(
      teams.map((id) => [id]),
      1,
    ).ranking,
    teams.map((teamId) => ({ rank: 1, teamId })),
  );
});

void test("exceeding the tie-search budget fails instead of returning a partial ranking", () => {
  throws(
    () =>
      tallyIrv(
        [
          ["a", "b"],
          ["b", "a"],
        ],
        1,
      ),
    IrvLimitError,
  );
});

function permutations(values: string[]): string[][] {
  if (values.length === 0) return [[]];
  return values.flatMap((value) =>
    permutations(values.filter((other) => other !== value)).map((rest) => [value].concat(rest)),
  );
}

// Independent oracle: run ordinary IRV with every fixed elimination priority,
// union its winners, remove that group, and repeat for the next place.
function deterministicWinner(ballots: string[][], remaining: string[], priority: string[]): string {
  let candidates = [...remaining];
  while (candidates.length > 0) {
    const counts = new Map(candidates.map((id) => [id, 0]));
    let continuing = 0;
    for (const ballot of ballots) {
      const choice = ballot.find((id) => counts.has(id));
      if (choice !== undefined) {
        counts.set(choice, counts.get(choice)! + 1);
        continuing += 1;
      }
    }
    const winner = candidates.find((id) => counts.get(id)! * 2 > continuing);
    if (winner !== undefined) return winner;
    const minimum = Math.min(...counts.values());
    const eliminated = priority.find((id) => counts.get(id) === minimum)!;
    candidates = candidates.filter((id) => id !== eliminated);
  }
  throw new Error("Expected a winner");
}

function referenceRanking(ballots: string[][]) {
  let remaining = [...new Set(ballots.flat())].toSorted();
  const priorities = permutations(remaining);
  const result: { rank: number; teamId: string }[] = [];
  while (remaining.length > 0) {
    const current = remaining;
    const possible = new Set(
      priorities.map((priority) => deterministicWinner(ballots, current, priority)),
    );
    const rank = result.length + 1;
    for (const teamId of [...possible].toSorted()) result.push({ rank, teamId });
    remaining = remaining.filter((id) => !possible.has(id));
  }
  return result;
}

void test("matches ordinary IRV under every fixed tiebreak order on 1,000 four-team profiles", () => {
  let seed = 73;
  function next(limit: number) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed % limit;
  }
  for (let sample = 0; sample < 1000; sample++) {
    const ballots = Array.from({ length: next(7) }, () => {
      const available = ["a", "b", "c", "d"];
      const ballot: string[] = [];
      const length = next(5);
      for (let i = 0; i < length; i++) {
        ballot.push(available.splice(next(available.length), 1)[0]);
      }
      return ballot;
    });
    deepStrictEqual(tallyIrv(ballots).ranking, referenceRanking(ballots), JSON.stringify(ballots));
  }
});
