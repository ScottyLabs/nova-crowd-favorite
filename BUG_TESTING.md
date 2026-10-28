# Nova Crowd Favorite bug testing session

Allow 65 minutes, plus setup. Test sticker claims, team collection, notes,
rankings, submission, and organizer controls.

## Local setup

Run from this repository with Deno installed (the project's devenv shell includes
it). Install dependencies if needed with `deno install`, then start:

```bash
bash scripts/bug-test.sh
```

The script creates a database in `/tmp/nova-bug-test.*` and sets `DATABASE_PATH`
to that file. It also sets a local `APP_URL` and signing secret. The project's
`nova.db` is unchanged. Port 5174 must be free.

1. Open the `links.html` file printed by the script in your browser. It lists
   six personal voter links, five linked team stickers, three free stickers,
   and an unknown sticker for error testing. Click your assigned voter link first.

1. In a second terminal, run the `source /tmp/.../organizer-env.sh` command printed
   by the script. From this repository, check:

   ```bash
   deno task organizer list-teams
   deno task organizer list-voters
   ```

   Expect seven teams (`test-t1` through `test-t7`) and six voters
   (`tester1@example.com` through `tester6@example.com`). All collections start
   empty. Testers 1 and 2 belong to teams 1 and 2; testers 3-6 have no team.

1. Assign one voter per tester/browser profile. For a small session, tester 1
   handles team claims, tester 2 handles competing claims, tester 3 completes the
   main tests, tester 4 submits a short ballot, tester 5 keeps a draft, and
   tester 6 checks empty-ballot behavior. One person can use separate browser
   profiles for multiple roles. Opening a different voter link in the same
   profile switches its identity.

1. During test 02, have testers 1 and 2 claim `test-free-1` and
   `test-free-2` for their own teams (leave them free until then).
   Then all seven teams have stickers, so each team member can collect six other
   teams. Keep `test-free-3` unclaimed for error checks. For camera tests, encode
   the full sticker URLs from `links.html` as QRs on a second screen or paper;
   for desktop checks, simply click those links.

1. Stop the server with Ctrl+C. To start over, run the script again and use the
   **new** links file and organizer environment. Do not visit `/api/dev/seed`:
   that endpoint replaces some of the test data.

1. Session files remain in the printed temporary directory until removed or the
   system clears temporary files. Keep that directory for review, or delete only
   that specific directory after stopping the server.

For phone tests, ask a maintainer to set up HTTPS access to the local server.
Use that HTTPS address in voter links and QR codes. A phone cannot reach your
computer at `127.0.0.1`, and the in-app camera requires HTTPS outside localhost.
Skip phone tests until HTTPS is set up and mark them as blocked.

## Before people arrive

- Record the app URL, commit, session time, and where to file bugs.
- Assign the voter links. The script creates seven teams and six voters.
- For camera tests, prepare sticker QR codes and an unrelated QR code on paper
  or a second screen.
- Have someone run the organizer commands. Check that `APP_URL` points to the
  local server and `list-teams` shows the test teams.
- Include iPhone/Safari, Android/Chrome, and desktop keyboard tests where possible.
  Record each tester's device, OS, and browser.
- Track each test: ID, tester, device/browser, result, and bug link. Use
  Pass, Fail, Blocked, or Not run.

Keep voting links and organizer credentials private. Hide voting codes, emails,
and other testers' votes in screenshots.

## Introduction (5 minutes)

> Use your assigned test account and stickers. Follow the tasks first, then try
> other actions.
> Say when something is confusing, even if it eventually works. When you find a
> problem, record what you did and what happened before changing anything else.
> Wait until I ask you to submit. Once submitted, ballots lock. I'll tell everyone
> before closing voting.

Choose someone to record bugs and someone to run organizer commands. Let testers
try the tasks before helping them. Record where they get stuck.

## Main tests (25 minutes)

Run these in order. Ask testers to record the names and order they expect before
refreshing or submitting, so they can compare against saved results.

