import { defineConfig, env } from 'prisma/config';

// Prisma 7's CLI no longer auto-loads `.env`, and Next.js only loads it for the app
// itself. Node's built-in loader keeps the CLI working without an extra dependency.
try {
  process.loadEnvFile();
} catch {
  // No `.env` file present — fall back to the real environment.
}

/**
 * A syntactically valid URL that cannot possibly connect, used only when
 * `DATABASE_URL` is absent.
 *
 * `prisma generate` needs the datasource to *parse*; it never opens it. Without
 * this, `env('DATABASE_URL')` throws while the config file is still loading, so
 * a fresh clone — where `.env` is gitignored and only `.env.example` ships —
 * fails its own `postinstall`, and `npm test` then reports three suites broken
 * on a client that was never generated. Neither is a real failure.
 *
 * `.invalid` is reserved by RFC 2606 and resolves nowhere, so anything that does
 * try to reach the database fails on connect rather than silently finding one,
 * and the host name it prints says what to set.
 */
const PLACEHOLDER_URL =
  'postgresql://user:pass@DATABASE_URL-is-not-set.invalid:5432/dentorganizer';

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = PLACEHOLDER_URL;
  // Generating a client is fine without a database; every other command is not.
  console.warn(
    '[prisma.config] DATABASE_URL is not set — using a placeholder. `generate` will\n' +
      '                work; `db push`, `migrate`, `studio` and `seed` will not.\n' +
      '                Copy .env.example to .env and set a real connection string.',
  );
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: env('DATABASE_URL'),
  },
  migrations: {
    seed: 'tsx prisma/seed.ts',
  },
});
