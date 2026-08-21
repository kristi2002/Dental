#!/bin/sh
#
# Bring the database up to the current schema, then hand over to the server.
#
# The project keeps its schema under migration control in `prisma/migrations`, so
# this replays that history: it turns an empty Postgres into a working one on
# first boot, and applies whatever is pending on later deploys.
#
# This used to be `prisma db push`, which reads `schema.prisma` and makes the
# database match it. That always worked, and that was the problem — it meant the
# migrations directory was never exercised by anything, and it had drifted nine
# commits behind the schema before anybody noticed. It also has no history, so
# there was no rollback, no record of when a column appeared, and no reviewed SQL
# for a change that rewrites patient data.
#
set -e

fail() {
  echo "[entrypoint] FATAL: $1" >&2
  exit 1
}

# --- Configuration the app cannot start without -----------------------------
# Failing here, with a sentence explaining what is missing, beats failing later
# inside a request handler with a stack trace nobody on site can read.

[ -n "${DATABASE_URL:-}" ] || fail "DATABASE_URL is not set."

[ -n "${AUTH_SECRET:-}" ] || fail "AUTH_SECRET is not set — staff sessions cannot be signed."
[ "${#AUTH_SECRET}" -ge 16 ] || fail "AUTH_SECRET is shorter than 16 characters."

# --- Patient files ----------------------------------------------------------
STORAGE_DIR="${FILE_STORAGE_DIR:-/data/patient-files}"
mkdir -p "$STORAGE_DIR"

# If the storage directory still sits on the container's own filesystem, nothing
# is mounted over it and every X-ray uploaded will disappear with the container.
# Not fatal — a first run or a smoke test is legitimate — but it must be loud.
if [ "$(stat -c %d "$STORAGE_DIR")" = "$(stat -c %d /)" ]; then
  echo "[entrypoint] ============================ WARNING ============================"
  echo "[entrypoint] $STORAGE_DIR is NOT a mounted volume."
  echo "[entrypoint] Uploaded X-rays, photos and consent forms will be LOST on the"
  echo "[entrypoint] next deploy. Mount a persistent volume at /data."
  echo "[entrypoint] ================================================================="
fi

# --- Schema -----------------------------------------------------------------
# `AUTO_DB_PUSH` is still honoured as the off switch, under its old name, so an
# existing deployment that set it to false does not silently start migrating.
if [ "${AUTO_DB_MIGRATE:-${AUTO_DB_PUSH:-true}}" = "true" ]; then

  # Which of three states is the database in? `check-migration-state.mjs`
  # explains them; the short version is that `migrate deploy` is safe against
  # two of them and would fail against the third.
  #
  # Exit code 2 means "could not connect", which on a fresh stack usually means
  # Postgres is still starting rather than that anything is wrong.
  attempt=1
  max_attempts="${DB_PUSH_ATTEMPTS:-10}"

  while :; do
    # `set -e` off across these two lines only: a non-zero exit is the answer
    # here, not a failure. `$?` has to be read into a variable immediately —
    # after an `if`, it is the status of the `if` rather than of the command.
    set +e
    state="$(node /app/docker/check-migration-state.mjs 2>/dev/null)"
    rc=$?
    set -e

    if [ "$rc" -eq 0 ]; then
      break
    fi

    if [ "$rc" -ne 2 ] || [ "$attempt" -ge "$max_attempts" ]; then
      # Run it once more without swallowing stderr, so the reason is on the log.
      node /app/docker/check-migration-state.mjs || true
      fail "could not read the database state after $attempt attempts."
    fi

    echo "[entrypoint] database not ready yet (attempt $attempt/$max_attempts) — retrying in 3s"
    attempt=$((attempt + 1))
    sleep 3
  done

  if [ "$state" = "unbaselined" ]; then
    echo "[entrypoint] ============================ STOPPING ===========================" >&2
    echo "[entrypoint] This database has our tables but no _prisma_migrations table." >&2
    echo "[entrypoint]" >&2
    echo "[entrypoint] That is what a database built by the old 'prisma db push'" >&2
    echo "[entrypoint] workflow looks like. Replaying the migration history over it" >&2
    echo "[entrypoint] would start at 0_init and try to CREATE TABLE \"Patient\" on top" >&2
    echo "[entrypoint] of a Patient table that already holds patients." >&2
    echo "[entrypoint]" >&2
    echo "[entrypoint] Nothing is wrong and nothing has been changed. What is needed is" >&2
    echo "[entrypoint] a one-time decision about which migrations those tables already" >&2
    echo "[entrypoint] reflect, which is not a decision a container should make at boot." >&2
    echo "[entrypoint]" >&2
    echo "[entrypoint] See 'Baselining an existing database' in docs/DEPLOYMENT.md." >&2
    echo "[entrypoint] =================================================================" >&2
    fail "database needs a one-time baseline before migrations can be applied."
  fi

  # An image built without the migration history fails inside the Prisma CLI
  # with an error that reads like a Prisma problem rather than a packaging one.
  # Name it here instead: the remedy is a COPY line in the Dockerfile, and
  # nobody should have to work that out from "No migration found".
  if [ ! -d /app/prisma/migrations ] || [ -z "$(ls -A /app/prisma/migrations 2>/dev/null)" ]; then
    fail "no migrations in /app/prisma/migrations — this image was built without them (see the runner stage in the Dockerfile)."
  fi

  echo "[entrypoint] applying migrations (database is '$state')..."

  node /opt/prisma-cli/node_modules/prisma/build/index.js migrate deploy \
    --config=/opt/prisma-cli/prisma.config.mjs \
    || fail "migrations failed to apply (see the error above)."

  echo "[entrypoint] schema is up to date."
else
  echo "[entrypoint] schema sync disabled — skipping migrations."
fi

# --- Activity log -----------------------------------------------------------
# Nothing prunes it, on purpose. The trail is kept in the database for good so
# the Activity page can be asked about any of it — see src/lib/audit-retention.ts
# for why that was chosen over archiving past seven years, and
# prisma/prune-audit.ts for the by-hand trim if a practice ever needs one.

# `server.js` resolves the static assets and the i18n messages relative to the
# working directory, so this has to be /app.
cd /app

# shellcheck disable=SC3028  # HOSTNAME is not POSIX, but Docker always sets it
# in the container environment, and the `:-` covers the case where it does not.
echo "[entrypoint] starting DentOrganizer on ${HOSTNAME:-0.0.0.0}:${PORT:-3000}"
exec "$@"
