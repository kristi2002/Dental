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
};

export default withNextIntl(nextConfig);
