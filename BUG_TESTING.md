# Local bug testing

## Start the app

From this repository:

```bash
deno install
bash scripts/bug-test.sh
```

The script uses a new database under `/tmp`. It does not change the project's
`nova.db`. Keep this terminal open. Stop the app with Ctrl+C.

Open <http://127.0.0.1:5174/api/dev/seed> once to add demo teams and a demo voter.
Opening it again resets the demo voter's ballot, collection, and sticker claims,
and reopens voting.

## Add voters and share links

Open a second terminal in this repository. Run the `source /tmp/.../organizer-env.sh`
command printed by the script, then add your testers:

```bash
deno task organizer voters alice@example.com bob@example.com
```

The command prints a personal voting link for each email. Send each person their
own link; the app does not send emails. Testers should open their link in the
browser they will use for testing. Use separate browser profiles when testing
multiple voters on one computer.

To replace a lost link:

```bash
deno task organizer reissue alice@example.com
```

Send the new link to the voter. The old one stops working.

## Collect teams and vote

Open these sticker links after opening a voting link:

- `http://127.0.0.1:5174/t/qr-dev-t2`
- `http://127.0.0.1:5174/t/qr-dev-t3`
- `http://127.0.0.1:5174/t/qr-dev-t4`
- `http://127.0.0.1:5174/t/qr-dev-t5`
- `http://127.0.0.1:5174/t/qr-dev-t6`

Ask testers to collect teams, add notes, rank their favorites, and submit.
Submitted ballots lock. To let someone vote again:

```bash
deno task organizer reset-ballot alice@example.com
```

To inspect ballots and results:

```bash
deno task organizer list-ballots
deno task organizer tally
```

Have testers report what they did, what went wrong, and their browser/device.

These links work on the computer running the app. Phone testing needs HTTPS
access to that computer and links using its HTTPS address.
