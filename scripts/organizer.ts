import process from "node:process";
import { formatTally, isTallySummary } from "./tally-output.ts";

const [command, ...args] = process.argv.slice(2);
const site = process.env.APP_URL;
if (site === undefined || site.length === 0) {
  throw new Error("Set APP_URL to the deployment you want to update");
}
const secret = process.env.SYNC_HMAC_SECRET;
if (secret === undefined || secret.length === 0) {
  throw new Error("Load the target deployment's SYNC_HMAC_SECRET before running this command");
}

let path: string;
let method = "POST";
let payload: unknown;
switch (command) {
  case "tally":
    if (args.length > 1 || (args.length === 1 && args[0] !== "--json")) {
      throw new Error("Usage: deno task organizer tally [--json]");
    }
    path = "/api/organizer/tally";
    method = "GET";
    break;
  case "reissue":
  case "reset-ballot":
    if (args.length !== 1) {
      throw new Error(`Usage: deno task organizer ${command} EMAIL`);
    }
    path = command === "reissue" ? "/api/organizer/voters/reissue" : "/api/organizer/ballots";
    method = command === "reissue" ? "POST" : "DELETE";
    payload = { email: args[0] };
    break;
  case "unlink-qr":
    if (args.length !== 1) {
      throw new Error("Usage: deno task organizer unlink-qr CODE");
    }
    path = "/api/organizer/qr-codes/unlink";
    payload = { code: args[0] };
    break;
  case "disqualify":
  case "reinstate":
    if (
      (command === "disqualify" && (args.length === 0 || args.length > 2)) ||
      (command === "reinstate" && args.length !== 1)
    ) {
      throw new Error("Usage: deno task organizer disqualify TEAM_ID [REASON] | reinstate TEAM_ID");
    }
    path = "/api/organizer/teams/disqualification";
    method = "PUT";
    payload = { teamId: args[0], disqualified: command === "disqualify", reason: args[1] };
    break;
  case "export-csv":
  case "export-db":
    if (args.length > 0) {
      throw new Error(`Usage: deno task organizer ${command}`);
    }
    path = `/api/organizer/export/${command === "export-csv" ? "ballots" : "database"}`;
    method = "GET";
    break;
  case "list-voters":
  case "list-teams":
  case "list-ballots":
    if (args.length > 0) {
      throw new Error(`Usage: deno task organizer ${command}`);
    }
    path = `/api/organizer/${command.slice(5)}`;
    method = "GET";
    break;
  case "voters":
    if (args.length === 0) {
      throw new Error("Usage: deno task organizer voters EMAIL...");
    }
    path = "/api/organizer/voters";
    payload = { emails: args };
    break;
  case "qr": {
    const count = Number(args[0]);
    if (args.length !== 1 || !Number.isInteger(count) || count < 1 || count > 1000) {
      throw new Error("Usage: deno task organizer qr COUNT (1-1000)");
    }
    path = "/api/organizer/qr-codes";
    payload = {
      codes: Array.from({ length: count }, () => crypto.randomUUID()),
    };
    break;
  }
  case "register-qr":
    if (args.length === 0) {
      throw new Error("Usage: deno task organizer register-qr CODE...");
    }
    path = "/api/organizer/qr-codes";
    payload = { codes: args };
    break;
  case "close":
  case "open":
    if ((command === "close" && args.length !== 1) || (command === "open" && args.length > 0)) {
      throw new Error("Usage: deno task organizer close ISO_TIMESTAMP | open");
    }
    path = "/api/organizer/voting";
    method = "PUT";
    payload = { closesAt: command === "open" ? null : args[0] };
    break;
  default:
    throw new Error(
      "Usage: deno task organizer voters EMAIL... | list-voters | list-teams | list-ballots | tally [--json] | reissue EMAIL | reset-ballot EMAIL | unlink-qr CODE | disqualify TEAM_ID [REASON] | reinstate TEAM_ID | export-csv | export-db | qr COUNT | register-qr CODE... | close ISO_TIMESTAMP | open",
    );
}

const body = method === "GET" ? "" : JSON.stringify(payload);
const timestamp = String(Date.now());
const enc = new TextEncoder();
const key = await crypto.subtle.importKey(
  "raw",
  enc.encode(secret),
  { name: "HMAC", hash: "SHA-256" },
  false,
  ["sign"],
);
const signature = new Uint8Array(
  await crypto.subtle.sign("HMAC", key, enc.encode(`${timestamp}.${body}`)),
);
const response = await fetch(new URL(path, site), {
  method,
  headers: {
    "content-type": "application/json",
    "x-timestamp": timestamp,
    "x-signature": Array.from(signature, (byte) => byte.toString(16).padStart(2, "0")).join(""),
  },
  body: method === "GET" ? undefined : body,
});
if (!response.ok) {
  const result: unknown = await response.json();
  throw new Error(`HTTP ${response.status}: ${JSON.stringify(result)}`);
}
if (command === "export-csv" || command === "export-db") {
  process.stdout.write(new Uint8Array(await response.arrayBuffer()));
} else if (command === "tally" && args[0] !== "--json") {
  const result: unknown = await response.json();
  if (!isTallySummary(result)) throw new Error("Invalid tally response");
  console.log(formatTally(result));
} else {
  const result: unknown = await response.json();
  console.log(JSON.stringify(result, null, 2));
}
