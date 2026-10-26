import { db } from "../../../../../lib/server/db";
import { exportOrganizerData } from "../../../../../lib/server/organizer-export";

export function GET({ request }: { request: Request }) {
  return exportOrganizerData(db, request, process.env.SYNC_HMAC_SECRET ?? "", "ballots");
}
