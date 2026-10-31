import { writable } from "svelte/store";
import { getVoterCode } from "./identity.ts";
import {
  acknowledge,
  clearLocal,
  pendingChanges,
  queueChange,
  readLocal,
  writeLocal,
  type PendingChange,
} from "./cache.ts";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export type ApiErrorCode =
  | "unauthorized"
  | "not-found"
  | "already-submitted"
  | "voting-closed"
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
export async function send(
  method: string,
  path: string,
  body?: unknown,
  code = getVoterCode(),
): Promise<ApiResponse> {
  const headers: Record<string, string> = code === null ? {} : { Authorization: `Bearer ${code}` };
  if (body !== undefined) headers["content-type"] = "application/json";
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      headers,
      signal: AbortSignal.timeout(10_000),
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
export function failure(status: number, data: unknown): ApiError {
  const message =
    isRecord(data) && typeof data.error === "string" ? data.error : "Something went wrong.";
  if (status >= 500 || status === 408 || status === 429)
    return new ApiError("network", "Could not reach the server. Try again shortly.");
  if (status === 401) return new ApiError("unauthorized", "This voting link does not work.");
  if (status === 403 && isRecord(data) && data.kind === "voting-closed") {
    return new ApiError("voting-closed", "Voting has closed.");
  }
  if (status === 404) return new ApiError("not-found", message);
  if (status === 409) return new ApiError("already-submitted", message);
  return new ApiError("invalid", message);
}

interface SyncState {
  pending: number;
  saving: boolean;
  offline: boolean;
  error: string | null;
  saved: boolean;
}

const initialSync: SyncState = {
  pending: 0,
  saving: false,
  offline: false,
  error: null,
  saved: false,
};
export const syncState = writable<SyncState>(initialSync);
const errors = new Map<string, ApiError>();
export function pendingError(version: string): ApiError {
  return errors.get(version) ?? new ApiError("network", "Connect to the internet to submit.");
}
let operation: Promise<void> | null = null;
let operationCode: string | null = null;
let saveTimer: ReturnType<typeof setTimeout> | undefined;

export function currentCode(): string {
  const code = getVoterCode();
  if (code === null) throw new ApiError("unauthorized", "Open your voting link first.");
  return code;
}

function report(code: string, patch: Partial<SyncState> = {}): void {
  if (code !== getVoterCode()) return;
  const pending = pendingChanges(code);
  const error = pending.map((item) => errors.get(item.version)).find((item) => item !== undefined);
  syncState.update((state) => ({
    ...state,
    ...patch,
    pending: pending.length,
    error: error !== undefined && error.code !== "network" ? error.message : null,
  }));
}

export async function readCached<T>(path: string, parse: (value: unknown) => T): Promise<T> {
  const code = currentCode();
  const previous = readLocal(code, path);
  if (!navigator.onLine && previous !== undefined) {
    report(code, { offline: true });
    return parse(previous);
  }
  try {
    const reply = await send("GET", path, undefined, code);
    if (code !== getVoterCode())
      throw new ApiError("invalid", "Voting link changed. Refresh to continue.");
    if (reply.status !== 200) throw failure(reply.status, reply.data);
    const value = parse(reply.data);
    // A save may have updated this snapshot while the GET was in flight.
    if (JSON.stringify(readLocal(code, path)) === JSON.stringify(previous)) {
      try {
        writeLocal(code, path, value);
      } catch {
        // Online reads still work when storage is full; queued edits must persist.
      }
      report(code, { offline: false });
      return value;
    }
    report(code, { offline: false });
    return parse(readLocal(code, path));
  } catch (cause) {
    if (cause instanceof ApiError && cause.code === "unauthorized") clearLocal(code);
    if (cause instanceof ApiError && cause.code === "network" && previous !== undefined) {
      if (code !== getVoterCode())
        throw new ApiError("invalid", "Voting link changed. Refresh to continue.");
      report(code, { offline: true });
      return parse(readLocal(code, path));
    }
    throw cause;
  }
}

export function enqueue(code: string, change: Omit<PendingChange, "version">): void {
  for (const old of pendingChanges(code)) if (old.path === change.path) errors.delete(old.version);
  try {
    queueChange(code, change);
  } catch {
    throw new ApiError("invalid", "Could not save on this device. Check your browser storage.");
  }
  report(code, { saved: false });
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    void syncPending();
  }, 400);
}

