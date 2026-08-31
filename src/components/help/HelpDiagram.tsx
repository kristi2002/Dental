'use client';

import { ChevronDown, ChevronRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Fragment } from 'react';
import type { HelpDiagram as DiagramKey } from '@/lib/help/topics';
import { cn } from '@/lib/utils';

/**
 * The second picture: not what the screen looks like, but how the thing it
 * manages actually *moves*.
 *
 * The wireframe answers "where do I press". This answers the question that
 * comes after it and that no amount of button-labelling ever answers on its
 * own — why a patient appears on the recall list months after a filling, why a
 * material vanishes from the order list the moment somebody counts the shelf,
 * why a reply from a patient lands in a screen they never wrote to.
 *
 * Nine of the fourteen are the same drawing with different words: a chain of
 * three to five stages, left to right on a desktop and top to bottom on a
 * phone. That is not a shortcut, it is the honest shape — most of what this
 * application does is move one record along a short queue. The other five earn
 * their own drawing because their shape is genuinely not a chain: a shelf has a
 * *level*, a mouth has a *map*, a role has a *grid*, a lot has a *date*, and a
 * working day has *gaps in it*.
 *
 * Every word comes from `help.diagrams.<key>` in the message files. A drawing
 * captioned in a language the reader does not have is a decoration.
 */

/** Diagrams that are a chain of stages, and how many stages each names. */
const FLOWS: Partial<Record<DiagramKey, number>> = {
  recall: 5,
  plan: 4,
  work: 4,
  message: 4,
  request: 4,
  prescription: 4,
  import: 4,
  scan: 4,
  followUp: 4,
  order: 4,
};

/**
 * A chain of stages.
 *
 * Down the screen on a phone and across it on a desktop, with the arrow turning
 * to match — the same content, laid out the way the space allows, rather than a
 * five-column diagram squeezed into 390px where every label breaks after two
 * letters.
 */
function Flow({ steps }: { steps: string[] }) {
  return (
    <ol className="flex flex-col gap-1.5 sm:flex-row sm:items-stretch">
      {steps.map((step, index) => (
        <Fragment key={index}>
          {index > 0 ? (
            <li
              aria-hidden
              className="flex shrink-0 items-center justify-center text-ink-faint sm:px-0.5"
            >
              <ChevronDown size={16} className="sm:hidden" />
              <ChevronRight size={16} className="hidden sm:block" />
            </li>
          ) : null}
          <li
            className={cn(
              'flex min-w-0 flex-1 items-start gap-2 rounded-lg border p-2.5 sm:flex-col sm:gap-1.5',
              // The last stage is the one that was the point of the chain, so it
              // is the one that carries the colour.
              index === steps.length - 1
                ? 'border-brand bg-brand-soft'
                : 'border-line bg-surface-soft',
            )}
          >
            <span
              aria-hidden
              className={cn(
                'grid size-5 shrink-0 place-items-center rounded-full text-micro font-bold',
                index === steps.length - 1
                  ? 'bg-brand-dark text-on-brand'
                  : 'bg-line-strong text-ink',
              )}
            >
              {index + 1}
            </span>
            <span className="min-w-0 text-caption leading-snug font-semibold text-ink">
              {step}
            </span>
          </li>
        </Fragment>
      ))}
    </ol>
  );
}

/** How full a shelf is, and where the line is that puts it on the order list. */
function StockLevels({ labels }: { labels: string[] }) {
  // Percentages, not data: three materials in the three states a shelf is ever
  // in — comfortable, at the line, and empty.
  const rows: { fill: number; tone: 'ok' | 'warn' | 'danger' }[] = [
    { fill: 78, tone: 'ok' },
    { fill: 26, tone: 'warn' },
    { fill: 0, tone: 'danger' },
  ];

  return (
    <div className="space-y-2.5">
      {rows.map((row, index) => (
        <div key={index} className="flex items-center gap-3">
          <span
            className={cn(
              'relative h-6 min-w-0 flex-1 rounded-md border border-line',
              // An empty shelf has no bar to draw, and a row with nothing in it
              // reads as a row that failed to render rather than as the point
              // being made. The track itself carries the alarm instead.
              row.fill === 0 ? 'border-danger/40 bg-danger-soft' : 'bg-surface-soft',
            )}
          >
            <span
              aria-hidden
              className={cn(
                'absolute inset-y-0 left-0 rounded-l-md',
                row.tone === 'ok' && 'bg-ok/45',
                row.tone === 'warn' && 'bg-warn/50',
                row.tone === 'danger' && 'bg-danger/40',
              )}
              style={{ width: `${row.fill}%` }}
            />
            {/* The minimum, in the same place on every row — that is the whole
                point of the drawing: one line, and which side of it you are on. */}
            <span
              aria-hidden
              className="absolute inset-y-0 left-[30%] w-0.5 -translate-x-1/2 bg-ink"
            />
          </span>
          <span className="w-1/2 shrink-0 text-caption leading-snug font-semibold text-ink sm:w-2/5">
            {labels[index]}
          </span>
        </div>
      ))}
      <p className="flex items-center gap-2 text-caption text-ink-soft">
        <span aria-hidden className="block h-4 w-0.5 shrink-0 bg-ink" />
        {labels[3]}
      </p>
    </div>
  );
}

