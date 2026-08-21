#!/bin/sh
#
# The weekly restore drill.
#
# An untested backup is a hope. This is the part that turns it into a fact, and
# it deliberately tests the copy that would actually be reached for in a
# disaster — the one in the bucket, not the one on the server's own disk.
#
# Four questions, in the order they would be asked at 8am on the worst Monday:
#
#   1. Is the repository itself intact? (`restic check`)
#   2. Can the newest dump be pulled back down and restored into a real
#      Postgres? (`pg_restore` into a throwaway database)
#   3. Does the restored practice hold roughly what the live one holds?
#   4. Is every X-ray, photograph and consent form the restored records point at
#      actually present in the backup?
#
# Question 4 is the one nobody asks, and the one that ends careers. The database
# and the files are backed up by different mechanisms and fail independently; a
# storage directory that silently stopped being copied six months ago looks
# exactly like one that is fine, right up until somebody opens a chart.
#
set -eu

STATUS_DIR="${BACKUP_STATUS_DIR:-/status}"
STATUS_FILE="$STATUS_DIR/verify.json"
BACKUP_DIR="${BACKUP_DIR:-/backups}"
DUMP_DIR="$BACKUP_DIR/db"
FILES_DIR="${FILE_STORAGE_DIR:-/data/patient-files}"
BACKUP_HOST="${BACKUP_HOST:-dentorganizer}"
VERIFY_DB="${BACKUP_VERIFY_DB:-dentorganizer_verify}"

# A fifty-second of the repository's data blocks are re-read and re-hashed each
# week, so a year of drills reads all of it. Reading the whole thing weekly
# would mean downloading the entire practice from B2 every Sunday, which is a
# bandwidth bill rather than a safety measure.
CHECK_SUBSET="${BACKUP_CHECK_SUBSET:-1/52}"

WORK_DIR="$(mktemp -d)"
started_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
started_epoch="$(date -u +%s)"

SOURCE="local"
SNAPSHOT_ID=""
DUMP_FILE=""
REPO_CHECK="skipped"
TABLES_JSON="[]"
EXPECTED=0
PRESENT=0
MISSING=0
MISSING_SAMPLES="[]"

log() { echo "[verify] $*"; }

# --- Tidying up -------------------------------------------------------------
# The throwaway database is a real database on the live server, and one left
# behind after a failed drill is a second copy of the practice sitting where
# nobody is looking for it. The trap is how it goes away even when this script
# does not reach its own end.
cleanup() {
  rm -rf "$WORK_DIR"
  if [ -n "${VERIFY_URL:-}" ]; then
    psql "$DB_URL" -q -c "DROP DATABASE IF EXISTS \"$VERIFY_DB\" WITH (FORCE)" > /dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

write_status() {
  state="$1"
  message="$2"

  finished_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  duration=$(( $(date -u +%s) - started_epoch ))

  previous_ok=""
  if [ -f "$STATUS_FILE" ]; then
    previous_ok="$(jq -r '.lastPassedAt // ""' "$STATUS_FILE" 2>/dev/null || echo "")"
  fi
  if [ "$state" = "ok" ]; then
    last_passed="$finished_at"
  else
    last_passed="$previous_ok"
  fi

  mkdir -p "$STATUS_DIR"
  jq -n \
    --arg state "$state" \
    --arg message "$message" \
    --arg startedAt "$started_at" \
    --arg checkedAt "$finished_at" \
    --arg lastPassedAt "$last_passed" \
    --argjson durationSeconds "$duration" \
    --arg source "$SOURCE" \
    --arg snapshotId "$SNAPSHOT_ID" \
    --arg dumpFile "$DUMP_FILE" \
    --arg repositoryCheck "$REPO_CHECK" \
    --argjson tables "$TABLES_JSON" \
    --argjson expected "$EXPECTED" \
    --argjson present "$PRESENT" \
    --argjson missing "$MISSING" \
    --argjson missingSamples "$MISSING_SAMPLES" \
    '{
      state: $state,
      message: $message,
      startedAt: $startedAt,
      checkedAt: $checkedAt,
      lastPassedAt: (if $lastPassedAt == "" then null else $lastPassedAt end),
      durationSeconds: $durationSeconds,
      source: $source,
      snapshotId: (if $snapshotId == "" then null else $snapshotId end),
      dumpFile: $dumpFile,
      repositoryCheck: $repositoryCheck,
      tables: $tables,
      files: {
        expected: $expected,
        present: $present,
        missing: $missing,
        missingSamples: $missingSamples
      }
    }' > "$STATUS_FILE.partial"
  mv -f "$STATUS_FILE.partial" "$STATUS_FILE"
}

fail() {
  log "FAILED: $1"
  write_status failed "$1"
  exit 1
}

# --- The connection strings -------------------------------------------------
# Same reasoning as `run-backup.sh`: libpq refuses Prisma's `?schema=`.
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

