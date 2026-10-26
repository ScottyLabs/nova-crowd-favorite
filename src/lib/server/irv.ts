export interface IrvRound {
  number: number;
  counts: { teamId: string; votes: number }[];
  continuingBallots: number;
  exhaustedBallots: number;
  eliminatedTeamId: string | null;
}

interface ElectionResult {
  status: "winner" | "elimination-tie" | "no-votes";
  winnerId: string | null;
  tiedTeamIds: string[];
  rounds: IrvRound[];
}

export interface IrvResult {
  status: ElectionResult["status"];
  winnerId: string | null;
  tiedTeamIds: string[];
  ranking: { rank: number; teamId: string }[];
  unrankedTeamIds: string[];
  elections: (ElectionResult & { rank: number })[];
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

function electWinner(ballots: string[][]): ElectionResult {
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

/** Select each place by rerunning IRV with previously selected teams removed. */
export function tallyIrv(ballots: string[][]): IrvResult {
  const remaining = new Set(ballots.flat().toSorted());
  const ranking: IrvResult["ranking"] = [];
  const elections: IrvResult["elections"] = [];
  let preferences = ballots;
  let status: IrvResult["status"] = "no-votes";
  while (remaining.size > 0) {
    const election = electWinner(preferences);
    const rank = ranking.length + 1;
    elections.push({ rank, ...election });
    status = election.status;
    const selected = election.winnerId === null ? election.tiedTeamIds : [election.winnerId];
    if (selected.length === 0) break;
    for (const teamId of selected) {
      ranking.push({ rank, teamId });
      remaining.delete(teamId);
    }
    preferences = preferences.map((ballot) => ballot.filter((id) => !selected.includes(id)));
    status = "winner";
  }
  const firstPlace = ranking.filter((entry) => entry.rank === 1).map((entry) => entry.teamId);
  return {
    status,
    winnerId: firstPlace.length === 1 ? firstPlace[0] : null,
    tiedTeamIds: firstPlace.length > 1 ? firstPlace : [],
    ranking,
    unrankedTeamIds: [...remaining],
    elections,
  };
}
