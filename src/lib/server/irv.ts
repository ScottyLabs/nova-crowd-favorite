import { IrvLimitError } from "./irv-error.ts";

export { IrvLimitError };

export interface IrvResult {
  status: "winner" | "no-votes";
  winnerId: string | null;
  tiedTeamIds: string[];
  ranking: { rank: number; teamId: string }[];
  unrankedTeamIds: string[];
}

class Elections {
  readonly bits: bigint[];
  private readonly preferences: number[][];
  private readonly cache = new Map<bigint, bigint>();
  private states = 0;

  constructor(
    teams: string[],
    ballots: string[][],
    private readonly maxStates: number,
  ) {
    const indices = new Map(teams.map((id, i) => [id, i]));
    this.preferences = ballots.map((ballot) => [...new Set(ballot)].map((id) => indices.get(id)!));
    this.bits = teams.map((_, i) => 1n << BigInt(i));
  }

  members(mask: bigint): number[] {
    return this.bits.flatMap((bit, i) => ((mask & bit) === 0n ? [] : [i]));
  }

  private count(mask: bigint) {
    const counts = this.bits.map(() => 0);
    let continuing = 0;
    let transfers = false;
    for (const ballot of this.preferences) {
      let chosen = false;
      for (const i of ballot) {
        if ((mask & this.bits[i]) === 0n) continue;
        if (chosen) {
          transfers = true;
          break;
        }
        counts[i] += 1;
        continuing += 1;
        chosen = true;
      }
    }
    return { counts, continuing, transfers };
  }

  private eliminate(mask: bigint, active: number[], counts: number[]): bigint {
    // Bound recursive depth as well as the total number of explored states.
    if (active.length > 128) throw new IrvLimitError();
    const minimum = Math.min(...active.map((i) => counts[i]));
    const lowest = active.filter((i) => counts[i] === minimum);
    const others = active.filter((i) => counts[i] !== minimum);
    const next = Math.min(...others.map((i) => counts[i]));
    if (others.length > 0 && minimum * lowest.length < next) {
      // Safe batch elimination, including zero-vote candidates. Even every
      // transfer staying within this group cannot let it catch the next team.
      const eliminated = lowest.reduce((group, i) => group | this.bits[i], 0n);
      return this.winners(mask & ~eliminated);
    }
    let result = 0n;
    for (const i of lowest) {
      result |= this.winners(mask & ~this.bits[i]);
      if (result === mask) break;
    }
    return result;
  }

  winners(mask: bigint): bigint {
    const cached = this.cache.get(mask);
    if (cached !== undefined) return cached;
    this.states += 1;
    if (this.states > this.maxStates) throw new IrvLimitError();
    const active = this.members(mask);
    const { counts, continuing, transfers } = this.count(mask);
    const majority = active.find((i) => counts[i] * 2 > continuing);
    let result = 0n;
    if (majority !== undefined) {
      result = this.bits[majority];
    } else if (transfers) {
      result = this.eliminate(mask, active, counts);
    } else {
      // With no remaining transfers, only the highest-count candidates can win.
      const maximum = Math.max(...active.map((i) => counts[i]));
      for (const i of active) if (counts[i] === maximum) result |= this.bits[i];
    }
    this.cache.set(mask, result);
    return result;
  }
}

/**
 * Select each place with a fresh IRV election. For elimination ties, consider
 * every tied-lowest candidate's elimination (parallel-universe tiebreaking).
 * Report all possible winners as tied, remove that group, and rerun IRV.
 */
export function tallyIrv(ballots: string[][], maxStates = 20_000): IrvResult {
  const teams = [...new Set(ballots.flat())].toSorted();
  const elections = new Elections(teams, ballots, maxStates);
  let remaining = (1n << BigInt(teams.length)) - 1n;
  const ranking: IrvResult["ranking"] = [];
  while (remaining !== 0n) {
    const selected = elections.winners(remaining);
    const rank = ranking.length + 1;
    for (const i of elections.members(selected)) ranking.push({ rank, teamId: teams[i] });
    remaining &= ~selected;
  }
  const first = ranking.filter((entry) => entry.rank === 1).map((entry) => entry.teamId);
  return {
    status: first.length === 0 ? "no-votes" : "winner",
    winnerId: first.length === 1 ? first[0] : null,
    tiedTeamIds: first.length > 1 ? first : [],
    ranking,
    unrankedTeamIds: [],
  };
}
