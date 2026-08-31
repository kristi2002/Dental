'use client';

import { CircleQuestionMark } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { usePathname } from '@/i18n/navigation';
import { topicFor } from '@/lib/help/topics';
import { openHelp } from './open-help';

/**
 * "What is this screen for?", offered on a screen that has nothing on it yet.
 *
 * An empty list is the one moment the question is being asked out loud. A
 * practice on its first morning opens Suppliers, reads "No suppliers yet", and
 * has no way to tell whether that matters, whether it is the right screen, or
 * what filling it in would buy them — and the answer to all three has been
 * written and sits behind a button in a corner they have not learnt yet.
 *
 * Deliberately quiet: a text button under the empty state's own sentence, not a
 * banner. It is a second offer on a screen that has already made its first, and
 * a screen with nothing on it is not an emergency.
 *
 * Renders nothing where no topic answers for the path — the same rule the
 * button in the corner follows, for the same reason. A link that opened
 * somebody else's explanation would be worse than no link.
 */
export function ExplainLink() {
  const t = useTranslations('help');
  const pathname = usePathname();
  if (!topicFor(pathname)) return null;

  return (
    <button
      type="button"
      onClick={() => openHelp()}
      className="inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-meta font-semibold text-brand-deep transition-colors hover:bg-brand-soft"
    >
      <CircleQuestionMark size={17} aria-hidden />
      {t('explain')}
    </button>
  );
}
