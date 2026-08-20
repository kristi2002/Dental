# Backup and restore

Everything the practice cannot afford to lose, where the copies are, and the
exact commands to get them back.

Read the [In an emergency](#in-an-emergency) section first if something has
already gone wrong. The rest is setup and maintenance.

---

## What is copied, and where

The practice is two things, and they are protected by different machinery
because they fail independently.

| | Holds | Lives in | Copied by |
| --- | --- | --- | --- |
| **Postgres** | Every record: patients, appointments, charts, plans, prescriptions, stock, the lab register, the seven-year activity log, and the staff PIN hashes | the `db-data` volume | `pg_dump` twice a day |
| **`/data/patient-files`** | X-rays, clinical photographs, signed consent forms | the `patient-files` volume | copied file by file, same run |

**No database dump has ever contained a radiograph.** A restore of Postgres
alone brings the records back pointing at storage keys, and every document in
every chart is broken. The two halves are backed up together, in one snapshot,
for exactly this reason.

### The three copies

Three copies, on two kinds of media, one of them in another company's building —
the old rule, and it is old because it works.

1. **On the server** — `/backups/db` in the `backup-local` volume. The last
   fourteen days of dumps. Fast, and worthless against the failure that actually
   kills a clinic: this volume dies with the machine.
2. **Backblaze B2, EU Central** — encrypted before it leaves Germany,
   deduplicated, kept 14 daily / 8 weekly / 24 monthly. This is the copy that
   survives the server.
3. **A disk in the clinic** — pulled down nightly by
   [`scripts/backup-pull.ps1`](../scripts/backup-pull.ps1). The copy the practice
   physically holds, and the one that survives a lost cloud account.

### The schedule

| When | What |
| --- | --- |
| 02:00 and 13:00 daily | Dump, verify the dump is readable, copy both halves offsite |
| 03:30 Sunday | Restore drill — see [Checking it works](#checking-it-works) |
| 04:30 daily | The clinic PC pulls the newest snapshot down to a local disk |

Twice a day rather than nightly because it costs almost nothing — restic
deduplicates, so the second run of the day uploads only what changed — and it
halves the worst case. A total loss at noon costs the morning, not the day.

---

## The three secrets that must not live only on the server

This is the single most important paragraph in this file.

| Secret | Without it |
| --- | --- |
| `RESTIC_PASSWORD` | **The offsite backup is undecryptable noise.** Not "hard to read" — mathematically gone. |
| `AUTH_SECRET` | The restored app refuses to start. |
| The Postgres password | The restored app cannot reach its own database. |

All three are held by Coolify, on the server. If the server is what died, and
the only copy of `RESTIC_PASSWORD` died with it, then the backups have been
running perfectly for a year and every one of them is worthless.

**Generate `RESTIC_PASSWORD` yourself, write it into the practice's password
manager, and put it on paper in the safe — then paste it into Coolify.** Do not
let Coolify generate this one; a generated secret you have never seen is a
secret you do not have a copy of.

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

---

## First-time setup

### 1. The bucket

In Backblaze B2 → **Buckets** → **Create a Bucket**:

- Name: something unique — `dentorganizer-backup-<clinic>`
- Files in bucket are: **Private**
- Default encryption: **Enable** (this is B2's own at-rest layer; restic has
  already encrypted everything before it arrives, so this is a second lock on
  the same door)
- Object Lock: **Disable** — see the note below
- Region: an **EU** one. The server is in Germany and the records are
  Article 9 health data; keeping both inside the EU is what makes the paperwork
  a single processor agreement rather than a transfer assessment.

Then **Lifecycle Settings** → **Use custom rules**, and set *Keep prior versions
for this many days* to **30**.

That rule is the ransomware defence, and it is worth understanding rather than
just copying. Something that takes over the server can reach the backup
credentials and delete everything in the bucket. With versioning and this rule,
"delete" only hides the current version — the real bytes stay for thirty days,
recoverable by whoever holds the **account** login, which is not on the server.

> **Why not Object Lock?** Object Lock in compliance mode would make the data
> genuinely immutable, but restic's `prune` rewrites pack files, and immutable
> files cannot be rewritten. The repository would grow without limit and
> retention would stop working. Versioning plus a lifetime rule buys the same
> thirty-day protection while leaving housekeeping possible. It is the honest
> trade, and it is the one this setup makes.

Note the bucket's **Endpoint** from the bucket list — it looks like
`s3.eu-central-003.backblazeb2.com`, and the number in the middle differs per
account.

### 2. The keys

Two keys, because two machines with different jobs.

**Account → Application Keys → Add a New Application Key**

| | The server | The clinic PC |
| --- | --- | --- |
| Name | `dentorganizer-server` | `dentorganizer-pull` |
| Allow access to | this bucket only | this bucket only |
| Type of access | **Read and Write** | **Read Only** |

Copy the `keyID` and `applicationKey` immediately — B2 shows the second one
once and never again.

The PC's key is read-only on purpose. Nothing about downloading a backup
requires the ability to destroy one, and a reception machine is the least
defended computer in the building.

### 3. Coolify

Add to the application's environment variables:

| Name | Value |
| --- | --- |
| `RESTIC_REPOSITORY` | `s3:s3.eu-central-003.backblazeb2.com/dentorganizer-backup-<clinic>` |
| `RESTIC_PASSWORD` | the passphrase from the safe |
| `BACKUP_S3_KEY_ID` | the server key's `keyID` |
| `BACKUP_S3_APPLICATION_KEY` | the server key's `applicationKey` |

Redeploy. The sidecar runs once at boot rather than waiting for 02:00, so the
deploy log tells you immediately whether it works:

```bash
docker compose logs backup
```

A healthy first run says `initialising the repository`, then `snapshot <id>`.
Within a minute the Staff page shows the backup card in green.

### 4. The clinic PC

On the machine that will hold the local copy:

```powershell
winget install restic.restic
```

Set the four values for that user — note the **read-only** key:

```powershell
setx RESTIC_REPOSITORY "s3:s3.eu-central-003.backblazeb2.com/dentorganizer-backup-<clinic>"
setx RESTIC_PASSWORD "<the same passphrase>"
setx AWS_ACCESS_KEY_ID "<the read-only keyID>"
setx AWS_SECRET_ACCESS_KEY "<the read-only applicationKey>"
```

Open a new terminal (so `setx` takes effect) and register the nightly task:

```powershell
.\scripts\backup-pull.ps1 -Destination D:\DentalBackup -Install
```

Then run it once by hand to prove it works before trusting it.

### 5. The disk in the safe

Once a week, copy `D:\DentalBackup` to an external drive and take it out of the
building. Rotate two drives so one is always off-site.

This is the copy that survives the fire, the burglary, and the day somebody
phishes the Backblaze login. It is also the only copy in the whole arrangement
that is not reachable from any network, which is the entire point of it.

---

## In an emergency

### The server is gone

Roughly forty minutes, most of it downloading.

**1. Get the repository open on any machine with restic and Docker.**

```bash
export RESTIC_REPOSITORY="s3:s3.eu-central-003.backblazeb2.com/dentorganizer-backup-<clinic>"
export RESTIC_PASSWORD="<from the safe>"
export AWS_ACCESS_KEY_ID="<keyID>"
export AWS_SECRET_ACCESS_KEY="<applicationKey>"

restic snapshots
```

If a local pull is current, skip the download entirely and use
`D:\DentalBackup` — it holds the same tree.

**2. Pull the newest snapshot down.**

```bash
restic restore latest --host dentorganizer --target /restore
```

You now have `/restore/backups/db/*.dump` and `/restore/data/patient-files/`.

**3. Bring up the database, and only the database.**

Order matters here. The app's entrypoint runs `prisma migrate deploy` at boot,
so starting the whole stack first would create an empty schema for `pg_restore`
to collide with.

```bash
docker compose -f docker-compose.prod.yml up -d db
```

**4. Restore the records.**

```bash
pg_restore \
  --dbname="postgresql://dent:<password>@localhost:5432/dentorganizer" \
  --no-owner --no-privileges --exit-on-error \
  /restore/backups/db/dentorganizer-<newest>.dump
```

**5. Restore the files.** Find the volume name first — Coolify prefixes it with
the project name.

```bash
docker volume ls | grep patient-files

docker run --rm \
  -v <project>_patient-files:/data \
  -v /restore/data/patient-files:/src:ro \
  alpine sh -c "mkdir -p /data/patient-files && cp -a /src/. /data/patient-files/"
```

**6. Start the app.**

```bash
docker compose -f docker-compose.prod.yml up -d
```

The dump carries `_prisma_migrations`, so the entrypoint sees the schema as
managed and applies only what is genuinely newer than the backup.

**7. Sign in.** Staff PIN hashes *are* in the dump — unlike the manual JSON
export, which leaves them out on purpose — so everyone's existing PIN still
works, provided `AUTH_SECRET` is the same one from the safe. If it is not,
sessions are invalid but accounts are fine: everyone signs in again.

### Somebody deleted something and it needs to come back

Never restore over the live database to recover one record. Restore beside it
and copy the row across.

```bash
restic restore latest --host dentorganizer --target /tmp/r --include /backups/db

createdb dentorganizer_yesterday
pg_restore --dbname="postgresql://dent:<password>@localhost:5432/dentorganizer_yesterday" \
  --no-owner --no-privileges /tmp/r/backups/db/dentorganizer-<the one you want>.dump
```

Then read what you need out of `dentorganizer_yesterday`, put it back by hand,
and `dropdb` it. The application's own delete rules exist for a reason and a
bulk copy would drive straight through them.

To reach further back than the local dumps, list what the repository holds:

```bash
restic snapshots --host dentorganizer
restic restore <snapshot-id> --target /tmp/r --include /backups/db
```

### A document will not open / files are missing

The Sunday drill reports this on the Staff page as *"N missing from the
backup"*, with the first few storage keys named. To get one back:

```bash
restic restore latest --host dentorganizer --target /tmp/r \
  --include /data/patient-files/<storage-key>
```

If the drill says files are missing, check the obvious cause first: the
`patient-files` volume is mounted read-only into the backup container, and a
deploy that dropped the mount would show as every file missing at once rather
than a handful.

---

## Checking it works

An untested backup is a hope. Three things test this one, and none of them
requires anybody to remember anything.

**Every run** verifies the dump it just wrote is readable with
`pg_restore --list`, before it is moved into place. A truncated dump never gets
a real filename.

**Every Sunday at 03:30**, `verify-restore.sh` performs a full drill against the
copy in the bucket — not the one on the server's disk, because the local one is
not what would be reached for in a disaster:

1. `restic check`, re-reading a fifty-second of the repository's data blocks, so
   a year of drills reads all of it.
2. Restores the newest dump into a throwaway `dentorganizer_verify` database on
   the real Postgres, at the real version.
3. Counts the rows in nine tables and reports them next to the live counts.
4. **Reconciles every stored file the records point at against what is actually
   in the backup** — `PatientDocument`, `FollowUpAttachment`, and both stock
   photo columns.

Step 4 is the one that would otherwise go unasked for years. The records and the
radiographs are copied by different machinery and fail independently, so a
storage directory that quietly stopped being backed up in March looks exactly
like one that is fine, right up until somebody opens a chart.

**On screen**, the Staff page shows the last successful copy, the number of
snapshots, and the result of the last drill. If nothing has succeeded for 26
hours the owner gets a warning bar on every page; after 48 it turns red. The age
is measured from the last *success*, never the last attempt — a sidecar failing
every twelve hours since Tuesday is punctual and protecting nothing.

---

## Maintenance

### Restore for real, once a year

Book an hour. Follow [The server is gone](#the-server-is-gone) against a spare
machine or a local Docker, and sign in to the restored copy. The Sunday drill
proves the data restores; this proves *you* can do it, which is a different
thing and the one that actually fails on the day.

### Retention and cost

Fourteen daily, eight weekly, twenty-four monthly. Deduplication means the
history is almost free — the second copy of a mostly-unchanged database is a few
kilobytes, and an X-ray uploaded once is stored once no matter how many
snapshots contain it. Expect single-digit euros a year at clinic scale.

Change it in Coolify with `BACKUP_KEEP_DAILY`, `BACKUP_KEEP_WEEKLY`,
`BACKUP_KEEP_MONTHLY`, then redeploy.

### When keys are rotated

Rotating the B2 keys is safe and needs nothing but new values in Coolify.
Rotating `RESTIC_PASSWORD` is **not**: existing snapshots stay encrypted with the
old one. Add a new key to the repository rather than replacing the passphrase:

```bash
restic key add
```

### What none of this covers

- **The Coolify configuration itself** — environment variables, the domain, the
  TLS setup. Rebuilding those is an hour of clicking, and
  [DEPLOYMENT.md](DEPLOYMENT.md) is the instructions. Keep a copy of the
  environment variables in the password manager.
- **Anything typed since the last run.** Up to twelve hours, by design. If that
  is too much, add more times to `BACKUP_SCHEDULE`; the runs are cheap.
- **A mistake nobody notices for six months.** Retention reaches back two years
  in monthly steps, which is the honest limit — a bad edit older than the oldest
  snapshot is not recoverable from here.
