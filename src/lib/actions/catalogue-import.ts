'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import { authorize, recordAudit } from '@/lib/auth/guard';
import {
  isCatalogueImportable,
  type CatalogueRow,
  type ServiceDraft,
  type StockDraft,
} from '@/lib/catalogue-import';
import { IMPORT_LIMIT } from '@/lib/patients-import';
import { prisma } from '@/lib/prisma';
import { actionError, actionOk, type ActionState } from './types';

/**
 * Writing an imported catalogue into the practice.
 *
 * Same shape as the patient import beside it, and for the same reasons: the file
 * is read in the browser, only the drafts cross the wire, and everything the
 * browser decided is decided again here. What is different is the join —
 * a treatment names a heading and a material names a supplier, and both arrive
 * as words rather than as ids.
 */

export type CatalogueOutcome = ActionState & { created?: number; skipped?: number };

/** Folded the way a person means it: "Terapi" and "terapi " are one heading. */
function fold(name: string): string {
  return name.trim().toLocaleLowerCase();
}

/**
 * Names the practice already uses, so the preview can mark what is a repeat.
 *
 * Returns folded names rather than rows: the screen needs to mark lines, and
 * sending the catalogue back would answer a question about a file with a copy
 * of the price list.
 */
export async function findTakenServiceNames(): Promise<string[]> {
  const user = await authorize('service.edit');
  if (!user) return [];

  const rows = await prisma.service.findMany({ select: { name: true } });
  return [...new Set(rows.map((row) => fold(row.name)))];
}

/** The same, for materials: every code and every name already on the shelves. */
export async function findTakenStockKeys(): Promise<string[]> {
  const user = await authorize('stock.edit');
  if (!user) return [];

  const rows = await prisma.stockItem.findMany({ select: { name: true, code: true } });
  return [
    ...new Set(rows.flatMap((row) => [fold(row.name), ...(row.code ? [fold(row.code)] : [])])),
  ];
}

/** Rows out of the posted JSON, or null if it is not what it claims to be. */
function readRows<Draft>(formData: FormData): CatalogueRow<Draft>[] | null {
  try {
    const parsed: unknown = JSON.parse(String(formData.get('rows') ?? '[]'));
    if (!Array.isArray(parsed)) return null;
    return parsed as CatalogueRow<Draft>[];
  } catch {
    return null;
  }
}

/**
 * Turn the names a file used into the rows they mean, creating what is missing.
 *
 * A heading or a supplier that the practice has not typed yet is *created*
 * rather than dropped. The alternative is refusing a whole price list because
 * one department is spelled differently, which is the behaviour that makes
 * people give up on importing and go back to typing — and an unfiled treatment
 * is a worse outcome than an extra heading somebody can rename later.
 *
 * Matched case-insensitively, so a file that says "TERAPI" files under the
 * "Terapi" that already exists instead of creating a second one beside it.
 */
async function resolveByName(
  wanted: ReadonlySet<string>,
  existing: ReadonlyArray<{ id: string; name: string }>,
  create: (name: string) => Promise<{ id: string; name: string }>,
): Promise<Map<string, string>> {
  const byFolded = new Map(existing.map((row) => [fold(row.name), row.id]));

  for (const name of wanted) {
    if (byFolded.has(fold(name))) continue;
    const made = await create(name);
    byFolded.set(fold(made.name), made.id);
  }

  return byFolded;
}

export async function commitServiceImport(
  _prev: CatalogueOutcome,
  formData: FormData,
): Promise<CatalogueOutcome> {
  const t = await getTranslations('errors');

  const user = await authorize('service.edit');
  if (!user) return actionError(t('forbidden'));

  const rows = readRows<ServiceDraft>(formData);
  if (!rows) return actionError(t('generic'));
  if (rows.length === 0) return actionError(t('fillRequired'));
  if (rows.length > IMPORT_LIMIT) return actionError(t('importTooMany', { limit: IMPORT_LIMIT }));

  const usable = rows.filter((row) => row?.draft?.name && isCatalogueImportable(row));

  let created = 0;
  try {
    await prisma.$transaction(async (tx) => {
      const existing = await tx.service.findMany({ select: { name: true } });
      const taken = new Set(existing.map((row) => fold(row.name)));

      // Only the headings this file actually names, and only the ones not
      // already on file — see `resolveByName`.
      const wanted = new Set(
        usable
          .map((row) => row.draft.category)
          .filter((name): name is string => Boolean(name?.trim())),
      );
      const categories = await resolveByName(
        wanted,
        await tx.serviceCategory.findMany({ select: { id: true, name: true } }),
        (name) =>
          // Top level: a file gives one heading per row, not a path, so there is
          // nothing to hang a subcategory from. The catalogue screen is where a
          // practice arranges its tree afterwards.
          tx.serviceCategory.create({ data: { name, parentId: null }, select: { id: true, name: true } }),
      );

      const data = [];
      for (const row of usable) {
        const key = fold(row.draft.name);
        if (taken.has(key)) continue;
        taken.add(key);
        data.push({
          name: row.draft.name,
          durationMin: row.draft.durationMin,
          categoryId: row.draft.category ? (categories.get(fold(row.draft.category)) ?? null) : null,
        });
      }

      if (data.length === 0) return;
      created = (await tx.service.createMany({ data, skipDuplicates: true })).count;
    });
  } catch {
    return actionError(t('generic'));
  }

  await recordAudit(user, {
    action: 'create',
    entity: 'service',
    summary: `Imported ${created} treatments from a file (${rows.length} rows offered)`,
  });

  revalidatePath('/', 'layout');
  return { ...actionOk(), created, skipped: rows.length - created };
}

