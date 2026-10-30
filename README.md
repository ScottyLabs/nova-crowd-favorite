# Nova Crowd Favorite

<https://crowd-favorite.nova.scottylabs.org>

For a facilitated test session, use the [bug testing runbook](BUG_TESTING.md).

## Organizer commands

Run from this repository with Deno installed and the production
`SYNC_HMAC_SECRET` loaded from OpenBao. The commands sign requests and update
the deployed app. Have a maintainer prepare this repository, install Deno,
and load the secret into your terminal before the event. Keep that terminal
open and run the commands from this repository's folder. You do not need to
write API requests or use SQLite. Use the HTTPS event URL so in-app camera
access works on attendees' phones. Deployment and initial credentials are
maintainer setup; organizer commands do not deploy the app.

```sh
export APP_URL=https://crowd-favorite.nova.scottylabs.org

# Add voters and print their personal voting links.
deno task organizer voters person@example.com other@example.com

# Inspect voters, teams (including inactive teams), and saved ballots.
deno task organizer list-voters
deno task organizer list-teams
deno task organizer list-ballots

# Count submitted ballots with IRV; voting data is unchanged.
deno task organizer tally

# Recover access or correct a mistake.
deno task organizer reissue person@example.com
deno task organizer reset-ballot person@example.com
deno task organizer unlink-qr sticker-001
deno task organizer disqualify TEAM_ID 'Rule violation'
deno task organizer reinstate TEAM_ID

# Export ballots for manual review/counting and a complete database backup.
deno task organizer export-csv > ballots.csv
deno task organizer export-db > nova-backup.db

# Generate and register 50 stickers; print their codes and QR URLs.
deno task organizer qr 50

# Register codes that are already printed.
deno task organizer register-qr sticker-001 sticker-002

# Set the closing time, including the timezone.
deno task organizer close '2026-11-08T13:00:00-05:00'

# Reopen voting without unlocking submitted ballots.
deno task organizer open
```

Send voter links privately; the command does not send email. Existing voters
are rejected without changing their links.
A voter can rank up to five teams. Submitted ballots are locked unless an
organizer resets them.

Print each sticker as a QR containing its returned URL (`/t/<code>`).
A team member opens their voter link and uses "Scan my team" to claim one
sticker. Their email must match a team member email in the Sheet.

## Running the event

1. Confirm `APP_URL` points to the intended app, then run
   `deno task organizer list-teams`. An empty list means no teams are synced yet;
   an error means setup needs attention before the event.
1. Set up Sheet sync below and check `list-teams` again. Add voters with
   `voters EMAIL...` and send each returned personal link to that voter.
1. Generate stickers with `qr COUNT`. Turn each returned URL into a printed QR
   code. Team members open their personal link and use **Scan my team** to
   link a sticker; other voters scan it to collect and rank that team.
1. Set the closing time with `close`, including the timezone. After that time,
   run `tally`. Only submitted ballots count, so remind voters to submit.
1. Run `tally` to see the ranked team table, including shared places. Confirm
   the heading says **Final results** before announcing. **Provisional results**
   means voting is still open. No eligible submitted ballots produces a message
   instead of a ranking.
1. Save `export-csv` and `export-db` using the commands above. Keep both private.

`TEAM_ID` in recovery examples means the `id` from `list-teams`, not the team
name. `CODE` means a sticker's `code`, not its full URL. After a link reissue,
send the new URL to the voter; their old link stops working. After a ballot
reset, ask the voter to refresh and submit again before voting closes.

If commands report HTTP 401, ask a maintainer to check the secret and computer
clock. HTTP 404 or 405 on a documented endpoint can mean the app has not been
updated; changing the command will not deploy it. HTTP 409 when adding an
existing voter means their link was preserved; use `reissue` if they lost it.

## Sync teams

In the submission Sheet, open **Extensions > Apps Script** and paste
[scripts/apps-script.gs](scripts/apps-script.gs). Under **Project Settings >
Script Properties**, set:

| Property | Value |
| --- | --- |
| `SYNC_URL` | `https://crowd-favorite.nova.scottylabs.org/api/sync` |
| `SYNC_HMAC_SECRET` | Production secret from OpenBao |
| `SHEET_NAME` | Submission tab name |

