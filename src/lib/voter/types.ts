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
  /** True after the organizers' close time. The app then shows "Voting closed". */
  votingClosed: boolean;
}

/** What happened when a QR code was scanned. */
export type ScanResult =
  | { kind: "added"; team: Team; count: number }
  | { kind: "already"; team: Team; count: number }
  | { kind: "own-team"; team: Team }
  /** A printed sticker no team has linked yet. Scanning it never links it. */
  | { kind: "unlinked" }
  | { kind: "unknown-code" };

/** The voter's own team, and whether it has a QR sticker linked yet. */
export interface MyTeam {
  /** Null for voters who are not on a team (judges, organizers). */
  team: Team | null;
  linked: boolean;
}

/** What happened when a voter tried to link a sticker with "Scan my team". */
export type ClaimResult =
  /** Only from the check before asking: the sticker is free and your team has none yet. */
  | { kind: "can-link"; team: Team }
  | { kind: "claimed"; team: Team }
  | { kind: "already-yours"; team: Team }
  | { kind: "team-has-code"; team: Team }
  | { kind: "taken"; team: Team }
  | { kind: "no-team" }
  | { kind: "unknown-code" };

export { MAX_RANKED } from "./ranking.ts";
