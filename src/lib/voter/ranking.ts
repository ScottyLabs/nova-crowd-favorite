// Pure ranking rules, kept separate so they are easy to test.
// A ranking is an array of team ids; index 0 is rank 1.

/** Most teams a voter can rank. */
export const MAX_RANKED = 5;

export interface RankChange {
  ranked: string[];
  /** Team pushed out of the top 5 by this change, if any. */
  bumped: string | null;
}

/**
 * Put a team at a rank (1-5). If that spot is taken, the team is inserted
 * there and everyone below moves down one. If the list was already full,
 * the last team falls out and is returned as `bumped`.
 */
export function insertAtRank(ranked: string[], teamId: string, rank: number): RankChange {
  const without = ranked.filter((id) => id !== teamId);
  const index = Math.max(0, Math.min(rank - 1, without.length));
  const next = [...without.slice(0, index), teamId, ...without.slice(index)];
  const bumped = next.length > MAX_RANKED ? next[MAX_RANKED] : null;
  return { ranked: next.slice(0, MAX_RANKED), bumped };
}

/** Take a team out of the top 5. Teams below it move up. */
export function unrank(ranked: string[], teamId: string): string[] {
  return ranked.filter((id) => id !== teamId);
}

/** Move the item at `from` to `to` (used by drag and by keyboard on the grip). */
export function moveItem(ranked: string[], from: number, to: number): string[] {
  if (from === to) return ranked;
  const next = [...ranked];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/** Rank of a team (1-5), or null if it is not in the top 5. */
export function rankOf(ranked: string[], teamId: string): number | null {
  const i = ranked.indexOf(teamId);
  return i === -1 ? null : i + 1;
}
