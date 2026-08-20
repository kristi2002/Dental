#!/bin/sh
#
# One backup run.
#
# Four steps, in this order, because each one is only worth doing if the one
# before it worked:
#
#   1. Dump the database to a file.
#   2. Prove the file is readable before anything relies on it.
#   3. Copy both halves of the practice — the dump and the uploaded files —
#      offsite.
#   4. Write down what happened, so the app can say so on screen.
#
# Step 4 is not bookkeeping. A backup system that fails silently is worse than
# no backup system, because it manufactures confidence: the clinic believes it
# is covered right up to the morning it finds out it is not. Everything here is
# arranged so that a failure ends up in front of a person.
#
set -eu

# --- Where things are -------------------------------------------------------

STATUS_DIR="${BACKUP_STATUS_DIR:-/status}"
STATUS_FILE="$STATUS_DIR/backup.json"
BACKUP_DIR="${BACKUP_DIR:-/backups}"
DUMP_DIR="$BACKUP_DIR/db"
FILES_DIR="${FILE_STORAGE_DIR:-/data/patient-files}"

KEEP_LOCAL_DAYS="${BACKUP_KEEP_LOCAL_DAYS:-14}"
KEEP_DAILY="${BACKUP_KEEP_DAILY:-14}"
KEEP_WEEKLY="${BACKUP_KEEP_WEEKLY:-8}"
KEEP_MONTHLY="${BACKUP_KEEP_MONTHLY:-24}"

# Every snapshot is filed under this name rather than the container's hostname.
# Coolify hands out a new hostname on every deploy, and restic groups snapshots
# by host — left alone, `--latest` and `forget` would treat each deploy as a
# different machine and the retention policy would keep the last fourteen daily
# snapshots *of each*, for ever.
BACKUP_HOST="${BACKUP_HOST:-dentorganizer}"

started_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
started_epoch="$(date -u +%s)"
stamp="$(date -u +%Y%m%d-%H%M%S)"

# Initialised up front because `write_status` reads all of them, and `set -u`
# would otherwise turn an early failure into a different, more confusing one.
DUMP_NAME=""
DUMP_BYTES=0
FILE_COUNT=0
FILE_BYTES=0
OFFSITE=false
SNAPSHOT_ID=""
SNAPSHOT_COUNT=0

log() { echo "[backup] $*"; }

# --- The status file --------------------------------------------------------

write_status() {
  state="$1"
  message="$2"

  finished_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  duration=$(( $(date -u +%s) - started_epoch ))

  # A failed run must not erase the memory of the last good one — "failing since
  # Tuesday" and "never worked at all" need different reactions, and the app can
  # only tell them apart if this survives.
  previous_success=""
  if [ -f "$STATUS_FILE" ]; then
    previous_success="$(jq -r '.lastSuccessAt // ""' "$STATUS_FILE" 2>/dev/null || echo "")"
  fi
  if [ "$state" = "ok" ]; then
    last_success="$finished_at"
  else
    last_success="$previous_success"
  fi

  mkdir -p "$STATUS_DIR"
  # Built by jq rather than by string concatenation, and written beside the real
  # file before being moved into place. Two different ways of saying the same
  # thing: the app must never read a status file that is half-written or — worse
  # — unparseable on exactly the run that failed.
  jq -n \
    --arg state "$state" \
    --arg message "$message" \
    --arg startedAt "$started_at" \
    --arg finishedAt "$finished_at" \
    --arg lastSuccessAt "$last_success" \
    --argjson durationSeconds "$duration" \
    --arg dumpFile "$DUMP_NAME" \
    --argjson dumpBytes "$DUMP_BYTES" \
    --argjson fileCount "$FILE_COUNT" \
    --argjson fileBytes "$FILE_BYTES" \
    --argjson offsiteConfigured "$OFFSITE" \
    --arg repository "${RESTIC_REPOSITORY:-}" \
    --arg snapshotId "$SNAPSHOT_ID" \
    --argjson snapshotCount "$SNAPSHOT_COUNT" \
    '{
      state: $state,
      message: $message,
      startedAt: $startedAt,
      finishedAt: $finishedAt,
      lastSuccessAt: (if $lastSuccessAt == "" then null else $lastSuccessAt end),
      durationSeconds: $durationSeconds,
      dump: { file: $dumpFile, bytes: $dumpBytes },
      files: { count: $fileCount, bytes: $fileBytes },
      offsite: {
        configured: $offsiteConfigured,
        repository: $repository,
        snapshotId: (if $snapshotId == "" then null else $snapshotId end),
        snapshotCount: $snapshotCount
      }
    }' > "$STATUS_FILE.partial"
  mv -f "$STATUS_FILE.partial" "$STATUS_FILE"
}

