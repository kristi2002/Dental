# DentOrganizer

A lightweight practice organizer and CRM for a small dental clinic. Built for a
dentist who trusts pen and paper: large type, high contrast, visible borders, and
every screen doing one obvious thing.

**No payments, no billing, no cash register, no fiscalization** — by design.

## Features

| Area | What it does |
| --- | --- |
| **Public page** | The practice's own storefront at `/` and the four pages the masthead links to — every treatment in full with what it costs in visits and days, the practice and what a first visit is like, the rooms as a filterable wall, and where to find them. Opening hours read live from the appointment book, and a request form. Indexable; the rest of the app is not |
| **Requests** | What came in through that form: name, number, and which of the three languages it was written in, so whoever rings back knows what to speak |
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
| **Backup** | Records and uploaded files copied offsite twice a day, encrypted, with a weekly automated restore drill — plus an owner-only export for a copy by hand |

Full interface in **Albanian (default)**, **English** and **Italian**.

## The public page

`/{locale}` is the practice's storefront — the page a patient finds. The
software lives at `/{locale}/dashboard` and everything under it still requires a
sign-in; the storefront is the only part of this deployment that does not, and
the only part `robots.txt` allows a crawler to index.

It is five pages, and the four beyond the front page are the ones the masthead
links to:

| Page | What it answers |
| --- | --- |
| `/{locale}` | Who this practice is, in one screen and one scroll |
| `/{locale}/treatments` | All eight, one entry each — what actually happens, how many appointments, how many days it keeps you in Vlorë |
| `/{locale}/practice` | Dr. Shehu, how the records are kept, what the first visit is like step by step, and the three languages |
| `/{locale}/gallery` | The rooms, the equipment and the people, as a wall you can filter |
| `/{locale}/visit` | Opening hours, address, how to reach Vlorë by air, sea and road — and the request form |

`src/lib/site-paths.ts` is the single list those five are drawn from; `robots.ts`
and `sitemap.ts` both read it, so a page can never be published in one and
refused in the other. `/{locale}/visit#request` is where every "book a visit"
link on the site points — with JavaScript it opens as a panel in place, without
it the browser lands on the real form.

It is built inside the app rather than beside it for one reason: **there is no
second copy of anything.** Opening hours come from the same `ClinicHours` rows
the free-slot search offers appointments from, and a closure entered for a public
holiday closes the public page too. The telephone number, email and address are
the `ClinicProfile` fields the prescription letterhead prints — set them in
**Settings → clinic profile**, not in a content file. A practice that starts
closing at two on Saturdays changes one screen and the public page is already
telling the truth.

Editorial copy — headlines, treatment blurbs — is in `messages/*.json` under
`site`, in all three languages, so it can be translated without touching code.
`tests/messages.test.ts` fails if one language falls behind.

What the page needs before it goes live:

- **Photographs.** Everything in `public/site/` is free-licence stock, credited
  in `src/components/site/photos.ts`. There is deliberately **no portrait** — a
  stock face under a real dentist's name is a fabricated person. Drop the
  practice's own images in at the same paths and clear the `source` field.
- **The telephone number.** Whatever is in `ClinicProfile.phone` is what the page
  dials. Confirm it.
- **`NEXT_PUBLIC_APP_URL`**, which is a *build* variable: the canonical URL,
  `hreflang` alternates, the sitemap and the social card are all built from it,
  and without it they are simply absent.

Requests from the form land in `AppointmentRequest` and are worked on
`/{locale}/requests`, oldest first — the reverse of every other list here,
because a request that has been sitting two days is the urgent one. Nothing is
booked automatically: somebody rings back and puts them in the calendar.

### Motion, and what happens without it

The page moves in three places: the brand strip between the hero and the
treatments, the hero's two-rate parallax, and a rise as each section comes into
view. Two of the three are CSS — the strip is a compositor-driven `translate3d`
loop, and the reveals use `animation-timeline: view()`. Only the hero parallax
and the gallery carousel ship JavaScript (`motion` and `embla-carousel-react`,
about 51KB over the wire between them).

**Nothing on the page is hidden until JavaScript runs**, and there is a test
holding that line. The reveals were a Motion `whileInView` component to begin
with, which server-rendered `opacity:0` onto every card: the page left the server
invisible below the hero, and stayed that way for readers with
`prefers-reduced-motion` set, because the reduced-motion branch swapped the
element type and React reused the DOM node without clearing a style it had not
written. `e2e/storefront.spec.ts` now asserts against the raw HTML that no
`opacity:0` reaches the browser, and separately that a reduced-motion reader gets
a fully visible page and a stopped strip.

Where `animation-timeline` is unsupported the browser simply shows the finished
page, which is the correct outcome rather than a fallback to apologise for.

### The Instagram section is not a feed

