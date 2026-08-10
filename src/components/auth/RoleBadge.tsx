import { useTranslations } from 'next-intl';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { Role } from '@/generated/prisma/enums';

/** Tone tracks reach, so a glance down a staff list shows who can do the most. */
const TONES: Record<Role, BadgeTone> = {
  [Role.OWNER]: 'brand',
  [Role.ASSISTANT]: 'ok',
  [Role.RECEPTIONIST]: 'warn',
  [Role.READONLY]: 'neutral',
};

export function RoleBadge({ role }: { role: Role }) {
  const t = useTranslations('roles');
  return <Badge tone={TONES[role]}>{t(role)}</Badge>;
}
