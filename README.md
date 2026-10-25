# Nova Crowd Favorite

Crowd favorite voting app for Nova, built with SvelteKit and SQLite.

## Development

Log in to OpenBao and set up devenv by following kennel's [local development](https://docs.kennel.scottylabs.org/guides/secrets.html#local-development) and [devenv setup](https://docs.kennel.scottylabs.org/guides/deploying.html#2-set-up-devenv) guides.

Run the dev server with hot reloading:

```sh
devenv up
```

The app runs at <http://localhost:5173>. The shell provides Deno, installs dependencies, and sets `DATABASE_PATH` to a local SQLite database.

```sh
deno task check
prek run --all-files
deno task build
```

## Deployment

Configured for deployment through [Kennel](https://git.cmu.dev/ScottyLabs/kennel) as the `web` service, with persistent SQLite storage and isolated PR previews.

[devenv.nix](./devenv.nix) defines the service and resources. [flake.nix](./flake.nix) defines the production package.

## Testing the voter flow

Open `/api/dev/seed` locally or on a PR preview to create demo teams, stickers,
and a voter link. Each visit resets the demo ballot and collection. This endpoint
returns 404 on event deployments.

- `/api/dev/seed?closed`: voting closed.
- `/api/dev/seed?closed=submitted`: ballot submitted before closing.
- `/api/dev/seed`: reset and reopen voting.

For phone camera testing, use the HTTPS preview and a QR containing
`https://<preview-host>/t/qr-dev-t3`. Use `qr-dev-new-1` or `qr-dev-new-2`
to test linking an unclaimed sticker to your team.

The type-check hook runs `deno task check` with the locked project dependencies.
For Svelte declaration errors, try `deno install --frozen` and `deno task check`.
If the error persists, remove `node_modules` and `.svelte-kit`, then repeat.

## Event QR stickers

Print `https://<event-site>/t/<code>` using a unique code per sticker
(e.g. `openssl rand -hex 16`). Insert each code into the event database:

```sql
INSERT INTO qr_codes (code) VALUES ('replace-with-the-printed-code');
```

Leave `team_id` null so a team member can claim it through "Scan my team".
Use plain `INSERT`; `INSERT OR REPLACE` can erase an existing claim.
