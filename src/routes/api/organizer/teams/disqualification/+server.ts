import { db } from "../../../../../lib/server/db";
import { setDisqualification } from "../../../../../lib/server/organizer-recovery";

export function PUT({ request }: { request: Request }) {
  return setDisqualification(db, request, process.env.SYNC_HMAC_SECRET ?? "");
}
