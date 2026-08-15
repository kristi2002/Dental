/**
 * Demo data for a small Albanian dental practice — enough to make every screen
 * (dashboard, calendar, charts, stock alerts) meaningful on first run.
 *
 * Run with:  npm run db:seed
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { hashPin } from '../src/lib/auth/crypto';
import { gtinCheckDigit } from '../src/lib/barcode';
import { storeFile } from '../src/lib/files';
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

/**
 * One account per role, so every permission path can be tried immediately.
 * Demo PINs — the README says to change them, and the app lets the owner do it
 * from the Staff page without touching the database.
 */
const STAFF = [
  { firstName: 'Ilir', lastName: 'Berisha', role: 'OWNER', pin: '1234' },
  { firstName: 'Teuta', lastName: 'Gashi', role: 'ASSISTANT', pin: '2345' },
  { firstName: 'Blerina', lastName: 'Nika', role: 'RECEPTIONIST', pin: '3456' },
  { firstName: 'Marco', lastName: 'Rossi', role: 'READONLY', pin: '4567' },
] as const;

/**
 * The catalogue, filed the way the app files it: a department, and for the two
 * departments that are worth subdividing, a subcategory inside it. Seeded with
 * both shapes on purpose — a demo where every service sits directly under its
 * department never shows what the second level looks like.
 */
const SERVICES = [
  { name: 'Kontroll i përgjithshëm', category: 'Diagnostikë', subcategory: '', durationMin: 20 },
  { name: 'Pastrim guri (detartrazh)', category: 'Profilaksi', subcategory: '', durationMin: 40 },
  { name: 'Mbushje kompozite', category: 'Terapi', subcategory: '', durationMin: 45 },
  { name: 'Devitalizim (trajtim kanali)', category: 'Endodonci', subcategory: '', durationMin: 90 },
  { name: 'Heqje dhëmbi', category: 'Kirurgji', subcategory: 'Kirurgji orale', durationMin: 40 },
  { name: 'Kurorë porcelani', category: 'Protetikë', subcategory: 'Fikse', durationMin: 60 },
  { name: 'Zbardhim dhëmbësh', category: 'Estetikë', subcategory: '', durationMin: 60 },
  {
    name: 'Implant dentar',
    category: 'Kirurgji',
    subcategory: 'Implantologji',
    durationMin: 120,
  },
  { name: 'Kontroll ortodontik', category: 'Ortodonci', subcategory: '', durationMin: 30 },
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

/**
 * A demo GTIN-14 with a real check digit, so the scanning screen has something
 * that actually resolves on a fresh install.
 *
 * `0590` is a GS1 prefix, and the digits after it are invented — these are not
 * anybody's real products. The check digit is computed rather than typed
 * because `normaliseGtin` refuses one that does not verify, which is exactly the
 * behaviour worth demonstrating and exactly what a hand-typed constant would
 * quietly break.
 */
function demoGtin(seed: number): string {
  const body = `059012${String(seed).padStart(7, '0')}`;
  return `${body}${gtinCheckDigit(body)}`;
}

/**
 * Standard wording, each tied to the treatments it follows — which is what turns
 * it into a *suggestion* the moment an extraction is recorded, rather than one
 * more row in a list somebody has to read to the end.
 */
const PRESCRIPTION_TEMPLATES = [
  {
    name: 'Antibiotik pas ekstraksionit',
    category: 'Antibiotikë',
    after: ['Heqje dhëmbi', 'Implant dentar'],
    body: 'Amoxicillin 500 mg\n1 kapsulë çdo 8 orë, për 5 ditë, pas ushqimit.\n\nNëse shfaqet skuqje ose vështirësi në frymëmarrje, ndaloni menjëherë dhe na kontaktoni.',
  },
  {
    name: 'Qetësues dhimbjeje',
    category: 'Analgjezikë',
    after: ['Heqje dhëmbi', 'Devitalizim (trajtim kanali)', 'Implant dentar'],
    body: 'Ibuprofen 400 mg\n1 tabletë çdo 8 orë sipas nevojës, maksimumi 3 në ditë, pas ushqimit.\n\nMos e kombinoni me qetësues të tjerë pa na pyetur.',
  },
  {
    name: 'Shpëlarje pas ndërhyrjes',
    category: 'Kujdesi pas ndërhyrjes',
    after: ['Heqje dhëmbi', 'Implant dentar', 'Pastrim guri (detartrazh)'],
    body: 'Klorheksidinë 0.12%\nShpëlani gojën 30 sekonda, dy herë në ditë, për 7 ditë.\n\nFilloni 24 orë pas ndërhyrjes. Mos hani dhe mos pini për 30 minuta pas shpëlarjes.',
  },
];

/**
 * A tiny valid PNG, so the documents tab has something to show on first run
 * without shipping a real radiograph. 8×8, mid-grey.
 */
const PLACEHOLDER_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAHElEQVQoz2NgGAWjYBSMglEwCkbBKBgFo4CBAAAIcAAB9r0ZzQAAAABJRU5ErkJggg==',
  'base64',
);