| ID | Task | Expected result |
| --- | --- | --- |
| 01 | In a fresh browser profile, open the app without a personal link. Then open your assigned link. | The app first asks for a voting link; the personal link opens your collection. A new voter has no teams. |
| 02 | As a team member, use **Scan my team** on an unclaimed sticker. Cancel once, then scan again and confirm. | The confirmation names your team. Cancel leaves the sticker unclaimed. Confirm links it to your team. |
| 03 | Try the same sticker again, another team's claimed sticker, and a second free sticker for your already-linked team. Have the non-team voter open `http://127.0.0.1:5174/link/test-free-3` to try claiming a free sticker. | Clear messages distinguish already yours, taken by another team, team already has a sticker, and voter has no team. No existing claim changes. |
| 04 | Use **Scan a team** to collect at least six other teams. Scan one twice. Team members also scan their own sticker. | Each other team appears once; duplicate scans say it is already collected. Your own team cannot be collected or ranked. |
| 05 | Scan an unrelated QR, open an unknown sticker URL, and scan a registered but unclaimed sticker. | No unrelated team is added. The scanner rejects unrelated QRs. Unknown codes show an error; unclaimed codes explain they need linking. An eligible team member may instead get a claim confirmation. |
| 06 | Deny camera permission. Return to the collection, enable permission in browser settings, and try again. Also scan a team with the phone's camera app, opening the URL in the browser where you opened your voting link. | Denial shows guidance and a way back. Scanning works after permission is restored. Opening the camera app's link adds the correct team. |
| 07 | Add five teams to your top five. Drag to reorder, then drag one into the Collection section. Add it back. | Ranks stay numbered in order without duplicates, never exceed five, and match your actions. Removed teams remain in your collection. Refresh keeps the saved order. |
| 08 | With five ranked teams, open the sixth team's detail page and select rank 2. Then choose "-" to unrank it. | It inserts at #2, shifts other teams down, and moves the old #5 into the collection with a notice. Unranking leaves no gap. |
| 09 | Add a note with punctuation and emoji. Wait for **Saved**, leave, and reopen. Try the 500-character limit. Also type and immediately tap **Done**. | Saved text remains for the same voter. The note cannot exceed 500 characters. Done saves the latest text before returning. A different voter does not see your note. |
| 10 | Refresh and close/reopen the browser. On desktop, use Tab and the arrow keys on a focused rank grip. On phones, check scrolling, landscape, and enlarged text. | Saved collection, notes, and ranks remain saved in the same browser profile. Keyboard reorder works. Controls remain readable and reachable without obstructing the ballot. |
| 11 | When asked, submit. Pause after the first tap; confirm with the second. Refresh and try browser Back or a team-detail URL. | First tap asks for confirmation. Second tap shows **Ballot submitted** with the order you chose. The ballot remains locked after navigation or refresh. |

Have one tester submit only one or two ranked teams: ranking all five is optional.
Have another check that an empty ballot cannot be submitted. Keep one voter in
draft for the closing test.

## Additional tests (10 minutes)

Assign different areas so everyone does not repeat the same path:

- **Slow or lost connection:** disconnect while changing ranks or notes, then
  reconnect and retry. Check that errors appear. Refresh to see which changes saved.
- **Fast actions:** rapidly change ranks, drag several times, or tap submit
  repeatedly. Compare the final screen with a refresh and the organizer's saved
  ballot. Watch for lost updates, duplicates, or an unintended order.
- **Navigation:** use two tabs for the same test voter, switch apps while typing
  a note, and use browser Back/Forward. Record any stale display or overwritten
  changes with the action sequence from both tabs.
- **Two teams claiming one sticker:** have two different teams confirm the same free sticker
  at nearly the same time. Run this after the main tests: first use
  `deno task organizer unlink-qr test-free-1` and
  `deno task organizer unlink-qr test-free-2` to free both teams' claims, then
  have testers 1 and 2 compete for `test-free-3`. Only one team should claim it. The other should see that it is taken. Check
  the claim by scanning as another voter.

## Organizer tests (15 minutes)

Tell testers before making changes. Use the test emails, team IDs, and sticker
codes listed above. Commands are below.