export async function commitStockImport(
  _prev: CatalogueOutcome,
  formData: FormData,
): Promise<CatalogueOutcome> {
  const t = await getTranslations('errors');

  const user = await authorize('stock.edit');
  if (!user) return actionError(t('forbidden'));

  const rows = readRows<StockDraft>(formData);
  if (!rows) return actionError(t('generic'));
  if (rows.length === 0) return actionError(t('fillRequired'));
  if (rows.length > IMPORT_LIMIT) return actionError(t('importTooMany', { limit: IMPORT_LIMIT }));

  const usable = rows.filter((row) => row?.draft?.name && isCatalogueImportable(row));

  let created = 0;
  /** Symbols taught to the scanner by this file — see the linking pass below. */
  let linked = 0;
  try {
    await prisma.$transaction(async (tx) => {
      const existing = await tx.stockItem.findMany({ select: { name: true, code: true } });
      const taken = new Set(
        existing.flatMap((row) => [fold(row.name), ...(row.code ? [fold(row.code)] : [])]),
      );

      const wantedCategories = new Set(
        usable
          .map((row) => row.draft.category)
          .filter((name): name is string => Boolean(name?.trim())),
      );
      const categories = await resolveByName(
        wantedCategories,
        await tx.stockCategory.findMany({ select: { id: true, name: true } }),
        (name) => tx.stockCategory.create({ data: { name }, select: { id: true, name: true } }),
      );

      const wantedSuppliers = new Set(
        usable
          .map((row) => row.draft.supplier)
          .filter((name): name is string => Boolean(name?.trim())),
      );
      const suppliers = await resolveByName(
        wantedSuppliers,
        await tx.supplier.findMany({ select: { id: true, name: true } }),
        (name) => tx.supplier.create({ data: { name }, select: { id: true, name: true } }),
      );

      const data = [];
      /** Name → the symbol on its carton, for the linking pass below. */
      const gtins = new Map<string, string>();

      for (const row of usable) {
        const { draft } = row;
        // Claimed by code where there is one, by name where there is not — the
        // same rule the reader applies within the file.
        const key = fold(draft.code ?? draft.name);
        if (taken.has(key) || taken.has(fold(draft.name))) continue;
        taken.add(key);
        taken.add(fold(draft.name));
        if (draft.gtin) gtins.set(draft.name, draft.gtin);

        data.push({
          name: draft.name,
          code: draft.code,
          minLimit: draft.minLimit,
          unitPrice: draft.unitPrice,
          categoryId: draft.category ? (categories.get(fold(draft.category)) ?? null) : null,
          supplierId: draft.supplier ? (suppliers.get(fold(draft.supplier)) ?? null) : null,
          // Nothing on the shelf until somebody counts it. A catalogue import
          // says what a material *is*; the stocktake screen records how much
          // there is, as the movement it really is — see `catalogue-import.ts`.
          quantity: 0,
        });
      }

      if (data.length === 0) return;
      created = (await tx.stockItem.createMany({ data, skipDuplicates: true })).count;

      /**
       * Teach the scanner, in the same pass that records the materials.
       *
       * This is the step that decides whether any of the scanning in this app is
       * ever used. A symbol can otherwise only be linked from a *failed scan* —
       * one carton at a time, by whoever is holding it — so a practice adopting
       * the scanner faces seventy of those before the first beep saves anybody a
       * second, and the realistic outcome is that it never gets past ten.
       *
       * `createMany` does not return ids, so the rows just written are read back
       * by name. Bounded by what was imported rather than by the whole shelf.
       *
       * `skipDuplicates` on the link: a code the practice has already taught the
       * app points at whatever it points at now, and a file is not grounds to
       * silently repoint it at something else. `ProductBarcode.code` is unique,
       * so the existing link simply stands.
       */
      if (gtins.size > 0) {
        const written = await tx.stockItem.findMany({
          where: { name: { in: [...gtins.keys()] } },
          select: { id: true, name: true },
        });

        const links = written
          .map((item) => ({ itemId: item.id, code: gtins.get(item.name) }))
          .filter((link): link is { itemId: string; code: string } => Boolean(link.code));

        if (links.length > 0) {
          linked = (await tx.productBarcode.createMany({ data: links, skipDuplicates: true })).count;
        }
      }
    });
  } catch {
    return actionError(t('generic'));
  }

  await recordAudit(user, {
    action: 'create',
    entity: 'stock',
    summary: `Imported ${created} materials from a file (${rows.length} rows offered), ${linked} barcode(s) linked`,
  });

  revalidatePath('/', 'layout');
  return { ...actionOk(), created, skipped: rows.length - created };
}
