import { db } from "../../../../lib/server/db";
import { addVoters } from "../../../../lib/server/organizer";

export function POST({ request }: { request: Request }) {
  return addVoters(db, request, process.env.APP_URL, process.env.SYNC_HMAC_SECRET ?? "");
}
