# Nova Crowd Favorite

<https://crowd-favorite.nova.scottylabs.org>

## Organizers

Open `/organizer`. From this repository, fetch the production password:

```sh
deno task password --profile prod
```

`deno task password` uses your current SecretSpec profile, normally `dev`.
Passwords are stored in OpenBao. To rotate one, run
`collar secrets set ORGANIZER_PASSWORD --profile prod --provider openbao`.
Rotation signs everyone out. A missing password keeps the dashboard locked.

- **Voters:** select hackers by name or email, or select all, and copy personal links.
  Hackers who already have voter links are excluded. Search by email, team, or
  ranked team; filter by ballot status. **Manage** shows the ballot and offers
  **Reset ballot** and **Replace voter link**.
- **Teams:** search names and members. **Edit** changes the name or eligibility.
- **QR codes:** create codes, print one per page, or release a team's claim.
- **Results:** calculate ranks from submitted ballots. Shared ranks are ties.
- **Settings:** set or clear the closing time, close or reopen voting, and back up or
  restore the database.

Before the event, check teams, add voters, print QR codes, and set the closing
time. After closing, calculate results and download the ballots and database.
Use **Refresh** to reload lists and voting status.

**Live leaderboard** opens a screen for the event board. It shows the top 10
named voters by unique teams collected and updates every 10 seconds. Ties share a
rank. It uses the organizer sign-in; keep that browser signed in on the display.

Send each voter their own link; the app does not send emails. Replacing a link
invalidates the old one. A reset archives the ballot and preserves the voter's
collection and link. Voting must be open for them to submit again.

Team membership comes from the submission Sheet. A voter's email must match a
member email to claim a QR code. Sticker numbers do not need to match voter
links. Names edited in the dashboard survive Sheet sync.

For a local session with a disposable database, see [BUG_TESTING.md](BUG_TESTING.md).
That script generates its own password instead of using OpenBao.

## Offline use

After opening the app online, voters can edit notes and draft rankings offline.
Changes stay in this browser and sync when the connection returns. The save
status shows whether they are stored locally or confirmed by the server.
Submission, scanning, and claiming QR codes require a connection.

Offline refresh works for cached pages in a production build. Keep the tab open
if visiting a team for the first time offline. Clearing browser data removes
unsynced changes. The organizer dashboard is not cached.

## Database recovery

In **Settings**, download a backup or restore one from the same app version.
Restores replace all event data and save the current database on the server
first. Failed imports roll back. Backups contain access hashes and private
notes; keep them private.

If the app cannot start, stop its service and run this on the server:

```sh
deno task restore nova-backup.db /path/to/nova.db --offline
```

The command validates the backup, keeps the old database and its WAL/SHM files
in a private directory alongside it, and restores them if replacement fails.
Restart the service afterward. Never run this while the app is running.

The existing [organizer CLI](scripts/organizer.ts) also works while the app is
running. It needs `APP_URL` and that deployment's `SYNC_HMAC_SECRET`:

```sh
deno task organizer export-db > nova-backup.db
deno task organizer reset-ballot person@example.com
```

## Team sync

In the submission Sheet, open **Extensions > Apps Script** and paste
[scripts/apps-script.gs](scripts/apps-script.gs). Set these Script Properties:

| Property | Value |
| --- | --- |
| `SYNC_URL` | `https://crowd-favorite.nova.scottylabs.org/api/sync` |
| `SYNC_HMAC_SECRET` | Production secret from OpenBao |
| `SHEET_NAME` | Submission tab name |

Use headers `Timestamp`, `Team Name`, `Team Members`, and `Team Emails`.
Check-in forms with repeated `Name` and `Email` columns are also supported;
each member column is imported, and unlabeled helper columns are ignored.
Adjacent `Name`/`Email` pairs also populate hacker names and use the check-in
timestamp. This lets check-in supply both teams and hacker names without the
registration spreadsheet. Blank member names leave saved hacker names intact.
Run `pushToApp`, authorize it, and add a recurring time-driven trigger.
Sync sends the whole Sheet. Missing teams become inactive. Changing a name or
timestamp in the Sheet creates a new team identity; rename through the
dashboard to keep the same team.

## Check-in hackers

The check-in Sheet is the source of both teams and hacker names. Each adjacent
`Name`/`Email` pair supplies a hacker, matched by email ignoring case. The Hackers
list and voter picker show members of current check-in teams. The **Checked in**
column shows the team's check-in timestamp.

The old registration sync endpoint is retired and returns HTTP 410. Disable its
Apps Script trigger. On upgrade, unused registration-only identities are removed
once, with a private recovery copy saved beside the production database first.
Records referenced by teams, ballots, collections, or claimed QR codes are kept.
Check-in sync updates names without changing existing voter links or ballots.

### Team check-in spreadsheet

In the team check-in spreadsheet, open **Extensions > Apps Script** and paste
[scripts/apps-script.gs](scripts/apps-script.gs). Set these Script Properties:

| Property | Value |
| --- | --- |
| `SYNC_URL` | `https://crowd-favorite.nova.scottylabs.org/api/sync` |
| `SYNC_HMAC_SECRET` | Existing production secret from OpenBao |
| `SHEET_NAME` | `Form Responses 1` |

Retrieve the secret from this repository:

```sh
secretspec get SYNC_HMAC_SECRET --profile prod --provider openbao --reason 'Configure team spreadsheet sync'
```

Run `pushToApp`, authorize it, and check for a
200 response in the execution log. Then add a time-driven trigger for
`pushToApp` every five minutes. The script only reads spreadsheet cells.
Disable the registration spreadsheet's old trigger; it is no longer used.

## Results and exports

Each place runs a fresh IRV election. A majority of continuing ballots wins;
otherwise the lowest team is eliminated and its votes transfer. Exhausted
ballots leave the majority denominator. Tied eliminations use
[parallel-universe tiebreaking](https://pref-voting.readthedocs.io/en/latest/iterative_methods.html#instant-runoff-put):
a team shares a place if it can win under a possible tied elimination order.
Remove the winning group, then repeat for the next place. Shared places use
competition ranking: 1, 1, 3.

Only submitted ballots count. Disqualified teams are skipped; inactive teams
still count. Drafts, reset ballots, and unranked teams do not participate.
Results are provisional while voting is open. Recalculate after any changes.
The tally stops with an error if its tie search exceeds 20,000 candidate sets
or requires recursive tie handling with more than 128 remaining teams.

To save results from the CLI:

```sh
deno task organizer tally --json > results.json
```

Ballot CSV exports include drafts and submissions, rank IDs and names, and
current eligibility flags. A database export includes every table and committed
WAL writes; it needs no accompanying WAL/SHM files. Both exports are private.
Organizer API requests use the same HMAC authentication as Sheet sync; the CLI
handles signing. See [the API routes](src/routes/api/organizer) for endpoints.
