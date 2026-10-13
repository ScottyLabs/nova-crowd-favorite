# Nova Crowd Favorite

Crowd favorite voting app for Nova, built with SvelteKit and SQLite.

## Development

Install [devenv](https://devenv.sh/getting-started/), then run:

```sh
devenv shell
devenv up
```

The app runs at <http://localhost:5173>. The shell provides Deno, installs dependencies, and configures the local SQLite database.

```sh
deno task check
prek run --all-files
deno task build
```

## Deployment

Configured for deployment through [Kennel](https://git.cmu.dev/ScottyLabs/kennel) as the `web` service, with persistent SQLite storage and isolated PR previews.

[devenv.nix](./devenv.nix) defines the service and resources. [flake.nix](./flake.nix) defines the production package.
