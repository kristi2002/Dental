import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * Is the app up, and can it reach its database?
 *
 * On a clinic mini-PC the alternative is a receptionist discovering the failure
 * at eight in the morning. Deliberately unauthenticated and deliberately
 * uninformative: it answers "yes" or "no" and nothing about the practice, so it
 * is safe to point a monitor at.
 */
export async function GET() {
  const startedAt = Date.now();

  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    return NextResponse.json(
      { status: 'error', database: 'unreachable' },
      { status: 503, headers: { 'cache-control': 'no-store' } },
    );
  }

  return NextResponse.json(
    { status: 'ok', database: 'ok', latencyMs: Date.now() - startedAt },
    { headers: { 'cache-control': 'no-store' } },
  );
}
