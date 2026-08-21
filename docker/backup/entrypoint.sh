#!/bin/sh
#
# Set the timers up, then get out of the way.
#
# Everything this container actually does lives in `run-backup.sh` and
# `verify-restore.sh`. This file exists to answer two questions that have to be
# answered before the first tick, and to fail loudly rather than quietly if it
# cannot:
#
#   1. Is the configuration complete enough to be worth starting?
#   2. How does a cron job — which inherits almost nothing — get the environment
#      Coolify injected into PID 1?
#
set -eu

log() { echo "[backup] $*"; }

fail() {
  echo "[backup] FATAL: $1" >&2
  exit 1
}

# --- What cannot be defaulted ----------------------------------------------

[ -n "${DATABASE_URL:-}" ] || fail "DATABASE_URL is not set — there is nothing to dump."

STATUS_DIR="${BACKUP_STATUS_DIR:-/status}"
BACKUP_DIR="${BACKUP_DIR:-/backups}"
mkdir -p "$STATUS_DIR" "$BACKUP_DIR/db"

# --- The offsite copy -------------------------------------------------------
# Not required, because a stack that keeps only local dumps is still better than
# the button somebody has to remember to press. But it is not a backup either —
# the dumps sit on the same disk as the database they protect, so a dead disk
# takes both — and that has to be said out loud rather than left for somebody to
# work out after the fact.

if [ -n "${RESTIC_REPOSITORY:-}" ]; then
  [ -n "${RESTIC_PASSWORD:-}" ] || fail "RESTIC_REPOSITORY is set but RESTIC_PASSWORD is not."
  [ "${#RESTIC_PASSWORD}" -ge 16 ] || fail "RESTIC_PASSWORD is shorter than 16 characters."
  [ -n "${AWS_ACCESS_KEY_ID:-}" ] || fail "RESTIC_REPOSITORY is set but AWS_ACCESS_KEY_ID is not."
  [ -n "${AWS_SECRET_ACCESS_KEY:-}" ] || fail "RESTIC_REPOSITORY is set but AWS_SECRET_ACCESS_KEY is not."
  log "offsite repository: ${RESTIC_REPOSITORY}"
else
  log "=========================== WARNING ==========================="
  log "RESTIC_REPOSITORY is not set. Dumps will be written to $BACKUP_DIR"
  log "and go no further — the same disk as the database they protect."
  log "That survives an accidental DROP. It does not survive the disk,"
  log "the server, or ransomware. See docs/RESTORE.md."
  log "==============================================================="
fi

# --- The local copy, at rest ------------------------------------------------
# The offsite copy is encrypted by restic before it leaves the building. The
# fortnight of dumps in $BACKUP_DIR/db was not encrypted at all — compressed,
# which is not the same thing — and each one holds every patient record, every
# visit, every prescription and the staff PIN hashes.
#
# What this protects against is honest to state: a disk pulled out of a clinic
# mini-PC, a volume copied off, a machine sent away for repair or sold. It is
# not a defence against somebody who already has root on the running host, since
# the key is in this container's environment; that is what full-disk encryption
# on the host is for, and the two are worth having together.
if [ -n "${BACKUP_LOCAL_KEY:-}" ]; then
  case "$BACKUP_LOCAL_KEY" in
    AGE-SECRET-KEY-1*) ;;
    *) fail "BACKUP_LOCAL_KEY does not look like an age identity (AGE-SECRET-KEY-1...). Generate one with 'age-keygen' — see docs/RESTORE.md." ;;
  esac
  # Derived rather than configured separately: one secret to store, and the
  # recipient can never drift from the identity that has to open it.
  BACKUP_LOCAL_RECIPIENT="$(printf '%s\n' "$BACKUP_LOCAL_KEY" | age-keygen -y 2>/dev/null)" \
    || fail "BACKUP_LOCAL_KEY is not a usable age identity."
  export BACKUP_LOCAL_RECIPIENT
  log "local dumps: encrypted to ${BACKUP_LOCAL_RECIPIENT}"
else
  log "=========================== WARNING ==========================="
  log "BACKUP_LOCAL_KEY is not set. The dumps kept in $BACKUP_DIR/db"
  log "are written in the clear: every patient record, in one file,"
  log "readable by anyone who takes the disk. Generate a key with"
  log "'age-keygen' and set it. See docs/RESTORE.md."
  log "==============================================================="
fi

# --- Environment for the cron jobs -----------------------------------------
# busybox crond hands a job a near-empty environment: no DATABASE_URL, no
# credentials, nothing. Snapshotting it here and sourcing it in each job is the
# standard fix, and `export -p` is the part that matters — it quotes and escapes
# every value, so a password containing a quote, a space or a dollar sign
# survives the round trip. Building this file with `printenv | sed` is the
# version of this that works until the day somebody rotates a key.
ENV_FILE=/run/backup.env
export -p > "$ENV_FILE"
chmod 600 "$ENV_FILE"

# --- Schedule ---------------------------------------------------------------
# Twice daily by default: 02:00, and 13:00 over the lunch break. The worst case
# a clinic can lose is then the half day between them, rather than the whole one
# a nightly-only schedule costs.
BACKUP_SCHEDULE="${BACKUP_SCHEDULE:-0 2,13 * * *}"
# Sunday, early. A restore drill creates a second database and reads a slice of
# the repository, so it belongs where it competes with nothing.
VERIFY_SCHEDULE="${VERIFY_SCHEDULE:-30 3 * * 0}"

# `/proc/1/fd/1` is this process's own stdout, which is what `docker logs` and
# Coolify's log view are reading. Without it a cron job's output goes to a mail
# spool that does not exist in this image, and every run is silent.
cat > /etc/crontabs/root <<CRONTAB
$BACKUP_SCHEDULE . $ENV_FILE; /usr/local/bin/run-backup.sh > /proc/1/fd/1 2>&1
$VERIFY_SCHEDULE . $ENV_FILE; /usr/local/bin/verify-restore.sh > /proc/1/fd/1 2>&1
CRONTAB

log "schedule: backup '$BACKUP_SCHEDULE', verify '$VERIFY_SCHEDULE' (TZ=${TZ:-UTC})"

# --- First run --------------------------------------------------------------
# A stack that comes up at 14:00 would otherwise sit unprotected until 02:00,
# and — worse — nobody would find out until then whether any of this is
# configured correctly. Running once at boot turns a misconfiguration into a
# deploy-time error instead of a 2am one.
#
# Deliberately not fatal: a backup that cannot run is not a reason to keep the
# clinic's records offline. It writes its failure to the status file, the app
# shows the banner, and the timer tries again.
if [ "${BACKUP_ON_START:-true}" = "true" ]; then
  log "running once at start"
  /usr/local/bin/run-backup.sh || log "the first run failed — see above. The schedule is still active."
fi

log "sleeping until the next tick"
exec crond -f -l 8
