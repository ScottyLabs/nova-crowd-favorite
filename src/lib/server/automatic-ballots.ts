import type { DatabaseSync } from "node:sqlite";
import { eligibleVoterSql } from "./voter-eligibility.ts";

const prefix = "automatic_ballot:";

/** Finalize saved drafts at closing; reopen only ballots finalized by this mechanism. */
export function reconcileAutomaticBallots(db: DatabaseSync, now = Date.now()): void {
  const deadline = db
    .prepare("SELECT value FROM settings WHERE key = 'voting_closes_at'")
    .get()?.value;
  const closed = typeof deadline === "string" && now >= Date.parse(deadline);
  if (
    !closed &&
    !db.prepare("SELECT 1 FROM settings WHERE key GLOB 'automatic_ballot:*' LIMIT 1").get()
  )
    return;
  db.exec("BEGIN IMMEDIATE");
  try {
    if (closed) {
      db.prepare(`INSERT OR REPLACE INTO settings (key, value)
        SELECT ? || voter_email, json_object('draftUpdatedAt', submitted_at, 'closedAt', ?)
        FROM ballots WHERE status = 'draft' AND rank_1 IS NOT NULL
          AND ${eligibleVoterSql("ballots.voter_email")}`).run(prefix, deadline);
      db.prepare(`UPDATE ballots SET status = 'submitted', submitted_at = ?
        WHERE status = 'draft' AND EXISTS (SELECT 1 FROM settings
          WHERE key = ? || ballots.voter_email)`).run(deadline, prefix);
    } else {
      db.prepare(`UPDATE ballots SET status = 'draft', submitted_at =
        (SELECT json_extract(value, '$.draftUpdatedAt') FROM settings WHERE key = ? || ballots.voter_email)
        WHERE status = 'submitted' AND submitted_at =
        (SELECT json_extract(value, '$.closedAt') FROM settings WHERE key = ? || ballots.voter_email)`).run(
        prefix,
        prefix,
      );
      db.exec("DELETE FROM settings WHERE key GLOB 'automatic_ballot:*'");
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

/** Poll even without traffic; request-time reconciliation also covers restarts and timer delays. */
export function watchVotingDeadline(db: DatabaseSync): ReturnType<typeof setInterval> {
  reconcileAutomaticBallots(db);
  const timer = setInterval(() => {
    try {
      reconcileAutomaticBallots(db);
    } catch (error) {
      console.error("Automatic ballot submission failed", error);
    }
  }, 1000);
  timer.unref();
  return timer;
}
