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

- **Voters:** add emails and copy personal links. Search by email, team, or
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

Send each voter their own link; the app does not send emails. Replacing a link
invalidates the old one. A reset archives the ballot and preserves the voter's
collection and link. Voting must be open for them to submit again.

Team membership comes from the submission Sheet. A voter's email must match a
member email to claim a QR code. Sticker numbers do not need to match voter
links. Names edited in the dashboard survive Sheet sync.

For a local session with a disposable database, see [BUG_TESTING.md](BUG_TESTING.md).
That script generates its own password instead of using OpenBao.

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
Run `pushToApp`, authorize it, and add a recurring time-driven trigger.
Sync sends the whole Sheet. Missing teams become inactive. Changing a name or
timestamp in the Sheet creates a new team identity; rename through the
dashboard to keep the same team.

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
