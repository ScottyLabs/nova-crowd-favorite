export interface IrvRound {
  number: number;
  counts: { teamId: string; votes: number }[];
  continuingBallots: number;
  exhaustedBallots: number;
  eliminatedTeamId: string | null;
}

export interface IrvResult {
  status: "winner" | "elimination-tie" | "no-votes";
  winnerId: string | null;
  tiedTeamIds: string[];
  rounds: IrvRound[];
}

function countRound(ballots: string[][], remaining: Set<string>, number: number): IrvRound {
  const counts = new Map([...remaining].map((teamId) => [teamId, { teamId, votes: 0 }]));
  let exhaustedBallots = 0;
  for (const ballot of ballots) {
    const choice = ballot.map((id) => counts.get(id)).find((count) => count !== undefined);
    if (choice === undefined) exhaustedBallots += 1;
    else choice.votes += 1;
  }
  return {
    number,
    counts: [...counts.values()],
    continuingBallots: ballots.length - exhaustedBallots,
    exhaustedBallots,
    eliminatedTeamId: null,
  };
}

/** Ballots contain eligible team IDs in preference order, including empty/exhausted ballots. */
export function tallyIrv(ballots: string[][]): IrvResult {
  const remaining = new Set(ballots.flat().toSorted());
  const rounds: IrvRound[] = [];
  while (remaining.size > 0) {
    const round = countRound(ballots, remaining, rounds.length + 1);
    rounds.push(round);
    const winner = round.counts.find((count) => count.votes * 2 > round.continuingBallots);
    if (winner !== undefined) {
      return { status: "winner", winnerId: winner.teamId, tiedTeamIds: [], rounds };
    }
    const minimum = Math.min(...round.counts.map((count) => count.votes));
    const lowest = round.counts.filter((count) => count.votes === minimum);
    if (lowest.length > 1) {
      return {
        status: "elimination-tie",
        winnerId: null,
        tiedTeamIds: lowest.map((count) => count.teamId),
        rounds,
      };
    }
    round.eliminatedTeamId = lowest[0].teamId;
    remaining.delete(lowest[0].teamId);
  }
  return { status: "no-votes", winnerId: null, tiedTeamIds: [], rounds };
}