/** How a tooth gets its number, which is the one thing a chart assumes you know. */
function ToothMap({ labels }: { labels: string[] }) {
  const quadrants = [
    { digit: '1', range: '18 – 11' },
    { digit: '2', range: '21 – 28' },
    { digit: '4', range: '48 – 41' },
    { digit: '3', range: '31 – 38' },
  ];

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-0.5 overflow-hidden rounded-lg border border-line bg-line">
        {quadrants.map((quadrant, index) => (
          <div key={quadrant.digit} className="flex items-center gap-2.5 bg-surface-soft p-2.5">
            <span
              aria-hidden
              className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-soft text-title leading-none font-bold text-brand-deep"
            >
              {quadrant.digit}
            </span>
            <span className="min-w-0">
              <span className="block text-caption leading-snug font-semibold text-ink">
                {labels[index]}
              </span>
              <span className="block text-caption tabular-nums text-ink-soft">
                {quadrant.range}
              </span>
            </span>
          </div>
        ))}
      </div>
      <p className="text-caption leading-snug text-ink-soft">{labels[4]}</p>
    </div>
  );
}

/** What a role is: four accounts, and the doors each one opens. */
function RoleGrid({ columns, note }: { columns: string[]; note: string }) {
  const tr = useTranslations('roles');
  /*
   * Copied off `ROLE_PERMISSIONS`, column by column: book an appointment, open
   * the chart, read the figures, run the practice.
   *
   * Four columns chosen because they are four the roles genuinely disagree
   * about — and note that the answers do not simply get shorter down the table.
   * A locum reads the chart and the statistics and writes nothing; the front
   * desk writes in the diary all day and never opens the chart. That crossing
   * over is the single most misunderstood thing about this model, and a table
   * that quietly smoothed it into a staircase would be teaching the wrong idea.
   */
  const rows: { role: 'OWNER' | 'ASSISTANT' | 'RECEPTIONIST' | 'READONLY'; can: boolean[] }[] = [
    { role: 'OWNER', can: [true, true, true, true] },
    { role: 'ASSISTANT', can: [true, true, false, false] },
    { role: 'RECEPTIONIST', can: [true, false, false, false] },
    { role: 'READONLY', can: [false, true, true, false] },
  ];

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[22rem] border-collapse text-caption">
          <thead>
            <tr>
              <th className="w-1/3 px-2 py-1.5 text-left font-bold text-ink-soft" />
              {columns.map((column) => (
                <th
                  key={column}
                  scope="col"
                  className="px-2 py-1.5 text-left leading-snug font-bold text-ink-soft"
                >
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ role, can }) => (
              <tr key={role} className="border-t border-line">
                <th scope="row" className="px-2 py-1.5 text-left font-bold text-ink">
                  {tr(role)}
                </th>
                {can.map((yes, index) => (
                  <td key={index} className="px-2 py-1.5">
                    <span
                      className={cn(
                        'grid size-5 place-items-center rounded-full text-micro font-bold',
                        yes ? 'bg-ok/25 text-ok' : 'bg-line text-ink-faint',
                      )}
                    >
                      <span aria-hidden>{yes ? '✓' : '–'}</span>
                    </span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-caption leading-snug text-ink-soft">{note}</p>
    </div>
  );
}

/** Lots against today, which is the only question an expiry date ever asks. */
function ExpiryLine({ labels }: { labels: string[] }) {
  const lots = [
    { at: 8, tone: 'danger' as const },
    { at: 26, tone: 'danger' as const },
    { at: 62, tone: 'warn' as const },
    { at: 86, tone: 'ok' as const },
  ];

  return (
    <div className="space-y-2">
      <div className="relative h-16">
        <span aria-hidden className="absolute inset-x-0 top-9 h-0.5 rounded bg-line-strong" />
        {/* Today, at the point the two answers divide. */}
        <span
          aria-hidden
          className="absolute top-6 bottom-0 left-[45%] w-0.5 -translate-x-1/2 bg-ink"
        />
        <span className="absolute top-0 left-[45%] -translate-x-1/2 rounded bg-ink px-1.5 py-0.5 text-micro font-bold whitespace-nowrap text-paper">
          {labels[0]}
        </span>
        {lots.map((lot, index) => (
          <span
            key={index}
            aria-hidden
            className={cn(
              'absolute top-[26px] size-4 -translate-x-1/2 rounded-full ring-2 ring-surface',
              lot.tone === 'danger' && 'bg-danger',
              lot.tone === 'warn' && 'bg-warn',
              lot.tone === 'ok' && 'bg-ok',
            )}
            style={{ left: `${lot.at}%` }}
          />
        ))}
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-caption text-ink-soft">
        {(['danger', 'warn', 'ok'] as const).map((tone, index) => (
          <li key={tone} className="flex items-center gap-1.5">
            <span
              aria-hidden
              className={cn(
                'block size-3 shrink-0 rounded-full',
                tone === 'danger' && 'bg-danger',
                tone === 'warn' && 'bg-warn',
                tone === 'ok' && 'bg-ok',
              )}
            />
            {labels[index + 1]}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** A working day: the hours the door is open, what is in them, and what is not. */
function DayBar({ labels }: { labels: string[] }) {
  // One day, as thirds of a bar: booked, break, booked, gap, booked.
  const blocks = [
    { width: 22, kind: 'booked' as const },
    { width: 10, kind: 'closed' as const },
    { width: 26, kind: 'booked' as const },
    { width: 18, kind: 'free' as const },
    { width: 24, kind: 'booked' as const },
  ];

  return (
    <div className="space-y-2">
      <div className="flex h-9 overflow-hidden rounded-lg border border-line">
        {blocks.map((block, index) => (
          <span
            key={index}
            aria-hidden
            className={cn(
              'block h-full',
              block.kind === 'booked' && 'bg-brand/40',
              block.kind === 'closed' && 'bg-line-strong',
              block.kind === 'free' && 'border-x border-dashed border-brand/70 bg-brand-soft',
            )}
            style={{ width: `${block.width}%` }}
          />
        ))}
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-caption text-ink-soft">
        {(['booked', 'closed', 'free'] as const).map((kind, index) => (
          <li key={kind} className="flex items-center gap-1.5">
            <span
              aria-hidden
              className={cn(
                'block size-3 shrink-0 rounded-sm',
                kind === 'booked' && 'bg-brand/40',
                kind === 'closed' && 'bg-line-strong',
                kind === 'free' && 'border border-dashed border-brand/70 bg-brand-soft',
              )}
            />
            {labels[index]}
          </li>
        ))}
      </ul>
      <p className="text-caption leading-snug text-ink-soft">{labels[3]}</p>
    </div>
  );
}

export function HelpDiagram({ diagram }: { diagram: DiagramKey }) {
  const t = useTranslations('help');
  const labels = t.raw(`diagrams.${diagram}.labels`) as string[];
  const title = t(`diagrams.${diagram}.title`);

  const stages = FLOWS[diagram];

  return (
    <figure className="rounded-[var(--radius-card)] border border-line bg-surface p-4">
      <figcaption className="mb-3 text-caption font-bold tracking-wide text-ink-faint uppercase">
        {title}
      </figcaption>
      {stages ? (
        <Flow steps={labels.slice(0, stages)} />
      ) : diagram === 'stock' ? (
        <StockLevels labels={labels} />
      ) : diagram === 'teeth' ? (
        <ToothMap labels={labels} />
      ) : diagram === 'roles' ? (
        <RoleGrid columns={labels.slice(0, 4)} note={labels[4]} />
      ) : diagram === 'expiry' ? (
        <ExpiryLine labels={labels} />
      ) : (
        <DayBar labels={labels} />
      )}
    </figure>
  );
}
