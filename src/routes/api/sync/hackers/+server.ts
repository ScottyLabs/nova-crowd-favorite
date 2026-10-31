import { db } from "../../../../lib/server/db";
import { syncHackers } from "../../../../lib/server/hackers";
import { isRecord, json, readBody } from "../../../../lib/server/organizer";

export async function POST({ request }: { request: Request }) {
  const input = await readBody(request, process.env.SYNC_HMAC_SECRET ?? "");
  if (input instanceof Response) return input;
  const body = input.body;
  if (
    !isRecord(body) ||
    !Array.isArray(body.rows) ||
    !body.rows.every(
      (row: unknown): row is string[] =>
        Array.isArray(row) && row.every((cell: unknown) => typeof cell === "string"),
    )
  )
    return json({ error: "rows must be string[][]" }, 400);
  try {
    return json(syncHackers(db, body.rows));
  } catch (cause) {
    return json({ error: cause instanceof Error ? cause.message : "Name sync failed." }, 400);
  }
}
