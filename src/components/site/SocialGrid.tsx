import { Heart } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { InstagramGlyph } from '@/components/site/InstagramGlyph';
import { INSTAGRAM_HANDLE, INSTAGRAM_URL, SOCIAL } from '@/components/site/photos';
import { Ambience } from '@/components/site/Ambience';
import { Reveal } from '@/components/site/Reveal';
import { Watermark } from '@/components/site/Watermark';

/**
 * The practice on Instagram — as a link out, not as an embed.
 *
 * Three constraints in this app's `Content-Security-Policy` decide the shape of
 * this section, and all three point the same way. `frame-src 'none'` rules out
 * Instagram's own embed. `connect-src 'self'` rules out fetching a feed in the
 * browser. `img-src 'self'` rules out hotlinking their CDN even for a single
 * thumbnail. So the squares are local files and the section is a doorway rather
 * than a window.
 *
 * That turns out to be the better build anyway: it costs six small WebP files
 * instead of Instagram's embed script, it cannot break when Meta changes an
 * endpoint, and it reports nothing about the practice's visitors to anybody.
 *
 * **What is on the page is not the practice's feed, and the page says so.**
 * `instagram.com/shehu.dental` is behind a login wall — the profile returns a
 * sign-in shell to anybody not signed in, and the public JSON endpoints that
 * used to serve it are gone — so none of these images came from that account.
 * Presenting stock photographs under somebody's handle as though they were their
 * posts is a fabricated record, and it is the kind that gets noticed by the one
 * person who follows the account and knows better. `social.placeholder` is the
 * line that says so; deleting it is part of the job of putting real photographs
 * in, and it is the only thing on this page written to be thrown away.
 */
export async function SocialGrid() {
  const t = await getTranslations('site');

  return (
    <section className="seam relative overflow-clip bg-navy px-5 py-band-aside text-white sm:px-8">
      <Ambience />
      <Watermark className="-bottom-40 -left-28 w-[32rem] text-white/[0.045]" />

      <div className="relative mx-auto w-full max-w-6xl">
        <Reveal>
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <h2 className="type-section max-w-[18ch]">
                {t('social.title')}
              </h2>
            </div>

            <a
              href={INSTAGRAM_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-14 items-center gap-2.5 rounded-xl bg-white px-6 text-body font-bold text-navy no-underline transition-transform hover:-translate-y-0.5 focus-visible:outline-white motion-reduce:hover:translate-y-0"
            >
              <InstagramGlyph size={20} />@{INSTAGRAM_HANDLE}
            </a>
          </div>
        </Reveal>

        <ul className="mt-12 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-6">
          {SOCIAL.map((photo, index) => (
            <Reveal
              as="li"
              key={photo.key}
              step={index % 6}
              className="group relative overflow-hidden rounded-xl"
            >
              <a
                href={INSTAGRAM_URL}
                target="_blank"
                rel="noreferrer"
                className="block"
                // The grid is one destination six times over. Each tile is a
                // link so it is reachable by keyboard, and each says where it
                // goes rather than repeating "Instagram" six times to a screen
                // reader with no way to tell them apart.
                aria-label={t('social.openProfile', { handle: INSTAGRAM_HANDLE })}
              >
                {/* eslint-disable-next-line next/no-img-element, @next/next/no-img-element */}
                <img
                  src={photo.src}
                  width={photo.width}
                  height={photo.height}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="aspect-square w-full object-cover transition-transform duration-500 ease-out group-hover:scale-110 motion-reduce:transition-none motion-reduce:group-hover:scale-100"
                />
                <span
                  aria-hidden
                  className="absolute inset-0 grid place-items-center bg-navy/60 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
                >
                  <Heart size={22} className="text-white" fill="currentColor" />
                </span>
              </a>
            </Reveal>
          ))}
        </ul>

        {/* The line that keeps this honest. See the note at the top of this
            file — it comes out when real posts go in. */}
        <Reveal step={1}>
          <p className="mt-6 text-meta text-navy-ink-soft">{t('social.placeholder')}</p>
        </Reveal>
      </div>
    </section>
  );
}
