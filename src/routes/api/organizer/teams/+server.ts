import { addOrganizerTeam } from "../../../../lib/server/organizer-team-add";
import { db } from "../../../../lib/server/db";
import { listOrganizerRecords } from "../../../../lib/server/organizer";

export function GET({ request }: { request: Request }) {
  return listOrganizerRecords(db, request, process.env.SYNC_HMAC_SECRET ?? "", "teams");
}

export function POST({ request }: { request: Request }) {
  return addOrganizerTeam(db, request, process.env.SYNC_HMAC_SECRET ?? "");
}