const TOOTH_STATUSES = ['CARIES', 'FILLED', 'CROWN', 'ROOT_CANAL', 'EXTRACTED', 'IMPLANT', 'MISSING'];
/** FDI permanent teeth — 11–18, 21–28, 31–38, 41–48. See src/lib/teeth.ts. */
const FDI_PERMANENT = [1, 2, 3, 4].flatMap((q) => [1, 2, 3, 4, 5, 6, 7, 8].map((i) => q * 10 + i));
/** Surfaces are only meaningful for the statuses that describe part of a tooth. */
const SURFACE_STATUSES = new Set(['CARIES', 'FILLED', 'ROOT_CANAL']);
const START_TIMES = ['08:30', '09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '14:00', '14:30', '15:00', '15:30', '16:00', '16:30', '17:00'];
const APPOINTMENT_STATUSES = ['SCHEDULED', 'COMPLETED', 'CANCELLED', 'NO_SHOW'] as const;

const SUPPLIERS = [
  { name: 'DentalMed Shpk', phone: '04 22 33 445', email: 'porosi@dentalmed.al' },
  { name: 'Farmaceutika Tirana', phone: '04 25 61 890', email: null },
];

/**
 * Which materials carry a lot number and an expiry date. Anaesthetics and
 * composites do; cotton rolls and gloves do not, which is exactly the mix that
 * makes a blank expiry an ordinary answer rather than a warning.
 */
const EXPIRING_MATERIALS = new Set([
  'Anestezi Lidokainë 2%',
  'Kompozit A2',
  'Cimento qelqjonomer',
  'Fije suture 4-0',
  'Solucion dezinfektues',
]);

async function main() {
  console.log('Clearing existing data…');
  await prisma.auditLog.deleteMany();
  await prisma.stockMovement.deleteMany();
  await prisma.productBarcode.deleteMany();
  // Retired, and no longer seeded — cleared so a re-seed leaves no rows behind
  // from a database that predates the change. See `drop-service-materials.ts`.
  await prisma.serviceMaterial.deleteMany();
  await prisma.toothRecord.deleteMany();
  await prisma.visitRecord.deleteMany();
  await prisma.waitlistEntry.deleteMany();
  await prisma.treatmentStep.deleteMany();
  await prisma.treatmentPlan.deleteMany();
  await prisma.patientDocument.deleteMany();
  await prisma.prescription.deleteMany();
  await prisma.prescriptionTemplate.deleteMany();
  await prisma.appointment.deleteMany();
  await prisma.patient.deleteMany();
  await prisma.stockItem.deleteMany();
  await prisma.stockCategory.deleteMany();
  await prisma.service.deleteMany();
  // Subcategories first: the parent's own `onDelete: Cascade` would take them,
  // but `deleteMany` gives no order and the children must not outlive the run.
  await prisma.serviceCategory.deleteMany({ where: { NOT: { parentId: null } } });
  await prisma.serviceCategory.deleteMany();
  await prisma.staffUser.deleteMany();
  await prisma.closure.deleteMany();
  await prisma.clinicHours.deleteMany();
  await prisma.operatory.deleteMany();
  await prisma.clinicProfile.deleteMany();
  await prisma.stockBatch.deleteMany();
  await prisma.supplier.deleteMany();

  // The demo practice keeps ordinary hours: weekdays with a lunch break,
  // Saturday mornings, Sunday shut. Seeded explicitly so the free-slot search
  // and the day grid have something realistic to disagree about.
  await prisma.clinicProfile.create({ data: { id: 'clinic', name: 'DentOrganizer' } });

  console.log('Seeding opening hours…');
  await prisma.clinicHours.createMany({
    data: [
      { weekday: 0, open: false, openTime: '09:00', closeTime: '13:00' },
      ...[1, 2, 3, 4, 5].map((weekday) => ({
        weekday,
        open: true,
        openTime: '08:00',
        closeTime: '19:00',
        breakStart: '13:00',
        breakEnd: '14:00',
      })),
      { weekday: 6, open: true, openTime: '09:00', closeTime: '14:00' },
    ],
  });

  await prisma.closure.create({
    data: {
      from: addDays(TODAY, 30),
      to: addDays(TODAY, 44),
      reason: 'Summer break',
    },
  });

  console.log('Seeding staff…');
  const staff = [];
  for (const person of STAFF) {
    const { hash, salt } = await hashPin(person.pin);
    staff.push(
      await prisma.staffUser.create({
        data: {
          firstName: person.firstName,
          lastName: person.lastName,
          role: person.role,
          pinHash: hash,
          pinSalt: salt,
        },
      }),
    );
  }
  const owner = staff[0];
  const assistant = staff[1];

  console.log('Seeding services…');
  // The headings exist before anything is filed under them — a service can only
  // pick from the categories the practice has named.
  const serviceCategories = new Map<string, string>();
  for (const name of new Set(SERVICES.map((service) => service.category))) {
    const created = await prisma.serviceCategory.create({ data: { name }, select: { id: true } });
    serviceCategories.set(name, created.id);
  }
  for (const { category, subcategory } of SERVICES) {
    if (!subcategory || serviceCategories.has(`${category}/${subcategory}`)) continue;
    const created = await prisma.serviceCategory.create({
      data: { name: subcategory, parentId: serviceCategories.get(category) },
      select: { id: true },
    });
    serviceCategories.set(`${category}/${subcategory}`, created.id);
  }

  const services = [];
  for (const { category, subcategory, ...service } of SERVICES) {
    services.push(
      await prisma.service.create({
        data: {
          ...service,
          // The deeper of the two, which is what a service is filed against.
          categoryId: serviceCategories.get(subcategory ? `${category}/${subcategory}` : category),
        },
      }),
    );
  }
  /** Name → catalogue id, so recorded visits link to the real entry. */
  const serviceIdByName = new Map(services.map((service) => [service.name, service.id]));

  console.log('Seeding suppliers…');
  const suppliers: Array<{ id: string; name: string }> = [];
  for (const supplier of SUPPLIERS) {
    suppliers.push(await prisma.supplier.create({ data: supplier }));
  }

  console.log('Seeding stock…');
  // The shelves exist before anything is put on them — a material can only pick
  // from the categories the practice has named.
  const categories = new Map<string, string>();
  for (const name of new Set(STOCK.map((item) => item.category))) {
    const created = await prisma.stockCategory.create({ data: { name }, select: { id: true } });
    categories.set(name, created.id);
  }

  const stockItems = [];
  for (const [index, { category, ...item }] of STOCK.entries()) {
    const created = await prisma.stockItem.create({
      data: {
        ...item,
        categoryId: categories.get(category),
        supplierId: suppliers[index % suppliers.length].id,
        // One item already on order, so the reorder list has something in the
        // "decision already taken" state to demonstrate.
        ...(item.name === 'Gjilpëra anestezie'
          ? { orderedAt: addDays(TODAY, -3), expectedAt: addDays(TODAY, 4) }
          : {}),
      },
    });
    stockItems.push(created);

    // Lots only for the materials that really carry a date. One already past
    // it, one inside the warning window, the rest comfortably ahead — so both
    // banners on the stock page have something true to say.
    if (EXPIRING_MATERIALS.has(item.name) && item.quantity > 0) {
      const offsets =
        item.name === 'Kompozit A2'
          ? [-20, 45]
          : item.name === 'Anestezi Lidokainë 2%'
            ? [60, 400]
            : [500];

      let left = item.quantity;
      for (const [batchIndex, offset] of offsets.entries()) {
        const isLast = batchIndex === offsets.length - 1;
        const quantity = isLast ? left : Math.max(1, Math.floor(item.quantity / offsets.length));
        left -= quantity;
        if (quantity <= 0) continue;

        await prisma.stockBatch.create({
          data: {
            itemId: created.id,
            lotNumber: `L${String(2600 + index * 7 + batchIndex)}`,
            expiryDate: addDays(TODAY, offset),
            quantity,
          },
        });
      }
    }
  }

  console.log('Seeding product barcodes…');
  for (const [index, item] of stockItems.entries()) {
    // The each-level code every material gets, plus a carton code on the two
    // that are genuinely bought by the box — which is the case that proves
    // `packQty` is doing something.
    await prisma.productBarcode.create({
      data: { code: demoGtin(index + 1), itemId: item.id, packQty: 1 },
    });

    if (item.packSize > 1) {
      await prisma.productBarcode.create({
        data: {
          code: demoGtin(500 + index),
          itemId: item.id,
          packQty: item.packSize,
          label: `Carton of ${item.packSize}`,
        },
      });
    }
  }

  console.log('Seeding stock movements…');
  for (const item of stockItems) {
    // A handful of "used" entries spread over the last six months.
    for (let monthsAgo = 5; monthsAgo >= 0; monthsAgo -= 1) {
      const uses = randomInt(0, 4);
      for (let i = 0; i < uses; i += 1) {
        const date = addDays(TODAY, -(monthsAgo * 30 + randomInt(0, 27)));
        await prisma.stockMovement.create({
          data: {
            itemId: item.id,
            delta: -randomInt(1, 3),
            reason: 'used',
            createdAt: date,
            staffUserId: assistant.id,
          },
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
          // A spread of intervals, so the recall list is not all one number.
          recallMonths: [6, 6, 12, 4, 6, 3, 6, 12, 6, 4][index] ?? 6,
          // Spread registrations across the last six months so the growth chart moves.
          createdAt: addDays(TODAY, -(index * 17 + randomInt(0, 12))),
        },
      }),
    );
  }

  // The last three are the recall demo: long overdue, and kept out of the future
  // calendar below so the recall page has something real to show on first run.
  const overdue = patients.slice(7);
  // The first two are the follow-up demo: treated a few days ago.
  const recentlyTreated = patients.slice(0, 2);

  console.log('Seeding visit history…');
  for (const patient of patients) {
    const visitCount = randomInt(1, 5);
    for (let i = 0; i < visitCount; i += 1) {
      const service = pick(SERVICES);
      const second = random() > 0.6 ? pick(SERVICES) : null;
      const performed = [service, ...(second ? [second] : [])];

      await prisma.visitRecord.create({
        data: {
          patientId: patient.id,
          visitDate: overdue.includes(patient)
            ? addDays(TODAY, -randomInt(260, 400))
            : addDays(TODAY, -randomInt(20, 170)),
          notes: `${service.name} — pa komplikacione. Pacienti u këshillua për higjienë orale.`,
          servicesText: performed.map((s) => s.name).join(', '),
          // The rows are the record; the line above is only how it was worded.
          services: {
            create: performed.map((s, index) => ({
              name: s.name,
              serviceId: serviceIdByName.get(s.name) ?? null,
              position: index + 1,
            })),
          },
          staffUserId: pick([owner.id, assistant.id]),
          // The dentist treats; whoever is at the keyboard writes it up.
          performedById: owner.id,
        },
      });
    }
  }

  for (const [index, patient] of recentlyTreated.entries()) {
    const service = SERVICES[2 + index];
    await prisma.visitRecord.create({
      data: {
        patientId: patient.id,
        visitDate: addDays(TODAY, -(index + 3)),
        notes: `${service.name} — përfunduar. Kontroll pas një jave nëse ka shqetësim.`,
        servicesText: service.name,
        services: {
          create: [{ name: service.name, serviceId: serviceIdByName.get(service.name) ?? null }],
        },
        staffUserId: assistant.id,
        performedById: owner.id,
      },
    });
  }

  console.log('Seeding dental charts…');
  for (const patient of patients.slice(0, 6)) {
    // Which visit put the tooth in this state. The app stamps this whenever a
    // tooth is charted on the same day as a visit, and the timeline draws the
    // teeth a visit changed — so demo data with the link missing makes a real
    // feature look like it does not exist.
    const lastVisit = await prisma.visitRecord.findFirst({
      where: { patientId: patient.id },
      orderBy: { visitDate: 'desc' },
      select: { id: true },
    });

    const affected = randomInt(1, 5);
    const used = new Set<number>();
    for (let i = 0; i < affected; i += 1) {
      const toothNum = pick(FDI_PERMANENT);
      if (used.has(toothNum)) continue;
      used.add(toothNum);
      const toothStatus = pick(TOOTH_STATUSES);
      await prisma.toothRecord.create({
        data: {
          patientId: patient.id,
          toothNum,
          status: toothStatus,
          surfaces: SURFACE_STATUSES.has(toothStatus) ? pick(['M', 'MO', 'MOD', 'O', 'OD']) : null,
          notes: random() > 0.7 ? 'Për kontroll në vizitën e ardhshme.' : null,
          visitRecordId: lastVisit?.id ?? null,
        },
      });
    }

    // And what the visit consumed, so the timeline's materials line has
    // something to show. One movement per material, the way a real deduction
    // writes it.
    if (lastVisit && stockItems.length > 0) {
      for (const item of stockItems.slice(0, randomInt(1, 3))) {
        await prisma.stockMovement.create({
          data: {
            itemId: item.id,
            delta: -randomInt(1, 2),
            reason: 'used in visit',
            staffUserId: assistant.id,
            visitRecordId: lastVisit.id,
          },
        });
      }
    }
  }

  // Two chairs, so the parallel-booking case the conflict check now understands
  // is actually reachable in the demo data.
  console.log('Seeding chairs…');
  const operatories: Array<{ id: string }> = [];
  for (const name of ['Karrigia 1', 'Karrigia 2']) {
    operatories.push(await prisma.operatory.create({ data: { name } }));
  }

  // Whoever can be booked with: the dentist and the assistant, not the desk.
  const providers = staff.filter((person) => person.role === 'OWNER' || person.role === 'ASSISTANT');
  // `index` is a day offset, so it goes negative for the past fortnight — and
  // `-1 % 2` is `-1` in JavaScript, which indexes off the front of the array and
  // crashes the seed. Rotating on the absolute value keeps the round-robin.
  const assign = (index: number) => {
    const slot = Math.abs(index);
    return {
      staffUserId: providers.length > 0 ? providers[slot % providers.length].id : null,
      operatoryId: operatories[slot % operatories.length].id,
    };
  };

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
        ...assign(index),
        // Two answered the confirmation link, two have not — so the digest has
        // something real to nag about.
        confirmedAt: index < 2 ? addDays(TODAY, -1) : null,
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

      // A booked patient is not overdue, so the recall demo group stays clear of
      // anything upcoming.
      const bookable = offset > 0 ? patients.filter((p) => !overdue.includes(p)) : patients;

      await prisma.appointment.create({
        data: {
          patientId: pick(bookable).id,
          date,
          startTime,
          durationMin: service.durationMin,
          status,
          serviceName: service.name,
          ...assign(offset + i),
        },
      });
    }
  }

  console.log('Seeding prescription templates…');
  const templates = [];
  for (const { after, ...template } of PRESCRIPTION_TEMPLATES) {
    templates.push(
      await prisma.prescriptionTemplate.create({
        data: {
          ...template,
          services: {
            create: after
              .map((name) => serviceIdByName.get(name))
              .filter((serviceId): serviceId is string => Boolean(serviceId))
              .map((serviceId) => ({ serviceId })),
          },
        },
      }),
    );
  }

  console.log('Seeding treatment plans…');
  await prisma.treatmentPlan.create({
    data: {
      patientId: patients[0].id,
      title: 'Restaurim i kuadrantit të sipërm majtas',
      notes: 'Pacienti preferon takime paradite.',
      steps: {
        create: [
          { position: 1, title: 'Pastrim dhe vlerësim', status: 'DONE', completedAt: addDays(TODAY, -40) },
          { position: 2, title: 'Mbushje kompozite', toothNum: 22, status: 'DONE', completedAt: addDays(TODAY, -12) },
          { position: 3, title: 'Mbushje kompozite', toothNum: 23 },
          { position: 4, title: 'Kontroll përfundimtar' },
        ],
      },
    },
  });

  await prisma.treatmentPlan.create({
    data: {
      patientId: patients[4].id,
      title: 'Implant në pozicionin 30',
      notes: 'Diabet tip 2 — kujdes me shërimin, kontrolle më të shpeshta.',
      steps: {
        create: [
          { position: 1, title: 'Radiografi dhe planifikim', status: 'DONE', completedAt: addDays(TODAY, -60) },
          { position: 2, title: 'Heqje dhëmbi', toothNum: 46, status: 'DONE', completedAt: addDays(TODAY, -55) },
          { position: 3, title: 'Vendosje implanti', toothNum: 46 },
          { position: 4, title: 'Kurorë mbi implant', toothNum: 46 },
        ],
      },
    },
  });

  console.log('Seeding prescriptions…');
  await prisma.prescription.create({
    data: {
      patientId: patients[4].id,
      templateId: templates[0].id,
      body: PRESCRIPTION_TEMPLATES[0].body,
      issuedById: owner.id,
      createdAt: addDays(TODAY, -55),
    },
  });

  console.log('Seeding documents…');
  for (const [index, patient] of patients.slice(0, 3).entries()) {
    const storageKey = await storeFile(PLACEHOLDER_PNG, 'image/png');
    await prisma.patientDocument.create({
      data: {
        patientId: patient.id,
        kind: index === 0 ? 'XRAY' : index === 1 ? 'PHOTO' : 'CONSENT',
        fileName: index === 0 ? 'panoramike.png' : index === 1 ? 'para-trajtimit.png' : 'pelqim.png',
        mimeType: 'image/png',
        sizeBytes: PLACEHOLDER_PNG.byteLength,
        storageKey,
        toothNum: index === 0 ? 46 : null,
        notes: index === 0 ? 'Radiografi panoramike para ndërhyrjes.' : null,
        uploadedById: owner.id,
        createdAt: addDays(TODAY, -randomInt(5, 60)),
      },
    });
  }

  console.log('Seeding waiting list…');
  for (const [index, patient] of patients.slice(3, 6).entries()) {
    const service = SERVICES[index * 2];
    await prisma.waitlistEntry.create({
      data: {
        patientId: patient.id,
        serviceName: service.name,
        durationMin: service.durationMin,
        note: index === 0 ? 'Vetëm paradite' : null,
        urgent: index === 1,
        createdAt: addDays(TODAY, -randomInt(1, 9)),
      },
    });
  }

  const counts = {
    staff: await prisma.staffUser.count(),
    patients: await prisma.patient.count(),
    appointments: await prisma.appointment.count(),
    visits: await prisma.visitRecord.count(),
    services: await prisma.service.count(),
    stock: await prisma.stockItem.count(),
    barcodes: await prisma.productBarcode.count(),
    waitlist: await prisma.waitlistEntry.count(),
    plans: await prisma.treatmentPlan.count(),
    documents: await prisma.patientDocument.count(),
    prescriptions: await prisma.prescription.count(),
    templates: await prisma.prescriptionTemplate.count(),
  };
  console.log('Done:', counts);
  console.log('\nSign in with:');
  for (const person of STAFF) {
    console.log(`  ${person.firstName} ${person.lastName} (${person.role}) — PIN ${person.pin}`);
  }
  console.log('\nChange these from the Staff page before real use.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
