import { db } from "../../../../lib/server/db";
import { setVotingDeadline } from "../../../../lib/server/organizer";

export function PUT({ request }: { request: Request }) {
  return setVotingDeadline(db, request, process.env.SYNC_HMAC_SECRET ?? "");
}
