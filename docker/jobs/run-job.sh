#!/bin/sh
#
# Ask the app to run one job, and say what came back.
#
# Everything interesting happens on the other end of this request; the value
# here is entirely in reporting the outcome in a way somebody scrolling Coolify's
# log at speed will read correctly. A job that failed must not look like a job
# that ran.
#
# **Exactly one request, ever.** The obvious shape — request, and if it failed
# ask again to find out why — runs the job twice. That is survivable for a sweep
# and not survivable for anything that sends, and this script is the template
# every future job will be copied from. `curl` gives the body and the status code
# from one call, which is why the image carries it rather than using the busybox
# `wget` that is already there (and which cannot POST in any case).
set -u

NAME="${1:?usage: run-job.sh <job-name>}"
APP_URL="${JOBS_APP_URL:-http://app:3000}"

log() { echo "[jobs] $*"; }

BODY_FILE=$(mktemp)
trap 'rm -f "$BODY_FILE"' EXIT

# 15 minutes: a sweep of a large storage volume is slow, and a timeout that
# fires mid-job abandons a JobRun row the app then reports as still running.
CODE=$(curl -sS -o "$BODY_FILE" -w '%{http_code}' \
  --max-time 900 \
  -X POST \
  -H "x-jobs-secret: ${JOBS_SECRET}" \
  "$APP_URL/api/jobs/$NAME" 2>/dev/null)
CURL_STATUS=$?

BODY=$(cat "$BODY_FILE")

if [ "$CURL_STATUS" -ne 0 ]; then
  log "$NAME: FAILED — could not reach $APP_URL (curl exit $CURL_STATUS)"
  exit 1
fi

case "$CODE" in
  200)
    log "$NAME: $BODY"
    exit 0
    ;;
  409)
    # The previous run has not finished. Ordinary, and not worth alarming
    # anybody about — it means the schedule is tighter than the work.
    log "$NAME: still running from a previous tick, skipped"
    exit 0
    ;;
  404)
    # Deliberately one message for two causes: the app answers 404 both for an
    # unknown job and for a secret that does not match, so that an unproven
    # caller cannot use the difference to learn which it got wrong. From in
    # here they are equally worth checking.
    log "$NAME: FAILED — the app refused the trigger."
    log "$NAME: either the job name is not in the registry, or JOBS_SECRET does not match the app's."
    exit 1
    ;;
  *)
    log "$NAME: FAILED — HTTP $CODE"
    [ -n "$BODY" ] && log "$NAME: $BODY"
    exit 1
    ;;
esac
