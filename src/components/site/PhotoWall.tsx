'use client';

import { Expand } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { CSSProperties, KeyboardEvent } from 'react';
import { useRef, useState } from 'react';
import { Lightbox } from '@/components/site/Lightbox';
import { PhotoMark } from '@/components/site/PhotoMark';
import { GALLERY, GALLERY_GROUPS, type GalleryGroup } from '@/components/site/photos';
import { cn } from '@/lib/utils';

/**
 * The same nine photographs the front page shows as a reel, laid out as a wall
 * you can sort.
 *
 * A carousel and a wall answer different questions and it is worth being clear
 * which is which. The reel on the front page says *this is a real place* to
 * somebody who is scrolling past on their way to the telephone number; it is
 * glanceable, it moves, and nobody is expected to reach slide nine. This page is
 * for the reader who stopped — who wants to see the rooms, or wants to know what
 * the equipment looks like before they sit in front of it — and for them a reel
 * is a bad deal: nine things behind an arrow they have to press eight times.
 *
 * So: everything at once, in a mosaic, with three filters over it. The filters
 * are the feature. "Rooms", "people", "care" is where these nine actually fall —
 * see `GALLERY_GROUPS` — and a reader nervous about the chair can look at the
 * rooms without a stranger's smile in the middle of them, which is a genuinely
 * different experience of the same set of files.
 *
 * **Tabs, because that is what this is.** One of a set, one panel, always
 * exactly one chosen — `role="tablist"` with roving focus and arrow keys, the
 * same pattern and the same reasoning as `ConcernPicker`. The cheaper build is
 * four `aria-pressed` buttons, which looks identical and describes four
 * independent toggles, which is a lie about how it behaves.
 *
 * **The whole set is server-rendered under "all".** The default choice is made
 * here rather than in an effect, so the HTML that ships contains nine
 * photographs rather than an empty grid that fills in on hydration — the rule the
 * rest of this site follows and the reason its content survives a failed script.
 *
 * **The grid is remounted on every change**, by keying the list on the filter.
 * That is what replays the stagger: an element that has just been inserted runs
 * its entry animation, and without the key React would reuse the tiles it can
 * and only the newcomers would move. It costs nine `<img>` elements being
 * recreated, and every file is already in the browser's cache by then.
 */
