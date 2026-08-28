import { getTranslations } from 'next-intl/server';
import type { SitePhoto } from '@/components/site/photos';
import { Reveal } from '@/components/site/Reveal';
import { SectionEyebrow } from '@/components/site/SectionEyebrow';
import { Watermark } from '@/components/site/Watermark';
import { cn } from '@/lib/utils';

/**
 * Five photographs in the middle of a treatment's page.
 *
 * **The eleven treatment pages had one picture each.** The file behind the
 * opening band, and then four screens of type on cream — which for a page about
 * something physical, that happens in a room, to a person's face, is the wrong
 * medium by a long way. A dentist's website that will not show you the room is
 * a dentist's website you read once.
 *
 * So the middle of every one of those pages is a wall now, and the photographs
 * are that treatment's own — `TREATMENT_GALLERY` picks a set per treatment out
 * of the pool this site already ships, and no page repeats an image inside
 * itself. The note there has the whole argument, including why this is drawn
 * from the existing set rather than from fifty-five new downloads.
 *
 * **Two shapes, because two of the three page structures need this in different
 * places.** `wall` is the one that stops a page — a square lead with four
 * around it, held together, the thing a reader arrives at halfway down. `ribbon`
 * is the one that separates two bands without stopping anything: five tall
 * frames in a row, staggered, more of a rule than a section. Which page gets
 * which is decided in `TREATMENT_MOVEMENT`.
 *
 * **The arithmetic is exact in both shapes and has to stay that way.** `wall`
 * gives the lead a 2×2 span, so five photographs occupy eight cells: two rows of
 * four, and two columns of four on a phone. `ribbon` is five across at `lg` and
 * two across below it, where the fifth takes a double cell — three exact rows. A
 * mosaic with a hole in the last row is worse than no mosaic.
 *
 * The practice's own note goes under it, in every language, and it is not
 * optional: none of these photographs is Shehu Dental, and `photos.ts` will not
 * let anybody forget which is which.
 */
export async function TreatmentMosaic({
  photos,
  shape,
  /** `navy` under a cream band, `bone` under a navy one. */
  tone = 'navy',
  title,
  lede,
}: {
  photos: readonly SitePhoto[];
  shape: 'wall' | 'ribbon';
  tone?: 'navy' | 'bone';
  title: string;
  lede: string;
}) {
  const t = await getTranslations('site');
  const dark = tone === 'navy';

  return (
    <section
      className={cn(
        // `clip` and never `hidden`: every photograph below is on a `view()`
        // timeline through `Reveal`, and `hidden` would make this a scroll
        // container and freeze all five. The whole argument is on `.drift`.
        'relative overflow-clip px-5 py-16 sm:px-8 sm:py-20',
        dark ? 'bg-navy text-white' : 'bg-bone-soft',
      )}
    >
      {dark ? (
        <div
          aria-hidden
          className="drift-light absolute inset-0 bg-[radial-gradient(115%_95%_at_12%_-5%,var(--color-navy-soft),transparent_58%)]"
        />
      ) : null}

      <Watermark
        className={cn(
          '-top-24 -right-28 w-[30rem]',
          dark ? 'text-white/[0.04]' : 'text-gilt/[0.05]',
        )}
      />

      <div className="relative mx-auto w-full max-w-6xl">
        <Reveal>
          <SectionEyebrow className={dark ? 'text-gilt' : 'text-gilt-deep'}>
            {title}
          </SectionEyebrow>
          <p
            className={cn(
              'mt-5 max-w-[54ch] text-[1.05rem] leading-relaxed',
              dark ? 'text-navy-ink' : 'text-bone-ink-soft',
            )}
          >
            {lede}
          </p>
        </Reveal>

        <ul
          className={cn(
            'mt-12 grid gap-4',
            shape === 'wall' ? 'grid-cols-2 lg:grid-cols-4' : 'grid-cols-2 lg:grid-cols-5',
          )}
        >
          {photos.map((photo, index) => (
            <Reveal
              as="li"
              key={photo.src}
              // Across the row rather than down the list, so a wide screen reads
              // a row landing instead of a queue of five.
              step={index % 3}
              className={cn(
                'drift-clip relative rounded-2xl border bg-navy',
                dark ? 'border-navy-line/40' : 'border-bone-deep',
                shape === 'wall' && index === 0 && 'col-span-2 row-span-2',
                // The fifth frame closes the second row on a phone, where five
                // items in two columns would otherwise leave one on its own.
                shape === 'ribbon' && index === 4 && 'col-span-2 lg:col-span-1',
                // The stagger only exists where there is a row to stagger. Two
                // columns with alternate cells pushed down is not a rhythm, it
                // is a misalignment.
                shape === 'ribbon' && index % 2 === 1 && 'lg:mt-10',
              )}
            >
              {/* eslint-disable-next-line next/no-img-element, @next/next/no-img-element */}
              <img
                src={photo.src}
                width={photo.width}
                height={photo.height}
                alt=""
                loading="lazy"
                decoding="async"
                sizes={
                  shape === 'wall'
                    ? '(min-width: 1024px) 280px, calc(50vw - 1.5rem)'
                    : '(min-width: 1024px) 220px, calc(50vw - 1.5rem)'
                }
                className={cn(
                  'drift rounded-2xl object-cover',
                  // The lead in a `wall` has no aspect of its own: it is laid
                  // into a 2×2 span whose height the grid has already decided
                  // from the square cells beside it, so it is positioned to fill
                  // that box rather than asked to imply one. An `aspect-square`
                  // here would be right only while the gap is zero.
                  shape === 'wall' && index === 0
                    ? 'absolute inset-0 h-full w-full'
                    : 'block w-full',
                  shape === 'wall' && index > 0 && 'aspect-square',
                  shape === 'ribbon' && (index === 4 ? 'aspect-16/10 lg:aspect-4/5' : 'aspect-4/5'),
                )}
              />
            </Reveal>
          ))}
        </ul>

        <p
          className={cn(
            'mt-8 text-[0.88rem]',
            dark ? 'text-navy-ink-soft' : 'text-bone-ink-faint',
          )}
        >
          {t('how.illustrative')}
        </p>
      </div>
    </section>
  );
}
