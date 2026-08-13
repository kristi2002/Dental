# DentOrganizer

A lightweight practice organizer and CRM for a small dental clinic. Built for a
dentist who trusts pen and paper: large type, high contrast, visible borders, and
every screen doing one obvious thing.

**No payments, no billing, no cash register, no fiscalization** — by design.

## Features

| Area | What it does |
| --- | --- |
| **Dashboard** | Today's schedule, recalls due, low-stock alerts, one-tap "New patient" / "New appointment" |
| **Today** | One morning brief — the day's list, free gaps, who to call, what's low — to print or send to the group chat |
| **Appointments** | Day (hour grid), Week (7 columns) and List (month agenda) views |
| **Scheduling** | Duration auto-filled from the service, double-booking warned (and overridable), free gaps per day |
| **Confirmations** | Patients answer a signed link — no login — and a decline frees the slot automatically |
| **Waiting list** | Who wants an earlier slot, matched against the day's actual gaps |
| **Recalls** | Works out who is overdue for a check-up and who to follow up after treatment |
| **Reminders** | Pre-filled WhatsApp (`wa.me`) and email (`mailto:`) links — the dentist reviews and sends |
| **Patients** | Searchable database, contact details, medical notes, visit timeline, recall interval, no-show flags |
| **Dental chart** | Simplified 2D chart of all 32 teeth, one click per tooth to record its condition |
| **Treatment plans** | Multi-visit courses with ordered steps and a visible "3 of 5 done" progress line |
| **Files** | X-rays, photos and consent forms per patient, stored outside the web root |
| **Prescriptions** | Reusable templates, issued text kept verbatim, printable one-page sheet |
| **Services** | Treatment catalog grouped by category, duration, and the materials each one consumes |
| **Stock** | Minimum levels, one-tap +1 / −1, automatic deduction from visits, and a suggested order from real consumption |
| **Statistics** | Visits per month, new patients, top services, material usage, appointment outcomes |
| **Staff and roles** | Four roles with distinct permissions, PIN sign-in, and a visible permission matrix |
| **Activity log** | Append-only record of every change and who made it |
| **Backup** | Owner-only full export, optionally encrypted with a passphrase |

Full interface in **Albanian (default)**, **English** and **Italian**.

## Roles and permissions

Everyone signs in by picking their name and typing a 4–6 digit PIN. There is no
self-service signup — the owner creates every account from the Staff page.

| Role | Can do |
| --- | --- |
| **Owner / Dentist** | Everything, including staff, deletions and statistics |
| **Assistant / Nurse** | Full clinical record and stock, no business figures, no deletions, cannot prescribe |
| **Receptionist** | Scheduling and contact details; the medical record stays closed |
| **Read-only / Locum** | Reads everything relevant, changes nothing |

Prescribing is the one clinical act withheld from the assistant: it carries the
dentist's signature and is not a task that can be delegated.

Deletion is owner-only across the board: in a small clinic an accidental delete
costs far more than asking. Everyone else cancels, deactivates or corrects.

The whole model lives in one table — `src/lib/auth/permissions.ts`. Nothing else
decides who may do what; screens and server actions both ask it. The Staff page
renders the same table, so the owner can answer "can the receptionist see
medical notes?" without reading code.

Enforcement is in two places, and the second is the one that matters:

- Pages call `requirePermission()`, so a hand-typed URL bounces to the dashboard.
- Every server action calls `authorize()` before touching the database, so a
  forged request fails even when the button was never rendered.

Refusals are written to the activity log — a receptionist repeatedly trying to
open the chart is worth seeing.

## Stack

- Next.js 16 (App Router) + React 19 + TypeScript
- Tailwind CSS 4, Lucide icons
- `next-intl` for `sq` / `en` / `it`
- Prisma 7 + PostgreSQL (via the `@prisma/adapter-pg` driver adapter)
- Recharts for the statistics page

## Getting started

### 1. Database

The repo ships a Postgres container matching the default `DATABASE_URL`:

```bash
docker compose up -d
```

Prefer your own PostgreSQL? Create a database and point `DATABASE_URL` at it in
`.env` instead — nothing else changes.

### 2. Environment

