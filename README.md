# DentOrganizer

A lightweight practice organizer and CRM for a small dental clinic. Built for a
dentist who trusts pen and paper: large type, high contrast, visible borders, and
every screen doing one obvious thing.

**No payments, no billing, no cash register, no fiscalization** — by design.

## Features

| Area | What it does |
| --- | --- |
| **Dashboard** | Today's schedule, low-stock alerts, and one-tap "New patient" / "New appointment" |
| **Appointments** | Day (hour grid), Week (7 columns) and List (month agenda) views |
| **Reminders** | Pre-filled WhatsApp (`wa.me`) and email (`mailto:`) links — the dentist reviews and sends |
| **Patients** | Searchable database, contact details, medical notes, visit timeline |
| **Dental chart** | Simplified 2D chart of all 32 teeth, one click per tooth to record its condition |
| **Services** | Treatment catalog grouped by category, with estimated duration |
| **Stock** | Materials with minimum levels, one-tap +1 / −1, low-stock badges |
| **Statistics** | Visits per month, new patients, top services, material usage, appointment outcomes |

Full interface in **Albanian (default)**, **English** and **Italian**.

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

### 3. Schema and demo data

```bash
npm run db:push
```

```bash
npm run db:seed
```

The seed creates 10 patients, a 9-item service catalog, 10 stock materials
(three of them deliberately below their minimum), appointments spanning four
weeks around today, six months of visit history, and dental charts — enough for
every screen and chart to be meaningful immediately.

### 4. Run

```bash
npm run dev
```

Open <http://localhost:3000> — you land on `/sq`. Switch language from the rail
at the bottom-left.

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | Production build (runs `prisma generate` first) |
| `npm start` | Serve the production build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run db:push` | Sync the schema to the database (no migration files) |
| `npm run db:migrate` | Create and apply a named migration |
| `npm run db:seed` | Load demo data (**clears existing rows first**) |
| `npm run db:studio` | Prisma Studio |

## How things are laid out

```
prisma/
  schema.prisma      Patient, Appointment, VisitRecord, ToothRecord,
                     StockItem, StockMovement, Service
  seed.ts            Demo data
prisma.config.ts     Prisma 7 config — holds DATABASE_URL and the seed command
messages/            sq.json · en.json · it.json  (identical key sets)
src/
  app/[locale]/      Dashboard, appointments, patients, services, stock, analytics
  components/        ui/ (Card, Badge, FormDialog, …) + one folder per feature
  i18n/              routing · request config · locale-aware navigation
  lib/
    actions/         Server actions, one file per entity
    queries.ts       Shared reads
    dates.ts         UTC-midnight day arithmetic
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
  is what the "material usage" chart reads.
- **Reminders are never sent automatically.** Each button opens WhatsApp or the
  mail client with the message pre-filled; the dentist stays the sender.

## Adding a language

1. Copy `messages/en.json` to `messages/<code>.json` and translate the values.
2. Add the code to `locales` and `localeLabels` in `src/i18n/routing.ts`.

Every key must exist in every file — there is no fallback locale.
