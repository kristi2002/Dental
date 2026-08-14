import { Role } from '@/generated/prisma/enums';

/**
 * Every distinct thing a person can do, named `resource.action`. Adding a
 * capability means adding it here first — the matrix below then forces a
 * yes/no decision for each role instead of letting one quietly inherit it.
 *
 * "medical" is split out from ordinary patient data on purpose: the front desk
 * needs a phone number and a slot, not a diagnosis.
 */
export const PERMISSIONS = [
  'patient.view',
  'patient.edit',
  'patient.delete',
  'patient.medical.view',
  'patient.medical.edit',
  'appointment.view',
  'appointment.edit',
  'appointment.delete',
  'service.view',
  'service.edit',
  'service.delete',
  'stock.view',
  'stock.edit',
  'stock.delete',
  'analytics.view',
  'recall.view',
  'recall.send',
  'waitlist.view',
  'waitlist.edit',
  'plan.view',
  'plan.edit',
  'work.view',
  'work.edit',
  'work.delete',
  'document.view',
  'document.edit',
  'document.delete',
  'prescription.view',
  'prescription.edit',
  'settings.view',
  'settings.edit',
  'staff.manage',
  'audit.view',
  'backup.export',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/**
 * The whole access model, in one readable table. Nothing else in the app decides
 * who may do what — if a screen or an action needs to know, it asks here.
 *
 * Deletion is deliberately owner-only across the board: in a small clinic the
 * cost of an accidental delete is far higher than the cost of asking the owner.
 * Everyone else cancels, deactivates or corrects instead.
 */
export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  /** Owner / dentist — the practice is theirs; nothing is hidden. */
  [Role.OWNER]: PERMISSIONS,

  /**
   * Assistant / nurse — full clinical record, no business figures, no deletes.
   * Prescribing is the one clinical act withheld: it is the dentist's signature,
   * not a task that can be delegated.
   */
  [Role.ASSISTANT]: [
    'patient.view',
    'patient.edit',
    'patient.medical.view',
    'patient.medical.edit',
    'appointment.view',
    'appointment.edit',
    'service.view',
    'stock.view',
    'stock.edit',
    'recall.view',
    'recall.send',
    'waitlist.view',
    'waitlist.edit',
    'plan.view',
    'plan.edit',
    'work.view',
    'work.edit',
    'document.view',
    'document.edit',
    'prescription.view',
    'settings.view',
  ],

  /** Front desk — schedules and contacts people, never opens the chart. */
  [Role.RECEPTIONIST]: [
    'patient.view',
    'patient.edit',
    'appointment.view',
    'appointment.edit',
    'service.view',
    'stock.view',
    'recall.view',
    'recall.send',
    'waitlist.view',
    'waitlist.edit',
    // Reading the works register, not writing it. The front desk is who answers
    // "is my crown back yet", so the list has to be open to them; the diagnosis
    // column on it is chart material, which is the line this role does not cross.
    'work.view',
    'settings.view',
  ],

  /** Locum or accountant — reads everything relevant, writes nothing. */
  [Role.READONLY]: [
    'patient.view',
    'patient.medical.view',
    'appointment.view',
    'service.view',
    'stock.view',
    'analytics.view',
    'recall.view',
    'waitlist.view',
    'plan.view',
    'work.view',
    'document.view',
    'prescription.view',
    'settings.view',
  ],
};

/** Role order used wherever roles are listed, most privileged first. */
export const ROLE_ORDER: readonly Role[] = [
  Role.OWNER,
  Role.ASSISTANT,
  Role.RECEPTIONIST,
  Role.READONLY,
];

export function roleHas(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

/** True when the role may change *anything* — drives "you are viewing only" hints. */
export function roleIsReadOnly(role: Role): boolean {
  return !ROLE_PERMISSIONS[role].some((p) => p.endsWith('.edit') || p.endsWith('.delete'));
}

export { Role };
