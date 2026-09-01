import { ArrowLeft, FlaskConical, Plus, Sparkles, Trash2 } from 'lucide-react';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ProcedureFormDialog } from '@/components/works/ProcedureFormDialog';
import { ActionForm } from '@/components/ui/ActionForm';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { Link } from '@/i18n/navigation';
import {
  adoptWorkProcedure,
  deleteWorkProcedure,
  restoreWorkProcedure,
} from '@/lib/actions/work-procedures';
import { ArchivedList } from '@/components/ui/ArchivedList';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/auth/guard';
import {
  getAllWorkProcedures,
  getProcedureUsage,
  getWorkProcedures,
  linesUsing,
  unnamedProcedures,
} from '@/lib/work-procedures';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'workProcedures' });
  return { title: t('title') };
}

/**
 * The kinds of work the practice sends out.
 *
 * Named here, once, and picked from everywhere else — the case form offers this
 * list and nothing but this list, which is what stops one kind of crown becoming
 * three spellings of itself and the month's count being unaddable.
 *
 * Needs `work.edit` rather than `work.view`, like the shelves: the names are
 * already printed on every case in the register, so a viewer landing here could
 * only read a list they can neither add to nor change.
 */
export default async function WorkProceduresPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const user = await requirePermission('work.edit');
  const canDelete = user.permissions.includes('work.delete');

  const t = await getTranslations('workProcedures');
  const tc = await getTranslations('common');
  const tw = await getTranslations('works');

  const [procedures, allProcedures, archivedProcedures, usage] = await Promise.all([
    getWorkProcedures(),
    // The whole catalogue, for the duplicate check below.
    getAllWorkProcedures(),
    // Retired kinds of work — see `deleteWorkProcedure`, which stopped deleting
    // them the moment `WorkLine.procedureId` made a delete destroy the link.
    prisma.workProcedure.findMany({
      where: { archivedAt: { not: null } },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, archivedAt: true },
    }),
    getProcedureUsage(),
  ]);
  // Measured against the *whole* catalogue, retired entries included.
  //
  //  above is the active list, and using it here made a retired
  // kind of work reappear under "names the register is already using" — an
  // invitation to adopt a second row for the thing the practice had just
  // retired. "Is this name in the catalogue" is a question that does not care
  // whether the row is still offered.
  const suggestions = unnamedProcedures(
    usage,
    allProcedures.map((procedure) => procedure.name),
  );

  const newLink = (
    <Link href="/works/procedures/new" className="btn btn-primary">
      <Plus size={18} aria-hidden />
      {t('new')}
    </Link>
  );

  return (
    <>
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        trail={[{ href: '/works', label: tw('title') }, { label: t('title') }]}
        actions={
          <>
            <Link href="/works" className="btn btn-secondary">
              <ArrowLeft size={18} aria-hidden />
              {tc('back')}
            </Link>
            {newLink}
          </>
        }
      />

      {procedures.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<FlaskConical size={40} aria-hidden />}
            title={t('empty')}
            action={newLink}
            explain
          />
        </div>
      ) : (
        <ul className="card divide-y divide-line">
          {procedures.map((procedure) => (
            <li
              key={procedure.id}
              className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 py-4"
            >
              <div className="min-w-0">
                <p className="text-body font-bold text-ink">{procedure.name}</p>
                <p className="text-meta text-ink-soft">
                  {t('lineCount', { count: linesUsing(usage, procedure.name) })}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <ProcedureFormDialog
                  procedure={{ id: procedure.id, name: procedure.name }}
                />
                {canDelete ? (
                  <ActionForm
                    action={deleteWorkProcedure}
                    values={{ id: procedure.id }}
                    confirmMessage={tc('confirmRetire')}
                  >
                    <button type="submit" className="btn btn-danger btn-sm" title={tc('delete')}>
                      <Trash2 size={17} aria-hidden />
                      <span className="sr-only">{tc('delete')}</span>
                    </button>
                  </ActionForm>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* What the register has been calling its work while this list did not
          exist. Offered rather than adopted behind the practice's back — the
          reasoning is on `unnamedProcedures`, and the short version is that half
          of these are usually spellings of the other half. */}
      {suggestions.length > 0 ? (
        <section className="card mt-6 overflow-hidden">
          <header className="flex items-start gap-3 border-b border-line bg-surface-soft px-5 py-4">
            <span className="mt-0.5 text-brand">
              <Sparkles size={22} aria-hidden />
            </span>
            <div>
              <h2 className="text-lead font-bold text-ink">{t('suggestions')}</h2>
              <p className="text-body text-ink-soft">{t('suggestionsHint')}</p>
            </div>
          </header>

          <ul className="divide-y divide-line">
            {suggestions.map((suggestion) => (
              <li
                key={suggestion.name}
                className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 py-3"
              >
                <div className="min-w-0">
                  <p className="text-body font-semibold text-ink">{suggestion.name}</p>
                  <p className="text-meta text-ink-soft">
                    {t('lineCount', { count: suggestion.lines })}
                  </p>
                </div>

                <ActionForm action={adoptWorkProcedure} values={{ name: suggestion.name }}>
                  <button type="submit" className="btn btn-secondary btn-sm">
                    <Plus size={16} aria-hidden />
                    {t('adopt')}
                  </button>
                </ActionForm>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="mt-6">
        <ArchivedList
          rows={archivedProcedures}
          action={restoreWorkProcedure}
          title={tc('archivedProcedures')}
        />
      </div>
    </>
  );
}
