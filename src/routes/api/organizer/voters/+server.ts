import { db } from "../../../../lib/server/db";
import { addVoters, listOrganizerRecords } from "../../../../lib/server/organizer";

export function GET({ request }: { request: Request }) {
  return listOrganizerRecords(db, request, process.env.SYNC_HMAC_SECRET ?? "", "voters");
}

export function POST({ request }: { request: Request }) {
  return addVoters(db, request, process.env.APP_URL, process.env.SYNC_HMAC_SECRET ?? "");
}
