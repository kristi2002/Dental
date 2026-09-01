import { today } from '@/lib/dates';
import { prisma } from '@/lib/prisma';

/**
 * Which visit today's work belongs to.
 *
 * Six tables carry a `visitRecordId` — the tooth's row, its findings, the perio
 * readings, the examination, the boxes off the shelf, and now the radiograph,
 * the prescription and the laboratory docket. Exactly one of those is written
 * from inside the visit form and has an id to hand. The rest are written from
 * their own screens, on their own tabs, minutes either side of the write-up,
 * and none of them is given one.
 *
 * So the link is inferred, by the rule this file exists to state once: **work
 * recorded on the same day as a visit belongs to that visit far more often than
 * it belongs to nothing.** Anything recorded on a day with no visit written up
 * stays unattributed, which is the honest answer and not a failure — a
 * radiograph carried in from another clinic, a prescription telephoned through
 * on a Sunday, an impression logged the morning after.
 *
 * This began as `sameDayVisitId` inside `actions/patients.ts`, private to the
 * chart. It is here because three more callers needed exactly it, and the one
 * thing worse than an inferred link is two screens inferring it differently.
 *
 * **Newest wins** where a patient has been seen twice in a day. That is a
 * genuine guess and it is the right one at the chair: the second write-up is
 * the one being worked on. The migration that backfilled these columns
 * deliberately did *not* copy this rule — reaching back over history with
 * nobody watching, it linked only the unambiguous days and left the rest null.
 */
export async function sameDayVisitId(patientId: string): Promise<string | null> {
  const visit = await prisma.visitRecord.findFirst({
    where: { patientId, visitDate: today() },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  });
  return visit?.id ?? null;
}
