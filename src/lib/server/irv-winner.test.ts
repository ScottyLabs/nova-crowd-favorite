import { deepStrictEqual, strictEqual, throws } from "node:assert";
import { test } from "node:test";
import { IrvLimitError, tallyIrv, tallyIrvWinner } from "./irv.ts";

void test("winner-only tally avoids lower-place tie explosions without dropping teams", () => {
  const lower = Array.from({ length: 129 }, (_, i) => `team-${i}`);
  const ballots = [
    ...Array.from({ length: 130 }, () => ["winner"]),
    ...lower.map((id, i) => [id, lower[(i + 1) % lower.length]]),
  ];
  throws(() => tallyIrv(ballots), IrvLimitError);
  const result = tallyIrvWinner(ballots);
  strictEqual(result.winnerId, "winner");
  deepStrictEqual(result.ranking, [{ rank: 1, teamId: "winner" }]);
  strictEqual(result.unrankedTeamIds.length, 129);
});

void test("winner-only tally preserves first-place ties and excludes lower placements", () => {
  const ballots = [
    ["a", "c"],
    ["b", "c"],
  ];
  const result = tallyIrvWinner(ballots);
  deepStrictEqual(result.ranking, [
    { rank: 1, teamId: "a" },
    { rank: 1, teamId: "b" },
  ]);
  deepStrictEqual(result.tiedTeamIds, ["a", "b"]);
  deepStrictEqual(result.unrankedTeamIds, ["c"]);
});
