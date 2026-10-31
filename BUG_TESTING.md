# Local bug testing

## Start

From this repository:

```sh
deno install
bash scripts/bug-test.sh
```

The app uses a new database under `/tmp` and leaves the project's `nova.db`
alone. Keep the terminal open; stop with Ctrl+C.

Open <http://127.0.0.1:5174/api/dev/seed> once to add demo teams and a voter.
Opening it again resets that voter's ballot, collection, and sticker claims,
and reopens voting. The demo voter starts with five collected teams; newly
added voters start empty.

## Organizer access

In a second terminal, run the `source /tmp/.../organizer-env.sh` command printed
by the script. Show the local password:

```sh
printf '%s\n' "$ORGANIZER_PASSWORD"
```

Open <http://127.0.0.1:5174/organizer> and sign in. This password belongs to this
session; `deno task password` fetches a different password from OpenBao.

## Run the session

1. In **Voters**, choose **Add voters**, enter tester emails, and copy the links.
   Send each tester their own link. The app does not send emails.
1. Testers open their link, collect teams, add notes, rank them, and submit.
   Use separate browser profiles for multiple voters on one computer.
1. In **Voters > Manage**, replace lost links or reset ballots. Submitted ballots
   stay locked until reset.
1. In **Results**, calculate ranks. Use **Settings** for voting controls and backups.

For collecting demo teams, open these after a voter link:

- <http://127.0.0.1:5174/t/qr-dev-t2>
- <http://127.0.0.1:5174/t/qr-dev-t3>
- <http://127.0.0.1:5174/t/qr-dev-t4>
- <http://127.0.0.1:5174/t/qr-dev-t5>
- <http://127.0.0.1:5174/t/qr-dev-t6>

To test claiming a sticker, use the demo voter's **Scan my team** action with
an unclaimed code from **QR codes**. Other voters need a matching team member
email in the Sheet to claim one.

Ask testers to report their steps, what went wrong, and their browser/device.
These URLs work on the host computer. Phones need HTTPS access to that computer
and links using its HTTPS address.
