# syntax=docker/dockerfile:1

# DentOrganizer — the backup sidecar.
#
# Built on `postgres:17-alpine` rather than a bare Alpine, and not for
# convenience: `pg_dump` refuses to dump a server newer than itself, and a
# version skew between this container and `db` turns every backup into an error
# nobody reads until the day it matters. Sharing the base image means the client
# and the server move together, by construction, and a Postgres upgrade cannot
# leave the backups behind.
#
# The image serves nothing and listens on nothing. It wakes on a timer, writes,
# and goes back to sleep.
FROM postgres:17-alpine

# restic — the offsite copy: client-side encryption, deduplication and
#          snapshots, in one static binary.
# jq     — every status file this writes is JSON, and building JSON by string
#          concatenation in a shell script is how a status file ends up
#          unparseable on exactly the run that failed.
# tzdata — the schedule is written in the clinic's hours, not UTC.
# age    — seals the dumps that stay on this disk. restic protects the copy that
#          leaves the building; until this was added the fortnight kept locally
#          was compressed and nothing more, and each file is every patient
#          record in the practice.
RUN apk add --no-cache restic jq ca-certificates tzdata age

COPY docker/backup/entrypoint.sh /usr/local/bin/backup-entrypoint.sh
COPY docker/backup/run-backup.sh /usr/local/bin/run-backup.sh
COPY docker/backup/verify-restore.sh /usr/local/bin/verify-restore.sh

# These are edited on Windows as often as not, and a trailing CR turns the
# shebang into a path that does not exist — the same trap the app's Dockerfile
# documents for its own entrypoint.
RUN sed -i 's/\r$//' /usr/local/bin/backup-entrypoint.sh \
                     /usr/local/bin/run-backup.sh \
                     /usr/local/bin/verify-restore.sh \
    && chmod +x /usr/local/bin/backup-entrypoint.sh \
                /usr/local/bin/run-backup.sh \
                /usr/local/bin/verify-restore.sh

# Runs as root on purpose. It reads a volume the app owns as uid 1001 and writes
# a status file the app then reads back; the container has no network service
# and no way in.
ENTRYPOINT ["/usr/local/bin/backup-entrypoint.sh"]
