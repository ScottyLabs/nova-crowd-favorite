import { db } from "../../../../../lib/server/db";
import { reissueVoter } from "../../../../../lib/server/organizer-recovery";

export function POST({ request }: { request: Request }) {
  return reissueVoter(db, request, process.env.APP_URL, process.env.SYNC_HMAC_SECRET ?? "");
}