export function PhotoWall() {
  const t = useTranslations('site');
  const [filter, setFilter] = useState<GalleryGroup | 'all'>('all');
  const [open, setOpen] = useState<number | null>(null);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);

  const choices = ['all', ...GALLERY_GROUPS] as const;
  const shown = filter === 'all' ? GALLERY : GALLERY.filter((photo) => photo.group === filter);

  /**
   * Arrow keys move between tabs and move focus with them, wrapping at both
   * ends; Home and End jump to the ends. The half of the tab pattern that is
   * invisible until somebody without a mouse arrives — and the half most
   * hand-rolled tablists leave out, at which point the roving `tabIndex` below
   * has made the other three unreachable rather than merely awkward.
   */
  function onKeyDown(event: KeyboardEvent, index: number) {
    const last = choices.length - 1;
    const next =
      event.key === 'ArrowRight' || event.key === 'ArrowDown'
        ? index === last
          ? 0
          : index + 1
        : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
          ? index === 0
            ? last
            : index - 1
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? last
              : null;

    if (next === null) return;
    event.preventDefault();
    setFilter(choices[next]);
    tabs.current[next]?.focus();
  }

  return (
    <section id="wall" className="scroll-mt-20 bg-bone px-5 py-16 sm:px-8 sm:py-20">
      <div className="mx-auto w-full max-w-6xl">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div
            role="tablist"
            aria-label={t('pages.place.filterLabel')}
            // Scrolls sideways on a phone rather than wrapping to two lines —
            // the same call the concern picker's row makes.
            className="-mr-5 flex gap-2 overflow-x-auto pr-5 pb-1 [scrollbar-width:none] sm:mr-0 sm:pr-0"
          >
            {choices.map((choice, index) => {
              const active = choice === filter;
              return (
                <button
                  key={choice}
                  ref={(node) => {
                    tabs.current[index] = node;
                  }}
                  type="button"
                  role="tab"
                  id={`wall-tab-${choice}`}
                  aria-selected={active}
                  aria-controls="wall-panel"
                  // Roving: one stop for the whole set, so Tab leaves the group
                  // rather than walking through all four.
                  tabIndex={active ? 0 : -1}
                  onClick={() => setFilter(choice)}
                  onKeyDown={(event) => onKeyDown(event, index)}
                  className={cn(
                    'inline-flex min-h-11 shrink-0 items-center rounded-full border px-4 text-[0.92rem] font-semibold whitespace-nowrap transition-colors',
                    active
                      ? 'border-gilt-deep bg-gilt text-navy'
                      : 'border-bone-deep bg-bone-soft text-bone-ink-soft hover:border-gilt hover:text-bone-ink',
                  )}
                >
                  {t(`pages.place.filters.${choice}`)}
                </button>
              );
            })}
          </div>

          {/* How many are on screen. `aria-live` because the grid changes under
              a reader who cannot see it change, and "3 photographs" is the whole
              of what happened. */}
          <p aria-live="polite" className="text-[0.92rem] text-bone-ink-faint tabular-nums">
            {t('pages.place.count', { count: shown.length })}
          </p>
        </div>

        <ul
          id="wall-panel"
          role="tabpanel"
          aria-labelledby={`wall-tab-${filter}`}
          // Remounted on every change so the stagger replays. See the note above.
          key={filter}
          // Fixed row height plus `grid-flow-dense`, which is what makes a mosaic
          // out of a grid: the two wide tiles take two cells across and two down,
          // and dense packing back-fills the holes they leave rather than
          // stranding a gap at the end of each row.
          className="mt-9 grid auto-rows-[9.5rem] grid-flow-dense grid-cols-2 gap-3 sm:auto-rows-[11rem] sm:grid-cols-3 lg:grid-cols-4 lg:gap-4"
        >
          {shown.map((photo, index) => (
            <li
              key={photo.key}
              className={cn(
                'tile-in min-w-0',
                photo.wide && 'sm:col-span-2 sm:row-span-2',
              )}
              style={{ '--i': `${index}` } as CSSProperties}
            >
              <button
                type="button"
                onClick={() => setOpen(index)}
                aria-label={t('gallery.openImage', { name: t(`gallery.alt.${photo.key}`) })}
                className="group relative block size-full overflow-hidden rounded-xl bg-navy focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gilt-deep"
              >
                {/* eslint-disable-next-line next/no-img-element, @next/next/no-img-element */}
                <img
                  src={photo.src}
                  width={photo.width}
                  height={photo.height}
                  alt={t(`gallery.alt.${photo.key}`)}
                  loading="lazy"
                  decoding="async"
                  sizes="(min-width: 1024px) 320px, 45vw"
                  className="size-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.06] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
                />

                <PhotoMark />

                <span
                  aria-hidden
                  className="absolute inset-0 grid place-items-center bg-navy/35 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
                >
                  <Expand size={24} className="text-white" />
                </span>
              </button>
            </li>
          ))}
        </ul>

        {/* The same note the practice section carries, for the same reason:
            these are not photographs of this surgery, and the page says so where
            they appear rather than in a footer nobody reads. */}
        <p className="mt-8 text-[0.88rem] text-bone-ink-faint">{t('how.illustrative')}</p>
      </div>

      {/* The arrows step through what is on screen rather than through all nine
          — filtering to "rooms" and then finding a stranger's portrait behind
          the next arrow would undo the whole point of the filter. */}
      {open !== null ? (
        <Lightbox photos={shown} index={open} onClose={() => setOpen(null)} />
      ) : null}
    </section>
  );
}