`instagram.com/shehu.dental` is behind a login wall — the profile returns a
sign-in shell to anybody not signed in, and the public JSON endpoints are gone —
so the six squares are local placeholder images, and the section says so on the
page in all three languages. The app's CSP (`frame-src 'none'`, `connect-src
'self'`, `img-src 'self'`) rules out the official embed, a client-side fetch and
even hotlinking a thumbnail, so a link-out with local images is the only honest
build as well as the only possible one. To make it real: export six squares from
the account into `public/site/s-1…6.webp`, null their `source` in `photos.ts`,
and delete `site.social.placeholder` from `messages/*.json`.

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
| `npm run lint` | [oxlint](https://oxc.rs/docs/guide/usage/linter), configured in `.oxlintrc.json`. Not ESLint: typescript-eslint refuses to run against TypeScript 7 |
| `npm run db:migrate` | Create and apply a named migration (development) |
| `npm run db:deploy` | Apply pending migrations (release step — needs no shadow database) |
| `npm run db:push` | Sync the schema without a migration file. Prefer `db:migrate` |
| `npm run db:seed` | Load demo data (**clears existing rows first**) |
| `npm run db:studio` | Prisma Studio |
| `npm test` | Unit tests for the pure logic (`node:test`, no database needed) |
| `npm run test:e2e` | End-to-end pass in a browser — builds, serves, seeds its own schema |
| `npm run test:e2e:ui` | The same suite in Playwright's interactive runner |
| `npm run test:e2e:report` | Open the report from the last run |

## Testing

Two suites, answering different questions.

**`npm test`** — 849 assertions over the pure logic and the query shapes, in
about eleven seconds, against no browser and (mostly) no database. This is where
a rule belongs: what `orderOverdue()` decides, what a `where` narrows to, how a
CSV cell is quoted.

**`npm run test:e2e`** — Playwright. Signs in through the real number pad, walks
all forty-four screens, and presses the primary verb on the ones that have one.
It answers the question the first suite structurally cannot: *is any of this
reachable?* Two server actions in this repository were written, permission
guarded, audited and correct, and unreachable from any screen for their entire
lives — a typecheck cannot see that and neither can a unit test. See
`docs/GAPS-PASS-3.md` §B-01 and §B-02, and `docs/GAPS-PASS-4.md` for the two
bugs the browser pass found on its first run.

It needs a Postgres it can reach and a browser:

```bash
npx playwright install chromium
npm run test:e2e
```

Three things worth knowing before you run it:

- **It builds first, every time.** A long-lived `next dev` serves stale
  translations and a stale Prisma client, and it serves them from a build nobody
  is going to deploy. Pass `E2E_SKIP_BUILD=1` while iterating on a spec to reuse
  the last build.
- **It serves the standalone output**, `node .next/standalone/server.js`, which
  is what the container runs — `next start` refuses `output: 'standalone'`
  outright. `scripts/stage-standalone.mjs` supplies the two directories the
  build tracer leaves out, exactly as the Dockerfile does.
- **It seeds, so it needs a schema of its own.** The suite takes your
  `DATABASE_URL`, re-aims it at the `e2e` schema of the same database, migrates
  and seeds *that*, and refuses outright to run against `public`. Nothing it
  does touches the rows you work with. Set `E2E_SCHEMA` if `e2e` is taken.

Outbound mail is blanked in the run's environment (`e2e/env.ts`), so no test can
send a real message no matter which button it presses.

## How things are laid out

```
prisma/
  schema.prisma      StaffUser, AuditLog, Patient, Appointment, VisitRecord,
                     VisitService, ToothRecord, StockItem, StockMovement,
                     Service, ServiceMaterial, WaitlistEntry, TreatmentPlan,
                     PatientAlert, Contact, ClinicHours, Closure,
                     AppointmentRequest
  seed.ts            Demo data
  migrations/              Migration history. `0_init` is the baseline.
  migrate-teeth-fdi.ts     One-off: Universal 1–32 → FDI tooth numbers
  backfill-services.ts     One-off: give existing rows their service ids and
                           search keys, and turn each visit's typed list into
                           VisitService rows
  restore-backup.ts        Replay a by-hand JSON export into an empty database
                           (the automatic backup restores with pg_restore
                           instead — see docs/RESTORE.md)
  prune-audit.ts           Archive and trim the activity log by hand. Nothing
                           runs it for you, and it refuses to go below the
                           seven-year floor
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
docker/
  entrypoint.sh      Applies migrations, then serves
  create-owner.mjs   The first account, on a fresh database
  backup/            The backup sidecar — see docs/RESTORE.md
    run-backup.sh      Dump, verify it is readable, copy offsite, record it
    verify-restore.sh  The Sunday drill: restore the offsite copy for real and
                       reconcile every stored file against the records
scripts/
  backup-pull.ps1    Pulls the offsite backup down to a disk in the clinic
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
- **The by-hand export excludes PIN hashes and uploaded files.** An export
  somebody downloads should restore the practice, not become an offline target
  for cracking staff credentials. The automatic backup is the opposite trade —
  it never leaves the encrypted repository, so it carries both, which is why it
  is the one a real recovery uses. See [docs/RESTORE.md](docs/RESTORE.md).
- **Backups are not a button somebody has to remember to press.** The `backup`
  sidecar dumps Postgres and copies the patient files to an encrypted bucket
  twice a day, rehearses the restore every Sunday, and the app puts a warning
  bar in front of the owner when it stops. A backup system that fails silently
  is worse than none, because it manufactures confidence.
- **The activity log is kept, and stays queryable.** Nothing in the app or the
  deploy removes an entry: the Activity page pages back through all of it and
  filters by date, person and record type, because an archive nothing can query
  is a box in a cupboard. Seven years is a *floor* — `prune-audit.ts` refuses to
  trim below it — not an expiry. The JSON export carries a recent window and
  says so in `auditTruncated`; the database is where the whole trail lives.

## Adding a language

1. Copy `messages/en.json` to `messages/<code>.json` and translate the values.
2. Add the code to `locales` and `localeLabels` in `src/i18n/routing.ts`.

Every key must exist in every file — there is no fallback locale.
