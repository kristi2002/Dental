/**
 * Create the first Owner account on a freshly deployed database.
 *
 * The app has no self-service signup — the owner creates every other account
 * from the Staff page — and `prisma/seed.ts` cannot help here: it needs `tsx`
 * and the dev dependencies, which the runtime image deliberately does not carry,
 * and it clears existing rows to plant demo data. So a real clinic needs exactly
 * one account to exist before anyone can sign in. This makes that one account.
 *
 * Run it once, after the first deploy:
 *
 *   docker exec -it <container> node /app/docker/create-owner.mjs "Ilir" "Berisha"
 *
 * It prints a generated PIN, or takes one as a third argument. It refuses to run
 * if any staff account already exists, so it can never be the thing that quietly
 * adds an owner to a practice already in use.
 *
 * Uses only `node:crypto` and `pg`, both of which the runtime image already has.
 */
import { randomBytes, randomUUID, scrypt as scryptCallback } from 'node:crypto';
import { promisify } from 'node:util';
import pg from 'pg';

const scrypt = promisify(scryptCallback);

// Must match `src/lib/auth/crypto.ts` exactly, or the PIN will never verify:
// a 16-byte salt rendered as hex and passed to scrypt as that hex *string*,
// and a 32-byte derived key stored as hex.
const KEY_LENGTH = 32;

async function hashPin(pin) {
  const salt = randomBytes(16).toString('hex');
  const derived = await scrypt(pin, salt, KEY_LENGTH);
  return { hash: derived.toString('hex'), salt };
}

function generatePin() {
  return Array.from(randomBytes(6), (byte) => String(byte % 10)).join('');
}

const [firstName, lastName, pinArg] = process.argv.slice(2);

if (!firstName || !lastName) {
  console.error('Usage: node create-owner.mjs "<first name>" "<last name>" [pin]');
  process.exit(1);
}

if (pinArg !== undefined && !/^\d{4,6}$/.test(pinArg)) {
  console.error('The PIN must be 4 to 6 digits.');
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set.');
  process.exit(1);
}

const pin = pinArg ?? generatePin();
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });

await client.connect();

try {
  const { rows } = await client.query('SELECT COUNT(*)::int AS count FROM "StaffUser"');

  if (rows[0].count > 0) {
    console.error(
      `Refusing to run: ${rows[0].count} staff account(s) already exist.\n` +
        'Add further accounts from the Staff page, signed in as the owner.',
    );
    process.exit(1);
  }

  const { hash, salt } = await hashPin(pin);

  await client.query(
    `INSERT INTO "StaffUser"
       (id, "firstName", "lastName", role, "pinHash", "pinSalt", active,
        "failedAttempts", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, 'OWNER', $4, $5, true, 0, NOW(), NOW())`,
    [randomUUID(), firstName, lastName, hash, salt],
  );

  console.log('');
  console.log(`  Owner account created: ${firstName} ${lastName}`);
  console.log(`  PIN: ${pin}`);
  console.log('');
  console.log('  This PIN is not stored anywhere in readable form and cannot be');
  console.log('  recovered. Write it down, then change it from the Staff page.');
  console.log('');
} finally {
  await client.end();
}
