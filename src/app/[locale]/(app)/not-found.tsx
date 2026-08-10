import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';

export default function LocaleNotFound() {
  const t = useTranslations('errors');

  return (
    <div className="card mx-auto max-w-lg p-8 text-center">
      <h1 className="text-3xl font-bold text-ink">{t('notFound')}</h1>
      <p className="mt-2 text-[1.05rem] text-ink-soft">{t('notFoundText')}</p>
      <Link href="/" className="btn btn-primary mt-6">
        {t('backHome')}
      </Link>
    </div>
  );
}