# Same server, same credentials, different database — so the drill exercises the
# real Postgres, at the real version, rather than a lookalike.
swap_database() {
  url="$1"
  newdb="$2"
  query=""
  case "$url" in
    *\?*)
      query="?${url#*\?}"
      url="${url%%\?*}"
      ;;
  esac
  echo "${url%/*}/$newdb$query"
}

DB_URL="$(libpq_url "${BACKUP_DATABASE_URL:-${DATABASE_URL:-}}")"
[ -n "$DB_URL" ] || fail "DATABASE_URL is not set."
VERIFY_URL="$(swap_database "$DB_URL" "$VERIFY_DB")"

# --- 1. Is the repository intact? -------------------------------------------

if [ -n "${RESTIC_REPOSITORY:-}" ] && [ -n "${RESTIC_PASSWORD:-}" ]; then
  SOURCE="offsite"

  log "checking the repository (reading $CHECK_SUBSET of the data)"
  if restic check --read-data-subset="$CHECK_SUBSET"; then
    REPO_CHECK="ok"
  else
    REPO_CHECK="failed"
    fail "restic check reported damage in the repository."
  fi

  SNAPSHOT_ID="$(restic snapshots --host "$BACKUP_HOST" --latest 1 --json 2>/dev/null | jq -r '.[0].short_id // ""')"
  [ -n "$SNAPSHOT_ID" ] || fail "the repository holds no snapshot for host $BACKUP_HOST."

  # Only the dumps come back down, never the radiographs. Restoring the whole
  # snapshot every Sunday would mean pulling the entire practice out of B2 to
  # prove a point that a few megabytes already prove; the files are checked by
  # inventory below, which needs their names and not their bytes.
  log "restoring the newest dump from snapshot $SNAPSHOT_ID"
  restic restore "$SNAPSHOT_ID" --target "$WORK_DIR" --include "$DUMP_DIR" \
    || fail "could not restore the dump from the repository."

  DUMP_PATH="$(find "$WORK_DIR" -name '*.dump' -type f 2>/dev/null | LC_ALL=C sort | tail -1)"
else
  log "no offsite repository configured — drilling against the local dump instead."
  DUMP_PATH="$(find "$DUMP_DIR" -name '*.dump' -type f 2>/dev/null | LC_ALL=C sort | tail -1)"
fi

[ -n "${DUMP_PATH:-}" ] || fail "no dump file to restore."
DUMP_FILE="$(basename "$DUMP_PATH")"
log "drilling with $DUMP_FILE"

# --- 2. Does it restore? ----------------------------------------------------

# Before creating a second copy of the practice, check there is room for one.
#
# This drill restores the whole database into `dentorganizer_verify` **on the
# live Postgres instance**, which for the length of the drill roughly doubles
# what `db-data` occupies. Unchecked, that turns a healthy 55%-full disk into a
# full one at 03:30 on a Sunday: Postgres stops accepting writes, and the
# practice opens on Monday to a database that will not take a booking. The
# backup that is supposed to be the safety net becomes the outage.
#
# So: refuse rather than risk it. A skipped drill is a warning on the Staff
# page and a thing somebody fixes on Monday. A full disk is the clinic shut.
#
# 2.5× the live database rather than 2×, because `pg_restore` needs room for
# indexes it is still building and for the WAL the restore generates.
verify_headroom() {
  live_bytes="$(psql "$DB_URL" -Atc "SELECT pg_database_size(current_database())" 2>/dev/null || echo "")"
  case "$live_bytes" in
    '' | *[!0-9]*)
      log "could not measure the live database — proceeding without a space check."
      return 0
      ;;
  esac

  # `df` on the data directory, in kibibytes, portable across coreutils and
  # busybox. The awk picks the "available" column of the last line.
  free_kb="$(psql "$DB_URL" -Atc "SHOW data_directory" 2>/dev/null \
    | { read -r dir; df -Pk "$dir" 2>/dev/null || df -Pk / ; } \
    | awk 'END { print $4 }')"
  case "$free_kb" in
    '' | *[!0-9]*)
      log "could not measure free space — proceeding without a space check."
      return 0
      ;;
  esac

  free_bytes=$(( free_kb * 1024 ))
  needed_bytes=$(( live_bytes * 5 / 2 ))

  log "live database $(( live_bytes / 1048576 )) MiB · free $(( free_bytes / 1048576 )) MiB · drill needs ~$(( needed_bytes / 1048576 )) MiB"

  if [ "$free_bytes" -lt "$needed_bytes" ]; then
    fail "not enough free disk to restore a second copy safely — need about $(( needed_bytes / 1048576 )) MiB, have $(( free_bytes / 1048576 )) MiB. The drill was skipped rather than risk filling the disk the live database is on."
  fi
}
verify_headroom

log "creating $VERIFY_DB"
psql "$DB_URL" -q -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS \"$VERIFY_DB\" WITH (FORCE)" \
  || fail "could not drop a leftover $VERIFY_DB."
