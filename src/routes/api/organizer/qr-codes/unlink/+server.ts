import { db } from "../../../../../lib/server/db";
import { unlinkQrCode } from "../../../../../lib/server/organizer-recovery";

export function POST({ request }: { request: Request }) {
  return unlinkQrCode(db, request, process.env.SYNC_HMAC_SECRET ?? "");
}
