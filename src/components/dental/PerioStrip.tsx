import {
  MOBILITY_LABEL,
  perioLayout,
  pocketBand,
  type PerioSummary,
  type PocketBand,
} from '@/lib/perio';
import { cn } from '@/lib/utils';

/**
 * One tooth's periodontal readings, under the tooth they belong to: six probe
 * depths in two rows of three, and the mobility grade when there is one.
 *
 * It is a grid of numbers rather than a drawing on purpose. Depths *are*
 * numbers — a dentist calls them out and a nurse writes them down, and the
 * comparison that matters is "this corner is 7 where the rest is 3", which the
 * digits answer instantly and a bar chart only approximates. The colour is a
 * second channel over the top, not the reading itself: green up to 3mm, amber
 * through the range that gets cleaned and watched, red from 6mm where surgery
 * starts being the conversation.
 *
 * The rows are laid out the way the mouth is, not the way the column is stored:
 * the cheek side is the row furthest from the bite, and the mesial end of each
 * row is the end nearest the midline. `perioLayout` holds that reasoning, the
 * same way `surfaceAt` holds it for the surface wheel — a chart that puts the
 * distobuccal reading where the mesiobuccal one goes is worse than no chart.
 *
 * A site that bled is underlined as well as coloured. Bleeding is what turns a
 * 4mm measurement into a diagnosis, and it is not something to encode as a
 * shade of the same colour that already means depth.
 */

const BAND_STYLE: Record<PocketBand, string> = {
  UNPROBED: 'text-ink-faint/50',
  HEALTHY: 'text-ok',
  WATCH: 'bg-warn-soft text-warn',
  DISEASED: 'bg-danger-soft text-danger',
};

/** An unprobed site reads as a placeholder rather than a blank, so six boxes
 *  always look like six boxes and a missed reading is visibly missed. */
const UNPROBED_MARK = '·';

function SiteRow({
  sites,
  summary,
}: {
  sites: number[];
  summary: PerioSummary;
}) {
  // Spans throughout rather than divs: the strip is rendered inside the button
  // that opens the tooth, and a button may only contain phrasing content.
  return (
    <span className="flex justify-center gap-px">
      {sites.map((site) => {
        const depth = summary.depths[site];
        const bled = summary.bleeding[site] === true;
        return (
          <span
            key={site}
            className={cn(
              'w-[var(--perio-site,0.95rem)] rounded-[3px] text-center text-[0.68rem] leading-[1.15rem] font-bold tabular-nums',
              BAND_STYLE[pocketBand(depth)],
              // A bled site carries its own mark as well as its colour, so the
              // finding survives a greyscale printout and colour-blind eyes.
              bled && 'underline decoration-danger decoration-2 underline-offset-[2px]',
            )}
          >
            {depth ?? UNPROBED_MARK}
          </span>
        );
      })}
    </span>
  );
}

export function PerioStrip({
  toothNum,
  summary,
  showMobility = true,
  className,
}: {
  toothNum: number;
  summary: PerioSummary;
  /**
   * Whether the mobility badge rides along under the depths.
   *
   * On the arch it always does, and always takes its space whether or not there
   * is a grade to show — see the note below. The printed record's findings table
   * gives mobility a column of its own, spelled out in words, and a second copy
   * of it three millimetres to the left is the same reading said twice.
   */
  showMobility?: boolean;
  className?: string;
}) {
  const { buccal, lingual, buccalFirst } = perioLayout(toothNum);
  const rows = buccalFirst ? [buccal, lingual] : [lingual, buccal];

  return (
    <span className={cn('flex flex-col items-center gap-px', className)}>
      {rows.map((sites) => (
        <SiteRow key={sites[0]} sites={sites} summary={summary} />
      ))}

      {/* The mobility line is always here and usually empty. Grade 0 is the
          answer for most of the mouth and printing it under every tooth would
          bury the two that matter — but a badge that appears only sometimes
          makes those teeth taller than their neighbours, and the row of tooth
          numbers underneath then stops being a straight line. The space is
          reserved instead, so every cell on the arch is the same height. */}
      {showMobility ? (
        <span
          className={cn(
            'mt-px rounded-[3px] px-1 text-[0.62rem] leading-[0.95rem] font-bold',
            summary.mobility !== null && summary.mobility > 0
              ? summary.mobility >= 2
                ? 'bg-danger-soft text-danger'
                : 'bg-warn-soft text-warn'
              : 'text-transparent',
          )}
        >
          {summary.mobility !== null && summary.mobility > 0
            ? `M${MOBILITY_LABEL[summary.mobility]}`
            : ' '}
        </span>
      ) : null}
    </span>
  );
}