psql "$DB_URL" -q -v ON_ERROR_STOP=1 -c "CREATE DATABASE \"$VERIFY_DB\"" \
  || fail "could not create $VERIFY_DB — the drill needs CREATEDB."

log "restoring"
# `--exit-on-error` because the default is to plough on and report at the end,
# which would let a drill "pass" having logged two hundred errors.
pg_restore --dbname="$VERIFY_URL" --no-owner --no-privileges --exit-on-error "$DUMP_PATH" \
  || fail "pg_restore failed — this dump would not have restored the practice."

# --- 3. Does it hold what the live database holds? --------------------------
# Reported side by side rather than judged against a fixed floor. A practice
# that opened last week legitimately has four patients, so "more than zero" is
# not a test — but "the live database has 2 000 patients and the restored one
# has none" is, and it is the shape a truncated dump actually takes.

# -1 means "could not be counted" rather than "empty", and the two must not be
# confused: a table missing from an older dump would otherwise read as a table
# that restored with nothing in it, which is the alarm this drill exists to
# raise. Anything that is not a plain number — an error, a notice, silence —
# lands on -1.
count_in() {
  value="$(psql "$1" -Atc "SELECT count(*) FROM \"$2\"" 2>/dev/null || true)"
  case "$value" in
    '' | *[!0-9]*) echo "-1" ;;
    *) echo "$value" ;;
  esac
}

TABLES_JSON="[]"
ROW_MISMATCH=0
for table in Patient Appointment VisitRecord PatientDocument Prescription Work FollowUp StaffUser AuditLog; do
  live="$(count_in "$DB_URL" "$table")"
  restored="$(count_in "$VERIFY_URL" "$table")"
  log "  $table: live $live, restored $restored"

  if [ "$live" -gt 0 ] && [ "$restored" -le 0 ]; then
    ROW_MISMATCH=$(( ROW_MISMATCH + 1 ))
  fi

  TABLES_JSON="$(printf '%s' "$TABLES_JSON" | jq \
    --arg table "$table" \
    --argjson live "$live" \
    --argjson restored "$restored" \
    '. + [{ table: $table, live: $live, restored: $restored }]')"
done

# --- 4. Are the files there? ------------------------------------------------
# Every column in the schema that names something on disk. Four of them, across
# three modules, and each one added at a different time — which is exactly why
# this is a query rather than a list somebody maintains by hand.

collect_keys() {
  table="$1"
  column="$2"
  psql "$VERIFY_URL" -Atc "SELECT \"$column\" FROM \"$table\" WHERE \"$column\" IS NOT NULL" 2>/dev/null || true
}

{
  collect_keys PatientDocument storageKey
  collect_keys FollowUpAttachment storageKey
  collect_keys StockItem photoKey
  collect_keys StockProduct photoKey
} | sed '/^$/d' | LC_ALL=C sort -u > "$WORK_DIR/expected.txt"

if [ "$SOURCE" = "offsite" ]; then
  # The names in the snapshot, without downloading a byte of any of them.
  restic ls "$SNAPSHOT_ID" "$FILES_DIR" 2>/dev/null \
    | grep '^/' \
    | sed 's#.*/##' \
    | sed '/^$/d' \
    | LC_ALL=C sort -u > "$WORK_DIR/present.txt"
else
  find "$FILES_DIR" -type f 2>/dev/null \
    | sed 's#.*/##' \
    | LC_ALL=C sort -u > "$WORK_DIR/present.txt"
fi

EXPECTED="$(wc -l < "$WORK_DIR/expected.txt" | tr -d ' \n')"
PRESENT="$(wc -l < "$WORK_DIR/present.txt" | tr -d ' \n')"
comm -23 "$WORK_DIR/expected.txt" "$WORK_DIR/present.txt" > "$WORK_DIR/missing.txt" || true
MISSING="$(wc -l < "$WORK_DIR/missing.txt" | tr -d ' \n')"

# Names, not counts — "412 missing" sends somebody looking at the whole
# directory, whereas five keys tell them within a minute whether it is one
# patient's chart or the day the mount went away.
MISSING_SAMPLES="$(head -5 "$WORK_DIR/missing.txt" | jq -R . | jq -s .)"

log "files: $EXPECTED referenced, $PRESENT in the backup, $MISSING missing"

# --- The verdict ------------------------------------------------------------

if [ "$MISSING" -gt 0 ]; then
  write_status warning "$MISSING uploaded files are referenced by the records but are not in the backup."
  log "WARNING: $MISSING files missing. First few: $(head -5 "$WORK_DIR/missing.txt" | tr '\n' ' ')"
  exit 0
fi

if [ "$ROW_MISMATCH" -gt 0 ]; then
  write_status warning "$ROW_MISMATCH table(s) restored empty although the live database holds rows."
  exit 0
fi

write_status ok ""
log "drill passed in $(( $(date -u +%s) - started_epoch ))s"
