'use client';

import { useEffect, useRef } from 'react';
import type { HeroFilm } from '@/components/site/photos';

/**
 * The hero's video, when there is one — see `HERO_FILM`.
 *
 * A client component for exactly one reason: **reduced motion cannot be honoured
 * in CSS.** A stylesheet can stop an animation; it cannot stop a video from
 * playing, and `autoplay` on a full-screen loop is precisely the thing somebody
 * who has asked for less movement is asking not to have. So the element ships
 * without `autoplay` and this starts it, having checked.
 *
 * It also pauses when the tab is hidden. A muted hero loop decoding in a
 * background tab is battery spent on something nobody can see, and browsers do
 * not all stop it on their own.
 *
 * The poster is what a visitor sees until the first frame is decoded, so the
 * hero is never a grey rectangle — and it is the whole hero for anybody whose
 * `preload` never completes.
 */
export function HeroFilmPlayer({ film }: { film: HeroFilm }) {
  const video = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const node = video.current;
    if (!node) return;

    const calm = window.matchMedia('(prefers-reduced-motion: reduce)');

    const sync = () => {
      if (calm.matches || document.hidden) {
        node.pause();
        return;
      }
      // Autoplay can still be refused — Data Saver, a low battery, a browser
      // policy. Nothing to do about it and nothing to report: the poster is a
      // perfectly good hero, which is why it is a real frame of the film.
      void node.play().catch(() => {});
    };

    sync();
    calm.addEventListener('change', sync);
    document.addEventListener('visibilitychange', sync);
    return () => {
      calm.removeEventListener('change', sync);
      document.removeEventListener('visibilitychange', sync);
    };
  }, []);

  return (
    <video
      ref={video}
      src={film.src}
      poster={film.poster}
      width={film.width}
      height={film.height}
      muted
      loop
      // iOS refuses to autoplay anything that is not muted, and without this it
      // takes the video full-screen the moment it starts.
      playsInline
      preload="metadata"
      // Decorative, exactly as the still reel is: everything the hero says is in
      // the type beside it.
      aria-hidden
      tabIndex={-1}
      className="absolute inset-0 size-full object-cover"
    />
  );
}
