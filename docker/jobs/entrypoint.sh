#!/bin/sh
#
# The clock.
#
# This container knows how to wait and how to make an HTTP request, and nothing
# else. It holds no database credential, no Prisma client and no copy of the
# app; every job runs *inside* the app container, where the schema and the
# translations already are, and this only decides when.
#
# That split is deliberate. A sidecar that talked to Postgres directly would be
# a second place that has to agree with `schema.prisma`, and it would drift —
# which is the same argument the backup sidecar makes for sharing its base image
# with `db`. Here there is nothing to drift, because there is nothing to agree.
#
# Modelled on `docker/backup/entrypoint.sh`, down to the environment snapshot
# and writing to PID 1's stdout, because that container had already solved both.
set -eu

log() { echo "[jobs] $*"; }

fail() {
  echo "[jobs] FATAL: $1" >&2
  exit 1
}

# --- What cannot be defaulted ----------------------------------------------

[ -n "${JOBS_SECRET:-}" ] || fail "JOBS_SECRET is not set — the app would refuse every trigger."
[ "${#JOBS_SECRET}" -ge 16 ] || fail "JOBS_SECRET is shorter than 16 characters."

APP_URL="${JOBS_APP_URL:-http://app:3000}"

# --- Environment for the cron jobs -----------------------------------------
# busybox crond hands a job a near-empty environment. Snapshotting with
# `export -p` quotes and escapes every value, so a secret containing a quote, a
# space or a dollar sign survives the round trip — building this with
# `printenv | sed` works until the day somebody rotates a key.
ENV_FILE=/run/jobs.env
export -p > "$ENV_FILE"
chmod 600 "$ENV_FILE"

# --- Schedule ---------------------------------------------------------------
# Weekly, early on Sunday. The sweep reads a directory and compares it against
# four tables; it competes with nothing at that hour, and the blueprint's own
# note puts it at weekly.
SWEEP_SCHEDULE="${SWEEP_SCHEDULE:-15 3 * * 0}"

# Early evening, every day. Late enough that the day's bookings and cancellations
# have settled, early enough that whoever is on the desk can work the queue down
# before they go home — which is the point of queueing it rather than sending it.
REMINDERS_SCHEDULE="${REMINDERS_SCHEDULE:-0 18 * * *}"

# And again first thing, because the evening run cannot see an evening booking.
#
# A slot booked at half past six for nine the next morning is not in the diary
# when the 18:00 run reads it, and nothing said so — the dashboard's "to remind"
# panel is a live query and showed the patient regardless, so the two surfaces
# disagreed and the incomplete one was the queue somebody is told to work down.
#
# This run only closes that because the job reads *today as well as tomorrow*.
# It did not always: `today()` rolls over overnight, so a job looking only at
# `today() + 1` queues Tuesday from both of Monday's runs and Wednesday from
# both of Tuesday's — and the Monday-evening booking for Tuesday morning falls
# between them. See `queueAppointmentReminders` in src/lib/messages/queue.ts,
# which is where that window is decided; changing it here does nothing.
#
# Repeating is free either way: every row carries a unique `dedupeKey`, so a
# second run over the same slot collides and is skipped rather than sending
# anybody two of anything.
#
# Seven, so the queue is right before the desk opens rather than while somebody
# is already working it.
REMINDERS_MORNING_SCHEDULE="${REMINDERS_MORNING_SCHEDULE:-0 7 * * *}"

# Monday morning, once. A recall is not urgent on any particular day — it is
# urgent over a season — and a queue that refilled itself every night would be
# read as noise by Wednesday. Early enough that it is waiting when the week
# starts, and after the reminder run above so the two do not collide.
RECALLS_SCHEDULE="${RECALLS_SCHEDULE:-30 7 * * 1}"

# `/proc/1/fd/1` is this process's own stdout — what `docker logs` and Coolify's
# log view read. Without it a cron job's output goes to a mail spool that does
# not exist in this image, and every run is silent.
cat > /etc/crontabs/root <<CRONTAB
$REMINDERS_SCHEDULE . $ENV_FILE; /usr/local/bin/run-job.sh queue-appointment-reminders > /proc/1/fd/1 2>&1
$REMINDERS_MORNING_SCHEDULE . $ENV_FILE; /usr/local/bin/run-job.sh queue-appointment-reminders > /proc/1/fd/1 2>&1
$RECALLS_SCHEDULE . $ENV_FILE; /usr/local/bin/run-job.sh queue-recalls > /proc/1/fd/1 2>&1
$SWEEP_SCHEDULE . $ENV_FILE; /usr/local/bin/run-job.sh sweep-orphan-files > /proc/1/fd/1 2>&1
CRONTAB

log "app: $APP_URL"
log "schedule: reminders '$REMINDERS_SCHEDULE' and '$REMINDERS_MORNING_SCHEDULE', recalls '$RECALLS_SCHEDULE', sweep '$SWEEP_SCHEDULE' (TZ=${TZ:-UTC})"

# --- Reachability -----------------------------------------------------------
# Not a first run of the job itself: unlike a backup, nothing here is urgent
# enough to justify doing work at boot, and a sweep on every deploy is a sweep
# nobody asked for. But a stack whose clock cannot reach its app should say so
# now rather than at a quarter past three on Sunday.
#
# Deliberately not fatal. The app may still be applying migrations, and a timer
# that refuses to start because it was early is worse than one that waits.
if wget -q -T 5 -O /dev/null "$APP_URL/api/health" 2>/dev/null; then
  log "app is reachable"
else
  log "WARNING: $APP_URL/api/health did not answer. The app may still be starting;"
  log "         the schedule stands either way. If jobs never run, start here."
fi

log "waiting."
exec crond -f -l 8
