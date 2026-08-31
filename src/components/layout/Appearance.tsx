'use client';

import { Monitor, Moon, Rows2, Rows4, Sun } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

/**
 * How this workstation looks, as opposed to what it shows.
 *
 * Two controls, and they belong together for a reason beyond tidiness: both are
 * properties of the *machine* rather than of the person, and neither goes near
 * the server. The mini-PC at reception is a 21-inch screen at arm's length in a
 * bright waiting room; the surgery's is a small panel in a dim room with the
 * blinds down. The same nurse signs in at both and wants a different answer at
 * each, so a preference stored against the account would be wrong at one of
 * them every single time.
 *
 * Hence `localStorage` and an attribute on `<html>`, with no database column and
 * nothing in the session. `theme-script.tsx` replays the theme before first
 * paint; this is only the place it gets set.
 *
 * **Mounted state, and why the controls are dead for one frame.** The stored
 * value cannot be read on the server, so the first render has to be identical
 * on both sides or React reports a hydration mismatch. The switch is therefore
 * drawn with nothing selected until the effect runs — which is one frame, on a
 * control nobody has moved the mouse to yet. The alternative is `suppressHydra-
 * tionWarning`, which does not fix the mismatch, only stops it being mentioned.
 */

type Theme = 'light' | 'system' | 'dark';
type Density = 'comfortable' | 'compact';

const THEMES: { value: Theme; Icon: typeof Sun }[] = [
  { value: 'light', Icon: Sun },
  { value: 'system', Icon: Monitor },
  { value: 'dark', Icon: Moon },
];

const DENSITIES: { value: Density; Icon: typeof Rows2 }[] = [
  { value: 'comfortable', Icon: Rows2 },
  { value: 'compact', Icon: Rows4 },
];

function read<T extends string>(key: string, fallback: T, allowed: readonly T[]): T {
  try {
    const stored = localStorage.getItem(key);
    return allowed.includes(stored as T) ? (stored as T) : fallback;
  } catch {
    // A locked-down browser throws rather than returning null, and an
    // appearance preference is not worth a broken menu.
    return fallback;
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* Same again: the attribute below still applies for this session. */
  }
}

export function Appearance() {
  const t = useTranslations('appearance');
  const [theme, setTheme] = useState<Theme | null>(null);
  const [density, setDensity] = useState<Density | null>(null);

  useEffect(() => {
    setTheme(read<Theme>('theme', 'system', ['light', 'system', 'dark']));
    setDensity(read<Density>('density', 'comfortable', ['comfortable', 'compact']));
  }, []);

  function chooseTheme(next: Theme) {
    setTheme(next);
    write('theme', next);
    // "System" is the *absence* of an attribute rather than a value of it —
    // that is what lets the stylesheet's `prefers-color-scheme` query answer.
    // Writing `data-theme="light"` here would pin the machine to light and look
    // identical until the sun went down.
    if (next === 'system') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = next;
  }

  function chooseDensity(next: Density) {
    setDensity(next);
    write('density', next);
    if (next === 'comfortable') delete document.documentElement.dataset.density;
    else document.documentElement.dataset.density = next;
  }

  return (
    <div className="border-t border-line px-4 py-3">
      <p className="mb-2 text-caption font-bold tracking-wide text-ink-faint uppercase">
        {t('title')}
      </p>

      <div className="segmented w-full" role="group" aria-label={t('theme')}>
        {THEMES.map(({ value, Icon }) => (
          <button
            key={value}
            type="button"
            className="segment flex-1"
            // `aria-pressed` rather than a class of its own, so what a screen
            // reader announces and what the eye sees cannot drift apart.
            aria-pressed={theme === value}
            title={t(value)}
            onClick={() => chooseTheme(value)}
          >
            <Icon size={17} aria-hidden />
            <span className="sr-only">{t(value)}</span>
          </button>
        ))}
      </div>

      <div className="segmented mt-2 w-full" role="group" aria-label={t('density')}>
        {DENSITIES.map(({ value, Icon }) => (
          <button
            key={value}
            type="button"
            className="segment flex-1"
            aria-pressed={density === value}
            title={t(value)}
            onClick={() => chooseDensity(value)}
          >
            <Icon size={17} aria-hidden />
            <span className="sr-only">{t(value)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
