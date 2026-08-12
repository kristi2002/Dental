import path from 'node:path';
import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  reactStrictMode: true,

  // Emit `.next/standalone`: a self-contained server with only the traced
  // dependencies, so the deployed image carries neither the toolchain nor the
  // 700-odd MB of `node_modules` behind it.
  output: 'standalone',

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
