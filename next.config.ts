import path from 'node:path';
import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  reactStrictMode: true,
  turbopack: {
    // Pin the workspace root — otherwise Turbopack walks up and finds unrelated
    // lockfiles in the parent directories.
    root: path.resolve(import.meta.dirname),
  },

  // Patient files are read by a path computed at runtime (`src/lib/files.ts`),
  // which makes the build tracer assume it needs to ship the entire project.
  // These are the directories it must never pull in — above all `storage`,
  // which holds real radiographs and belongs nowhere near a deploy artifact.
  outputFileTracingExcludes: {
    '**/*': ['./storage/**', './.next/cache/**'],
  },
};

export default withNextIntl(nextConfig);
