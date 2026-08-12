/**
 * One-off: give existing rows the service *keys* they never had.
 *
 * Three columns named a treatment as free text — `Appointment.serviceName`,
 * `WaitlistEntry.serviceName` and, worst of the three, `VisitRecord.services`,
 * which was a comma-separated list in a single column. This backfills the ids
 * beside them and turns each visit's list into `VisitService` rows, so the
 * statistics page groups by catalogue entry instead of by typed text and
 * "which visits used this material" becomes answerable.
 *
 *     npx tsx --env-file=.env prisma/backfill-services.ts          # dry run
 *     npx tsx --env-file=.env prisma/backfill-services.ts --apply
 *
 * Safe to run twice. Visits that already have rows are skipped, and an id is
 * only ever filled in where there is none.
 *
 * Names are matched case- and accent-folded, because "Mbushje kompozit" and
 * "mbushje kompozit" are the same treatment and only one of them is in the
 * catalogue. A name that matches nothing keeps its text and gets no id — that
 * is the honest answer for a service that was renamed or deleted, and it is
 * still counted on the statistics page, as itself.
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const APPLY = process.argv.includes('--apply');

/** Same folding the in-app search uses, so both agree on what "matches" means. */
function fold(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}

/** The visit form's own parser, kept identical on purpose. */
function parseServiceList(value: string): string[] {
  return value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

async function main() {
  const services = await prisma.service.findMany({ select: { id: true, name: true } });
  const idByName = new Map(services.map((service) => [fold(service.name), service.id]));
  console.log(`Catalogue: ${services.length} services.\n`);

  // ---- 1. Visits -----------------------------------------------------------
  const visits = await prisma.visitRecord.findMany({
    where: { services: { none: {} } },
    select: { id: true, servicesText: true },
  });

  let visitRows = 0;
  let visitMatched = 0;
  let visitUnmatched = 0;
  const unmatchedNames = new Map<string, number>();

  for (const visit of visits) {
    const names = parseServiceList(visit.servicesText);
    if (names.length === 0) continue;

    const rows = names.map((name, index) => {
      const serviceId = idByName.get(fold(name)) ?? null;
      if (serviceId) visitMatched += 1;
      else {
        visitUnmatched += 1;
        unmatchedNames.set(name, (unmatchedNames.get(name) ?? 0) + 1);
      }
      return { visitId: visit.id, name, serviceId, position: index + 1 };
    });

    visitRows += rows.length;
    if (APPLY) await prisma.visitService.createMany({ data: rows });
  }

  console.log(`Visits without rows: ${visits.length}`);
  console.log(`  → ${visitRows} VisitService rows (${visitMatched} linked, ${visitUnmatched} free text)`);
  if (unmatchedNames.size > 0) {
    console.log('  Names with no catalogue entry:');
    for (const [name, count] of [...unmatchedNames].sort((a, b) => b[1] - a[1]).slice(0, 12)) {
      console.log(`    ${count.toString().padStart(4)} × ${name}`);
    }
  }

  // ---- 2. Appointments -----------------------------------------------------
  const appointments = await prisma.appointment.findMany({
    where: { serviceId: null, serviceName: { not: null } },
    select: { id: true, serviceName: true },
  });

  let apptLinked = 0;
  for (const appointment of appointments) {
    const serviceId = idByName.get(fold(appointment.serviceName!));
    if (!serviceId) continue;
    apptLinked += 1;
    if (APPLY) {
      await prisma.appointment.update({ where: { id: appointment.id }, data: { serviceId } });
    }
  }
  console.log(`\nAppointments named but unlinked: ${appointments.length} → ${apptLinked} linked`);

  // ---- 3. Waiting list -----------------------------------------------------
  const waiting = await prisma.waitlistEntry.findMany({
    where: { serviceId: null, serviceName: { not: null } },
    select: { id: true, serviceName: true },
  });

  let waitLinked = 0;
  for (const entry of waiting) {
    const serviceId = idByName.get(fold(entry.serviceName!));
    if (!serviceId) continue;
    waitLinked += 1;
    if (APPLY) {
      await prisma.waitlistEntry.update({ where: { id: entry.id }, data: { serviceId } });
    }
  }
  console.log(`Waitlist entries named but unlinked: ${waiting.length} → ${waitLinked} linked`);

  console.log(
    APPLY ? '\nApplied.' : '\nDry run — nothing written. Re-run with --apply.',
  );
  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
