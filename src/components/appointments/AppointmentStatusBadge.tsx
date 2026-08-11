import { Ban, CalendarClock, CircleCheck, DoorOpen, UserX } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Badge, type BadgeTone } from '@/components/ui/Badge';

const STATUS_META: Record<string, { tone: BadgeTone; Icon: typeof CircleCheck }> = {
  SCHEDULED: { tone: 'brand', Icon: CalendarClock },
  ARRIVED: { tone: 'warn', Icon: DoorOpen },
  COMPLETED: { tone: 'ok', Icon: CircleCheck },
  CANCELLED: { tone: 'neutral', Icon: Ban },
  NO_SHOW: { tone: 'warn', Icon: UserX },
};

export function AppointmentStatusBadge({ status }: { status: string }) {
  const t = useTranslations('appointments');
  const meta = STATUS_META[status] ?? STATUS_META.SCHEDULED;
  const { Icon } = meta;

  return (
    <Badge tone={meta.tone}>
      <Icon size={15} aria-hidden />
      {t(`status_${status}`)}
    </Badge>
  );
}
