/**
 * Demo data for a small Albanian dental practice — enough to make every screen
 * (dashboard, calendar, charts, stock alerts) meaningful on first run.
 *
 * Run with:  npm run db:seed
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';

try {
  process.loadEnvFile();
} catch {
  // Rely on the ambient environment when there is no `.env`.
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

/** Deterministic pseudo-randomness, so re-seeding produces the same demo set. */
let seedState = 20260810;
function random(): number {
  seedState = (seedState * 1664525 + 1013904223) % 4294967296;
  return seedState / 4294967296;
}
function pick<T>(items: readonly T[]): T {
  return items[Math.floor(random() * items.length)];
}
function randomInt(min: number, max: number): number {
  return min + Math.floor(random() * (max - min + 1));
}

function utcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}
function addDays(date: Date, amount: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + amount);
  return next;
}

const now = new Date();
const TODAY = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));

const SERVICES = [
  { name: 'Kontroll i përgjithshëm', category: 'Diagnostikë', durationMin: 20 },
  { name: 'Pastrim guri (detartrazh)', category: 'Profilaksi', durationMin: 40 },
  { name: 'Mbushje kompozite', category: 'Terapi', durationMin: 45 },
  { name: 'Devitalizim (trajtim kanali)', category: 'Endodonci', durationMin: 90 },
  { name: 'Heqje dhëmbi', category: 'Kirurgji', durationMin: 40 },
  { name: 'Kurorë porcelani', category: 'Protetikë', durationMin: 60 },
  { name: 'Zbardhim dhëmbësh', category: 'Estetikë', durationMin: 60 },
  { name: 'Implant dentar', category: 'Kirurgji', durationMin: 120 },
  { name: 'Kontroll ortodontik', category: 'Ortodonci', durationMin: 30 },
];

const STOCK = [
  { name: 'Anestezi Lidokainë 2%', category: 'Farmaceutike', quantity: 42, minLimit: 15, unit: 'fiola' },
  { name: 'Dorashka nitrili (M)', category: 'Higjienë', quantity: 8, minLimit: 20, unit: 'kuti' },
  { name: 'Maska kirurgjikale', category: 'Higjienë', quantity: 26, minLimit: 10, unit: 'kuti' },
  { name: 'Kompozit A2', category: 'Materiale', quantity: 4, minLimit: 6, unit: 'shiringa' },
  { name: 'Freza diamanti', category: 'Instrumente', quantity: 31, minLimit: 12, unit: 'copë' },
  { name: 'Gjilpëra anestezie', category: 'Instrumente', quantity: 0, minLimit: 10, unit: 'kuti' },
  { name: 'Cimento qelqjonomer', category: 'Materiale', quantity: 9, minLimit: 4, unit: 'kuti' },
  { name: 'Fije suture 4-0', category: 'Kirurgji', quantity: 14, minLimit: 5, unit: 'copë' },
  { name: 'Rula pambuku', category: 'Konsumueshme', quantity: 55, minLimit: 20, unit: 'paketa' },
  { name: 'Solucion dezinfektues', category: 'Higjienë', quantity: 6, minLimit: 8, unit: 'litra' },
];

const PATIENTS = [
  { firstName: 'Arben', lastName: 'Hoxha', phone: '069 21 45 782', email: 'arben.hoxha@example.al', dob: '1968-03-14', notes: 'Alergji ndaj penicilinës. Hipertension i kontrolluar.' },
  { firstName: 'Elira', lastName: 'Kola', phone: '068 33 91 204', email: 'elira.kola@example.al', dob: '1985-11-02', notes: null },
  { firstName: 'Bledar', lastName: 'Shehu', phone: '067 44 12 990', email: null, dob: '1979-07-22', notes: 'Bruksizëm — rekomanduar mbrojtëse nate.' },
  { firstName: 'Migena', lastName: 'Dervishi', phone: '069 55 60 118', email: 'migena.d@example.al', dob: '1992-01-30', notes: null },
  { firstName: 'Genti', lastName: 'Prifti', phone: '068 77 23 456', email: 'genti.prifti@example.al', dob: '1955-09-08', notes: 'Diabet tip 2. Kujdes me shërimin pas ndërhyrjeve.' },
  { firstName: 'Anila', lastName: 'Rama', phone: '069 12 88 340', email: null, dob: '2001-05-17', notes: null },
  { firstName: 'Dritan', lastName: 'Basha', phone: '067 90 41 275', email: 'dritan.basha@example.al', dob: '1974-12-11', notes: 'Duhanpirës. Kontroll periodontal çdo 6 muaj.' },
  { firstName: 'Vjollca', lastName: 'Mehmeti', phone: '068 20 15 663', email: 'vjollca.m@example.al', dob: '1963-02-25', notes: null },
  { firstName: 'Ermal', lastName: 'Zeneli', phone: '069 66 30 887', email: null, dob: '1998-08-04', notes: null },
  { firstName: 'Suela', lastName: 'Cami', phone: '068 45 72 019', email: 'suela.cami@example.al', dob: '1989-06-19', notes: 'Shtatzënë — shmang radiografitë.' },
];

