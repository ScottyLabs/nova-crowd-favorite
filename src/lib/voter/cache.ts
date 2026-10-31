export interface PendingChange {
  path: string;
  method: "PUT" | "PATCH";
  body: { ranked: string[] } | { note: string };
  version: string;
}

const keyFor = (code: string, key: string) => `nova-cache:${code}:${key}`;

export function readLocal(code: string, key: string): unknown {
  const name = keyFor(code, key);
  try {
    const raw = localStorage.getItem(name);
    const value: unknown = raw === null ? undefined : JSON.parse(raw);
    return value;
  } catch {
    return undefined;
  }
}

export function writeLocal(code: string, key: string, value: unknown): void {
  const name = keyFor(code, key);
  localStorage.setItem(name, JSON.stringify(value));
}

function isChange(value: unknown): value is PendingChange {
  if (typeof value !== "object" || value === null) return false;
  if (!("path" in value) || !("version" in value) || typeof value.version !== "string")
    return false;
  if (!("body" in value) || typeof value.body !== "object" || value.body === null) return false;
  if (!("method" in value)) return false;
  return (
    (value.method === "PUT" &&
      value.path === "/api/ballot" &&
      "ranked" in value.body &&
      Array.isArray(value.body.ranked) &&
      value.body.ranked.every((id: unknown) => typeof id === "string")) ||
    (value.method === "PATCH" &&
      typeof value.path === "string" &&
      /^\/api\/collection\/[^/]+$/u.test(value.path) &&
      "note" in value.body &&
      typeof value.body.note === "string")
  );
}

export function pendingChanges(code: string): PendingChange[] {
  const value = readLocal(code, "pending");
  return Array.isArray(value) ? value.filter((item: unknown) => isChange(item)) : [];
}

export function queueChange(code: string, change: Omit<PendingChange, "version">): void {
  const pending = pendingChanges(code).filter((item) => item.path !== change.path);
  writeLocal(code, "pending", [...pending, { ...change, version: crypto.randomUUID() }]);
}

export function acknowledge(code: string, change: PendingChange): void {
  writeLocal(
    code,
    "pending",
    pendingChanges(code).filter((item) => item.version !== change.version),
  );
}

export function clearLocal(code: string): void {
  const prefix = keyFor(code, "");
  try {
    for (const key of Object.keys(localStorage))
      if (key.startsWith(prefix)) localStorage.removeItem(key);
  } catch {
    /* Storage may be unavailable. */
  }
}
