import { fail, redirect, error } from "@sveltejs/kit";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { db } from "../../lib/server/db";
import { dashboardRecords, updateTeamName } from "../../lib/server/dashboard";
import {
  allowLogin,
  apiRequest,
  passwordMatches,
  signIn,
  signedIn,
  signOut,
} from "../../lib/server/organizer-session";
import { databaseSnapshot } from "../../lib/server/organizer-export";
import { restoreDatabase } from "../../lib/server/database-restore";
import { isRecord } from "../../lib/server/organizer";
import type { Actions, PageServerLoad } from "./$types";

const password = () => process.env.ORGANIZER_PASSWORD ?? "";
const messages: Record<string, string> = {
  voters: "Voter links created.",
  reissue: "Voter link replaced.",
  reset: "Ballot reset.",
  disqualify: "Team eligibility updated.",
  stickers: "QR codes created. Use Print all to print them.",
  register: "Printed codes registered.",
  unlink: "QR code released.",
  voting: "Voting settings updated.",
  tally: "Results calculated.",
};

type ApiResult = {
  error?: string;
  voters?: { email: string; url: string }[];
  email?: string;
  url?: string;
  created?: number;
  ranking?: { rank: number; name: string }[];
  provisional?: boolean;
  submittedBallots?: number;
};

function isApiResult(value: unknown): value is ApiResult {
  if (!isRecord(value)) return false;
  return (
    ["error", "email", "url"].every(
      (key) => value[key] === undefined || typeof value[key] === "string",
    ) &&
    (value.voters === undefined ||
      (Array.isArray(value.voters) &&
        value.voters.every(
          (link: unknown) =>
            isRecord(link) && typeof link.email === "string" && typeof link.url === "string",
        ))) &&
    (value.ranking === undefined ||
      (Array.isArray(value.ranking) &&
        value.ranking.every(
          (entry: unknown) =>
            isRecord(entry) && typeof entry.rank === "number" && typeof entry.name === "string",
        ))) &&
    (value.provisional === undefined || typeof value.provisional === "boolean") &&
    (value.submittedBallots === undefined || typeof value.submittedBallots === "number")
  );
}

function text(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}

function list(form: FormData, name: string): string[] {
  return text(form, name)
    .split(/[\s,;]+/u)
    .filter(Boolean);
}

export const load: PageServerLoad = ({ cookies }) => {
  if (!signedIn(cookies, password()))
    return { authenticated: false, configured: Boolean(password()) };
  return { authenticated: true, configured: true, ...dashboardRecords(db) };
};

function operation(form: FormData): [string, string, unknown] {
  const field = (name: string) => text(form, name);
  switch (field("operation")) {
    case "voters":
      return ["voters", "POST", { emails: list(form, "emails") }];
    case "reissue":
      return ["voters/reissue", "POST", { email: field("email") }];
    case "reset":
      return ["ballots", "DELETE", { email: field("email") }];
    case "unlink":
      return ["qr-codes/unlink", "POST", { code: field("code") }];
    case "disqualify":
      return [
        "teams/disqualification",
        "PUT",
        {
          teamId: field("teamId"),
          disqualified: field("disqualified") === "true",
          reason: field("reason"),
        },
      ];
    case "stickers": {
      const count = Number(field("count"));
      if (!Number.isInteger(count) || count < 1 || count > 1000)
        throw new Error("Choose 1 to 1000 stickers.");
      return [
        "qr-codes",
        "POST",
        { codes: Array.from({ length: count }, () => crypto.randomUUID()) },
      ];
    }
    case "register":
      return ["qr-codes", "POST", { codes: list(form, "codes") }];
    case "voting":
      return ["voting", "PUT", { closesAt: field("closesAt") || null }];
    case "tally":
      return ["tally", "GET", undefined];
    default:
      throw new Error("Unknown action.");
  }
}

async function restore(form: FormData): Promise<string> {
  if (form.get("confirmation") !== "RESTORE") throw new Error("Type RESTORE to confirm.");
  const file = form.get("backup");
  if (!(file instanceof File) || file.size === 0 || file.size > 50 * 1024 * 1024) {
    throw new Error("Choose a SQLite backup smaller than 50 MB.");
  }
  const directory = dirname(process.env.DATABASE_PATH ?? "nova.db");
  const path = join(directory, `before-restore-${Date.now()}.db`);
  writeFileSync(path, databaseSnapshot(db), { mode: 0o600 });
  restoreDatabase(db, new Uint8Array(await file.arrayBuffer()));
  return `Database restored. Previous database saved on the server as ${path}.`;
}

export const actions: Actions = {
  login: async ({ request, cookies, url, getClientAddress }) => {
    if (!password()) return fail(503, { error: "Organizer password has not been configured." });
    if (!allowLogin(getClientAddress()))
      return fail(429, { error: "Too many attempts. Try again in a minute." });
    const form = await request.formData();
    if (!passwordMatches(text(form, "password"), password()))
      return fail(401, { error: "Incorrect password." });
    signIn(cookies, password(), url.protocol === "https:");
    return redirect(303, "/organizer");
  },
  logout: ({ cookies }) => {
    signOut(cookies);
    redirect(303, "/organizer");
  },
  run: async ({ request, cookies, fetch, url }) => {
    if (!signedIn(cookies, password())) error(401, "Sign in again.");
    if (request.headers.get("origin") !== url.origin) error(403, "Invalid origin.");
    try {
      const form = await request.formData();
      if (form.get("operation") === "restore") return { message: await restore(form) };
      if (form.get("operation") === "team-name") {
        updateTeamName(db, text(form, "teamId"), text(form, "name"));
        return { message: "Team name saved." };
      }
      const [path, method, payload] = operation(form);
      const response = await fetch(`/api/organizer/${path}`, apiRequest(method, payload));
      const body: unknown = await response.json();
      if (!isApiResult(body)) throw new Error("Invalid organizer response.");
      const result = body;
      if (!response.ok) return fail(response.status, { error: result.error ?? "Action failed." });
      return { message: messages[text(form, "operation")] ?? "Updated.", result };
    } catch (cause) {
      return fail(400, { error: cause instanceof Error ? cause.message : "Action failed." });
    }
  },
};
