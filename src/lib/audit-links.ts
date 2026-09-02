/**
 * Where a line in the activity log points, and which lines point anywhere.
 *
 * The trail records `entity` and `entityId` on every line and nothing ever
 * followed them, so reading "Changed · Patient · Arta Krasniqi" and then wanting
 * to *look* at Arta Krasniqi meant going to the patient list and searching for a
 * name that had just been printed on screen.
 *
 * Deliberately conservative. A link that leads to a 404 is worse than a line
 * that is not a link, and three entity names in this app carry two different
 * kinds of id depending on which action wrote them:
 *
 *   - `prescription` is the issued prescription's id from `issuePrescription`,
 *     and the *template's* id from `deletePrescriptionTemplate`.
 *   - `plan` is sometimes the plan and sometimes the step that was booked.
 *   - `document` is the document for a delete and the *patient* for an ID-card
 *     upload, which replaces two rows at once and has no single document to name.
 *
 * None of those can be resolved from the row alone, so none of them links. The
 * ones below can, because every action that writes them writes the same kind of
 * id — which is a property worth stating in a test rather than trusting, and
 * `tests/audit-links.test.ts` states it.
 */

/** Entity names whose `entityId` is always a patient id. */
const PATIENT_ENTITIES = new Set(['patient', 'tooth', 'recall', 'contact', 'waitlist', 'message']);

/** Entity names whose `entityId` is always a stock item id. */
const STOCK_ENTITIES = new Set(['stock']);

export type AuditDestination = {
  /** Locale-less href, for `@/i18n/navigation`'s `Link`. */
  href: string;
  /** Which record the link leads to, so the caller can check it still exists. */
  kind: 'patient' | 'stock';
  id: string;
};

/**
 * The record a line is about, when the line names one unambiguously.
 *
 * Null covers three different situations and does not distinguish them, because
 * the page does the same thing in all three: the entity has no page of its own
 * (an appointment lives on a calendar, a follow-up in a bell), the id is
 * ambiguous (above), or the line names no record at all (a sign-in, a backup).
 */
export function auditDestination(
  entity: string,
  entityId: string | null,
): AuditDestination | null {
  if (!entityId) return null;

  if (PATIENT_ENTITIES.has(entity)) {
    return { href: `/patients/${entityId}`, kind: 'patient', id: entityId };
  }

  if (STOCK_ENTITIES.has(entity)) {
    // The edit form rather than the label screen: somebody arriving from the
    // trail is checking what a change did, which is what that page shows.
    return { href: `/stock/${entityId}/edit`, kind: 'stock', id: entityId };
  }

  return null;
}
