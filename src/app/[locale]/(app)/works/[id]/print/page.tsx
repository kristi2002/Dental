import { FileText } from 'lucide-react';
import type { Metadata } from 'next';
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { SheetHead } from '@/components/brand/SheetHead';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import { PrintButton } from '@/components/prescriptions/PrintButton';
import { DocketChart } from '@/components/works/DocketChart';
import { recordView, requirePermission } from '@/lib/auth/guard';
import { age } from '@/lib/dates';
import { prisma } from '@/lib/prisma';
import { getClinicProfile } from '@/lib/queries';
import { mergeSpans, spanCodes } from '@/lib/tooth-span';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'works' });
  return { title: t('docketTitle') };
}

/**
 * The docket that travels with the case.
 *
 * The register knew everything about a case except how to send it anywhere. A
 * box goes to the laboratory with a slip in it, and that slip was a page torn
 * off a pre-printed pad and filled in by hand — the start date, the kind of
 * work, the patient, the shade, and the teeth ringed on a little chart. The app
 * held every one of those facts and could not put them on paper, so they were
 * written twice: once into the register, once onto the pad, and the two only
 * agreed if whoever copied them was careful.
 *
 * This is that pad, printed from the register. Same fields in the same order, so
 * the laboratory receives what it has always received; the difference is that
 * the half the practice already knows arrives typed and cannot disagree with the
 * screen.
 *
 * ## What is deliberately left blank
 *
 * The stage lines at the foot — metal frame, dentine try-in, completion, custom
 * tray — and the shade are ruled and empty, exactly as they are on the pad. That
 * is not an omission. Those are filled in *by the laboratory*, after the box
 * arrives, and the practice's copy of the register has nothing to say about them.
 * Printing an empty box for a technician's pen is the honest shape of this
 * document; inventing columns in the database to hold dates nobody in the
 * building will ever type would not be.
 *
 * Same mechanics as the other sheets: an ordinary page, printed by the browser,
 * with the app chrome stripped by the `print:` rules in `globals.css`.
 */
