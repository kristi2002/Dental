/**
 * Empty the retired `ServiceMaterial` table so the model can be deleted.
 *
 * Bills of materials were replaced by scanning the product itself. The rows are
 * dead weight, but the table cannot simply be removed from `schema.prisma`: the
 * deploy runs `prisma db push` *without* `--accept-data-loss` on purpose (see
 * `docker/entrypoint.sh`), and dropping a populated table is precisely the
 * change that halts a release rather than applying it.
 *
 * So the removal is two releases, and this is the step between them:
 *
 *   1. This release — nothing reads or writes the table any more.
 *   2. Run this script once against the live database.
 *   3. Next release — delete the `ServiceMaterial` model and the two relation
 *      fields that name it (`Service.materials`, `StockItem.usedBy`). With no
 *      rows to lose, `db push` drops the table without complaint.
 *
 * Nothing else is touched. The `StockMovement` rows those deductions wrote stay
 * exactly where they are — they are the ledger, and last quarter's usage figures
 * are supposed to stay true.
 *
 * Usage, from the project root, with `DATABASE_URL` pointing at the database to
 * clean:
 *
 *     npx tsx --env-file=.env prisma/drop-service-materials.ts
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function main() {
  const before = await prisma.serviceMaterial.count();
  if (before === 0) {
    console.log('ServiceMaterial is already empty — the model can be deleted.');
    return;
  }

  const { count } = await prisma.serviceMaterial.deleteMany();
  console.log(`Deleted ${count} bill-of-materials row${count === 1 ? '' : 's'}.`);
  console.log('The model and its two relation fields can now be deleted from schema.prisma.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
