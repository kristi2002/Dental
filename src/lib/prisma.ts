import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/generated/prisma/client';
import { pgAdapterOptions } from '@/lib/db-url';

type PrismaClientType = InstanceType<typeof PrismaClient>;

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClientType };

function createClient(): PrismaClientType {
  const connectionString = process.env.DATABASE_URL;
  return new PrismaClient({
    // The second argument is not optional decoration: without it the adapter
    // qualifies every table as `public`, whatever the URL's `?schema=` says.
    // See `lib/db-url.ts`.
    adapter: new PrismaPg({ connectionString }, pgAdapterOptions(connectionString)),
  });
}

// Reuse the client across hot reloads in dev so we don't exhaust the connection pool.
export const prisma: PrismaClientType = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
