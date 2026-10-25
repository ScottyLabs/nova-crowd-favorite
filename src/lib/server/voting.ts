import { db } from "./db";

export const CLOSES_AT_KEY = "voting_closes_at";

// Organizers set the deadline through /api/organizer/voting.
const selectClosesAt = db.prepare("SELECT value FROM settings WHERE key = ?");

/** True once the close time has passed. A missing or unreadable time leaves voting open. */
export function isVotingClosed(now: Date = new Date()): boolean {
  const row = selectClosesAt.get(CLOSES_AT_KEY);
  if (row === undefined || typeof row.value !== "string") return false;
  const closesAt = Date.parse(row.value);
  if (Number.isNaN(closesAt)) {
    console.error(`settings.${CLOSES_AT_KEY} is not a valid date: ${row.value}`);
    return false;
  }
  return now.getTime() >= closesAt;
}

/** Standard 403 for changes after voting closed. The app shows screen 6 when it sees this. */
export function votingClosedResponse(): Response {
  return Response.json({ kind: "voting-closed", error: "voting has closed" }, { status: 403 });
}