function accept(code: string, change: PendingChange, data: unknown): void {
  if (change.path === "/api/ballot") {
    if (
      !isRecord(data) ||
      !Array.isArray(data.ranked) ||
      (data.status !== "draft" && data.status !== "submitted")
    )
      throw new ApiError("invalid", "Unexpected ballot from the server.");
    writeLocal(code, change.path, data);
  } else {
    const cached = readLocal(code, "/api/collection");
    if (cached !== undefined && "note" in change.body) {
      const note = change.body.note;
      writeLocal(
        code,
        "/api/collection",
        (Array.isArray(cached) ? cached : []).map((item: unknown) => {
          if (!isRecord(item) || !isRecord(item.team) || typeof item.team.id !== "string")
            return item;
          return `/api/collection/${encodeURIComponent(item.team.id)}` === change.path
            ? Object.assign({}, item, { note })
            : item;
        }),
      );
    }
  }
  acknowledge(code, change);
  errors.delete(change.version);
}

async function drain(code: string): Promise<void> {
  const tried = new Set<string>();
  while (code === getVoterCode()) {
    const change = pendingChanges(code).find(
      (item) =>
        !tried.has(item.version) &&
        (!errors.has(item.version) || errors.get(item.version)?.code === "network"),
    );
    if (change === undefined) return;
    tried.add(change.version);
    try {
      // Keep writes ordered; parallel saves can overwrite newer edits.
      // eslint-disable-next-line no-await-in-loop
      const reply = await send(change.method, change.path, change.body, code);
      if (reply.status !== 200) throw failure(reply.status, reply.data);
      accept(code, change, reply.data);
      report(code, { offline: false, saved: true });
    } catch (cause) {
      const error =
        cause instanceof ApiError ? cause : new ApiError("invalid", "Could not sync this change.");
      errors.set(change.version, error);
      if (error.code === "unauthorized") break;
      report(code, { offline: error.code === "network" });
    }
  }
}

export function syncPending(retryRejected = false): Promise<void> {
  const code = getVoterCode();
  if (code === null) return Promise.resolve();
  if (retryRejected) for (const item of pendingChanges(code)) errors.delete(item.version);
  if (operation !== null)
    return operationCode === code ? operation : operation.then(() => syncPending(retryRejected));
  report(code, { saving: pendingChanges(code).length > 0 });
  operationCode = code;
  const task = () => drain(code);
  const result =
    typeof navigator !== "undefined" && navigator.locks !== undefined
      ? navigator.locks.request(`nova-sync:${code}`, task)
      : task();
  operation = result.finally(() => {
    operation = null;
    report(code, { saving: false });
  });
  return operation;
}

function changed(): void {
  syncState.set(initialSync);
  const code = getVoterCode();
  if (code !== null) report(code, { offline: !navigator.onLine });
  void syncPending();
}
function online(): void {
  const code = getVoterCode();
  if (code !== null) report(code, { offline: false });
  void syncPending();
}
function offline(): void {
  const code = getVoterCode();
  if (code !== null) report(code, { offline: true });
}
function storage(event: StorageEvent): void {
  if (event.key === "nova-voter-code") changed();
  else {
    const code = getVoterCode();
    if (code !== null) report(code);
  }
}

export function startSync(): () => void {
  window.addEventListener("online", online);
  window.addEventListener("offline", offline);
  window.addEventListener("nova-voter-change", changed);
  window.addEventListener("storage", storage);
  const timer = setInterval(() => {
    void syncPending();
  }, 15_000);
  changed();
  return () => {
    clearInterval(timer);
    clearTimeout(saveTimer);
    window.removeEventListener("online", online);
    window.removeEventListener("offline", offline);
    window.removeEventListener("nova-voter-change", changed);
    window.removeEventListener("storage", storage);
  };
}
