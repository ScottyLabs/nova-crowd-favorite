// Talks to the crowd favorite API. Every screen goes through these functions,
// so this is the only file that knows the URLs and response shapes.
// Each request sends the voter code as `Authorization: Bearer <code>`.

import { authHeaders } from "./identity.ts";
import type { Ballot, ClaimResult, CollectionItem, MyTeam, ScanResult, Team } from "./types.ts";
export type ApiErrorCode =
  | "unauthorized"
  | "not-found"
  | "already-submitted"
  | "invalid"
  | "network";

/** Thrown for errors the screens need to react to. */
export class ApiError extends Error {
  code: ApiErrorCode;

  constructor(code: ApiErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

interface ApiResponse {
  status: number;
  data: unknown;
}

/** Send a request. Only throws when the server can't be reached. */
async function send(method: string, path: string, body?: unknown): Promise<ApiResponse> {
  const headers: Record<string, string> = { ...authHeaders() };
  if (body !== undefined) headers["content-type"] = "application/json";
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError("network", "Could not reach the server. Check your connection.");
  }
  let data: unknown = null;
  try {
    data = await response.json();
  } catch {
    // empty or non-JSON body
  }
  return { status: response.status, data };
}

/** Turn a failed response into the right ApiError. */
function failure(status: number, data: unknown): ApiError {
  const message =
    isRecord(data) && typeof data.error === "string" ? data.error : "Something went wrong.";
  if (status === 401) return new ApiError("unauthorized", "This voting link does not work.");
  if (status === 404) return new ApiError("not-found", message);
  if (status === 409) return new ApiError("already-submitted", message);
  return new ApiError("invalid", message);
}

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
  };
}

function toCount(value: unknown): number {
  return typeof value === "number" ? value : 0;
}

// ---- Endpoints ----------------------------------------------------------

/** GET /api/collection */
export async function getCollection(): Promise<CollectionItem[]> {
  const { status, data } = await send("GET", "/api/collection");
  if (status !== 200) throw failure(status, data);
  if (!Array.isArray(data)) throw new ApiError("invalid", "Unexpected collection from the server.");
  return data.flatMap((entry: unknown) => {
    const item = toItem(entry);
    return item === null ? [] : [item];
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

/** PATCH /api/collection/{teamId}  (body: { note }) */
export async function updateNote(teamId: string, note: string): Promise<void> {
  const { status, data } = await send("PATCH", `/api/collection/${encodeURIComponent(teamId)}`, {
    note,
  });
  if (status !== 200) throw failure(status, data);
}

/** GET /api/ballot */
export async function getBallot(): Promise<Ballot> {
  const { status, data } = await send("GET", "/api/ballot");
  if (status !== 200) throw failure(status, data);
  return toBallot(data);
}

/** PUT /api/ballot  (body: { ranked: teamId[] }) */
export async function putBallot(ranked: string[]): Promise<Ballot> {
  const { status, data } = await send("PUT", "/api/ballot", { ranked });
  if (status !== 200) throw failure(status, data);
  return toBallot(data);
}

/** POST /api/ballot/submit */
export async function submitBallot(): Promise<Ballot> {
  const { status, data } = await send("POST", "/api/ballot/submit");
  if (status !== 200) throw failure(status, data);
  return toBallot(data);
}

/** GET /api/my-team */
export async function getMyTeam(): Promise<MyTeam> {
  const { status, data } = await send("GET", "/api/my-team");
  if (status !== 200) throw failure(status, data);
  if (!isRecord(data)) throw new ApiError("invalid", "Unexpected team from the server.");
  return { team: toTeam(data.team), linked: data.linked === true };
}

const CLAIM_KINDS = ["claimed", "already-yours", "team-has-code", "taken"] as const;

/** POST /api/qr/claim  (body: the scanned QR code) */
export async function claimQr(code: string): Promise<ClaimResult> {
  const { status, data } = await send("POST", "/api/qr/claim", { code });
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
