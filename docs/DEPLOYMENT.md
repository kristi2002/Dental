# Deploying to Coolify

Target: **https://dental.testdemo.it**

## What is being deployed

| Piece | Where it lives | Survives a redeploy? |
| --- | --- | --- |
| Next.js app | `Dockerfile` → standalone server on port 3000 | n/a — replaced each deploy |
| Postgres | `docker-compose.prod.yml`, or Coolify's managed database | Yes, in a named volume |
| Patient files (X-rays, photos, consent forms) | Volume mounted at `/data` | **Only if the volume is mounted** |

The image is self-healing on boot: it reconciles the database schema, then starts
the server. It refuses to start at all if `DATABASE_URL` or `AUTH_SECRET` is
missing, rather than failing later inside a request.

## Before you start

Point DNS at the server:

```
A    dental.testdemo.it    →    <your Coolify server's IP>
```

Coolify issues the Let's Encrypt certificate itself once the record resolves.

---

## Path A — Docker Compose (recommended)

Deploys the app and its database together, so the whole stack is described by a
file in the repo.

1. **New Resource → Docker Compose**, connected to this Git repository.
2. Set the compose file to `docker-compose.prod.yml`.
3. Set the domain for the `app` service to `https://dental.testdemo.it`.
4. Under **Build Variables**, set:

   | Name | Value |
   | --- | --- |
   | `NEXT_PUBLIC_APP_URL` | `https://dental.testdemo.it` |
   | `NEXT_PUBLIC_CLINIC_NAME` | the clinic's name |

5. Deploy.

`SERVICE_PASSWORD_POSTGRES` and `SERVICE_PASSWORD_64_AUTHSECRET` in the compose
file are Coolify's own convention: it generates each secret once, stores it, and
injects it. You do not set them by hand, and they stay stable across deploys —
which matters for `AUTH_SECRET`, because changing it signs every user out.

Both volumes (`db-data`, `patient-files`) are declared in the compose file, so
persistence is handled.

Everything optional — the mail provider, the clinic's time zone, how long a
session may idle — goes in Coolify's ordinary **Environment Variables**, and
`docker-compose.prod.yml` names each one so it reaches the container. That
naming is the part that matters: Compose hands a service only the variables the
file asks for, so a variable set in Coolify but absent from the compose file is
one the app never sees. If you add a setting the app reads, add it there too.

---

## Path B — Dockerfile plus Coolify's managed Postgres

Slightly more clicking, but you get Coolify's database backup UI.

1. **New Resource → PostgreSQL**. Note the *internal* connection URL.
2. **New Resource → Application**, this Git repository, build pack **Dockerfile**.
3. Domain: `https://dental.testdemo.it`. Port: `3000`.
4. **Environment Variables**:

   | Name | Value |
   | --- | --- |
   | `DATABASE_URL` | the internal URL from step 1, with `?schema=public` |
   | `AUTH_SECRET` | 32+ random characters (see below) |
   | `JOBS_SECRET` | 32+ random characters, different from the one above (see step 8) |

   ```bash
   node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
   ```

5. **Build Variables**: `NEXT_PUBLIC_APP_URL` and `NEXT_PUBLIC_CLINIC_NAME`, as in Path A.
6. **Persistent Storage** — this one is not optional:

   | Mount path | Why |
   | --- | --- |
   | `/data` | Patient files. Without it, every uploaded X-ray is destroyed by the next deploy. |

   The container prints a loud warning in its logs if `/data` is not a mount, so
   check the first boot log if you are unsure.

7. Deploy.

