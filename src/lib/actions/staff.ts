'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import { Role } from '@/generated/prisma/enums';
import { hashPin, isValidPinFormat } from '@/lib/auth/crypto';
import { authorize, recordAudit } from '@/lib/auth/guard';
import { prisma } from '@/lib/prisma';
import { optionalString, requiredString } from '@/lib/utils';
import { actionError, actionOk, type ActionState } from './types';

function revalidateAll() {
  revalidatePath('/', 'layout');
}

function toRole(value: string): Role {
  return value in Role ? (value as Role) : Role.RECEPTIONIST;
}

/**
 * Guards the one change that can lock everyone out: removing the last person who
 * is able to manage staff. Checked before demotion and before deactivation.
 */
async function isLastActiveOwner(staffId: string): Promise<boolean> {
  const owners = await prisma.staffUser.findMany({
    where: { role: Role.OWNER, active: true },
    select: { id: true },
  });
  return owners.length === 1 && owners[0]?.id === staffId;
}

export async function saveStaff(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const t = await getTranslations('errors');
  const ts = await getTranslations('staff');

  const user = await authorize('staff.manage');
  if (!user) return actionError(t('forbidden'));

  const id = optionalString(formData.get('id'));
  const firstName = requiredString(formData.get('firstName'));
  const lastName = requiredString(formData.get('lastName'));
  const role = toRole(requiredString(formData.get('role')));
  const pin = requiredString(formData.get('pin'));

  if (!firstName || !lastName) return actionError(t('fillRequired'));

  // A new account needs a PIN; an existing one only when it is being changed.
  if (!id && !pin) return actionError(ts('errorPinRequired'));
  if (pin && !isValidPinFormat(pin)) return actionError(ts('errorPinFormat'));

  if (id && role !== Role.OWNER && (await isLastActiveOwner(id))) {
    return actionError(ts('errorLastOwner'));
  }

  const credentials = pin ? await hashPin(pin) : null;

  let savedId = id;
  try {
    if (id) {
      await prisma.staffUser.update({
        where: { id },
        data: {
          firstName,
          lastName,
          role,
          ...(credentials
            ? {
                pinHash: credentials.hash,
                pinSalt: credentials.salt,
                // A fresh PIN clears an active lockout — that is the point of it.
                failedAttempts: 0,
                lockedUntil: null,
              }
            : {}),
        },
      });
    } else {
      savedId = (
        await prisma.staffUser.create({
          data: {
            firstName,
            lastName,
            role,
            pinHash: credentials!.hash,
            pinSalt: credentials!.salt,
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
    entity: 'staff',
    entityId: savedId,
    summary: `${firstName} ${lastName} · ${role}${pin ? ' · PIN' : ''}`,
  });

  revalidateAll();
  return actionOk();
}

/**
 * Deactivating rather than deleting: the audit trail, recorded visits and stock
 * movements all point at this person and should keep reading correctly.
 */
export async function setStaffActive(formData: FormData): Promise<void> {
  const user = await authorize('staff.manage');
  if (!user) return;

  const id = requiredString(formData.get('id'));
  const active = requiredString(formData.get('active')) === '1';
  if (!id) return;

  if (!active && (await isLastActiveOwner(id))) return;

  const staff = await prisma.staffUser.update({
    where: { id },
    data: { active, failedAttempts: 0, lockedUntil: null },
    select: { firstName: true, lastName: true },
  });

  await recordAudit(user, {
    action: 'update',
    entity: 'staff',
    entityId: id,
    summary: `${staff.firstName} ${staff.lastName} · ${active ? 'active' : 'disabled'}`,
  });
  revalidateAll();
}

/** Clears a lockout without changing the PIN — for the honest "I mistyped it five times". */
export async function unlockStaff(formData: FormData): Promise<void> {
  const user = await authorize('staff.manage');
  if (!user) return;

  const id = requiredString(formData.get('id'));
  if (!id) return;

  const staff = await prisma.staffUser.update({
    where: { id },
    data: { failedAttempts: 0, lockedUntil: null },
    select: { firstName: true, lastName: true },
  });

  await recordAudit(user, {
    action: 'update',
    entity: 'staff',
    entityId: id,
    summary: `${staff.firstName} ${staff.lastName} · unlocked`,
  });
  revalidateAll();
}
