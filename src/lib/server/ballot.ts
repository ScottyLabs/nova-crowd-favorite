import { db } from "./db";
import { isVotingClosed } from "./voting";

// Shared ballot helpers for /api/ballot and /api/ballot/submit.
// A ballot row stores rank_1..rank_5 as team ids (or null).
// The API exposes it as an ordered list instead: { ranked: [...], status, submittedAt, votingClosed }.

export const MAX_RANKED = 5;

export interface Ballot {
  ranked: string[];
  status: "draft" | "submitted";
  submittedAt: string | null;
  /** True after the organizers' close time. The app then shows "Voting closed". */
  votingClosed: boolean;
}

const selectBallot = db.prepare(`
  SELECT rank_1, rank_2, rank_3, rank_4, rank_5, status, submitted_at
  FROM ballots
  WHERE voter_email = ?
`);

/** The voter's ballot, or an empty draft if they have not saved one yet. */
export function getBallot(email: string): Ballot {
  const row = selectBallot.get(email);
  const votingClosed = isVotingClosed();
  if (row === undefined) return { ranked: [], status: "draft", submittedAt: null, votingClosed };
  const ranked = [row.rank_1, row.rank_2, row.rank_3, row.rank_4, row.rank_5].filter(
    (id): id is string => typeof id === "string",
  );
  return {
    ranked,
    status: row.status === "submitted" ? "submitted" : "draft",
    submittedAt:
      row.status === "submitted" && typeof row.submitted_at === "string" ? row.submitted_at : null,
    votingClosed,
  };
}
