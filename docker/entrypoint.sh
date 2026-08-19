#!/bin/sh
#
# Bring the database up to the current schema, then hand over to the server.
#
# The project keeps no migration history — `prisma db push` is its workflow — so
# this is what turns an empty Postgres into a working one on first boot, and what
# applies schema changes on later deploys.
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
# Run without --accept-data-loss on purpose: a schema change that would drop a
# column stops the deploy rather than quietly discarding patient records. If that
# happens, resolve it deliberately (see docs/DEPLOYMENT.md) instead of forcing it.
if [ "${AUTO_DB_PUSH:-true}" = "true" ]; then
  echo "[entrypoint] syncing database schema..."

  attempt=1
  max_attempts="${DB_PUSH_ATTEMPTS:-10}"

  until node /opt/prisma-cli/node_modules/prisma/build/index.js db push \
    --config=/opt/prisma-cli/prisma.config.mjs; do

    if [ "$attempt" -ge "$max_attempts" ]; then
      fail "could not sync the schema after $attempt attempts (see the error above)."
    fi

    echo "[entrypoint] database not ready yet (attempt $attempt/$max_attempts) — retrying in 3s"
    attempt=$((attempt + 1))
    sleep 3
  done

  echo "[entrypoint] schema is up to date."
else
  echo "[entrypoint] AUTO_DB_PUSH=false — skipping schema sync."
fi

# --- Activity log retention -------------------------------------------------
# Seven years, archived to the volume before anything is removed. Runs here
# rather than on a schedule because the app has no scheduler and a deploy is the
# one moment something is guaranteed to run.
#
# `|| true` is not redundant with the script's own catch: it also covers the
# process failing to start at all. Housekeeping must never be the reason a
# clinic cannot open in the morning.
if [ "${AUDIT_PRUNE:-true}" = "true" ]; then
  node /app/docker/prune-audit.mjs || true
fi

# `server.js` resolves the static assets and the i18n messages relative to the
# working directory, so this has to be /app.
cd /app

echo "[entrypoint] starting DentOrganizer on ${HOSTNAME:-0.0.0.0}:${PORT:-3000}"
exec "$@"