fail() {
  log "FAILED: $1"
  write_status failed "$1"
  exit 1
}

# --- The connection string --------------------------------------------------
# Prisma's DATABASE_URL carries parameters libpq has never heard of — `schema`
# above all, which this stack always sets. libpq does not ignore an unknown
# query parameter, it refuses the whole URL: "invalid URI query parameter".
# So the Prisma-only ones come off, and everything else — `sslmode` included —
# stays exactly as written.
libpq_url() {
  base="${1%%\?*}"
  query="${1#*\?}"
  if [ "$query" = "$1" ]; then
    echo "$base"
    return
  fi

  kept=""
  old_ifs="$IFS"
  IFS="&"
  for param in $query; do
    case "$param" in
      schema=*|connection_limit=*|pool_timeout=*|pgbouncer=*|socket_timeout=*|relationMode=*)
        continue
        ;;
    esac
    kept="${kept:+$kept&}$param"
  done
  IFS="$old_ifs"

  echo "${base}${kept:+?$kept}"
}

# `BACKUP_DATABASE_URL` is the escape hatch: set it to a plain libpq URL and the
# rewriting above is skipped entirely.
DB_URL="$(libpq_url "${BACKUP_DATABASE_URL:-${DATABASE_URL:-}}")"
[ -n "$DB_URL" ] || fail "DATABASE_URL is not set."

# --- 1. Dump ----------------------------------------------------------------
# Custom format, not plain SQL: it is compressed, and `pg_restore` can rebuild
# schema and data from it on its own. That matters more than it looks — it means
# a restore depends on neither this repository, nor Prisma, nor the migration
# history still being replayable. A dump file and a Postgres of the right
# version are the whole recovery kit.

mkdir -p "$DUMP_DIR"
DUMP_NAME="dentorganizer-$stamp.dump"
dump_partial="$DUMP_DIR/.$DUMP_NAME.partial"
dump_path="$DUMP_DIR/$DUMP_NAME"

log "dumping the database"
# Written under a dotted temporary name and moved into place only once it is
# complete. A dump killed halfway through — the disk filling, the deploy
# restarting — otherwise leaves a plausible-looking file under the right name,
# and the retention sweep below would faithfully keep it for a fortnight.
rm -f "$dump_partial"
pg_dump \
  --format=custom \
  --compress=9 \
  --no-owner \
  --no-privileges \
  --file="$dump_partial" \
  "$DB_URL" \
  || fail "pg_dump failed — see the log above."

# --- 2. Prove the dump is readable ------------------------------------------
# Cheap, and the difference between a backup and a file. `--list` walks the
# archive's table of contents, so a truncated or corrupt dump fails here rather
# than during the restore nobody ever gets to rehearse.
log "checking the dump is readable"
entries="$(pg_restore --list "$dump_partial" 2>/dev/null | grep -c 'TABLE DATA' || true)"
[ "${entries:-0}" -gt 0 ] || fail "the dump was written but pg_restore cannot read it."

mv -f "$dump_partial" "$dump_path"
DUMP_BYTES="$(stat -c %s "$dump_path")"
log "wrote $DUMP_NAME ($DUMP_BYTES bytes, $entries tables)"