`.env` is already present with local defaults. Copy `.env.example` when setting
up another machine:

```bash
cp .env.example .env
```

`AUTH_SECRET` signs the staff session cookie **and** the patient confirmation
links. Development falls back to a fixed string; **production refuses to start
without a real one**. Generate it with:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

Two more, both optional:

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_APP_URL` | The address patients reach. Confirmation links are built from it — without it they point at `localhost` and will not work outside the clinic. |
| `FILE_STORAGE_DIR` | Where X-rays and documents are written. Defaults to `./storage/patient-files`. |

### 3. Schema and demo data

The schema is under migration control — `prisma/migrations/0_init` is the
baseline, and every change since is a numbered migration.

```bash
npm run db:migrate
```

Deploying applies them without asking questions:

```bash
npx prisma migrate deploy
```

```bash
npm run db:seed
```

The seed creates four staff accounts (one per role), 10 patients, a 9-item
service catalog with bills of materials, 10 stock materials (three of them
deliberately below their minimum), appointments spanning four weeks around
today, six months of visit history, dental charts, a waiting list and a couple
of deliberately overdue patients — enough for every screen to be meaningful
immediately.

It prints the demo PINs when it finishes:

| Person | Role | PIN |
| --- | --- | --- |
| Ilir Berisha | Owner / Dentist | `1234` |
| Teuta Gashi | Assistant | `2345` |
| Blerina Nika | Receptionist | `3456` |
| Marco Rossi | Read-only | `4567` |

**Change these from the Staff page before the clinic uses it.**

### 4. Run

```bash
npm run dev
```

Open <http://localhost:3000> — you land on `/sq`. Switch language from the rail
at the bottom-left.

## Deploying

`Dockerfile` builds the production image and `docker-compose.prod.yml` describes
the deployed stack — the app, Postgres, and the volume holding patient files.
The container reconciles its own schema on boot and refuses to start without
`DATABASE_URL` and `AUTH_SECRET`.

See **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)** for the Coolify walkthrough. Two
things there are easy to get wrong and expensive to discover later: `/data` must
be a mounted volume or every uploaded X-ray dies with the container, and
`NEXT_PUBLIC_*` values are compiled into the browser bundle, so they are build
variables rather than runtime ones.

### The first account

A fresh database has no staff accounts, so **open the deployed site and it takes
you to `/setup`** — a one-time page that creates the Owner and signs you in.
Everyone else is added from the Staff page afterwards.

That page exists only while the staff table is empty. It redirects to sign-in the
moment anybody exists, and the row it writes is inserted *conditionally on the
table still being empty*, so two people submitting at once cannot both become
owners. It is not a signup: there is deliberately no way to create an account
from outside once the practice has one.

Because it is open for the minutes between deploying and setting up, do the setup
immediately after the first deploy.

Prefer a shell? The original path still works and behaves the same way:

```bash
node /app/docker/create-owner.mjs "Ilir" "Berisha"
```

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | Production build (runs `prisma generate` first) |
| `npm start` | Serve the production build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run db:migrate` | Create and apply a named migration (development) |
| `npm run db:deploy` | Apply pending migrations (release step — needs no shadow database) |
| `npm run db:push` | Sync the schema without a migration file. Prefer `db:migrate` |
| `npm run db:seed` | Load demo data (**clears existing rows first**) |
| `npm run db:studio` | Prisma Studio |
| `npm test` | Unit tests for the pure logic (`node:test`, no database needed) |

## How things are laid out