| ID | Organizer action and tester check | Expected result |
| --- | --- | --- |
| 12 | Reissue a test voter's link. Try the old and new links in fresh browser profiles. | Old link fails; new link works and preserves the voter's collection, notes, ballot, and team claim. |
| 13 | Reset a submitted test ballot; have the voter refresh and rank again. | Ballot becomes editable while voting is open. Collection remains; previous rankings are cleared. |
| 14 | Unlink a test sticker, then let another team claim it. | Existing collections and votes still refer to the original team. Future scans resolve to the new claimant. |
| 15 | Disqualify a collected team, refresh as a voter, then reinstate it. | The team disappears from the visible collection while disqualified and returns when reinstated if active. New rankings cannot include it while disqualified. |
| 16 | Run `list-ballots` and `tally` while open. | Saved draft/submitted states match tester records. Tally is **Provisional** and counts only submitted ballots. |
| 17 | Announce closing, set a near-future deadline with an explicit timezone, and let it pass. Have the draft voter attempt to save and submit, including from an already-open page. | Late ballot changes are rejected and the app shows voting closed. Tally says **Final results**. A deadline does not automatically submit drafts. |
| 18 | Reopen voting; refresh as draft and submitted voters. | Draft voter can continue. Previously submitted ballots remain locked. Subsequent tallies are provisional. |
| 19 | Export CSV and database to private files. Compare the CSV with recorded test ballots. | Both exports succeed. CSV distinguishes drafts from submissions and preserves rank order. A maintainer verifies the database snapshot opens. |

To check the tally, use a new session before other testers submit. As
tester 3, collect teams 3, 4, and 5, rank them in that order, and submit.
`deno task organizer tally` should show Comet first, Dreamloom second,
and Echo Chamber third, with one submitted ballot. Restart with a new session for
additional tie cases using the documented [IRV rules](README.md#ranked-choice-tally-irv).
Inactive teams remain eligible; disqualified teams are skipped. Existing draft
rankings containing a later disqualified team may still be submitted.

### Copy-and-paste organizer commands

Use the second terminal where you sourced this session's environment. Run one
operation at a time, with the tester ready to check the result.
Reissuing prints a new link: give it to the tester and stop using the old link.
The script creates the voters, team, and sticker used below.

```bash
# Inspect and tally.
deno task organizer list-ballots
deno task organizer tally

# Recovery (coordinate with testers before each command).
deno task organizer reissue tester6@example.com
deno task organizer reset-ballot tester3@example.com
deno task organizer unlink-qr test-free-1
deno task organizer disqualify test-t3 'Testing disqualification'
deno task organizer reinstate test-t3

# Close immediately, check blocked writes, then reopen.
deno task organizer close '2000-01-01T00:00:00Z'
deno task organizer tally
deno task organizer open
```

For test 17, the past date above is the command to close voting immediately. To test the deadline, replace it with a time a minute ahead, including your timezone offset.
Save exports in `/tmp` from the repository terminal:

```bash
deno task organizer export-csv > /tmp/nova-test-ballots.csv
deno task organizer export-db > /tmp/nova-test-backup.db
```

These two filenames are overwritten when reused. Keep exports private.

## Bug report template

```text
Title: [device/browser] Short description of the failure
Test ID:
Test deployment and version/commit:
Time and timezone:
Device / OS / browser version:
Test voter (do not paste the personal voting link):
Starting state: draft/submitted, collected teams, camera permission, connection
Steps to reproduce:
1.
2.
3.
Expected result:
Actual result:
Frequency: e.g. 2 of 3 attempts
Impact: blocker / major / minor
Evidence: redacted screenshot or recording; test team/sticker codes
Workaround, if any:
```

Use **blocker** for inability to complete voting, wrong/lost submitted rankings,
unauthorized access, or accepting late ballot changes; **major** for broken core
behavior with a workaround; **minor** for visual or wording issues that do not
prevent the task. Report confusing instructions too.

## Finish (5 minutes)

1. Review failed and blocked tests. Combine duplicate reports, keep device
   details, and assign someone to each bug.
1. Prioritize bugs that prevent voting or save the wrong ballot.
1. List tests and devices you did not cover.
1. Save the checklist and screenshots. Record whether voting is open or closed
   and which test data changed.
1. After a fix, repeat the failed test and refresh to check that changes saved.
   Resolve voting blockers before the event.
