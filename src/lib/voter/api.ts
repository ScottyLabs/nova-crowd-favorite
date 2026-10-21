// FAKE API for building the voter screens before the real API exists.
//
// Every function here matches one real endpoint.
//
// Fake data is kept in localStorage so it survives page reloads while you test.
// Run resetFakeData() in the browser console to start over.

import type { Ballot, CollectionItem, ScanResult, Settings, Team } from "./types.ts";
import { MAX_RANKED } from "./types.ts";

// pretend network time, so loading states are visible
const DELAY_MS = 300;
const STORE_KEY = "nova-fake-api";

const TEAMS: Team[] = [
  { id: "t4", name: "Example_4", table: "3", description: "Blah blah blah description" },
  { id: "t5", name: "Example_5", table: "11", description: "Blah blah blah description" },
  { id: "t6", name: "Example_6", table: "7", description: "Blah blah blah description" },
  { id: "t7", name: "Example_7", table: "2", description: "Blah blah blah description" },
  { id: "t8", name: "Example_8", table: "19", description: "Blah blah blah description" },
  { id: "t9", name: "Example_9", table: "5", description: "Blah blah blah description" },
  { id: "t1", name: "Example_1", table: "14", description: "Blah blah blah description" },
  { id: "t2", name: "Example_2", table: "8", description: "Your own team in the fake data" },
];

/** QR code value -> team id. Real QR codes will come from the qr_codes table. */
const QR_CODES = new Map<string, string>([
  ["qr-t1", "t1"],
  ["qr-t2", "t2"],
  ["qr-t4", "t4"],
  ["qr-t5", "t5"],
  ["qr-t6", "t6"],
  ["qr-t7", "t7"],
  ["qr-t8", "t8"],
  ["qr-t9", "t9"],
]);

const OWN_TEAM_ID = "t2";

interface FakeState {
  collection: { teamId: string; note: string }[];
  ballot: Ballot;
}

function emptyState(): FakeState {
  return { collection: [], ballot: { ranked: [], status: "draft", submittedAt: null } };
}

function isFakeState(value: unknown): value is FakeState {
  if (typeof value !== "object" || value === null) return false;
  return "collection" in value && Array.isArray(value.collection) && "ballot" in value;
}

function load(): FakeState {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    const parsed: unknown = raw === null ? null : JSON.parse(raw);
    return isFakeState(parsed) ? parsed : emptyState();
  } catch {
    return emptyState();
  }
}

function save(state: FakeState): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
  } catch {
    // private mode or storage blocked: fake data just won't persist
  }
}

function wait(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, DELAY_MS);
  });
}

function teamById(id: string): Team {
  const team = TEAMS.find((t) => t.id === id);
  if (!team) throw new Error(`Unknown team ${id}`);
  return team;
}

export type ApiErrorCode = "not-found" | "already-submitted" | "closed" | "network";

/** Thrown for errors the screens need to react to (like the real API's status codes). */
export class ApiError extends Error {
  code: ApiErrorCode;

  constructor(code: ApiErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

// ---- Endpoints ----------------------------------------------------------

/** GET /api/collection */
export async function getCollection(): Promise<CollectionItem[]> {
  await wait();
  return load().collection.map((c) => ({ team: teamById(c.teamId), note: c.note }));
}

/** POST /api/collection  (body: the scanned QR code) */
export async function addByQr(qr: string): Promise<ScanResult> {
  await wait();
  const teamId = QR_CODES.get(qr);
  if (teamId === undefined) return { kind: "unknown-code" };
  const team = teamById(teamId);
  if (teamId === OWN_TEAM_ID) return { kind: "own-team", team };

  const state = load();
  if (state.collection.some((c) => c.teamId === teamId)) {
    return { kind: "already", team, count: state.collection.length };
  }
  state.collection.push({ teamId, note: "" });
  save(state);
  return { kind: "added", team, count: state.collection.length };
}

/** GET /api/collection/{teamId}  (one team plus the note) */
export async function getCollectionItem(teamId: string): Promise<CollectionItem> {
  await wait();
  const item = load().collection.find((c) => c.teamId === teamId);
  if (!item) throw new ApiError("not-found", "That team is not in your collection.");
  return { team: teamById(item.teamId), note: item.note };
}

/** PATCH /api/collection/{teamId}  (body: { note }) */
export async function updateNote(teamId: string, note: string): Promise<void> {
  await wait();
  const state = load();
  const item = state.collection.find((c) => c.teamId === teamId);
  if (!item) throw new ApiError("not-found", "That team is not in your collection.");
  item.note = note;
  save(state);
}

/** GET /api/ballot */
export async function getBallot(): Promise<Ballot> {
  await wait();
  return load().ballot;
}

/** PUT /api/ballot  (body: { ranked: teamId[] }) */
export async function putBallot(ranked: string[]): Promise<Ballot> {
  await wait();
  const state = load();
  if (state.ballot.status === "submitted") {
    throw new ApiError("already-submitted", "Your ballot was already submitted.");
  }
  state.ballot.ranked = ranked.slice(0, MAX_RANKED);
  save(state);
  return state.ballot;
}

/** POST /api/ballot/submit */
export async function submitBallot(): Promise<Ballot> {
  await wait();
  const state = load();
  if (state.ballot.status === "submitted") {
    throw new ApiError("already-submitted", "Your ballot was already submitted.");
  }
  state.ballot.status = "submitted";
  state.ballot.submittedAt = new Date().toISOString();
  save(state);
  return state.ballot;
}

/** GET /api/settings  (or wherever voting close time ends up) */
export async function getSettings(): Promise<Settings> {
  await wait();
  return { closesAt: "2026-11-07T20:00:00-05:00", closed: false };
}

// ---- Dev helpers --------------------------------------------------------

/** Wipe the fake data. Handy while testing screens. */
export function resetFakeData(): void {
  save(emptyState());
}

/** Fill in a collection of 6 teams with 3 ranked, so screens have something to show. */
export function seedFakeData(): void {
  const teamIds = ["t4", "t5", "t6", "t7", "t8", "t9"];
  save({
    collection: teamIds.map((teamId) => ({
      teamId,
      note: teamId === "t5" ? "Great demo, ask about latency." : "",
    })),
    ballot: { ranked: ["t4", "t5", "t6"], status: "draft", submittedAt: null },
  });
}

// Lets you type resetFakeData() or seedFakeData() in the browser console.
if (typeof window !== "undefined") {
  Object.assign(window, { resetFakeData, seedFakeData });
}
