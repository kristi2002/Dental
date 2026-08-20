# syntax=docker/dockerfile:1

# DentOrganizer — the clock.
#
# A timer and an HTTP client. Nothing else, deliberately: every job runs inside
# the app container, so this needs no database driver, no Node, no Prisma and no
# copy of the schema to fall out of step with. Compare the backup sidecar, which
# is built on `postgres:17-alpine` precisely *because* it does talk to the
# database and its client must move with the server.
#
# The image serves nothing and listens on nothing.
FROM alpine:3.21

# curl  — one request has to yield both a body and a status code; busybox wget
#         gives neither reliably, and cannot POST at all. Asking twice would run
#         the job twice, which is the bug this image exists not to have.
# tzdata — the schedule is written in the clinic's hours, not UTC.
RUN apk add --no-cache curl ca-certificates tzdata

COPY docker/jobs/entrypoint.sh /usr/local/bin/jobs-entrypoint.sh
COPY docker/jobs/run-job.sh /usr/local/bin/run-job.sh

# Edited on Windows as often as not, and a trailing CR turns the shebang into a
# path that does not exist — the same trap the app's and the backup's
# Dockerfiles both document.
RUN sed -i 's/\r$//' /usr/local/bin/jobs-entrypoint.sh /usr/local/bin/run-job.sh \
    && chmod +x /usr/local/bin/jobs-entrypoint.sh /usr/local/bin/run-job.sh

ENTRYPOINT ["/usr/local/bin/jobs-entrypoint.sh"]
