import { defineConfig, env } from 'prisma/config';

// Prisma 7's CLI no longer auto-loads `.env`, and Next.js only loads it for the app
// itself. Node's built-in loader keeps the CLI working without an extra dependency.
try {
  process.loadEnvFile();
} catch {
  // No `.env` file present — fall back to the real environment.
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
