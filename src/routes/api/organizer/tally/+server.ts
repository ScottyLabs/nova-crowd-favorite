import { db } from "../../../../lib/server/db";
import { tallyVotes } from "../../../../lib/server/organizer-tally";

export function GET({ request }: { request: Request }) {
  return tallyVotes(db, request, process.env.SYNC_HMAC_SECRET ?? "");
}