# --- Local retention --------------------------------------------------------
find "$DUMP_DIR" -name '*.dump' -type f -mtime "+$KEEP_LOCAL_DAYS" -delete 2>/dev/null || true
# A run interrupted before the rename leaves one of these behind. Nothing else
# would ever clean it up, and it is a whole dump's worth of disk.
find "$DUMP_DIR" -name '.*.partial' -type f -mtime +1 -delete 2>/dev/null || true

# --- The other half ---------------------------------------------------------
# X-rays, clinical photographs and signed consent forms. No dump of the database
# has ever contained one of these, and no restore of one brings them back — the
# rows return pointing at storage keys and every document is broken. They are
# the half of the practice that cannot be re-entered from paper.

if [ -d "$FILES_DIR" ]; then
  FILE_COUNT="$(find "$FILES_DIR" -type f 2>/dev/null | wc -l | tr -d ' \n')"
  FILE_BYTES="$(( $(du -sk "$FILES_DIR" 2>/dev/null | cut -f1) * 1024 ))"
  log "patient files: $FILE_COUNT files, $FILE_BYTES bytes"
else
  log "WARNING: $FILES_DIR does not exist — no uploaded files will be copied."
fi

# --- 3. Offsite -------------------------------------------------------------

if [ -n "${RESTIC_REPOSITORY:-}" ] && [ -n "${RESTIC_PASSWORD:-}" ]; then
  OFFSITE=true

  # `cat config` is the cheapest question that separates "repository exists"
  # from "first ever run", and unlike `snapshots` it takes no lock.
  if ! restic cat config > /dev/null 2>&1; then
    log "initialising the repository"
    restic init || fail "restic init failed — check the credentials and the bucket name."
  fi

  log "copying to $RESTIC_REPOSITORY"
  # Both paths in one snapshot, so that a snapshot id names a coherent moment:
  # this database *and* the files it refers to. Splitting them across two
  # snapshots invites a restore that pairs Tuesday's records with Monday's
  # radiographs, which is a subtler kind of data loss and a harder one to spot.
  if [ -d "$FILES_DIR" ]; then
    restic backup --host "$BACKUP_HOST" --tag dentorganizer "$DUMP_DIR" "$FILES_DIR" \
      || fail "restic backup failed — see the log above."
  else
    restic backup --host "$BACKUP_HOST" --tag dentorganizer "$DUMP_DIR" \
      || fail "restic backup failed — see the log above."
  fi

  SNAPSHOT_ID="$(restic snapshots --host "$BACKUP_HOST" --latest 1 --json 2>/dev/null | jq -r '.[0].short_id // ""')"
  SNAPSHOT_COUNT="$(restic snapshots --host "$BACKUP_HOST" --json 2>/dev/null | jq 'length')"
  SNAPSHOT_COUNT="${SNAPSHOT_COUNT:-0}"
  log "snapshot $SNAPSHOT_ID ($SNAPSHOT_COUNT in the repository)"

  # Retention. Deliberately a switch rather than a given: this deletes, and the
  # whole ransomware argument rests on what the key on *this* server is allowed
  # to delete. See docs/RESTORE.md — with B2 versioning and a lifecycle rule
  # behind it a prune only hides versions the account owner can still recover,
  # which is why it is safe to leave on.
  #
  # A failed prune is a warning, not a failure: the copy is already safely
  # offsite by this point, and refusing to record that because housekeeping went
  # wrong would put a red banner in front of the clinic for no reason.
  if [ "${BACKUP_PRUNE:-true}" = "true" ]; then
    log "applying retention: $KEEP_DAILY daily, $KEEP_WEEKLY weekly, $KEEP_MONTHLY monthly"
    restic forget \
      --host "$BACKUP_HOST" \
      --keep-daily "$KEEP_DAILY" \
      --keep-weekly "$KEEP_WEEKLY" \
      --keep-monthly "$KEEP_MONTHLY" \
      --prune \
      || log "WARNING: retention failed. The copy is safe; the repository will grow."
  fi
else
  log "no offsite repository configured — local copy only."
fi

write_status ok ""
log "done in $(( $(date -u +%s) - started_epoch ))s"
