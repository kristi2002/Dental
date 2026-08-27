import { getTranslations } from 'next-intl/server';
import { GALLERY } from '@/components/site/photos';
import { Ambience } from '@/components/site/Ambience';
import { Reveal } from '@/components/site/Reveal';

/**
 * How the work is actually done: the record, and the instruments.
 *
 * The brief asked for a section proving the clinic's modern capabilities — a 3D
 * scanner, a sterilisation room — with the photographs scaling as the reader
 * scrolls. The scroll part is here. The proving part is deliberately narrower
 * than the brief, and it is worth saying why in the file rather than only in a
 * commit message.
 *
 * **Every photograph on this page is stock**, `photos.ts` says so at the top,
 * and a section captioned "our intraoral scanner" over a photograph of somebody
 * else's scanner is a claim about equipment this practice may or may not own.
 * That is a different kind of placeholder from a stock treatment room: one is
 * illustrative, the other is a specification. So the two panels here say only
 * things the page already asserts and the practice already stands behind — the
 * electronic record, tooth by tooth, which is what the software underneath this
 * site *is*, and sterilisation between patients, which is the floor every
 * practice works to rather than a boast.
 *
 * When Dr. Shehu confirms what is in the surgery, this is the section that gets
 * the specifics, and the photographs get replaced at the same time.
 */
export async function HowWeWork() {
  const t = await getTranslations('site');

  // Both already in the gallery, so nothing new is downloaded for this section
  // on a visitor who has scrolled past it.
  const scanner = GALLERY.find((photo) => photo.key === 'scanner');
  const sterile = GALLERY.find((photo) => photo.key === 'sterile');
  const panels = [
    { key: 'record', photo: scanner },
    { key: 'clean', photo: sterile },
  ].filter((panel) => panel.photo !== undefined);

  if (panels.length === 0) return null;

  return (
    <section
      id="how"
      // `clip`, never `hidden`: the photographs below are on `view()` timelines
      // and `hidden` would make this section their scroll container and freeze
      // them mid-drift. See the note on `.drift` in globals.css.
      // `relative` for `Ambience`, whose two layers are absolutely positioned
      // and would otherwise hang themselves off the page rather than off this
      // section.
      className="relative scroll-mt-20 overflow-clip bg-navy px-5 py-20 text-white sm:px-8 sm:py-24"
    >
      <Ambience />

      <div className="relative mx-auto w-full max-w-6xl">
        <Reveal>
          <h2 className="type-section max-w-[16ch] text-white">{t('how.title')}</h2>
          <p className="mt-5 max-w-[54ch] text-[1.05rem] leading-relaxed text-navy-ink">
            {t('how.lede')}
          </p>
        </Reveal>

        <div className="mt-14 grid gap-6 lg:grid-cols-2 lg:gap-8">
          {panels.map((panel, index) => (
            <Reveal as="figure" key={panel.key} step={index}>
              {/* The clip carries the corner so the photograph inside can be a
                  plain rectangle that grows past its own edges. */}
              <div className="drift-clip rounded-2xl border border-white/10">
                {/* eslint-disable-next-line next/no-img-element, @next/next/no-img-element */}
                <img
                  src={panel.photo!.src}
                  width={panel.photo!.width}
                  height={panel.photo!.height}
                  alt={t(`gallery.alt.${panel.key === 'record' ? 'scanner' : 'sterile'}`)}
                  loading="lazy"
                  decoding="async"
                  sizes="(min-width: 1024px) 560px, calc(100vw - 2.5rem)"
                  className="drift block aspect-16/10 w-full object-cover"
                />
              </div>

              <figcaption className="mt-5">
                <h3 className="text-[1.15rem] font-bold text-white">
                  {t(`how.${panel.key}.title`)}
                </h3>
                <p className="mt-2 max-w-[46ch] text-[1rem] leading-relaxed text-navy-ink">
                  {t(`how.${panel.key}.body`)}
                </p>
              </figcaption>
            </Reveal>
          ))}
        </div>

        {/* The same note the practice section carries, for the same reason: these
            are not photographs of this surgery and the page says so where they
            appear rather than in a footer nobody reads. */}
        <p className="mt-10 text-[0.88rem] text-navy-ink-soft">{t('how.illustrative')}</p>
      </div>
    </section>
  );
}
