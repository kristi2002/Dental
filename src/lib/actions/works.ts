'use server';

import { revalidatePath } from 'next/cache';
import { getLocale, getTranslations } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { authorize, recordAudit } from '@/lib/auth/guard';
import { followUpFileKeys, forgetFiles } from '@/lib/cascade-files';
import { prisma } from '@/lib/prisma';
import { sameDayVisitId } from '@/lib/visit-link';
import { fromDateKey, today } from '@/lib/dates';
import { optionalString, requiredString } from '@/lib/utils';
import { parseDraftLines } from '@/lib/works';
import { actionError, actionOk, type ActionState } from './types';

function revalidateAll() {
  revalidatePath('/', 'layout');
}

/**
 * Write a row of the works register, with its lines.
 *
 * The lines are replaced wholesale on every save — the form always posts the
 * complete case, so a removed row has to disappear rather than linger.
 */
export async function saveWork(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const t = await getTranslations('errors');

  const user = await authorize('work.edit');
  if (!user) return actionError(t('forbidden'));

  const id = optionalString(formData.get('id'));
  const patientName = requiredString(formData.get('patientName'));
  const phone = requiredString(formData.get('phone'));
  if (!patientName || !phone) return actionError(t('fillRequired'));

  // The link is optional and is only ever a link: the name and the number are
  // taken from the form either way, so correcting a typo on this row does not
  // reach into the patient's record, and vice versa. See `Work.patientName`.
  const patientId = optionalString(formData.get('patientId'));
  const patient = patientId
    ? await prisma.patient.findUnique({ where: { id: patientId }, select: { id: true } })
    : null;

  // `fromDateKey` falls back to today, which is right for the day a docket goes
  // out and wrong for both of these: a case with no promise from the lab must
  // stay without one, and an empty "back on" box means it is still out there.
  const optionalDay = (field: string) => {
    const key = optionalString(formData.get(field));
    return key ? fromDateKey(key) : null;
  };

  const data = {
    labSerial: optionalString(formData.get('labSerial')),
    patientId: patient?.id ?? null,
    patientName,
    phone,
    // Only when the form actually carries the field. Which teeth a case covers
    // is picked off the chart now and lives on the lines, so neither form posts
    // this any more — and writing `null` over a case recorded before the chart
    // existed would delete the only copy of its span. See `Work.diagnosis`.
    ...(formData.has('diagnosis')
      ? { diagnosis: optionalString(formData.get('diagnosis')) }
      : {}),
    notes: optionalString(formData.get('notes')),
    // Which month this case counts towards. `fromDateKey` falls back to today,
    // which is the right answer for a docket being written as it goes out.
    sentAt: fromDateKey(optionalString(formData.get('sentAt'))),
    dueAt: optionalDay('dueAt'),
    // The visit that produced the impression, where the patient is on the
    // register and today's treatment has been written up. See `sameDayVisitId`:
    // a docket is filled in at the chair, minutes either side of the write-up,
    // and has no more idea of the visit's id than the chart does.
    //
    // Only on the first save. Re-opening a case in June to type in the lab's
    // serial must not re-attribute a March impression to whatever happened to
    // be written up in June — which is precisely what an unconditional
    // same-day inference would do on every subsequent edit.
    ...(id || !patient ? {} : { visitRecordId: await sameDayVisitId(patient.id) }),
    receivedAt: optionalDay('receivedAt'),
    // An unticked checkbox posts nothing at all, so absence is `false`.
    urgent: formData.get('urgent') !== null,
  };

  const lines = parseDraftLines(requiredString(formData.get('lines')));

  // Which of the posted laboratory ids are real, and what each is called today.
  //
  // Checked rather than trusted: `labId` arrives in a hidden JSON field, and a
  // foreign key taken on faith from one of those is a foreign key somebody can
  // point at any row they like. An id that does not resolve is dropped to null
  // and the line keeps its text, which is exactly the state every case written
  // before this table is already in.
  //
  // The name is read back here too, so the snapshot on the line is the
  // catalogue's spelling rather than whatever the browser happened to send —
  // the one place the two could otherwise disagree from the moment of writing.
  const labIds = [...new Set(lines.map((line) => line.labId).filter(Boolean))];
  const labs = labIds.length
    ? await prisma.lab.findMany({
        where: { id: { in: labIds } },
        select: { id: true, name: true },
      })
    : [];
  const labNames = new Map(labs.map((lab) => [lab.id, lab.name]));

  // The same pass for the kind of work, and word for word the same reasoning:
  // the id arrives in a hidden field and is checked, the name is read back from
  // the catalogue so the snapshot is its spelling rather than the browser's.
  const procedureIds = [...new Set(lines.map((line) => line.procedureId).filter(Boolean))];
  const procedures = procedureIds.length
    ? await prisma.workProcedure.findMany({
        where: { id: { in: procedureIds } },
        select: { id: true, name: true },
      })
    : [];
  const procedureNames = new Map(procedures.map((procedure) => [procedure.id, procedure.name]));

  let savedId = id;
  try {
    await prisma.$transaction(async (tx) => {
      if (id) {
        await tx.work.update({ where: { id }, data });
      } else {
        // `number` is not set here on purpose — the column is a sequence, so two
        // people saving at once cannot be handed the same one. See `Work.number`.
        savedId = (await tx.work.create({ data, select: { id: true } })).id;
      }

      await tx.workLine.deleteMany({ where: { workId: savedId! } });
      if (lines.length > 0) {
        await tx.workLine.createMany({
          data: lines.map((line, index) => ({
            workId: savedId!,
            position: index + 1,
            elements: line.elements,
            // The catalogue's spelling when the line names a row, the typed
            // text when it does not — see `WorkLine.procedure`, which is the
            // docket's copy and never moves again.
            procedure: procedureNames.get(line.procedureId) ?? line.procedure,
            procedureId: procedureNames.has(line.procedureId) ? line.procedureId : null,
            // The catalogue's spelling when the line names a row, the typed
            // text when it does not. See `WorkLine.lab` — the snapshot is what
            // the docket said and stays put for ever after.
            lab: labNames.get(line.labId) ?? (line.lab || null),
            labId: labNames.has(line.labId) ? line.labId : null,
            teeth: line.teeth || null,
          })),
        });
      }
    });
  } catch {
    return actionError(t('generic'));
  }

  await recordAudit(user, {
    action: id ? 'update' : 'create',
    entity: 'work',
    entityId: savedId,
    summary: patientName,
  });

  revalidateAll();

  // A new case is written on a page of its own, and the register is both what
  // the person came here to add to and where the row now is. An edit is
  // submitted from a dialog on that register, so it stays put.
  if (!id) {
    redirect({ href: '/works', locale: await getLocale() });
  }

  return actionOk();
}

