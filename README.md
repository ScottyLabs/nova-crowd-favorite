# Nova Crowd Favorite

<https://crowd-favorite.nova.scottylabs.org>

## Organizer commands

Run from this repository with Deno installed and the production
`SYNC_HMAC_SECRET` loaded from OpenBao. The commands sign requests and update
the deployed app.

```sh
export APP_URL=https://crowd-favorite.nova.scottylabs.org

# Add voters and print their personal voting links.
deno task organizer voters person@example.com other@example.com

# Inspect voters, teams (including inactive teams), and saved ballots.
deno task organizer list-voters
deno task organizer list-teams
deno task organizer list-ballots

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
A voter can rank up to five teams, and submitting is final.

Print each sticker as a QR containing its returned URL (`/t/<code>`).
A team member opens their voter link and uses "Scan my team" to claim one
sticker. Their email must match a team member email in the Sheet.

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
| GET | `/api/organizer/export/ballots` | No body; downloads CSV |
| GET | `/api/organizer/export/database` | No body; downloads SQLite database |
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
and update time. Ballots include `voterEmail`, `ranked` (ordered team IDs),
`status`, and `updatedAt` (last draft save or submission time). Both drafts and
submitted ballots are included; voters without a saved ballot have no ballot
entry. Treat these responses as private: they contain emails and voting choices.

### Data exports

Export requests use the same empty-body signatures as list requests. Both
responses are attachments with `Cache-Control: no-store`. The CLI writes the
file bytes to stdout; use the redirections above to save them.

The ballot CSV contains one row per saved ballot, ordered by voter email:
`voter_email`, `status`, `updated_at`, followed by `rank_N_team_id`,
`rank_N_team_name`, and `rank_N_team_active` for ranks 1-5. Active status is
`1` or `0`; unfilled ranks have empty cells. Both drafts and submitted ballots
are included, with inactive teams preserved. Filter `status` to `submitted`
when counting votes. Voters who have never saved a ballot have no row.
`updated_at` is the last draft save or submission time. Names and active
statuses reflect the database at export time. Spreadsheet formula-like cells
are prefixed with an apostrophe so they are treated as text; the database
snapshot preserves the original values.

The database export is a standalone, consistent SQLite snapshot of every table,
including committed writes in the WAL. It can be opened without accompanying
`-wal` or `-shm` files. It contains emails, credential hashes, private notes,
and ballots; keep it private. The CSV also contains emails and voting choices.
Neither export changes voting data or sends data back to the Sheet.