Run `pushToApp`, authorize it, and add a recurring time-driven trigger.
Use headers `Timestamp`, `Team Name`, `Team Members`, and `Team Emails`.
Sync sends the whole Sheet: missing teams become inactive. Changing a team's
name or timestamp creates a new team identity.

## Organizer API

All requests use the same HMAC headers as team sync; the
[organizer command](scripts/organizer.ts) handles signing. Responses containing
voter links are private and must not be shared publicly.

| Method | Endpoint | JSON body |
| --- | --- | --- |
| GET | `/api/organizer/voters` | No body |
| GET | `/api/organizer/teams` | No body |
| GET | `/api/organizer/ballots` | No body |
| GET | `/api/organizer/tally` | No body; returns IRV results |
| GET | `/api/organizer/export/ballots` | No body; downloads CSV |
| GET | `/api/organizer/export/database` | No body; downloads SQLite database |
| POST | `/api/organizer/voters/reissue` | `{"email":"person@example.com"}` |
| DELETE | `/api/organizer/ballots` | `{"email":"person@example.com"}` |
| POST | `/api/organizer/qr-codes/unlink` | `{"code":"sticker-001"}` |
| PUT | `/api/organizer/teams/disqualification` | `{"teamId":"TEAM_ID","disqualified":true,"reason":"Rule violation"}` or `{"teamId":"TEAM_ID","disqualified":false}` |
| POST | `/api/organizer/voters` | `{"emails":["person@example.com"]}` |
| POST | `/api/organizer/qr-codes` | `{"codes":["sticker-001","sticker-002"]}` |
| PUT | `/api/organizer/voting` | `{"closesAt":"2026-11-08T13:00:00-05:00"}` or `{"closesAt":null}` |

Voter and sticker batches accept up to 1,000 entries. Registering an existing
sticker preserves its team claim. A past deadline closes voting immediately;
`null` reopens it. Only submitted ballots count; there is no results screen.

List requests sign an empty string as the body. They return `{ "voters": [...] }`,
`{ "teams": [...] }`, or `{ "ballots": [...] }`, with all records in a stable
order (email for voters and ballots, ID for teams). Empty lists return `[]`.
Voters include `email` and `createdAt`, never access codes or token hashes.
Teams include their ID, Sheet response ID, display fields, links, active status,
`disqualified`, `disqualificationReason` (null when eligible), and update time.
Ballots include `voterEmail`, `ranked` (ordered team IDs),
`status`, and `updatedAt` (last draft save or submission time). Both drafts and
submitted ballots are included; voters without a saved ballot have no ballot
entry. Treat these responses as private: they contain emails and voting choices.

### Data exports

Export requests use the same empty-body signatures as list requests. Both
responses are attachments with `Cache-Control: no-store`. The CLI writes the
file bytes to stdout; use the redirections above to save them.

The ballot CSV contains one row per saved ballot, ordered by voter email:
`voter_email`, `status`, `updated_at`, followed by `rank_N_team_id`,
`rank_N_team_name`, `rank_N_team_active`, and `rank_N_team_disqualified` for
ranks 1-5. Both status flags are `true` or `false`; unfilled ranks have empty
cells. Both drafts and submitted ballots are included, with inactive teams
preserved. Filter `status` to `submitted`
when counting votes, and skip disqualified teams. Voters who have never saved
a ballot have no row.
`updated_at` is the last draft save or submission time. Names and active
statuses reflect the database at export time. Spreadsheet formula-like cells
are prefixed with an apostrophe so they are treated as text; the database
snapshot preserves the original values.

The database export is a standalone, consistent SQLite snapshot of every table,
including committed writes in the WAL. It can be opened without accompanying
`-wal` or `-shm` files. It contains emails, credential hashes, private notes,
and ballots; keep it private. The CSV also contains emails and voting choices.
Neither export changes voting data or sends data back to the Sheet.

### Recovery operations

Recovery requests sign the exact JSON body, including the target email, code,
or team ID. Unknown targets return 404 and invalid inputs return 400.

Reissuing a voter link invalidates the previous link and preserves their
collections, ballot, and team claim. Send the new link privately.

Resetting a ballot removes its current draft or submission so the voter can
start again. The previous ranks, status, and timestamp are saved in
`ballot_resets`, included in database exports; the response returns `resetId`.
Collections and voter access are preserved. Resets do not reopen voting:
organizers may reset a ballot after closing, but the voter cannot save or submit
until voting is reopened. Repeating a reset before a new ballot exists returns 404.

