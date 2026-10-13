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
