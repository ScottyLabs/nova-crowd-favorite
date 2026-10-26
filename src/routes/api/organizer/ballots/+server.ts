import { db } from "../../../../lib/server/db";
import { resetBallot } from "../../../../lib/server/organizer-recovery";
import { listOrganizerRecords } from "../../../../lib/server/organizer";

export function GET({ request }: { request: Request }) {
  return listOrganizerRecords(db, request, process.env.SYNC_HMAC_SECRET ?? "", "ballots");
}

export function DELETE({ request }: { request: Request }) {
  return resetBallot(db, request, process.env.SYNC_HMAC_SECRET ?? "");
}
