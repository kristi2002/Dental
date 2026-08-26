import { defineConfig, devices } from '@playwright/test';
import { E2E_BASE_URL, e2eServerEnv, OWNER_STATE_PATH } from './e2e/env';

/**
 * The end-to-end pass.
 *
 * `npm test` covers the rules — 849 assertions over pure functions and query
 * shapes, and it is the faster and more precise of the two suites. What it
 * cannot see is whether a rule is *reachable*: `unlinkBarcode` and
 * `restoreStockAlert` were both written, guarded, audited and correct, and both
 * were unreachable from any screen for their entire life (see
 * `docs/GAPS-PASS-3.md`, §B-01 and §B-02). No typecheck and no unit test can
 * find that. A browser that signs in and presses the button can.
 *
 * So the division of labour is deliberate: unit tests own *what the answer is*,
 * this suite owns *whether anybody can get to the question*. Assertions here
 * stay coarse on purpose — a route renders, a verb takes effect, a guard
 * refuses — because a fine-grained assertion about wording belongs in the suite
 * that runs in eleven seconds.
 *
 * **It builds before it runs.** A long-lived `next dev` serves stale
 * translations and a stale Prisma client, and a suite that trusts one is a
 * suite that reports on a build nobody is going to deploy.
 */
export default defineConfig({
  testDir: './e2e',

  // Provisions and seeds the run's own schema. See `e2e/env.ts` for why this is
  // guarded as heavily as it is.
  globalSetup: './e2e/global-setup.ts',

  // The seed runs once, so specs share one database. They are written not to
  // collide — each creates what it needs under a name of its own — but a
  // parallel run would still interleave writes against shared list screens, and
  // a flaky suite is one nobody trusts enough to fix. Correctness first; this
  // whole pass is under two minutes.
  fullyParallel: false,
  workers: 1,

  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  timeout: 30_000,
  expect: { timeout: 10_000 },

  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never' }], ['list']]
    : [['list'], ['html', { open: 'never' }]],

  use: {
    baseURL: E2E_BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    // The practice's own locale is the default, so it is the one the smoke pass
    // walks. Specs that assert on wording ask for `/en` explicitly.
    locale: 'sq-AL',
    timezoneId: 'Europe/Tirane',
  },

  projects: [
    // Signs in once with the seeded Owner and writes the cookie to disk. Every
    // other spec replays it, so the PIN pad is exercised deliberately in
    // `auth.spec.ts` rather than incidentally forty times.
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], storageState: OWNER_STATE_PATH },
      dependencies: ['setup'],
      testIgnore: /auth\.setup\.ts/,
    },
  ],

  webServer: {
    // `node .next/standalone/server.js`, not `next start` — the latter refuses
    // `output: 'standalone'` outright, and the practice's server runs the
    // standalone bundle. `stage-standalone.mjs` supplies the two directories the
    // tracer leaves out, exactly as the Dockerfile does.
    command: [
      process.env.E2E_SKIP_BUILD ? null : 'npm run build',
      'node scripts/stage-standalone.mjs',
      'node .next/standalone/server.js',
    ]
      .filter(Boolean)
      .join(' && '),
    url: `${E2E_BASE_URL}/api/health`,
    env: e2eServerEnv(),
    // A cold `next build` on this repository is the long pole, not the server.
    timeout: 300_000,
    reuseExistingServer: !process.env.CI,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
