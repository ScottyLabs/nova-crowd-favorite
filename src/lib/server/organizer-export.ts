import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync, SQLOutputValue } from "node:sqlite";
import { verifySignature } from "./hmac.ts";

const ranks = [1, 2, 3, 4, 5];
const ballotColumns = [
  "voter_email",
  "status",
  "updated_at",
  ...ranks.flatMap((rank) => [
    `rank_${rank}_team_id`,
    `rank_${rank}_team_name`,
    `rank_${rank}_team_active`,
    `rank_${rank}_team_disqualified`,
  ]),
];

function csvCell(value: SQLOutputValue): string {
  let text = value === null ? "" : String(value);
  // Quoting alone does not stop spreadsheet programs interpreting formulas.
  if (/^\s*[=+\-@]/u.test(text) || /^[\t\r\n]/u.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

function ballotCsv(db: DatabaseSync): string {
  const columns = ranks.map(
    (rank) => `
    b.rank_${rank} AS rank_${rank}_team_id,
    t${rank}.name AS rank_${rank}_team_name,
    CASE t${rank}.active WHEN 1 THEN 'true' WHEN 0 THEN 'false' END AS rank_${rank}_team_active,
    CASE WHEN t${rank}.id IS NULL THEN NULL
      WHEN EXISTS (SELECT 1 FROM team_disqualifications d WHERE d.team_id = t${rank}.id)
      THEN 'true' ELSE 'false' END AS rank_${rank}_team_disqualified
  `,
  );
  const joins = ranks.map((rank) => `LEFT JOIN teams t${rank} ON t${rank}.id = b.rank_${rank}`);
  const rows = db
    .prepare(`
    SELECT b.voter_email, b.status, b.submitted_at AS updated_at, ${columns.join(",")}
    FROM ballots b ${joins.join(" ")}
    ORDER BY b.voter_email
  `)
    .all();
  return (
    [
      ballotColumns.join(","),
      ...rows.map((row) => ballotColumns.map((column) => csvCell(row[column])).join(",")),
    ].join("\r\n") + "\r\n"
  );
}

export function databaseSnapshot(db: DatabaseSync): Uint8Array<ArrayBuffer> {
  const directory = mkdtempSync(join(tmpdir(), "nova-export-"));
  try {
    const path = join(directory, "nova.db");
    // VACUUM INTO produces a standalone consistent snapshot, including WAL data.
    db.prepare("VACUUM INTO ?").run(path);
    return new Uint8Array(readFileSync(path));
  } finally {
    rmSync(directory, { recursive: true });
  }
}

export async function exportOrganizerData(
  db: DatabaseSync,
  request: Request,
  secret: string,
  format: "ballots" | "database",
): Promise<Response> {
  const valid = await verifySignature(
    "",
    request.headers.get("x-timestamp"),
    request.headers.get("x-signature"),
    secret,
  );
  if (!valid) {
    return Response.json(
      { error: "invalid signature" },
      {
        status: 401,
        headers: { "cache-control": "no-store" },
      },
    );
  }
  const csv = format === "ballots";
  return new Response(csv ? ballotCsv(db) : databaseSnapshot(db), {
    headers: {
      "cache-control": "no-store",
      "content-type": csv ? "text/csv; charset=utf-8" : "application/vnd.sqlite3",
      "content-disposition": `attachment; filename="${csv ? "ballots.csv" : "nova.db"}"`,
    },
  });
}
