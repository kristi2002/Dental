import { Archive, ChevronLeft, ChevronRight, Inbox, MailOpen, Search } from 'lucide-react';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ThreadRow } from '@/components/messages/ThreadRow';
import { Card, CardHeader } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { Link } from '@/i18n/navigation';
import { requirePermission } from '@/lib/auth/guard';
import { inboundConfigured, mailerStatus } from '@/lib/messages/mailer';
import { getThreads, THREAD_PAGE_SIZE } from '@/lib/messages/threads';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'inbox' });
  return { title: t('title') };
}

/**
 * What came back.
 *
 * The outbox is the practice deciding what to say; this is the half that did
 * not exist. Until now a reminder set `Reply-To` to a mailbox and then lost
 * track: the patient's "can we move it to Thursday?" landed in somebody's
 * Outlook, and the record showed a message sent into silence.
 *
 * **Two lists and no bin.** Filed-away threads are a click away rather than
 * gone, because what arrives here is the only copy — see the note on
 * `EmailThread` — and "I do not want to look at this" is a different statement
 * from "this should stop existing". Spam lands filed rather than deleted for the
 * same reason: the classifier is somebody else's, and it is wrong occasionally.
 */
export default async function InboxPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ filed?: string; q?: string; page?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  await requirePermission('message.view');

  const t = await getTranslations('inbox');
  const tc = await getTranslations('common');
  const { filed, q, page: rawPage } = await searchParams;
  const archived = filed === '1';
  const query = (q ?? '').trim();
  const page = Math.max(1, Number.parseInt(rawPage ?? '1', 10) || 1);

  const { threads, total } = await getThreads({
    archived,
    query,
    skip: (page - 1) * THREAD_PAGE_SIZE,
  });

  const pages = Math.max(1, Math.ceil(total / THREAD_PAGE_SIZE));

  const hrefFor = (nextPage: number) => {
    const search = new URLSearchParams();
    if (archived) search.set('filed', '1');
    if (query) search.set('q', query);
    if (nextPage > 1) search.set('page', String(nextPage));
    const suffix = search.toString();
    return suffix ? `/inbox?${suffix}` : '/inbox';
  };

  // The tabs keep the search but drop the page: thread forty of the open list
  // has no counterpart in the filed one, and landing on an empty page two reads
  // as an empty archive.
  const tabHref = (toArchived: boolean) => {
    const search = new URLSearchParams();
    if (toArchived) search.set('filed', '1');
    if (query) search.set('q', query);
    const suffix = search.toString();
    return suffix ? `/inbox?${suffix}` : '/inbox';
  };
  const mailer = mailerStatus();
  // Two separate settings, and this screen is about the second one. A practice
  // can be sending perfectly and receiving nothing — which is every practice,
  // until somebody points an MX record at the provider.
  const receiving = inboundConfigured();

  return (
    <>
      <PageHeader
        title={t('title')}
        // Said out loud, because an inbox on a practice that never pointed an MX
        // record at anything will simply stay empty for ever, and an empty
        // screen does not explain itself.
        subtitle={
          receiving && mailer.configured ? t('subtitle', { from: mailer.from }) : t('subtitleUnset')
        }
        trail={[{ label: t('title') }]}
      />

      {/* Two tabs rather than a filter bar: there are exactly two states a
          thread can be in, and a control with two options is a pair of links. */}
      <div className="mb-5 flex items-center gap-1 rounded-[var(--radius-card)] border border-line bg-surface p-1">
        {[
          { key: 'open', href: tabHref(false), on: !archived, icon: <Inbox size={17} aria-hidden /> },
          {
            key: 'filed',
            href: tabHref(true),
            on: archived,
            icon: <Archive size={17} aria-hidden />,
          },
        ].map((tab) => (
          <Link
            key={tab.key}
            href={tab.href}
            aria-current={tab.on ? 'page' : undefined}
            className={cn(
              'flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-body font-semibold no-underline transition-colors',
              tab.on
                ? 'bg-brand-soft text-brand-deep'
                : 'text-ink-soft hover:bg-surface-soft hover:text-ink',
            )}
          >
            {tab.icon}
            {t(`tab_${tab.key}`)}
          </Link>
        ))}
      </div>

      {/* The one list in the app nobody controls the length of, so it is the one
          that most needs finding rather than scrolling: a patient's reply is
          looked for by their name or by what the thread is about, weeks after
          it arrived. */}
      <form className="mb-6 flex gap-2" role="search">
        {archived ? <input type="hidden" name="filed" value="1" /> : null}
        <label className="sr-only" htmlFor="inbox-search">
          {tc('search')}
        </label>
        <input
          id="inbox-search"
          type="search"
          name="q"
          defaultValue={query}
          placeholder={t('searchPlaceholder')}
          className="field-input flex-1"
        />
        <button type="submit" className="btn btn-secondary">
          <Search size={20} aria-hidden />
          <span className="sr-only sm:not-sr-only">{tc('search')}</span>
        </button>
      </form>

      <Card>
        <CardHeader
          title={t(archived ? 'filedTitle' : 'openTitle')}
          // The total, not the length of this page. This list used to take a
          // flat hundred and count what it had taken, so a busy practice read
          // "100" for ever and never learned there was more.
          subtitle={t(archived ? 'filedSubtitle' : 'openSubtitle', { count: total })}
          icon={<MailOpen size={22} aria-hidden />}
        />

        {threads.length === 0 ? (
          <EmptyState
            icon={<Inbox size={40} aria-hidden />}
            title={
              query
                ? t('emptySearch', { query })
                : t(archived ? 'filedEmpty' : 'empty')
            }
          />
        ) : (
          <ul className="divide-y divide-line">
            {threads.map((thread) => (
              <ThreadRow key={thread.id} thread={thread} />
            ))}
          </ul>
        )}
      </Card>

      {/* Previous/next, as the patient list uses: the way anybody finds one
          conversation is the box above, and paging is the fallback. */}
      {pages > 1 ? (
        <nav aria-label={tc('search')} className="mt-6 flex items-center justify-between gap-3">
          {page > 1 ? (
            <Link href={hrefFor(page - 1)} className="btn btn-secondary">
              <ChevronLeft size={18} aria-hidden />
              {tc('back')}
            </Link>
          ) : (
            <span />
          )}

          <span className="text-body font-semibold text-ink-soft tabular-nums">
            {tc('pageOf', { page, pages })}
          </span>

          {page < pages ? (
            <Link href={hrefFor(page + 1)} className="btn btn-secondary">
              {tc('open')}
              <ChevronRight size={18} aria-hidden />
            </Link>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
    </>
  );
}
