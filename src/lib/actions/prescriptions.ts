'use server';

import { revalidatePath } from 'next/cache';
import { getLocale, getTranslations } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { MedicalAlertKind } from '@/generated/prisma/enums';
import { authorize, recordAudit } from '@/lib/auth/guard';
import { allergyLines, matchingAllergies } from '@/lib/medical';
import { prisma } from '@/lib/prisma';
import { optionalString, requiredString } from '@/lib/utils';
import { actionError, actionOk, type ActionState } from './types';

function revalidateAll() {
  revalidatePath('/', 'layout');
}

export async function savePrescriptionTemplate(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const t = await getTranslations('errors');

  const user = await authorize('prescription.edit');
  if (!user) return actionError(t('forbidden'));

  const id = optionalString(formData.get('id'));
  const name = requiredString(formData.get('name'));
  const body = requiredString(formData.get('body'));
  if (!name || !body) return actionError(t('fillRequired'));

  const data = { name, body, category: optionalString(formData.get('category')) };
  // Which treatments this wording follows. Set as a whole, so unticking a
  // service on the form actually removes the link rather than only failing to
  // add it again.
  const serviceIds = [...new Set(formData.getAll('serviceIds').map(String).filter(Boolean))];

  let savedId = id;
  try {
    if (id) {
      await prisma.$transaction([
        prisma.prescriptionTemplate.update({ where: { id }, data }),
        prisma.prescriptionTemplateService.deleteMany({ where: { templateId: id } }),
        prisma.prescriptionTemplateService.createMany({
          data: serviceIds.map((serviceId) => ({ templateId: id, serviceId })),
        }),
      ]);
    } else {
      savedId = (
        await prisma.prescriptionTemplate.create({
          data: {
            ...data,
            services: { create: serviceIds.map((serviceId) => ({ serviceId })) },
          },
          select: { id: true },
        })
      ).id;
    }
  } catch {
    return actionError(t('generic'));
  }

  await recordAudit(user, {
    action: id ? 'update' : 'create',
    entity: 'prescription',
    entityId: savedId,
    summary: name,
  });

  revalidateAll();

  // Writing a wording is done on a page of its own, so there is nowhere for the
  // form to return to — the template list is what the person came here to add
  // to, and it is where the new row now is. An edit is submitted from a dialog
  // on that list, so it stays put.
  if (!id) {
    redirect({ href: '/prescriptions', locale: await getLocale() });
  }

  return actionOk();
}

export async function deletePrescriptionTemplate(formData: FormData): Promise<void> {
  const user = await authorize('prescription.edit');
  if (!user) return;

  const id = requiredString(formData.get('id'));
  if (!id) return;

  const template = await prisma.prescriptionTemplate.findUnique({
    where: { id },
    select: { name: true },
  });
  if (!template) return;

  // Issued prescriptions keep their own copy of the text, so removing a template
  // cannot rewrite what a patient was actually given.
  await prisma.prescriptionTemplate.delete({ where: { id } });
  await recordAudit(user, {
    action: 'delete',
    entity: 'prescription',
    entityId: id,
    summary: template.name,
  });
  revalidateAll();
}

/**
 * Issue a prescription to a patient. The final wording is stored verbatim —
 * a template is a starting point, and what the patient received must stay
 * exactly what the patient received.
 */
export async function issuePrescription(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const t = await getTranslations('errors');

  const user = await authorize('prescription.edit');
  if (!user) return actionError(t('forbidden'));

  const patientId = requiredString(formData.get('patientId'));
  const body = requiredString(formData.get('body'));
  if (!patientId || !body) return actionError(t('fillRequired'));

  const templateId = optionalString(formData.get('templateId'));

  // The check the structured alerts exist for: a prescription naming something
  // this patient is recorded as allergic to is stopped once and reported, not
  // silently written. It is overridable — a dentist may have a reason, and the
  // match is a substring test, not clinical judgement — but it must be a
  // deliberate second press.
  if (requiredString(formData.get('force')) !== '1') {
    const [alerts, patient] = await Promise.all([
      prisma.patientAlert.findMany({
        where: { patientId, kind: MedicalAlertKind.ALLERGY },
        select: { kind: true, substance: true, severity: true },
      }),
      prisma.patient.findUnique({ where: { id: patientId }, select: { medicalNotes: true } }),
    ]);

    // The notes count too.
    //
    // This read only the promoted `PatientAlert` rows, so a penicillin allergy
    // written as a sentence — which is how every record predating the alerts
    // feature holds it — passed the check in silence, while the patient's own
    // header shouted about it two inches away. Each sentence the regex finds is
    // offered as a substance in its own right; `matchingAllergies` then decides
    // whether the prescription names it.
    const fromNotes = allergyLines(patient?.medicalNotes).map((line) => ({
      kind: 'ALLERGY',
      substance: line,
      severity: 'CRITICAL',
    }));

    const hits = matchingAllergies(body, [...alerts, ...fromNotes]);
    if (hits.length > 0) {
      return actionError(
        t('allergyClash', {
          list: [...new Set(hits.map((hit) => hit.substance))].join(', '),
        }),
        'allergy',
      );
    }
  }

  let issuedId: string;
  try {
    issuedId = (
      await prisma.prescription.create({
        data: { patientId, body, templateId, issuedById: user.id },
        select: { id: true },
      })
    ).id;
  } catch {
    return actionError(t('generic'));
  }

  // Saving the wording back as a template, at the one moment it is known to be
  // right. A standard-wording list only becomes worth reading if adding to it
  // costs less than not adding to it, and a separate screen costs more.
  const templateName = optionalString(formData.get('templateName'));
  if (requiredString(formData.get('saveAsTemplate')) === '1' && templateName) {
    // One field carrying a comma-separated list, because it is a single "tie
    // this to what was just done" tick rather than one box per treatment.
    const linkedServiceIds = [
      ...new Set(
        requiredString(formData.get('templateServiceIds'))
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean),
      ),
    ];

    try {
      await prisma.prescriptionTemplate.create({
        data: {
          name: templateName,
          category: optionalString(formData.get('templateCategory')),
          body,
          services: { create: linkedServiceIds.map((serviceId) => ({ serviceId })) },
        },
      });
    } catch (error) {
      // The prescription is already issued and that is the part that matters —
      // failing to file a copy of the wording must not report the issue itself
      // as failed.
      console.error('[prescriptions] could not save the template', error);
    }
  }

  const patient = await prisma.patient.findUnique({
    where: { id: patientId },
    select: { firstName: true, lastName: true },
  });

  await recordAudit(user, {
    action: 'create',
    entity: 'prescription',
    entityId: issuedId,
    summary: patient ? `${patient.firstName} ${patient.lastName}` : patientId,
  });

  revalidateAll();
  return actionOk();
}

export async function deletePrescription(formData: FormData): Promise<void> {
  const user = await authorize('patient.delete');
  if (!user) return;

  const id = requiredString(formData.get('id'));
  if (!id) return;

  const prescription = await prisma.prescription.findUnique({
    where: { id },
    select: { patient: { select: { firstName: true, lastName: true } } },
  });
  if (!prescription) return;

  await prisma.prescription.delete({ where: { id } });
  await recordAudit(user, {
    action: 'delete',
    entity: 'prescription',
    entityId: id,
    summary: `${prescription.patient.firstName} ${prescription.patient.lastName}`,
  });
  revalidateAll();
}