/**
 * Tick a case back in, or put it back out if that was a mis-tap.
 *
 * Its own one-button verb rather than a trip through the edit dialog, because it
 * is the single commonest thing that happens to a row on this register — a box
 * arrives from the laboratory and somebody marks it — and the whole value of the
 * chase list depends on it being effortless. A list nobody ticks off fills with
 * red and stops being read.
 */
export async function markWorkReceived(formData: FormData): Promise<void> {
  const user = await authorize('work.edit');
  if (!user) return;

  const id = requiredString(formData.get('id'));
  if (!id) return;

  const work = await prisma.work.findUnique({
    where: { id },
    select: { number: true, patientName: true, receivedAt: true },
  });
  if (!work) return;

  // Read from the row rather than from a hidden field: two people ticking the
  // same case at once should land on "it is back", not toggle each other.
  const receivedAt = work.receivedAt ? null : today();

  await prisma.work.update({ where: { id }, data: { receivedAt } });
  await recordAudit(user, {
    action: 'update',
    entity: 'work',
    entityId: id,
    summary: `#${work.number} ${work.patientName} — ${receivedAt ? 'received' : 'reopened'}`,
  });
  revalidateAll();
}

export async function deleteWork(formData: FormData): Promise<void> {
  const user = await authorize('work.delete');
  if (!user) return;

  const id = requiredString(formData.get('id'));
  if (!id) return;

  const work = await prisma.work.findUnique({
    where: { id },
    select: { number: true, patientName: true },
  });
  if (!work) return;

  // Read before the delete: a case cascades into the follow-ups filed against
  // it, and those carry attachments — most often a photograph of what came back
  // from the laboratory wrong, which is the whole reason somebody pinned it.
  // See `cascade-files.ts`.
  const files = await followUpFileKeys({ workId: id });

  await prisma.work.delete({ where: { id } });
  await forgetFiles(files);

  await recordAudit(user, {
    action: 'delete',
    entity: 'work',
    entityId: id,
    summary: `#${work.number} ${work.patientName}`,
  });
  revalidateAll();
}
