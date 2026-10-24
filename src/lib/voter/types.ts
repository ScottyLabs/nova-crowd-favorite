// Shapes the voter screens work with. They match what the API returns
// (see src/routes/api/collection and src/routes/api/ballot).

export interface Team {
  id: string;
  name: string;
  /** Member names as typed in the form, e.g. "Ann Lee, Bob Kim". */
  members: string;
}

/** A team the voter has scanned, plus their private note on it. */
export interface CollectionItem {
  team: Team;
  note: string;
}

export type BallotStatus = "draft" | "submitted";

export interface Ballot {
  /** Team ids in rank order. Index 0 is rank 1. At most 5. */
  ranked: string[];
  status: BallotStatus;
  submittedAt: string | null;
}

/** What happened when a QR code was scanned. */
export type ScanResult =
  | { kind: "added"; team: Team; count: number }
  | { kind: "already"; team: Team; count: number }
  | { kind: "own-team"; team: Team }
  | { kind: "unknown-code" };

export { MAX_RANKED } from "./ranking.ts";
