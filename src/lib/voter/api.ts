// Talks to the crowd favorite API. Every screen goes through these functions,
// so this is the only file that knows the URLs and response shapes.
// Each request sends the voter code as `Authorization: Bearer <code>`.

import { getVoterCode } from "./identity.ts";
import { pendingChanges, readLocal, writeLocal } from "./cache.ts";
import {
  ApiError,
  currentCode,
  enqueue,
  failure,
  readCached as read,
  send,
  syncPending,
  pendingError,
} from "./sync.ts";
export { ApiError, startSync, syncPending, syncState } from "./sync.ts";
import type { Ballot, ClaimResult, CollectionItem, MyTeam, ScanResult, Team } from "./types.ts";

// ---- Checking response shapes (no `as`, so bad data fails loudly) ----------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toTeam(value: unknown): Team | null {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.name !== "string") {
    return null;
  }
  return {
    id: value.id,
    name: value.name,
    members: typeof value.members === "string" ? value.members : "",
  };
}

function toItem(value: unknown): CollectionItem | null {
  if (!isRecord(value)) return null;
  const team = toTeam(value.team);
  if (team === null) return null;
  return { team, note: typeof value.note === "string" ? value.note : "" };
}

function toBallot(value: unknown): Ballot {
  if (
    !isRecord(value) ||
    !Array.isArray(value.ranked) ||
    !value.ranked.every((id: unknown) => typeof id === "string") ||
    (value.status !== "draft" && value.status !== "submitted")
  ) {
    throw new ApiError("invalid", "Unexpected ballot from the server.");
  }
  const ranked: string[] = value.ranked.filter(
    (id: unknown): id is string => typeof id === "string",
  );
  return {
    ranked,
    status: value.status,
    submittedAt: typeof value.submittedAt === "string" ? value.submittedAt : null,
    votingClosed: value.votingClosed === true,
  };
}

function toCount(value: unknown): number {
  return typeof value === "number" ? value : 0;
}

// ---- Endpoints ----------------------------------------------------------

function toCollection(value: unknown): CollectionItem[] {
  if (!Array.isArray(value))
    throw new ApiError("invalid", "Unexpected collection from the server.");
  return value.flatMap((entry: unknown) => {
    const item = toItem(entry);
    return item === null ? [] : [item];
  });
}

/** GET /api/collection, with pending local notes. */
export async function getCollection(): Promise<CollectionItem[]> {
  const code = currentCode();
  const items = await read("/api/collection", toCollection);
  if (code !== getVoterCode())
    throw new ApiError("invalid", "Voting link changed. Refresh to continue.");
  return items.map((item) => {
    const change = pendingChanges(code).find((entry) => entry.path === notePath(item.team.id));
    return change !== undefined && "note" in change.body
      ? { team: item.team, note: change.body.note }
      : item;
  });
}

/** One team from the collection (there is no single-team endpoint, so this filters the list). */
export async function getCollectionItem(teamId: string): Promise<CollectionItem> {
  const item = (await getCollection()).find((entry) => entry.team.id === teamId);
  if (item === undefined) throw new ApiError("not-found", "That team is not in your collection.");
  return item;
}

/** POST /api/collection  (body: the scanned QR code) */
export async function addByQr(code: string): Promise<ScanResult> {
  const { status, data } = await send("POST", "/api/collection", { code });
  if (status === 404) return { kind: "unknown-code" };
  if (status !== 200 && status !== 201) throw failure(status, data);
  if (isRecord(data) && data.kind === "unlinked") return { kind: "unlinked" };
  const team = isRecord(data) ? toTeam(data.team) : null;
  if (!isRecord(data) || team === null) {
    throw new ApiError("invalid", "Unexpected scan result from the server.");
  }
  if (data.kind === "own-team") return { kind: "own-team", team };
  const count = toCount(data.count);
  return data.kind === "already"
    ? { kind: "already", team, count }
    : { kind: "added", team, count };
}

const notePath = (id: string) => `/api/collection/${encodeURIComponent(id)}`;

