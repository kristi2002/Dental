import { useTranslations } from 'next-intl';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import type { Reliability } from '@/lib/reliability';

const TONES: Record<'watch' | 'at-risk', BadgeTone> = {
  watch: 'neutral',
  'at-risk': 'warn',
};

/**
 * Shown only when there is something to say. A patient who always turns up gets
 * no badge at all — a "reliable" tag on nine rows out of ten is noise, and the
 * point of the flag is that it stands out on the tenth.
 */
export function ReliabilityBadge({ reliability }: { reliability: Reliability | undefined }) {
  const t = useTranslations('reliability');

  if (!reliability) return null;
  if (reliability.level === 'unknown' || reliability.level === 'reliable') return null;

  return (
    <Badge tone={TONES[reliability.level]}>
      {t(reliability.level === 'at-risk' ? 'atRisk' : 'watch', {
        missed: reliability.noShows,
        total: reliability.past,
      })}
    </Badge>
  );
}
