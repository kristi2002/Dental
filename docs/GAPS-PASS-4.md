# A fourth pass — what a browser could see and nothing else could

August 2026. The first three passes were read out of the repository: modules
against the queries that feed them, exported actions against the components that
call them, schema relations against the screens that should show them. This one
is different in kind. It is the first pass performed by **a browser signing in
and pressing things**, and its findings are the ones no amount of reading finds.

The suite behind it is `e2e/`, driven by Playwright. See `README.md` for how to
run it and `playwright.config.ts` for why it is shaped the way it is.

---

## Status

| § | Gap | State |
| --- | --- | --- |
| H-01 | Client-side date and number formatting is English on Albanian pages, in Chrome | closed by `src/lib/date-names.ts` |
| D-01 | `?schema=` was documented, honoured by the Prisma CLI, and ignored by the app | closed by `src/lib/db-url.ts` |

---

## D-01 — the app ignored the schema its own URL named *(closed)*

`.env.example` and `.env.production.example` both document the connection string
as ending `?schema=public`, which reads as a setting. It was not one.

Prisma 7 talks to Postgres through a driver adapter, and `PrismaPg` qualifies
every generated statement with the schema it is **handed** — falling back to
`public` when it is handed nothing. `src/lib/prisma.ts` handed it nothing. So a
URL ending `?schema=staging` connected to the right database, reported the right
`search_path`, and then read and wrote `public` regardless. Nothing errored.

The Prisma **CLI** honours `?schema=` correctly, which is what makes this worse
than a dead setting: `migrate deploy` and `db seed` target the named schema while
the running app targets `public`. Point the two at different schemas and the
migrations land somewhere the app never looks.

Found by pointing the end-to-end suite at a schema of its own and watching a seed
that reported `patients: 10` leave that schema empty — and `public` rewritten.

**Closed by** `schemaFromDatabaseUrl` / `pgAdapterOptions` in `src/lib/db-url.ts`,
passed to the adapter in both `src/lib/prisma.ts` and `prisma/seed.ts`. The seed
now also prints the host, database and schema it is about to empty, before it
empties it — the only warning anybody gets when this is aimed wrongly.

---

## H-01 — the Albanian UI rendered English dates in Chrome *(closed)*

**What happens.** On `/sq/appointments`, the week grid's column headings are
rendered `hën mar mër` by the server and `Mon Tue Wed` by the browser. React
reports a hydration mismatch (`#418`), discards the server's tree, and the
practice's own language is replaced with English on a page that is otherwise
entirely in Albanian.

**Why.** Seven client components format dates and numbers through next-intl's
`useFormatter`, which is `Intl.DateTimeFormat` underneath:

```
src/components/appointments/AppointmentDetailsDialog.tsx
src/components/appointments/MonthView.tsx
src/components/appointments/SlotFinder.tsx
src/components/appointments/WeekView.tsx
src/components/plans/PlanRow.tsx
src/components/plans/StepList.tsx
src/components/ui/Calendar.tsx
```

On the server that is Node, which ships full ICU and knows `sq`. In the browser
it is whatever locale data that browser was built with — and **Chrome does not
have Albanian**:

| Runtime | `supportedLocalesOf(['sq'])` | `weekday: 'short'` |
| --- | --- | --- |
| Node 24 | `['sq']` | `hën` |
| Chrome 151 | `[]` | `Mon` |
| Edge 151 | `['sq']` | `hën` |
| Playwright Chromium 151 | `[]` | `Mon` |

Measured on the development machine, headed and headless alike. Chrome's set
here covers `it`, `en`, `de`, `hr`, `sr` — and not `sq` or `mk`. `Intl.NumberFormat`
goes the same way: `1,234.5` rather than `1.234,5`.

**Why it matters more than it looks.** This is the practice's primary language,
on the screen they use most, in the browser most people have. It is not a
crash and no test that reads the source can see it — the code is correct, the
translation files are complete, and the server renders exactly the right string.
The wrongness is introduced by the client, after the page has already arrived
looking right.

**What it is not.** Not a next-intl bug and not a missing message. `sq.json` is
complete; nothing in it is consulted for a weekday name.

**The fix.** The server measures the locale and the browser only substitutes.
`src/lib/date-names.ts` works out, on Node, the seven weekday names, the twelve
month names, and the *shape* of each of the nine date formats the app renders;
`DateNamesProvider` carries them into the browser; the seven components above
call `dates.date(value, shape)` instead of `format.dateTime(value, options)`.

Nothing hardcodes a format string. `shapes` is `Intl.formatToParts` run once per
shape on the server and kept as tokens, so the order of the parts and the marks
between them stay the locale's business — English writes `Sep 23, 2026` and
Albanian `23 sht 2026`, and neither ordering is written down anywhere. A fourth
language is described correctly without anybody authoring a pattern for it.

`useFormatter` is untouched where the value is not language-shaped — a numeric
day, a year, a 24-hour time all render identically with or without locale data,
and replacing those would have been churn.

`BackupCheckCard` went the same way: its `toLocaleString()` took the *browser's*
default locale, not the app's, which was both wrong on an Albanian page and a
hydration mismatch waiting to happen. Counts now use the group separator the
server measured — including CLDR's `minimumGroupingDigits: 2`, which is why
Albanian writes `1000` but `10 000`.

Not done: a polyfill. `@formatjs/intl-datetimeformat` with `sq` data would have
worked and cost a dependency and a payload on every page, to solve what one
provider solves.

**How it is held.** Two tests, and they check different things:

- `tests/date-names.test.ts` asserts that the token renderer produces *exactly*
  what `Intl` produces, for every locale × every shape × 370 dates. Node has the
  locale data, so the equality is checkable there — which is the whole asymmetry
  the module papers over. This is what caught the two bugs in the first draft:
  `resolvedOptions()` returns an empty object for `dateStyle` on this Node, and
  Albanian does not group four-digit numbers.
- `e2e/routes.spec.ts` walks every route in `sq` and fails on any console error,
  and names the calendar case explicitly — `hën` must be on the week grid and
  `Mon` must not. Chromium still has no Albanian data, so if a component ever
  reaches for `Intl` again in the browser, that walk goes red immediately.