/** Keep edits on this device immediately; network saves run in the background. */
export function updateNote(teamId: string, note: string): Promise<void> {
  const code = currentCode();
  enqueue(code, { path: notePath(teamId), method: "PATCH", body: { note } });
  return Promise.resolve();
}

export async function getBallot(): Promise<Ballot> {
  const code = currentCode();
  const ballot = await read("/api/ballot", toBallot);
  if (code !== getVoterCode())
    throw new ApiError("invalid", "Voting link changed. Refresh to continue.");
  const change = pendingChanges(code).find((entry) => entry.path === "/api/ballot");
  return ballot.status === "draft" &&
    !ballot.votingClosed &&
    change !== undefined &&
    "ranked" in change.body
    ? { ...ballot, ranked: change.body.ranked }
    : ballot;
}

export function putBallot(ranked: string[]): Promise<Ballot> {
  const code = currentCode();
  const value = readLocal(code, "/api/ballot");
  const ballot =
    value === undefined
      ? { ranked: [], status: "draft" as const, submittedAt: null, votingClosed: false }
      : toBallot(value);
  if (ballot.votingClosed) throw new ApiError("voting-closed", "Voting has closed.");
  if (ballot.status === "submitted")
    throw new ApiError("already-submitted", "Your ballot is already submitted.");
  const next = { ...ballot, ranked };
  enqueue(code, { path: "/api/ballot", method: "PUT", body: { ranked } });
  return Promise.resolve(next);
}

/** Never queue final submission or report success without server confirmation. */
export async function submitBallot(): Promise<Ballot> {
  const code = currentCode();
  await syncPending();
  if (code !== getVoterCode())
    throw new ApiError("invalid", "Voting link changed. Refresh to continue.");
  const pending = pendingChanges(code).find((entry) => entry.path === "/api/ballot");
  if (pending !== undefined) throw pendingError(pending.version);
  const { status, data } = await send("POST", "/api/ballot/submit", undefined, code);
  if (status !== 200) throw failure(status, data);
  const ballot = toBallot(data);
  try {
    writeLocal(code, "/api/ballot", ballot);
  } catch {
    // A confirmed submission succeeds even if the browser cannot cache its receipt.
  }
  if (code !== getVoterCode())
    throw new ApiError("invalid", "Voting link changed. Refresh to continue.");
  return ballot;
}

/** GET /api/my-team */
function toMyTeam(value: unknown): MyTeam {
  if (!isRecord(value)) throw new ApiError("invalid", "Unexpected team from the server.");
  return { team: toTeam(value.team), linked: value.linked === true };
}

export function getMyTeam(): Promise<MyTeam> {
  return read("/api/my-team", toMyTeam);
}

const CLAIM_KINDS = ["can-link", "claimed", "already-yours", "team-has-code", "taken"] as const;

function toClaimResult(status: number, data: unknown): ClaimResult {
  if (status === 404) return { kind: "unknown-code" };
  if (status !== 200) throw failure(status, data);
  if (!isRecord(data)) throw new ApiError("invalid", "Unexpected claim result from the server.");
  if (data.kind === "no-team") return { kind: "no-team" };
  const team = toTeam(data.team);
  const kind = CLAIM_KINDS.find((k) => k === data.kind);
  if (kind === undefined || team === null) {
    throw new ApiError("invalid", "Unexpected claim result from the server.");
  }
  return { kind, team };
}

/** GET /api/qr/claim?code=...  Checks whether "Link to my team" would work. Links nothing. */
export async function checkClaim(code: string): Promise<ClaimResult> {
  const { status, data } = await send("GET", `/api/qr/claim?code=${encodeURIComponent(code)}`);
  return toClaimResult(status, data);
}

/** POST /api/qr/claim  (body: the scanned QR code) */
export async function claimQr(code: string): Promise<ClaimResult> {
  const { status, data } = await send("POST", "/api/qr/claim", { code });
  return toClaimResult(status, data);
}
