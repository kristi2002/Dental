'use client';

import { Download, ShieldCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId } from 'react';
import { Card, CardHeader } from '@/components/ui/Card';

/**
 * A plain form posting to the export route, so the browser handles the download
 * itself — no blob juggling, and the file lands wherever downloads normally go.
 *
 * The passphrase is optional and never leaves this request: it derives the key
 * server-side and is not stored, which also means a forgotten passphrase makes
 * the backup unreadable. The hint says so.
 */
export function BackupCard() {
  const t = useTranslations('backup');
  const tc = useTranslations('common');
  const uid = useId();

  return (
    <Card>
      <CardHeader title={t('title')} icon={<ShieldCheck size={22} aria-hidden />} />

      <form action="/api/backup" method="post" className="space-y-4 p-5">
        <p className="text-body text-ink-soft">{t('description')}</p>

        <div className="max-w-md">
          <label className="field-label" htmlFor={`${uid}-passphrase`}>
            {t('passphrase')}
            <span className="ml-1.5 font-normal text-ink-faint">({tc('optional')})</span>
          </label>
          <p className="mb-1.5 text-meta text-ink-soft">{t('passphraseHint')}</p>
          <input
            id={`${uid}-passphrase`}
            name="passphrase"
            type="password"
            autoComplete="off"
            className="field-input"
          />
        </div>

        <p className="rounded-lg border border-warn bg-warn-soft px-3 py-2.5 text-body font-semibold text-warn">
          {t('warning')}
        </p>

        <button type="submit" className="btn btn-primary">
          <Download size={19} aria-hidden />
          {t('download')}
        </button>
      </form>
    </Card>
  );
}
