'use client';

import { ArrowRight, CalendarCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import { TREATMENT_PHOTOS } from '@/components/site/photos';
import { useTopicChoice } from '@/components/site/TopicChoice';
import { Link } from '@/i18n/navigation';
import { CONCERNS, type ConcernKey } from '@/lib/site-content';
import { cn } from '@/lib/utils';

/**
 * "What brings you in?" — six sentences, and the treatment behind each.
 *
 * **Tabs, because that is what this is.** One of a set, one panel, always
 * exactly one chosen — `role="tablist"` with roving focus and arrow keys, which
 * is the pattern a keyboard and a screen reader already know. The tempting
 * cheaper version is six `aria-expanded` buttons over a shared panel, which
 * describes six independent disclosures and is a lie about how it behaves.
 *
 * **Sentences rather than a dental chart, and this page has now reached that
 * conclusion three times.** A clickable odontogram was built for this section
 * and taken out again: legible, operable, and it still read as clip-art beside
 * real photography. `Treatments.tsx` dropped the app's own tooth chart from the
 * public page and `HeroStage` rejected the cutaway molar, both for the related
 * reason that a drawing of teeth is the wrong thing to put in front of somebody
 * nervous about the chair. A chart also asks a worried person to point at what
 * is wrong with them before they have spoken to anybody; "a tooth is missing"
 * needs no anatomy and lands them on the same treatment.
 *
 * **The first concern is selected on the server.** So the panel is real content
 * in the HTML rather than an empty box that fills in on hydration — the same
 * rule the scroll reveals follow, and for the same reason: a clinic's page has
 * to say something on a bad connection.
 *
 * Choosing a concern also sets the request form's topic, four sections down. See
 * `TopicChoice` for why that goes through a context.
 */
export function ConcernPicker() {
  const t = useTranslations('site');
  const { setTopic } = useTopicChoice();
  const [chosen, setChosen] = useState<ConcernKey>(CONCERNS[0].key);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);

  const concern = CONCERNS.find((entry) => entry.key === chosen) ?? CONCERNS[0];

  /**
   * Arrow keys move between tabs and move focus with them, wrapping at both
   * ends; Home and End jump to the ends. This is the half of the tab pattern
   * that is invisible until somebody without a mouse arrives, and the half most
   * hand-rolled tablists leave out — at which point the roving `tabIndex` below
   * has made the other five unreachable rather than merely awkward.
   */
  function onKeyDown(event: React.KeyboardEvent, index: number) {
    const last = CONCERNS.length - 1;
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
    setChosen(CONCERNS[next].key);
    tabs.current[next]?.focus();
  }

  return (
    <section
      id="concerns"
      className="relative scroll-mt-20 overflow-clip bg-bone-soft px-5 py-16 sm:px-8 sm:py-20"
    >
      <div className="relative mx-auto w-full max-w-6xl">
        <h2 className="type-section max-w-[18ch] text-bone-ink">{t('concerns.title')}</h2>
        <p className="mt-4 max-w-[46ch] text-[1.02rem] text-bone-ink-soft">
          {t('concerns.hint')}
        </p>

        {/* Scrolls sideways on a phone rather than wrapping to three lines —
            the same call the hero's chips make, and for the same reason: six
            pills wrapped at 390px is a block of furniture where a row of them
            running off the edge says there is more. */}
        <div
          role="tablist"
          aria-label={t('concerns.title')}
          className="mt-9 -mr-5 flex gap-2 overflow-x-auto pr-5 pb-1 [scrollbar-width:none] sm:mr-0 sm:flex-wrap sm:pr-0"
        >
          {CONCERNS.map((entry, index) => {
            const active = entry.key === chosen;
            return (
              <button
                key={entry.key}
                ref={(node) => {
                  tabs.current[index] = node;
                }}
                type="button"
                role="tab"
                id={`concern-tab-${entry.key}`}
                aria-selected={active}
                aria-controls="concern-panel"
                // Roving: one stop for the whole set, so Tab leaves the group
                // rather than walking through all six of them.
                tabIndex={active ? 0 : -1}
                onClick={() => setChosen(entry.key)}
                onKeyDown={(event) => onKeyDown(event, index)}
                className={cn(
                  'inline-flex min-h-11 shrink-0 items-center rounded-full border px-4 text-[0.92rem] font-semibold whitespace-nowrap transition-colors',
                  active
                    ? 'border-gilt-deep bg-gilt text-navy'
                    : 'border-bone-deep bg-bone text-bone-ink-soft hover:border-gilt hover:text-bone-ink',
                )}
              >
                {t(`concerns.${entry.key}.label`)}
              </button>
            );
          })}
        </div>

        {/* One panel for all six tabs, relabelled as the selection changes.
            `aria-labelledby` pointing at the chosen tab is what tells a screen
            reader which of the six it is now reading. */}
        <div
          id="concern-panel"
          role="tabpanel"
          aria-labelledby={`concern-tab-${concern.key}`}
          // Focusable, because the panel is not itself a set of controls and a
          // keyboard user arriving from the tabs has to be able to reach the
          // text. The pattern's own recommendation for exactly this case.
          tabIndex={0}
          className="card mt-6 grid gap-8 p-6 sm:p-8 lg:grid-cols-[1fr_auto] lg:items-start lg:gap-12"
        >
          <div>
            <p className="max-w-[52ch] text-[1.06rem] leading-relaxed text-balance text-bone-ink">
              {t(`concerns.${concern.key}.body`)}
            </p>

            <p className="mt-5 text-[0.95rem] text-bone-ink-soft">
              <span className="font-semibold text-bone-ink">{t('concerns.usually')}</span>{' '}
              {/* Rendered from the treatment names the rest of the page already
                uses, so a concern can never name a treatment this practice has
                stopped listing. */}
              {concern.treatments.map((key) => t(`topics.${key}`)).join(' · ')}
            </p>

            <div className="mt-7 flex flex-wrap gap-3">
              <a
                href="#request"
                onClick={() => setTopic(concern.topic)}
                className="group inline-flex min-h-12 items-center gap-2.5 rounded-full bg-gilt px-6 text-[0.98rem] font-bold text-navy no-underline transition-transform hover:-translate-y-0.5 motion-reduce:hover:translate-y-0"
              >
                <CalendarCheck size={18} aria-hidden />
                {t('concerns.ask')}
              </a>

              {/* The treatments page rather than the front page's grid. This
                  was `#treatments` while there was only one document to be
                  further down; the page it points at now answers the question
                  the grid could only label. */}
              <Link
                href="/treatments"
                className="inline-flex min-h-12 items-center gap-2 rounded-full border border-bone-deep px-5 text-[0.98rem] font-semibold text-bone-ink no-underline transition-colors hover:border-gilt hover:bg-gilt-soft"
              >
                {t('concerns.see')}
                <ArrowRight size={17} aria-hidden />
              </Link>
            </div>
          </div>

          {/*
           * The treatments this concern usually means, as the photographs the
           * grid further down already uses.
           *
           * The panel was a paragraph of text stopping at 58 characters with the
           * right half of a very wide card left empty, which is most of why this
           * section read as unfinished — a box with air in it is not restraint,
           * it is a layout that ran out. Showing the one or two treatments the
           * answer points at fills it with the thing the sentence is about, and
           * it means the reader sees the treatment before they have decided
           * whether to press anything.
           *
           * `aria-hidden`, because the names are already written in the sentence
           * above under "usually" — announcing them twice would describe the same
           * two facts to a screen reader in a row. Hidden from the tree, the
           * pictures are decoration for the text beside them, which is what they
           * are.
           */}
          <ul aria-hidden className="hidden shrink-0 gap-4 lg:flex">
            {concern.treatments.map((key) => {
              const photo = TREATMENT_PHOTOS[key];
              return (
                <li key={key} className="relative w-40 overflow-hidden rounded-xl bg-navy xl:w-48">
                  {/* eslint-disable-next-line next/no-img-element, @next/next/no-img-element */}
                  <img
                    src={photo.src}
                    width={photo.width}
                    height={photo.height}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="aspect-3/4 w-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-navy from-8% via-navy/55 via-45% to-transparent to-80%" />
                  <p className="absolute inset-x-0 bottom-0 p-3 text-[0.86rem] font-bold text-white">
                    {t(`topics.${key}`)}
                  </p>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </section>
  );
}