8. **The schedule** — the step it is easiest not to notice is missing.

   Path A deploys four containers; this one deploys the app on its own. The
   `jobs` sidecar that asks the app to queue tomorrow's reminders, and the
   `backup` sidecar that dumps the database, exist only in
   `docker-compose.prod.yml`. Nothing here replaces them, and nothing on screen
   says so: the app fails closed, so an unset `JOBS_SECRET` means every trigger
   is refused, no reminders are ever queued, and the Messages page simply stays
   empty as though the practice had a quiet week.

   So set `JOBS_SECRET` above, then add two **Scheduled Tasks** to the
   application in Coolify, both running in the `app` container:

   | Frequency | Job |
   | --- | --- |
   | `0 18 * * *` | `queue-appointment-reminders` |
   | `15 3 * * 0` | `sweep-orphan-files` |

   The command, with the job name substituted in:

   ```bash
   node -e "fetch('http://127.0.0.1:3000/api/jobs/JOB_NAME',{method:'POST',headers:{'x-jobs-secret':process.env.JOBS_SECRET}}).then(async r=>{console.log(r.status,await r.text());process.exitCode=r.ok?0:1}).catch(e=>{console.error(e.message);process.exitCode=1})"
   ```

   `node`, not `curl`: the runtime image is Alpine and carries neither `curl`
   nor a `wget` that can POST. The `.catch` is not decoration — without it an
   app that is still starting produces an unhandled rejection and a stack trace
   instead of one line saying it could not connect, and `process.exitCode`
   rather than `process.exit()` lets the response finish being read first.

   A 404 means the secret does not match. The route answers identically for an
   unknown job and a wrong secret, on purpose, so a caller who cannot prove
   itself learns nothing from the difference — which also means you cannot tell
   the two apart from here. Check the secret first; it is almost always that.

   Backups are the other half of what the sidecars did. Coolify's own database
   backup covers Postgres; it does not copy `/data`, which is where the X-rays
   are. [RESTORE.md](RESTORE.md) says what to do about that.

   If both of these read as work you would rather not own, that is the honest
   argument for Path A.

---

## First sign-in

A fresh database has **no staff accounts**, and the app has no self-service
signup — so nobody can sign in until the first Owner exists.

**Open the site.** With an empty staff table you land on `/setup`, which asks for
a name and a PIN, creates the Owner and signs you in. Add everyone else from the
Staff page afterwards.

Do it straight after deploying. The page is only reachable while the practice has
nobody in it — it redirects to sign-in the moment an account exists, and the
insert behind it is conditional on the table still being empty, so a second
submission arriving at the same instant creates nothing. But between the deploy
finishing and you setting up, that door is open to whoever knows the URL.

