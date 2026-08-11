'use client';

import { Check, Copy } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

/**
 * The subscription URL, and one button that copies it.
 *
 * Shown rather than emailed, because the person who needs it is standing at the
 * machine. The warning is not decoration: anyone holding this link can read that
 * dentist's schedule without signing in, which is the trade for a feed a phone
 * can actually subscribe to.
 */
export function CalendarFeedCard({ url }: { url: string }) {
  const t = useTranslations('settings');
  const [copied, setCopied] = useState(false);

  return (
    <div className="space-y-3 px-5 py-5">
      <p className="text-[0.98rem] text-ink-soft">{t('feedHint')}</p>

      <div className="flex flex-wrap items-center gap-2">
        <input
          readOnly
          value={url}
          aria-label={t('feedUrl')}
          onFocus={(event) => event.currentTarget.select()}
          className="field-input min-w-0 flex-1 font-mono text-[0.88rem]"
        />
        <button
          type="button"
          className="btn btn-secondary"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(url);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            } catch {
              // Clipboard access can be refused; the field is selectable anyway.
            }
          }}
        >
          {copied ? <Check size={18} aria-hidden /> : <Copy size={18} aria-hidden />}
          {copied ? t('feedCopied') : t('feedCopy')}
        </button>
      </div>

      <p className="text-[0.9rem] font-semibold text-warn">{t('feedWarning')}</p>
    </div>
  );
}