```
prisma/
  schema.prisma      StaffUser, AuditLog, Patient, Appointment, VisitRecord,
                     VisitService, ToothRecord, StockItem, StockMovement,
                     Service, ServiceMaterial, WaitlistEntry, TreatmentPlan,
                     PatientAlert, Contact, ClinicHours, Closure
  seed.ts            Demo data
  migrations/              Migration history. `0_init` is the baseline.
  migrate-teeth-fdi.ts     One-off: Universal 1–32 → FDI tooth numbers
  backfill-services.ts     One-off: give existing rows their service ids and
                           search keys, and turn each visit's typed list into
                           VisitService rows
  restore-backup.ts        Replay a backup file into an empty database
  prune-audit.ts           Archive and trim the activity log
  sweep-orphan-files.ts    Delete patient files no record points at
                           (every one of these is a dry run without --apply)
prisma.config.ts     Prisma 7 config — holds DATABASE_URL and the seed command
messages/            sq.json · en.json · it.json  (identical key sets)
src/
  app/[locale]/
    login/           Staff picker + PIN pad, rendered without the app chrome
    (app)/           Everything behind sign-in; its layout calls requireUser()
  components/        ui/ (Card, Badge, FormDialog, …) + one folder per feature
  i18n/              routing · request config · locale-aware navigation
  lib/
    auth/
      permissions.ts The whole access model: permissions + role matrix
      guard.ts       authorize() for actions, requirePermission() for pages
      session.ts     Current user, cached per request
      token.ts       HMAC-signed cookie (Web Crypto, runs in either runtime)
      crypto.ts      scrypt PIN hashing
    actions/         Server actions, one file per entity
    queries.ts       Shared reads
    dates.ts         UTC-midnight day arithmetic
    scheduling.ts    Conflict detection and free-gap finding
    recalls.ts       Who is overdue, and who to follow up
    reliability.ts   No-show scoring from appointment history
    reorder.ts       Burn rate and suggested order quantities
    confirmations.ts Signed, storage-free patient confirmation links
    files.ts         Disk storage for X-rays (server-only)
    file-constants.ts  Size/type limits shared with the upload form
    stock-consumption.ts  Turns a recorded visit into stock movements
    teeth.ts         The 32-tooth model and its colour legend
    reminders.ts     wa.me / mailto link builders
  proxy.ts           next-intl locale negotiation (Next 16 middleware)
```

### Conventions worth knowing

- **Dates.** Appointment days are stored at UTC midnight and everything is
  formatted with `timeZone: 'UTC'`, so the calendar day never shifts between
  server and browser.
- **Tooth numbering.** Universal Numbering System, 1–32: teeth 1–16 upper,
  17–32 lower. A tooth that is healthy with no note stores no row at all.
- **Phone numbers.** `wa.me` links normalise Albanian formats — a local
  `069…` becomes `35569…`. Change the country code in `src/lib/reminders.ts`.
- **Stock movements.** Every quantity change is logged to `StockMovement`, which
  is what the "material usage" chart reads. Recording a visit deducts the
  materials of each catalog service it included, in one movement per material.
- **Reminders are never sent automatically.** Each button opens WhatsApp or the
  mail client with the message pre-filled; the dentist stays the sender. That
  holds for recalls and waiting-list offers too — the app decides *who* to
  contact, never *that* they were contacted.
- **Clinical data is stripped server-side, not hidden with CSS.** A role without
  `patient.medical.view` never receives the notes in the first place, because a
  hidden field still ships to the browser.
- **Double-booking warns rather than blocks.** Squeezing in an emergency is a
  real thing a dentist does; the second submit carries an explicit override.
- **Staff are deactivated, never deleted.** The audit trail, recorded visits and
  stock movements all point at them and should keep reading correctly.
- **Patient files never sit under `public/`.** Anything in there is served to the
  whole internet by filename, and a radiograph is medical data. Files live in
  `storage/` (git-ignored) and are handed out only by `/api/documents/[id]`,
  which checks the session first and 404s without one.
- **Confirmation links carry no stored secret.** The token is an HMAC of the
  appointment id, so there is no table to leak and nothing to expire. It grants
  exactly two actions on exactly one appointment, and the page behind it shows a
  first name and a time — nothing that would matter if the link were forwarded.
- **Issued prescriptions keep their own copy of the text.** Editing a template
  later must never rewrite what a patient was actually handed.
- **Backups exclude PIN hashes and uploaded files.** A backup should restore the
  practice, not become an offline target for cracking staff credentials. Copy
  the `storage/` directory alongside it with your ordinary file backup.

## Adding a language

1. Copy `messages/en.json` to `messages/<code>.json` and translate the values.
2. Add the code to `locales` and `localeLabels` in `src/i18n/routing.ts`.

Every key must exist in every file — there is no fallback locale.
