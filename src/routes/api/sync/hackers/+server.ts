import { json, readBody } from "../../../../lib/server/organizer";

export async function POST({ request }: { request: Request }) {
  const input = await readBody(request, process.env.SYNC_HMAC_SECRET ?? "");
  if (input instanceof Response) return input;
  return json(
    { error: "Registration sync is retired. Sync the check-in spreadsheet to /api/sync." },
    410,
  );
}
