import { db } from "../../../../lib/server/db";
import { dashboardRecords, ensureVoterLinks } from "../../../../lib/server/dashboard";
import { error } from "@sveltejs/kit";
import { apiRequest, signedIn } from "../../../../lib/server/organizer-session";
import type { RequestHandler } from "./$types";

function cell(value: import("node:sqlite").SQLOutputValue): string {
  let text = value === null ? "" : String(value);
  if (/^\s*[=+\-@]/u.test(text) || /^[\t\r\n]/u.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export const GET: RequestHandler = async ({ cookies, params, fetch, url }) => {
  if (!signedIn(cookies, process.env.ORGANIZER_PASSWORD ?? "")) error(401, "Sign in again.");
  if (params.kind === "voters.csv" || params.kind === "voters.tsv") {
    await ensureVoterLinks(db, process.env.APP_URL ?? url.origin);
    const delimiter = params.kind.endsWith("tsv") ? "\t" : ",";
    const rows = dashboardRecords(db).voters;
    const body =
      [
        ["name", "email", "url"].join(delimiter),
        ...rows.map((row) =>
          [row.name, row.email, row.url].map((value) => cell(value)).join(delimiter),
        ),
      ].join("\r\n") + "\r\n";
    return new Response(body, {
      headers: {
        "cache-control": "no-store",
        "content-type": `${delimiter === "," ? "text/csv" : "text/tab-separated-values"}; charset=utf-8`,
        "content-disposition": `attachment; filename="${params.kind}"`,
      },
    });
  }
  if (params.kind !== "ballots" && params.kind !== "database") error(404);
  return fetch(`/api/organizer/export/${params.kind}`, apiRequest());
};