If you would rather not have it open at all, create the Owner from a shell first
(Coolify's terminal for the app, or `docker exec`) — one account is enough to
close `/setup` permanently:

```bash
node /app/docker/create-owner.mjs "Ilir" "Berisha"
```

It prints a generated PIN once and never again — the PIN is stored only as a
scrypt hash. Write it down, sign in, then change it and add the rest of the staff
from the Staff page. Pass a PIN as a third argument if you want to choose it.

The script refuses to run if any staff account already exists, so it cannot
quietly add an owner to a practice already in use.

> Deploying a **demo** rather than a real clinic? Run the seed instead, from a
> workstation with the repo checked out and `DATABASE_URL` pointing at the
> deployed database: `npm run db:seed`. It creates four accounts with known PINs
> and a set of demo patients — and **clears existing rows first**, so never point
> it at a database in real use.

---

## Build-time versus runtime configuration

`NEXT_PUBLIC_*` values are compiled into the JavaScript sent to the browser. They
are fixed when the image is built and **editing them in the runtime environment
does nothing.** To change the domain or clinic name, change the build variable and
redeploy.

This matters most for `NEXT_PUBLIC_APP_URL`: it is the base of the confirmation
links patients receive by message. Wrong value, dead links.

Everything else — `DATABASE_URL`, `AUTH_SECRET`, `FILE_STORAGE_DIR` — is read at
runtime and takes effect on restart.

## Schema changes

The schema is under migration control in `prisma/migrations`. The container runs
`prisma migrate deploy` on every boot, so a schema change ships with an ordinary
deploy: whatever is pending is replayed, in order, and recorded in the
`_prisma_migrations` table.

Authoring one, against a database that already holds the previous shape:

```bash
npx prisma migrate diff \
  --from-migrations prisma/migrations \
  --to-schema prisma/schema.prisma \
  --script -o /tmp/next.sql
mkdir -p prisma/migrations/$(date -u +%Y%m%d%H%M%S)_short_name
mv /tmp/next.sql prisma/migrations/$(date -u +%Y%m%d%H%M%S)_short_name/migration.sql
```

`--from-migrations` replays the history into a scratch database first, so it
needs `SHADOW_DATABASE_URL` set to a database the role may create and drop. The
clinic's own role cannot, which is why that variable is optional and unset in
production — `migrate deploy` only ever replays forward and never diffs.

Read the generated SQL before committing it. It is the review step `db push`
never had, and the place to notice that a column is about to be dropped or a
`NOT NULL` added to a table that already has rows.

CI fails the build if `prisma/migrations` and `prisma/schema.prisma` disagree, so
a schema change committed without its migration does not reach a deploy.

Set `AUTO_DB_MIGRATE=false` to skip the step entirely and manage the schema
yourself. `AUTO_DB_PUSH=false` is still honoured under its old name.

### Baselining an existing database

**This applies once, to a database created before the switch to migrations, and
to nothing else.** If the entrypoint stops with

```
[entrypoint] This database has our tables but no _prisma_migrations table.
```

then it is looking at a database the old `prisma db push` workflow built. The
tables are all there; the record of *which migrations produced them* is not, and
`migrate deploy` would start at `0_init` and try to create tables that already
exist.

Nothing has been changed and nothing is wrong. What is needed is a statement of
which migrations those tables already reflect. Because `db push` always brought
the database to the schema of the image being deployed, a database last pushed
by the current image reflects **all** of them:

```bash
# 1. Take a backup first. This writes to _prisma_migrations, and there is no undo.
pg_dump "$DATABASE_URL" > pre-baseline.sql

# 2. Confirm the tables really do match the current schema — no output means yes.
npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma

# 3. Mark every existing migration as already applied.
for m in prisma/migrations/*/; do
  npx prisma migrate resolve --applied "$(basename "$m")"
done
```

If step 2 reports differences, **stop**. The database is on an older schema than
the current image, so only the migrations up to that point may be marked applied
and the rest must be allowed to run. Work out where it sits before marking
anything.

After that the database is `managed`, the entrypoint stops complaining, and every
later deploy is an ordinary `migrate deploy`.

## Sending email

Optional. With none of `MAIL_PROVIDER`, `MAIL_API_KEY` or `MAIL_FROM` set, the
send queue opens a draft in whoever's mail client — the way the app has always
worked, and a perfectly good way to run a practice. Setting all three turns the
queue's email button into one that sends. **Nothing sends by itself either way;
a person still presses the button on a row they have read.**

Pick **Brevo** (300 messages a day, free) or **Resend** (100 a day, free). Both
are configured the same way: verify a sending domain, take the transactional API
key, paste it into Coolify. A practice sending thirty reminders a day will not
reach either ceiling.

The app talks to the provider's HTTPS API rather than over SMTP, deliberately:
hosts block outbound 25, 465 and 587 far more often than they block 443, and a
clinic whose reminders fail silently behind a firewall rule is exactly the
outcome this should not ship with.

### The three DNS records

Without these, the provider accepts every message and the world's mail servers
file them as spam. This is the step that gets skipped, and its failure is
invisible from inside the app — which is why Settings → Sending email has a test
button that puts a message in the practice's own inbox, so somebody can *see*
which folder it lands in.

On Cloudflare, at **DNS → Records** for the sending domain. Every value below is
given to you by the provider; do not copy these verbatim.

| Type | Name | Value | Proxy |
| --- | --- | --- | --- |
| `TXT` | `@` | `v=spf1 include:<provider's host> ~all` | — |
| `TXT` | `<selector>._domainkey` | the DKIM key the provider shows | — |
| `TXT` | `_dmarc` | `v=DMARC1; p=none; rua=mailto:postmaster@yourdomain` | — |

Three notes that account for most of the failures:

- **One SPF record per domain.** If the domain already has a `v=spf1` line, add
  the `include:` to the existing one rather than creating a second — two SPF
  records is a misconfiguration and mail servers treat it as such.
- **Proxy status must be DNS-only** (grey cloud) for anything mail-related.
  Cloudflare's orange cloud is for HTTP; there is nothing to proxy here.
- **Start DMARC at `p=none`.** It reports without rejecting. Move to
  `p=quarantine` once the reports show the practice's own mail passing, not
  before, or a mistake in the other two records silently bins real reminders.

Verification can take an hour to propagate. The provider's dashboard is the
authority on whether it worked; the app cannot see any of it.

### Replies

Set `MAIL_REPLY_TO` to a mailbox somebody actually reads. It is optional and it
is the one option worth setting: without it the header is omitted and an answer
to a reminder goes back to `MAIL_FROM`, which for a `no-reply@` address is
nowhere. A reminder system whose replies land nowhere is a way of not hearing
from patients — "can we move it to Thursday?" is the commonest reply there is.

Settings → Sending email shows which address is in use, and warns when none is.

## Backups

**Full instructions, including creating the bucket and restoring from it, are in
[RESTORE.md](RESTORE.md).** The short version:

`docker-compose.prod.yml` includes a `backup` service that dumps Postgres at
02:00 and 13:00, copies the dump *and* the `/data` volume to a Backblaze B2
bucket encrypted, and rehearses the restore every Sunday. It needs four
environment variables — `RESTIC_REPOSITORY`, `RESTIC_PASSWORD`,
`BACKUP_S3_KEY_ID`, `BACKUP_S3_APPLICATION_KEY` — and does nothing offsite
without them.

Two things need copying and the database is only one of them:

- **Postgres** — every record, including the staff PIN hashes.
- **`/data`** — the patient files. Nothing in a database dump contains them.
  Restoring the database alone brings the records back pointing at storage keys
  and every document in every chart is broken.

The sidecar covers both, in one snapshot, so a restore cannot pair Tuesday's
records with Monday's radiographs.

> **The passphrase must not live only on this server.** `RESTIC_PASSWORD` is
> what decrypts the offsite copy. If the only copy of it is on the machine that
> died, the backups are undecryptable noise. Generate it yourself, put it in the
> password manager and on paper, *then* paste it into Coolify.

Path B (Coolify's managed Postgres) also has its own database backup UI, which
covers the records but not `/data` — the sidecar is still what copies the
radiographs.

The app's own owner-only export (Staff → Backup) remains, as the portable
by-hand copy. It carries neither PIN hashes nor uploaded files by design, so it
is a supplement to the automatic backup rather than a substitute for it. The
Staff page also reports what the automatic backup did last, and the app shows
the owner a warning bar when nothing has succeeded for 26 hours.

## Troubleshooting

| Symptom | Cause |
| --- | --- |
| Container restarts, log says `FATAL: AUTH_SECRET` | Not set, or under 16 characters. |
| `database not ready yet (attempt n/10)` | Postgres is still starting, or `DATABASE_URL` is wrong. It retries ten times, then gives up. |
| Log warns `/data/patient-files is NOT a mounted volume` | No persistent storage mapped. Uploads will be lost on redeploy. |
| A warning bar across every page saying backups have stopped | The `backup` sidecar has not completed a run for 26 hours. `docker compose logs backup` says why; [RESTORE.md](RESTORE.md) covers the setup. |
| `backup` logs `RESTIC_REPOSITORY is not set` | Expected until the bucket is configured. Dumps are being written to the server's own disk and nowhere else. |
| Login page lists nobody | No staff accounts yet — see [First sign-in](#first-sign-in). |
| `This database has our tables but no _prisma_migrations table` | Built by the old `db push` workflow. One-time fix: [Baselining an existing database](#baselining-an-existing-database). |
| Confirmation links point at `localhost` | `NEXT_PUBLIC_APP_URL` was not set as a **build** variable. Rebuild. |
| Deploy fails on a schema change | The push refused to lose data. See [Schema changes](#schema-changes). |
| Build never starts: `non-string key in services.app.environment: 0` | An `environment:` entry was written as a bare list item with no `=`. Coolify re-serialises the compose file and such an entry comes back keyed by its list index. Keep `environment:` in mapping (`KEY: value`) form. |

Health endpoint: `GET /api/health` — reports whether the app can reach its
database, and nothing about the practice. Coolify uses it to judge whether a
deploy came up.

## Running the production image locally

```bash
docker compose -f docker-compose.prod.yml up --build
```

Provide `SERVICE_PASSWORD_POSTGRES` and `SERVICE_PASSWORD_64_AUTHSECRET` in a
local env file — outside Coolify nothing generates them for you.