export default async function WorkDocketPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const user = await requirePermission('work.view');

  const t = await getTranslations('works');
  const tt = await getTranslations('teeth');
  const tp = await getTranslations('patients');
  const format = await getFormatter();

  const [work, profile] = await Promise.all([
    prisma.work.findUnique({
      where: { id },
      include: {
        lines: { orderBy: { position: 'asc' } },
        // Only the date of birth, and only to write an age on the slip. The
        // laboratory is told how old the patient is because it changes how a
        // denture is made; it is not told who they are beyond the name the
        // register already snapshotted.
        patient: { select: { dateOfBirth: true } },
      },
    }),
    getClinicProfile(),
  ]);

  if (!work) notFound();

  await recordView(user, {
    entity: 'work',
    entityId: work.id,
    summary: `Printed the laboratory docket for case ${work.number} (${work.patientName})`,
  });

  const positions = mergeSpans(work.lines);

  // The laboratories this case is going to. Nearly always one — the register
  // keeps the lab per line because a case can be split, and a docket for a split
  // case should say so rather than pick the first and be quietly wrong.
  const labs = [...new Set(work.lines.map((line) => line.lab?.trim()).filter(Boolean))];

  const totalElements = work.lines.reduce((sum, line) => sum + line.elements, 0);

  const day = (value: Date) =>
    format.dateTime(value, { day: '2-digit', month: '2-digit', year: 'numeric' });

  return (
    <div className="mx-auto max-w-[46rem]">
      <div
        className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden"
        data-print-hide
      >
        <Breadcrumbs
          items={[{ href: '/works', label: t('title') }, { label: t('docketTitle') }]}
        />
        <div className="flex items-center gap-2">
          {/* The same slip, the two ways it leaves: onto paper for the box, and
              into a file for whoever asks about it afterwards. A plain anchor —
              the route sits outside the `[locale]` segment, so it is handed the
              language rather than reading one. */}
          <a
            href={`/api/works/${work.id}/docket?locale=${locale}`}
            className="btn btn-secondary"
            download
          >
            <FileText size={20} aria-hidden />
            {t('docketDownload')}
          </a>
          <PrintButton label={t('docketPrint')} />
        </div>
      </div>

      <article className="card p-8 print:border-0 print:p-0 print:shadow-none">
        <SheetHead
          profile={profile}
          title={t('docketTitle')}
          meta={t('docketNumber', { number: work.number })}
        />

        {/* The head of the pad, field for field and in its order. Two columns
            where the pad has two, because a technician reads this by position as
            much as by label — after a few hundred of them the eye goes straight
            to the top right for the laboratory's name. */}
        <dl className="grid grid-cols-[auto_1fr_auto_1fr] items-baseline gap-x-3 gap-y-2.5 text-body">
          <Entry label={t('docketStart')} value={day(work.sentAt)} />
          <Entry label={t('lab')} value={labs.join(' · ')} />

          <Entry label={t('patientName')} value={work.patientName} span />

          <Entry
            label={tp('ageLabel')}
            value={work.patient?.dateOfBirth ? tp('age', { age: age(work.patient.dateOfBirth) }) : ''}
          />
          {/* Nothing in the register holds the shade — see the note above. */}
          <Entry label={t('docketShade')} value="" />

          <Entry label={t('labSerial')} value={work.labSerial ?? ''} />
          <Entry label={t('dueAt')} value={work.dueAt ? day(work.dueAt) : ''} />
        </dl>

        {work.urgent ? (
          <p className="mt-4 border-2 border-ink px-3 py-1.5 text-center text-body font-bold tracking-wide text-ink uppercase">
            {t('urgent')}
          </p>
        ) : null}

        {/* What is being made. The pad has one line for this and the register has
            a row per piece, so the docket prints the rows — a case that is a
            crown and a bridge should not arrive as one hand-compressed phrase. */}
        <table className="mt-6 w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-line">
              <th className="py-2 pr-3 text-caption font-bold tracking-wide text-ink-faint uppercase">
                {t('docketType')}
              </th>
              <th className="py-2 pr-3 text-caption font-bold tracking-wide text-ink-faint uppercase">
                {t('teeth')}
              </th>
              <th className="w-16 py-2 text-right text-caption font-bold tracking-wide text-ink-faint uppercase">
                {t('elementsShort')}
              </th>
            </tr>
          </thead>
          <tbody>
            {work.lines.map((line) => (
              <tr key={line.id} className="border-b border-line align-top">
                <td className="py-2.5 pr-3 text-body font-semibold text-ink">
                  {line.procedure}
                </td>
                <td className="py-2.5 pr-3 text-body text-ink-soft tabular-nums">
                  {spanCodes(line.teeth) || '—'}
                </td>
                <td className="py-2.5 text-right text-body font-bold tabular-nums">
                  {line.elements}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={2} className="py-2.5 pr-3 text-right text-body font-bold text-ink-faint uppercase">
                {t('elementsTotal')}
              </td>
              <td className="py-2.5 text-right text-lead font-bold tabular-nums">
                {totalElements}
              </td>
            </tr>
          </tfoot>
        </table>

        <div className="mt-6">
          <DocketChart
            positions={positions}
            labels={{
              right: tt('right'),
              left: tt('left'),
              upper: tt('upper'),
              lower: tt('lower'),
            }}
          />
        </div>

        {work.notes ? (
          <p className="mt-5 text-body whitespace-pre-wrap text-ink-soft">{work.notes}</p>
        ) : null}

        {/* The technician's half of the pad. Ruled and empty on purpose. */}
        <div className="mt-8 border-t-2 border-line pt-5">
          {[
            t('docketStageFrame'),
            t('docketStageDentine'),
            t('docketStageFinish'),
            t('docketStageTray'),
          ].map((stage) => (
            <div key={stage} className="mb-4 flex items-baseline gap-3 text-body">
              <span className="shrink-0 font-semibold text-ink">{stage}:</span>
              <span className="min-w-0 flex-1 border-b border-line-strong" aria-hidden />
              <span className="shrink-0 font-semibold text-ink">{t('docketTime')}:</span>
              <span className="w-24 shrink-0 border-b border-line-strong" aria-hidden />
            </div>
          ))}
        </div>
      </article>
    </div>
  );
}

/**
 * One labelled field of the pad's head.
 *
 * An empty value rules a line rather than printing nothing, because that is what
 * the field is for: `Kolori` with no rule under it reads as a field somebody
 * forgot, and `Kolori` with a rule reads as a field waiting for a pen.
 */
function Entry({
  label,
  value,
  span,
}: {
  label: string;
  value: ReactNode;
  /** Run across both columns, for a field the pad gives a whole line to. */
  span?: boolean;
}) {
  return (
    <>
      <dt className="font-bold whitespace-nowrap text-ink-faint">{label}:</dt>
      <dd className={span ? 'col-span-3 min-w-0 text-ink' : 'min-w-0 text-ink'}>
        {value ? (
          <span className="font-semibold">{value}</span>
        ) : (
          <span className="block border-b border-line-strong pt-3" aria-hidden />
        )}
      </dd>
    </>
  );
}