Unlinking a sticker clears its claim and returns the previous team, claimant,
and claim time. The sticker can then be claimed again. Existing collections
and votes stay attached to their original team; unlinking does not rewrite them.
Unlinking an already-free sticker succeeds with a null previous claim.

Disqualification is reversible and stored separately from Sheet data, so sync
cannot clear it for the same team ID. It removes the team from voter collections
and prevents saving new rankings containing it. Existing collections, notes,
and ballot rankings are preserved in the database. Reinstating restores access
for active teams. Disqualification does not submit, reset, or rewrite ballots;
existing drafts may still be submitted with those rankings preserved. The team
list includes the decision and reason, and each CSV rank includes the current
disqualification flag. Reasons are optional and accept up to 1,000 characters.

### Ranked-choice tally (IRV)

Run `deno task organizer tally` to rank teams by rerunning IRV for each place.
The first election selects first place. That team is removed from every ballot,
then a fresh election selects second place, and so on. Teams eliminated within
one election are reconsidered for later places. This can give different lower
places from reversing the elimination order of a single election.

The endpoint is read-only and signs an empty body like the list endpoints.
It reads ballots, teams, disqualifications, and the deadline from one database
snapshot. It does not close voting or store a final result.

In each election, a round counts a ballot for its highest-ranked remaining
candidate. A team wins that place with strictly more than half of the continuing
(non-exhausted) ballots. Otherwise, the unique lowest-count team is eliminated
and its ballots transfer to their next remaining preference. Ballots with no
remaining preference are exhausted and excluded from the majority denominator.

Disqualified teams are skipped, allowing their ballots to transfer. Inactive
teams remain eligible: removal from the Sheet is not disqualification.
Candidates are eligible teams appearing anywhere in submitted rankings;
unranked teams do not participate. Drafts and archived reset ballots never count.

If multiple teams tie for elimination, consider each possible tied-lowest
elimination and continue counting in each case. This is
[IRV with parallel-universe tiebreaking](https://pref-voting.readthedocs.io/en/latest/iterative_methods.html#instant-runoff-put).
A team shares the current place only if it can actually win that election under
one of those elimination orders. A tie for the fewest votes is not itself a win.
Zero-vote teams are eliminated safely, and exhausted ballots are excluded from
the majority denominator.

After finding the winner or tied winning group, remove that entire group from
all ballots and run a fresh election for the next place. Teams eliminated during
that election remain eligible for later places. Shared places use competition
ranking: two teams sharing first are followed by third (1, 1, 3).
No eligible preferences returns an empty `ranking`.

The tally memoizes repeated candidate sets and safely eliminates groups whose
combined votes are below every other team's count. If an election still exceeds
20,000 candidate sets or needs recursive tie handling with more than 128 remaining
teams, the endpoint returns HTTP 422 without a ranking. It does not choose an
arbitrary tiebreak or return incomplete results.

The JSON response contains only:

- `generatedAt`: the timestamp of this tally.
- `provisional`: `true` while voting is open; `false` once the closing deadline
  has passed. Reopening voting makes subsequent tallies provisional.
- `submittedBallots`: the number of submitted ballots, including those with no
  eligible preferences remaining.
- `ranking`: the ordered results, each with `rank`, `teamId`, and `name`.
  Shared places have the same rank.

Names and eligibility reflect the database snapshot used for that tally.

#### Read and save results

With `APP_URL` and `SYNC_HMAC_SECRET` loaded for the intended app, run:

```bash
deno task organizer tally
```

The command displays a table with a final/provisional heading and submitted
ballot count, for example:

```text
Final results · 42 submitted ballots

Rank  Team
1     Team Aurora
1     Team Beacon
3     Team Comet

Shared rank 1: Team Aurora, Team Beacon
```

The heading says **Provisional results** while voting is open. Shared places
use 1, 1, 3 numbering and contain possible IRV winners for that place, never
candidates promoted simply because they tied for elimination.

To save the same results as JSON, use:

```bash
deno task organizer tally --json > results.json
```

This saves a snapshot for review. Rerun the command if ballots, voting, or
eligibility have changed. The API returns the same compact JSON response.
