/**
 * Where a lab case can be in its life.
 *
 * Here rather than beside the dialog that first needed it: a plain array
 * exported from a `'use client'` module reaches a server component as a client
 * *reference*, not as an array, and the failure surfaces as `.find is not a
 * function` at the point of use rather than at the import.
 */
export const LAB_STATUSES = ['SENT', 'RECEIVED', 'FITTED', 'CANCELLED'] as const;

export type LabStatus = (typeof LAB_STATUSES)[number];

export function isLabStatus(value: string | undefined): value is LabStatus {
  return value !== undefined && (LAB_STATUSES as readonly string[]).includes(value);
}

/**
 * Aftercare, as a short list rather than a free-text box.
 *
 * What a patient is told about a new zirconia crown should not depend on who
 * happened to be at the desk that afternoon, and "be careful for a few days" is
 * what free text reliably degrades into. The wording itself lives in the message
 * files, so it is written once per language and printed on the work order.
 */
export const LAB_CARE_GUIDES = [
  'CROWN_BRIDGE',
  'DENTURE',
  'IMPLANT',
  'ALIGNER',
  'VENEER',
  'RETAINER',
] as const;

export type LabCareGuide = (typeof LAB_CARE_GUIDES)[number];

export function isLabCareGuide(value: string): value is LabCareGuide {
  return (LAB_CARE_GUIDES as readonly string[]).includes(value);
}