const TOOTH_STATUSES = ['CARIES', 'FILLED', 'CROWN', 'ROOT_CANAL', 'EXTRACTED', 'IMPLANT', 'MISSING'];
const START_TIMES = ['08:30', '09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '14:00', '14:30', '15:00', '15:30', '16:00', '16:30', '17:00'];
const APPOINTMENT_STATUSES = ['SCHEDULED', 'COMPLETED', 'CANCELLED', 'NO_SHOW'] as const;

async function main() {
  console.log('Clearing existing data…');
  await prisma.stockMovement.deleteMany();
  await prisma.toothRecord.deleteMany();
  await prisma.visitRecord.deleteMany();
  await prisma.appointment.deleteMany();
  await prisma.patient.deleteMany();
  await prisma.stockItem.deleteMany();
  await prisma.service.deleteMany();

  console.log('Seeding services…');
  await prisma.service.createMany({ data: SERVICES });

  console.log('Seeding stock…');
  const stockItems = [];
  for (const item of STOCK) {
    stockItems.push(await prisma.stockItem.create({ data: item }));
  }

  console.log('Seeding stock movements…');
  for (const item of stockItems) {
    // A handful of "used" entries spread over the last six months.
    for (let monthsAgo = 5; monthsAgo >= 0; monthsAgo -= 1) {
      const uses = randomInt(0, 4);
      for (let i = 0; i < uses; i += 1) {
        const date = addDays(TODAY, -(monthsAgo * 30 + randomInt(0, 27)));
        await prisma.stockMovement.create({
          data: { itemId: item.id, delta: -randomInt(1, 3), reason: 'used', createdAt: date },
        });
      }
    }
  }

  console.log('Seeding patients…');
  const patients = [];
  for (const [index, person] of PATIENTS.entries()) {
    patients.push(
      await prisma.patient.create({
        data: {
          firstName: person.firstName,
          lastName: person.lastName,
          phone: person.phone,
          email: person.email,
          dateOfBirth: new Date(`${person.dob}T00:00:00.000Z`),
          medicalNotes: person.notes,
          // Spread registrations across the last six months so the growth chart moves.
          createdAt: addDays(TODAY, -(index * 17 + randomInt(0, 12))),
        },
      }),
    );
  }

  console.log('Seeding visit history…');
  for (const patient of patients) {
    const visitCount = randomInt(1, 5);
    for (let i = 0; i < visitCount; i += 1) {
      const service = pick(SERVICES);
      const extra = random() > 0.6 ? `, ${pick(SERVICES).name}` : '';
      await prisma.visitRecord.create({
        data: {
          patientId: patient.id,
          visitDate: addDays(TODAY, -randomInt(1, 170)),
          notes: `${service.name} — pa komplikacione. Pacienti u këshillua për higjienë orale.`,
          services: `${service.name}${extra}`,
        },
      });
    }
  }

  console.log('Seeding dental charts…');
  for (const patient of patients.slice(0, 6)) {
    const affected = randomInt(1, 5);
    const used = new Set<number>();
    for (let i = 0; i < affected; i += 1) {
      const toothNum = randomInt(1, 32);
      if (used.has(toothNum)) continue;
      used.add(toothNum);
      await prisma.toothRecord.create({
        data: {
          patientId: patient.id,
          toothNum,
          status: pick(TOOTH_STATUSES),
          notes: random() > 0.7 ? 'Për kontroll në vizitën e ardhshme.' : null,
        },
      });
    }
  }

  console.log('Seeding appointments…');
  // Today, so the dashboard is never empty on first launch.
  const todaySlots = ['09:00', '10:30', '12:00', '15:00'];
  for (const [index, startTime] of todaySlots.entries()) {
    const service = pick(SERVICES);
    await prisma.appointment.create({
      data: {
        patientId: patients[index % patients.length].id,
        date: utcDay(TODAY),
        startTime,
        durationMin: service.durationMin,
        status: 'SCHEDULED',
        serviceName: service.name,
      },
    });
  }

  // The surrounding four weeks, for the week and list views.
  for (let offset = -14; offset <= 14; offset += 1) {
    if (offset === 0) continue;
    const date = addDays(TODAY, offset);
    if (date.getUTCDay() === 0) continue; // Clinic closed on Sundays.

    const count = randomInt(0, 4);
    const taken = new Set<string>();
    for (let i = 0; i < count; i += 1) {
      const startTime = pick(START_TIMES);
      if (taken.has(startTime)) continue;
      taken.add(startTime);

      const service = pick(SERVICES);
      const status =
        offset < 0 ? pick(APPOINTMENT_STATUSES.filter((s) => s !== 'SCHEDULED')) : 'SCHEDULED';

      await prisma.appointment.create({
        data: {
          patientId: pick(patients).id,
          date,
          startTime,
          durationMin: service.durationMin,
          status,
          serviceName: service.name,
        },
      });
    }
  }

  const counts = {
    patients: await prisma.patient.count(),
    appointments: await prisma.appointment.count(),
    visits: await prisma.visitRecord.count(),
    services: await prisma.service.count(),
    stock: await prisma.stockItem.count(),
  };
  console.log('Done:', counts);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
