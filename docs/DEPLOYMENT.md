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

The project keeps no migration history; `prisma db push` is its workflow. The
container runs that push on every boot, so an additive schema change ships with
an ordinary deploy.

It runs **without** `--accept-data-loss` on purpose. If a change would drop a
column or table, the push fails, the container does not start, and the deploy
stops — with the offending change named in the logs. That is the intended
behaviour: resolve it deliberately against a backup rather than discovering
afterwards that a column of clinical notes is gone.

Set `AUTO_DB_PUSH=false` to skip the step entirely and manage the schema yourself.

For a practice holding real records, consider moving to `prisma migrate` proper —
`db push` has no history, no review step and no way back.

## Backups

Two things need copying, and the database is only one of them:

- **Postgres** — Coolify backs up managed databases on a schedule (Path B). On
  Path A, back up the `db-data` volume, or add a scheduled `pg_dump`.
- **`/data`** — the patient files. Nothing in a database dump contains them, and
  the in-app backup export deliberately excludes them too. Back up this volume.

The app's own owner-only export (Settings → Backup) covers records but, by
design, neither PIN hashes nor uploaded files.

## Troubleshooting

| Symptom | Cause |
| --- | --- |
| Container restarts, log says `FATAL: AUTH_SECRET` | Not set, or under 16 characters. |
| `database not ready yet (attempt n/10)` | Postgres is still starting, or `DATABASE_URL` is wrong. It retries ten times, then gives up. |
| Log warns `/data/patient-files is NOT a mounted volume` | No persistent storage mapped. Uploads will be lost on redeploy. |
| Login page lists nobody | No staff accounts yet — see [First sign-in](#first-sign-in). |
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
