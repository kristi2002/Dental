/**
 * Demo data for a small Albanian dental practice — enough to make every screen
 * (dashboard, calendar, charts, stock alerts) meaningful on first run.
 *
 * Run with:  npm run db:seed
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { hashPin } from '../src/lib/auth/crypto';
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

/**
 * What each treatment consumes, by service name → [stock name, quantity].
 * This is what makes recording a visit deduct materials on its own.
 */
const SERVICE_MATERIALS: Record<string, Array<[string, number]>> = {
  'Kontroll i përgjithshëm': [['Dorashka nitrili (M)', 1]],
  'Pastrim guri (detartrazh)': [
    ['Dorashka nitrili (M)', 1],
    ['Rula pambuku', 2],
  ],
  'Mbushje kompozite': [
    ['Dorashka nitrili (M)', 1],
    ['Kompozit A2', 1],
    ['Freza diamanti', 1],
    ['Anestezi Lidokainë 2%', 1],
  ],
  'Devitalizim (trajtim kanali)': [
    ['Dorashka nitrili (M)', 2],
    ['Anestezi Lidokainë 2%', 2],
    ['Gjilpëra anestezie', 1],
    ['Cimento qelqjonomer', 1],
  ],
  'Heqje dhëmbi': [
    ['Dorashka nitrili (M)', 1],
    ['Anestezi Lidokainë 2%', 2],
    ['Fije suture 4-0', 1],
    ['Rula pambuku', 3],
  ],
  'Implant dentar': [
    ['Dorashka nitrili (M)', 2],
    ['Anestezi Lidokainë 2%', 2],
    ['Fije suture 4-0', 2],
  ],
};

const PRESCRIPTION_TEMPLATES = [
  {
    name: 'Antibiotik pas ekstraksionit',
    category: 'Antibiotikë',
    body: 'Amoxicillin 500 mg\n1 kapsulë çdo 8 orë, për 5 ditë, pas ushqimit.\n\nNëse shfaqet skuqje ose vështirësi në frymëmarrje, ndaloni menjëherë dhe na kontaktoni.',
  },
  {
    name: 'Qetësues dhimbjeje',
    category: 'Analgjezikë',
    body: 'Ibuprofen 400 mg\n1 tabletë çdo 8 orë sipas nevojës, maksimumi 3 në ditë, pas ushqimit.\n\nMos e kombinoni me qetësues të tjerë pa na pyetur.',
  },
  {
    name: 'Shpëlarje pas ndërhyrjes',
    category: 'Kujdesi pas ndërhyrjes',
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
const START_TIMES = ['08:30', '09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '14:00', '14:30', '15:00', '15:30', '16:00', '16:30', '17:00'];
const APPOINTMENT_STATUSES = ['SCHEDULED', 'COMPLETED', 'CANCELLED', 'NO_SHOW'] as const;

async function main() {
  console.log('Clearing existing data…');
  await prisma.auditLog.deleteMany();
  await prisma.stockMovement.deleteMany();
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
  await prisma.service.deleteMany();
  await prisma.staffUser.deleteMany();

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
  const services = [];
  for (const service of SERVICES) {
    services.push(await prisma.service.create({ data: service }));
  }

  console.log('Seeding stock…');
  const stockItems = [];
  for (const item of STOCK) {
    stockItems.push(await prisma.stockItem.create({ data: item }));
  }

  console.log('Seeding service materials…');
  for (const service of services) {
    for (const [itemName, quantity] of SERVICE_MATERIALS[service.name] ?? []) {
      const item = stockItems.find((candidate) => candidate.name === itemName);
      if (!item) continue;
      await prisma.serviceMaterial.create({
        data: { serviceId: service.id, itemId: item.id, quantity },
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
      const extra = random() > 0.6 ? `, ${pick(SERVICES).name}` : '';
      await prisma.visitRecord.create({
        data: {
          patientId: patient.id,
          visitDate: overdue.includes(patient)
            ? addDays(TODAY, -randomInt(260, 400))
            : addDays(TODAY, -randomInt(20, 170)),
          notes: `${service.name} — pa komplikacione. Pacienti u këshillua për higjienë orale.`,
          services: `${service.name}${extra}`,
          staffUserId: pick([owner.id, assistant.id]),
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
        services: service.name,
        staffUserId: owner.id,
      },
    });
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
        },
      });
    }
  }

  console.log('Seeding prescription templates…');
  const templates = [];
  for (const template of PRESCRIPTION_TEMPLATES) {
    templates.push(await prisma.prescriptionTemplate.create({ data: template }));
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
          { position: 2, title: 'Mbushje kompozite', toothNum: 12, status: 'DONE', completedAt: addDays(TODAY, -12) },
          { position: 3, title: 'Mbushje kompozite', toothNum: 13 },
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
          { position: 2, title: 'Heqje dhëmbi', toothNum: 30, status: 'DONE', completedAt: addDays(TODAY, -55) },
          { position: 3, title: 'Vendosje implanti', toothNum: 30 },
          { position: 4, title: 'Kurorë mbi implant', toothNum: 30 },
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
        toothNum: index === 0 ? 30 : null,
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
    serviceMaterials: await prisma.serviceMaterial.count(),
    stock: await prisma.stockItem.count(),
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
