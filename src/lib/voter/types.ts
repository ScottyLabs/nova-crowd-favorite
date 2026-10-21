// Shapes the voter screens work with.
// These are a guess at Shaun's API. When his real responses are ready,
// update these types and api.ts, and the screens should keep working.

export interface Team {
  id: string;
  name: string;
  table: string;
  description: string;
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

export interface Settings {
  /** ISO timestamp when voting closes. */
  closesAt: string;
  closed: boolean;
}

/** What happened when a QR code was scanned. */
export type ScanResult =
  | { kind: "added"; team: Team; count: number }
  | { kind: "already"; team: Team; count: number }
  | { kind: "own-team"; team: Team }
  | { kind: "unknown-code" };

export { MAX_RANKED } from "./ranking.ts";
