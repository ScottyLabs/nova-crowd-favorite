#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."
command -v deno >/dev/null || { echo 'Install Deno or enter the devenv shell first.' >&2; exit 1; }
[[ -d node_modules ]] || { echo 'Run deno install first.' >&2; exit 1; }

# Override devenv settings and keep test data outside the repository.
umask 077
session_dir=$(mktemp -d /tmp/nova-bug-test.XXXXXX)
export DATABASE_PATH="$session_dir/nova.db"
export APP_URL="http://127.0.0.1:5174"
export SYNC_HMAC_SECRET="$(od -An -N32 -tx1 /dev/urandom | tr -d ' \n')"
export ORGANIZER_PASSWORD="$(od -An -N16 -tx1 /dev/urandom | tr -d ' \n')"

# Save settings for the organizer terminal.
printf 'export APP_URL=%q\nexport SYNC_HMAC_SECRET=%q\nexport ORGANIZER_PASSWORD=%q\n' \
  "$APP_URL" "$SYNC_HMAC_SECRET" "$ORGANIZER_PASSWORD" > "$session_dir/organizer-env.sh"
chmod 600 "$session_dir/organizer-env.sh"

printf 'Test database: %s\n' "$DATABASE_PATH"
printf 'Organizer terminal: source %s/organizer-env.sh\n' "$session_dir"
printf 'Add demo teams: %s/api/dev/seed\n' "$APP_URL"
printf 'Organizer dashboard: %s/organizer\n' "$APP_URL"
printf 'Stop with Ctrl+C. Files stay in %s until deleted or cleared by the system.\n' "$session_dir"

exec deno task dev --host 127.0.0.1 --port 5174 --strictPort
