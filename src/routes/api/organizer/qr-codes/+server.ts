import { db } from "../../../../lib/server/db";
import { registerQrCodes } from "../../../../lib/server/organizer";

export function POST({ request }: { request: Request }) {
  return registerQrCodes(db, request, process.env.APP_URL, process.env.SYNC_HMAC_SECRET ?? "");
}
