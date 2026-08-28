'use client';

import { ArrowRight, CalendarCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import { TREATMENT_PHOTOS } from '@/components/site/photos';
import { Reveal } from '@/components/site/Reveal';
import { SectionEyebrow } from '@/components/site/SectionEyebrow';
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
 *
 * --- The layout, and why it stopped being a row of chips ------------------
 *
 * This was a horizontal row of six pills over a wide card, and it failed in
 * three separate ways that all had the same cause: the row was sized by the
 * words in it and the card was not sized by anything.
 *
 * **The row only fit in two of the three languages.** Measured: the six pills
 * come to 1182px in English and 1178px in Italian against this page's 1224px
 * measure — forty pixels of headroom, which is not a margin, it is a coincidence
 * — and 1421px in Albanian, which wrapped to two lines. So the section was one
 * shape for two locales and another for the third, decided by how long "Më dalin
 * gjak mishrat e dhëmbëve" happens to be. A layout that is a translator's
 * casting-off away from reflowing is not a layout.
 *
 * **The card was mostly empty.** Three of the six concerns name one treatment,
 * not two, and on those the panel was a 48-character paragraph on the left and a
 * single photograph on the right with seven hundred pixels of nothing between
 * them. Adding the photographs was the previous attempt at this and it only
 * moved the hole.
 *
 * **And below `lg` there were no photographs at all** — the panel was a bare
 * paragraph and two buttons, on the widths most of these readers are actually
 * holding.
 *
 * So the six choices are a **column** beside the answer rather than a bar above
 * it. A column is set by its own width instead of by the longest label, which
 * makes the section identical in all three languages; it leaves the panel a
 * shape it can fill; and it reads as what it is, an index of six ways in, rather
 * than as a filter bar borrowed from an application. Under `lg` it is still the
 * sideways-scrolling row of pills it always was — six full-width rows stacked on
 * a phone would be a screen of furniture before the reader reaches a single
 * word of the answer.
 *
 * **The photographs are flush to the panel's edge**, no padding and no gap, one
 * or two of them filling whichever the concern names. That is the same device
 * `Practice` uses for the portrait, and it is what makes one treatment and two
 * treatments both look deliberate: with the images fitted to the space rather
 * than fixed at `w-40`, the count changes what is in the frame and never how
 * much of the panel is used.
 *
 * **The two halves move at different breakpoints, which is deliberate.** The
 * rail turns vertical at `lg`; the panel only splits into text-and-column at
 * `xl`. Between the two — 1024 to 1279, which is most of the laptops that reach
 * this page — the rail has already taken 17rem off the left, and splitting what
 * is left again puts the paragraph on a 26-character measure. So at those widths
 * the photographs are a band across the top of the panel instead, and the
 * paragraph keeps the whole width under it. One breakpoint for both would have
 * meant choosing between a rail that arrives too late and a column that is too
 * narrow when it does.
 *
 * Which way the two photographs sit follows from the same thing: side by side
 * while they are a band, stacked once they are a column, because two portraits
 * cut out of a 4:3 photograph in a 10rem-wide slot are two slivers of the middle
 * third of the picture.
 *
 * **No numbers down the rail.** The obvious ornament here is `01`–`06`, which
 * `StepSpine` and `StepChain` both use — and both of those are describing
 * something that happens *in that order*. Six reasons for coming in are not a
 * sequence, and numbering them would tell the reader that a missing tooth is the
 * first of something.
 *
 * **The bronze is spent once.** The selected chip used to be `bg-gilt text-navy`
 * — which is character for character the "Ask about this" button sitting a few
 * inches below it, so the section showed the reader two identical bronze pills
 * and left them to work out which of the two did anything. Selection is navy
 * now, the page's other structural colour, and the one bronze fill in the
 * section is the one control it exists to get pressed. The argument is written
 * out under `.segmented` in `globals.css`; this is the storefront's copy of the
 * same mistake.
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
   *
   * Both axes are accepted, and that is not laziness: this set is a row under
   * `lg` and a column above it, so there is no single answer to which pair of
   * arrows is the right one. It is for the same reason that no
   * `aria-orientation` is declared — a value baked into the markup would be
   * wrong at one width or the other, and the attribute's only real job is to say
   * which keys work. Here both pairs do.
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
      className="relative scroll-mt-20 overflow-clip px-5 py-16 sm:px-8 sm:py-20"
    >
      <div className="relative mx-auto w-full max-w-6xl">
        <Reveal>
          <SectionEyebrow className="text-gilt-deep">{t('concerns.eyebrow')}</SectionEyebrow>
          <h2 className="type-section mt-5 max-w-[18ch] text-bone-ink">{t('concerns.title')}</h2>
          <p className="mt-4 max-w-[46ch] text-[1.02rem] text-pretty text-bone-ink-soft">
            {t('concerns.hint')}
          </p>
        </Reveal>

        <Reveal
          step={1}
          className="mt-10 grid items-start gap-6 lg:grid-cols-[minmax(0,17rem)_minmax(0,1fr)] lg:gap-8 xl:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]"
        >
          {/* A column above `lg`, and still a sideways-scrolling row below it —
              the same call the hero's chips make, and for the same reason: six
              pills wrapped at 390px is a block of furniture where a row of them
              running off the edge says there is more. */}
          <div
            role="tablist"
            aria-label={t('concerns.title')}
            className="-mr-5 flex gap-2 overflow-x-auto pr-5 pb-1 [scrollbar-width:none] sm:mr-0 sm:pr-0 lg:mr-0 lg:flex-col lg:gap-1 lg:overflow-visible lg:pb-0"
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
                    'inline-flex min-h-11 shrink-0 items-center gap-3 rounded-full border px-4',
                    'text-[0.92rem] font-semibold whitespace-nowrap transition-colors',
                    'lg:min-h-13 lg:w-full lg:shrink lg:rounded-xl lg:px-4 lg:text-left lg:whitespace-normal',
                    active
                      ? 'border-navy bg-navy text-bone lg:shadow-lift'
                      : 'border-bone-deep bg-bone text-bone-ink-soft hover:border-gilt hover:text-bone-ink lg:border-transparent lg:bg-transparent lg:hover:bg-bone-soft',
                  )}
                >
                  {/* The marker, and it is drawn on every row rather than only on
                      the chosen one — twice for the price of once.

                      Reserving the gutter is what stops the label shoving
                      sideways as the selection moves, which is the usual way this
                      mark is done and the usual reason it twitches. Drawing a
                      hairline in the unchosen ones costs nothing further and buys
                      the thing the column actually needed: six rows of plain
                      sentences with no boxes look like a paragraph somebody
                      forgot to style, and a rule down the left says they are a
                      list of choices before anything is hovered.

                      The rule is the eyebrow's own — the page's standing rule is
                      that the fix for a flourish you want twice is to reuse it,
                      not to draw a second one slightly differently and finish
                      with two that disagree. */}
                  <span
                    aria-hidden
                    className={cn(
                      'hidden h-px w-5 shrink-0 transition-colors lg:block',
                      active ? 'bg-gilt' : 'bg-bone-deep',
                    )}
                  />
                  {t(`concerns.${entry.key}.label`)}
                </button>
              );
            })}
          </div>

          {/* One panel for all six tabs, relabelled as the selection changes.
              `aria-labelledby` pointing at the chosen tab is what tells a screen
              reader which of the six it is now reading.

              `min-h` above `lg` so that switching concerns does not move the rest
              of the page: the six bodies are four to six lines long, and without
              a floor the panel grew and shrank under the reader's cursor as they
              worked along the rail. */}
          <div
            id="concern-panel"
            role="tabpanel"
            aria-labelledby={`concern-tab-${concern.key}`}
            // Focusable, because the panel is not itself a set of controls and a
            // keyboard user arriving from the tabs has to be able to reach the
            // text. The pattern's own recommendation for exactly this case.
            tabIndex={0}
            className="grid overflow-clip rounded-2xl border border-bone-deep bg-bone-soft shadow-lift xl:min-h-[23rem] xl:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]"
          >
            {/*
             * The treatments this concern usually means, as the photographs the
             * grid further down already uses.
             *
             * **Flush to the panel, not floating inside it.** They were two
             * fixed `w-40` tiles sitting in the padding, which is why a concern
             * naming one treatment left a lake of empty panel beside it. Fitted
             * to a column instead, one photograph and two photographs both fill
             * the same space and the count changes only what is in the frame.
             *
             * **Above the text on a phone**, which is what `order` is doing: the
             * DOM keeps the pictures first so the two columns read left-to-right
             * on a desktop without any reordering, and below `lg` that same order
             * puts the photograph at the top of the panel where it introduces the
             * paragraph rather than trailing after the buttons.
             *
             * `gap-px` over `bg-bone-deep` is the hairline between two of them —
             * the page's own rule rather than a border, so it cannot double up
             * against the panel's edge.
             *
             * `aria-hidden`, because the names are already written in the
             * sentence above under "usually" — announcing them twice would
             * describe the same two facts to a screen reader in a row. Hidden
             * from the tree, the pictures are decoration for the text beside
             * them, which is what they are.
             */}
            <ul
              aria-hidden
              className={cn(
                'grid aspect-16/10 gap-px bg-bone-deep sm:aspect-[5/2] lg:aspect-[3/1] xl:order-2 xl:aspect-auto xl:h-full',
                concern.treatments.length > 1 ? 'grid-cols-2 xl:grid-cols-1' : 'grid-cols-1',
              )}
            >
              {concern.treatments.map((key) => {
                const photo = TREATMENT_PHOTOS[key];
                return (
                  <li key={key} className="relative overflow-hidden bg-navy">
                    {/* eslint-disable-next-line next/no-img-element, @next/next/no-img-element */}
                    <img
                      src={photo.src}
                      width={photo.width}
                      height={photo.height}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className="absolute inset-0 h-full w-full object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-navy from-8% via-navy/55 via-45% to-transparent to-80%" />
                    <p className="absolute inset-x-0 bottom-0 p-4 text-[0.86rem] font-bold text-white">
                      {t(`topics.${key}`)}
                    </p>
                  </li>
                );
              })}
            </ul>

            <div className="flex flex-col p-6 sm:p-8 xl:order-1">
              {/* `text-pretty`, not `text-balance`. Balancing is for a heading of
                  two or three lines; on a five-line paragraph the browser stops
                  applying it altogether above its line cap, and where it does
                  apply it narrows the measure for no gain. */}
              <p className="max-w-[52ch] text-[1.06rem] leading-relaxed text-pretty text-bone-ink">
                {t(`concerns.${concern.key}.body`)}
              </p>

              <p className="mt-5 text-[0.95rem] text-bone-ink-soft">
                <span className="font-semibold text-bone-ink">{t('concerns.usually')}</span>{' '}
                {/* Rendered from the treatment names the rest of the page already
                  uses, so a concern can never name a treatment this practice has
                  stopped listing. */}
                {concern.treatments.map((key) => t(`topics.${key}`)).join(' · ')}
              </p>

              {/* `mt-auto` rather than a fixed margin: the panel has a floor to
                  stop it resizing between concerns, and without this the buttons
                  would sit wherever the shortest paragraph left them and move up
                  and down the panel as the reader worked along the rail. Pinned
                  to the bottom they are in the same place for all six. */}
              <div className="mt-7 flex flex-wrap gap-3 xl:mt-auto xl:pt-7">
                {/* The booking page rather than a fragment further down this
                    document. It was `#request` while the form was at the foot of
                    the front page; it is a route now, and the topic ticked here
                    travels with the reader through `TopicChoice` — a context on
                    the storefront layout, which sits above both routes and so
                    survives the navigation.

                    `cta-fill` because this is a primary action and every other
                    one on the site has had the navy rising into it since that was
                    written; this was the single bronze pill still hovering by
                    lifting half a step. See `.cta-fill` in `globals.css` for why
                    the two colours are utilities here rather than declarations
                    there. */}
                <Link
                  href="/book"
                  onClick={() => setTopic(concern.topic)}
                  className="cta-fill group inline-flex min-h-13 items-center gap-2.5 rounded-full bg-gilt px-7 text-[0.98rem] font-bold text-navy no-underline hover:text-bone focus-visible:text-bone"
                >
                  <CalendarCheck size={18} aria-hidden />
                  {t('concerns.ask')}
                </Link>

                {/* The treatments page rather than the front page's grid. This
                    was `#treatments` while there was only one document to be
                    further down; the page it points at now answers the question
                    the grid could only label. */}
                <Link
                  href="/treatments"
                  className="group inline-flex min-h-13 items-center gap-2 rounded-full border border-bone-deep px-6 text-[0.98rem] font-semibold text-bone-ink no-underline transition-colors hover:border-gilt hover:bg-gilt-soft"
                >
                  {t('concerns.see')}
                  <ArrowRight
                    size={17}
                    aria-hidden
                    className="transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none motion-reduce:group-hover:translate-x-0"
                  />
                </Link>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
