import { getTranslations } from 'next-intl/server';
import type { SitePhoto } from '@/components/site/photos';
import { Reveal } from '@/components/site/Reveal';
import { TREATMENT_STEPS, type TreatmentKey } from '@/lib/site-content';
import { cn } from '@/lib/utils';

/**
 * The same three steps, told down a spine instead of across a row.
 *
 * `StepChain` is the shape of an appointment: three things that happen one after
 * another and are over by the evening. This is the shape of a course of
 * treatment — impressions in March, a fitting in May — and the difference is
 * worth drawing rather than describing, because it is the whole of what a reader
 * flying in needs to understand before they book anything.
 *
 * A horizontal row says *and then, and then*. A vertical rail with the work
 * hanging off alternate sides of it says *and then, months later* — the eye has
 * to travel to reach the next node, and the travelling is the point. Which
 * treatments get this is decided in `TREATMENT_MOVEMENT`, from their own
 * timings, and the note there carries the argument.
 *
 * **On navy, and with the photographs at full strength.** The chain's cards wash
 * their picture back under cream because the subject there is a paragraph; here
 * the subject is genuinely the photograph — the scan, the bench, the finished
 * work — and it gets the treatment every other picture-card on this site gets: a
 * gradient poured up from the bottom and the type sitting in it. Two card
 * treatments across two page shapes, so a reader who follows one treatment to
 * the next is not reading the same page twice.
 *
 * The rail draws itself downward as the section arrives — see `.spine-draw`,
 * which is the vertical counterpart of the swash's dashed stroke and exists
 * because the height of three cards of unknown copy is not a number a path can
 * be given in advance.
 *
 * **Below `lg` it is the same rail on the left** that `StepChain` falls back to,
 * and deliberately so: the two page shapes differ where there is width to differ
 * in, and converge on a phone, where there is one column and any attempt at a
 * second is a column of forty-character lines.
 */
export async function StepSpine({
  treatmentKey,
  photos,
}: {
  treatmentKey: TreatmentKey;
  /** One picture per step, in step order — `TREATMENT_GALLERY[key].steps`. */
  photos: readonly [SitePhoto, SitePhoto, SitePhoto];
}) {
  const t = await getTranslations('site');

  return (
    <ol className="relative mt-14 grid gap-12 pl-14 sm:pl-16 lg:gap-16 lg:pl-0">
      {/*
       * The rail. It stops short of both ends of the list for the reason the
       * chain's does: a line running past the last node into empty space reads
       * as a list that has lost its final entry.
       *
       * The fade at the bottom is not decoration either — it is what lets the
       * rail end without a hard stop that would read as a rule.
       */}
      <div
        aria-hidden
        className="spine-draw absolute top-10 bottom-16 left-6 w-px bg-gradient-to-b from-gilt/60 via-gilt/45 to-gilt/10 sm:left-7 lg:left-1/2 lg:-translate-x-1/2"
      />

      {TREATMENT_STEPS.map((step, index) => {
        // The photograph changes sides at each node, which is what makes the
        // rail read as something being travelled rather than as a border down
        // the middle of a two-column table.
        const flipped = index % 2 === 1;

        return (
          <Reveal
            as="li"
            key={step}
            className="relative grid items-center gap-6 lg:grid-cols-2 lg:gap-20"
          >
            {/*
             * The node. On the rail at every width — left of the card on a
             * phone, on the centre line at `lg`, where it sits at the vertical
             * middle of the entry rather than at its top, because that is where
             * the rail passes through it.
             */}
            <span
              aria-hidden
              className="absolute top-8 -left-8 z-10 flex h-11 w-11 -translate-x-1/2 items-center justify-center rounded-full border border-gilt/55 bg-navy font-display text-[0.98rem] text-gilt sm:-left-9 sm:h-12 sm:w-12 lg:top-1/2 lg:left-1/2 lg:h-14 lg:w-14 lg:-translate-y-1/2 lg:text-[1.16rem]"
            >
              {String(index + 1).padStart(2, '0')}
            </span>

            <figure
              className={cn(
                'group relative min-w-0 overflow-clip rounded-2xl border border-navy-line/50 bg-navy shadow-lift',
                flipped && 'lg:order-2',
              )}
            >
              {/* eslint-disable-next-line next/no-img-element, @next/next/no-img-element */}
              <img
                src={photos[index].src}
                width={photos[index].width}
                height={photos[index].height}
                alt=""
                loading="lazy"
                decoding="async"
                sizes="(min-width: 1024px) 480px, calc(100vw - 6rem)"
                className="block aspect-16/10 w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.05] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
              />

              {/* Light, and only along the foot. Nothing is set on this picture
                  — the words are beside it, not on it — so the gradient is here
                  to land the photograph on the navy it sits in rather than to
                  make room for type. */}
              <div
                aria-hidden
                className="absolute inset-0 bg-gradient-to-t from-navy/70 from-2% via-transparent via-46% to-transparent"
              />
            </figure>

            <div className={cn('min-w-0', flipped && 'lg:order-1 lg:text-right')}>
              <h3 className="text-[1.24rem] font-bold text-white">
                {t(`pages.treatment.steps.${treatmentKey}.${step}.title`)}
              </h3>

              {/* The bronze rule, pushed to the outer edge on a flipped entry so
                  it always sits under the first character of the heading rather
                  than under its last. */}
              <span
                aria-hidden
                className={cn('mt-4 block h-px w-10 bg-gilt', flipped && 'lg:ml-auto')}
              />

              <p
                className={cn(
                  'mt-4 max-w-[44ch] text-[1.03rem] leading-relaxed text-navy-ink',
                  flipped && 'lg:ml-auto',
                )}
              >
                {t(`pages.treatment.steps.${treatmentKey}.${step}.body`)}
              </p>
            </div>
          </Reveal>
        );
      })}
    </ol>
  );
}
