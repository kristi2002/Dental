import { FlaskConical, PackageCheck, Phone, PhoneOff } from 'lucide-react';
import { getFormatter, getTranslations } from 'next-intl/server';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Link } from '@/i18n/navigation';
import { labsOnCase } from '@/lib/labs';
import { daysLate, elementsOf, workStatus, type DatedWork } from '@/lib/works';
import { cn } from '@/lib/utils';

type Line = {
  elements: number;
  procedure: string;
  teeth: string | null;
  lab: string | null;
  labRef: { id: string; name: string; phone: string | null; email: string | null } | null;
};

export type PatientWork = DatedWork & {
  id: string;
  number: number;
  labSerial: string | null;
  sentAt: Date;
  urgent: boolean;
  lines: Line[];
};

/**
 * What this patient has at the laboratory, on the patient's own record.
 *
 * The question the front desk is asked more than any other about the register —
 * "is my crown back yet" — was asked with the patient's record already on
 * screen and could only be answered somewhere else. `Work.patientId` has been a
 * real relation since the register existed and this screen read none of it, so
 * answering meant leaving the record, opening `/works`, and searching for a name
 * that had just been printed.
 *
 * Read-only, deliberately. The register is where a case is written and
 * corrected — that screen has the month, the filters and the totals the practice
 * checks its invoices against — and duplicating the edit dialog here would be a
 * second place for one row to be changed. What this owes is the answer and a way
 * through to the rest, which is what the case number links to.
 */
export async function PatientWorks({
  works,
  canSeeLabs,
}: {
  works: ReadonlyArray<PatientWork>;
  /** Whether the reader may open the laboratory list the missing-number link goes to. */
  canSeeLabs: boolean;
}) {
  const t = await getTranslations('works');
  const format = await getFormatter();

  if (works.length === 0) {
    return <EmptyState icon={<FlaskConical size={40} aria-hidden />} title={t('patientEmpty')} />;
  }

  return (
    <ul className="divide-y-2 divide-line">
      {works.map((work) => {
        const state = workStatus(work);
        const labs = labsOnCase(work.lines);

        return (
          <li key={work.id} className="px-5 py-4">
            <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2">
                  <Link href={`/works?q=${work.number}`} className="text-[1.05rem] font-bold">
                    #{work.number}
                  </Link>
                  {work.urgent ? <Badge tone="alert">{t('urgent')}</Badge> : null}
                  {/* Back is back — a case that arrived late is finished, not
                      still late, which is the rule `workStatus` already applies
                      everywhere else the register is read. */}
                  {state === 'received' ? (
                    <Badge tone="ok">
                      <PackageCheck size={15} aria-hidden />
                      {t('statusReceived')}
                    </Badge>
                  ) : (
                    <Badge tone={state === 'overdue' ? 'danger' : state === 'open' ? 'neutral' : 'warn'}>
                      {state === 'overdue'
                        ? t('lateByDays', { days: daysLate(work) })
                        : state === 'dueToday'
                          ? t('statusDueToday')
                          : state === 'dueSoon'
                            ? t('statusDueSoon')
                            : t('statusOut')}
                    </Badge>
                  )}
                </p>

                <p className="mt-0.5 text-[0.93rem] text-ink-soft">
                  {t('sentOn', {
                    date: format.dateTime(work.sentAt, {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    }),
                  })}
                  {work.dueAt
                    ? ` · ${t('dueOn', {
                        date: format.dateTime(work.dueAt, { day: 'numeric', month: 'short' }),
                      })}`
                    : ''}
                  {work.labSerial ? ` · ${work.labSerial}` : ''}
                </p>
              </div>

              <span className="text-[0.93rem] font-semibold text-ink-soft tabular-nums">
                {t('elementsCount', { count: elementsOf(work) })}
              </span>
            </div>

            {/* What is actually being made, one line per piece, exactly as the
                register lists it. The span is printed because "which crown" is
                the follow-up question to "is it back". */}
            <ul className="mt-2 space-y-1">
              {work.lines.map((line, index) => (
                <li key={index} className="text-[0.95rem] text-ink">
                  <span className="font-semibold">{line.procedure}</span>
                  {line.teeth ? <span className="text-ink-soft"> · {line.teeth}</span> : null}
                </li>
              ))}
            </ul>

            {/* Who to ring about it, on a case still out. A case that is back
                needs no telephone number, and printing one would be the record
                offering an errand that is finished. */}
            {state !== 'received' && labs.length > 0 ? (
              <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[0.92rem]">
                {labs.map((lab) => (
                  <span
                    key={lab.id ?? lab.name}
                    className={cn('flex items-center gap-1.5', !lab.phone && 'text-warn')}
                  >
                    {lab.phone ? <Phone size={14} aria-hidden /> : <PhoneOff size={14} aria-hidden />}
                    <span className="font-semibold">{lab.name}</span>
                    {lab.phone ? (
                      <a href={`tel:${lab.phone.replace(/\s/g, '')}`} className="tabular-nums">
                        {lab.phone}
                      </a>
                    ) : canSeeLabs ? (
                      // The laboratory is named and has no number yet — the
                      // state every row the migration carried over starts in.
                      // A link to fix it, rather than a blank, because the
                      // person reading this is the one who wants to ring them.
                      <Link href="/works/labs" className="underline">
                        {t('noLabPhone')}
                      </Link>
                    ) : (
                      <span>{t('noLabPhone')}</span>
                    )}
                  </span>
                ))}
              </p>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
