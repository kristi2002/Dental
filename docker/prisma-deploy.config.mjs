import { defineConfig, env } from 'prisma/config';

/**
 * Prisma config for the schema sync the container runs at boot.
 *
 * The project's own `prisma.config.ts` cannot be used here: it is copied into
 * the image as part of Next's standalone output, but `prisma` is a
 * devDependency and is absent from the runtime `node_modules`, so its
 * `import ... from 'prisma/config'` has nothing to resolve against. This file
 * lives beside the isolated CLI instead, where that import does resolve, and
 * the entrypoint points at it with `--config` so the CLI never goes looking for
 * the unusable one.
 */
export default defineConfig({
  schema: '/app/prisma/schema.prisma',
  datasource: {
    url: env('DATABASE_URL'),
  },
});
