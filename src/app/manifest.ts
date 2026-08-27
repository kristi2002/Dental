import type { MetadataRoute } from 'next';
import { clinicDisplayName, getClinicProfile } from '@/lib/queries';

export const dynamic = 'force-dynamic';

/**
 * What lets the front desk put this on a tablet's home screen.
 *
 * The app is designed for a screen the practice looks at all day — large type,
 * high contrast, one obvious thing per view — and every shift began in a browser
 * tab with an address bar above it, because there was no manifest at all. The
 * icons and the theme colour were already here; nothing tied them together.
 *
 * A route rather than a static `manifest.json`, for the same reason
 * `generateMetadata` is a function: the name belongs to the practice, not to the
 * product, and it is edited in Settings without a redeploy. A file checked into
 * the repository would say "Shehu Dental" on every install for ever.
 *
 * `standalone`, which is the whole point — no address bar, no browser chrome,
 * and the app's own navigation as the only navigation. `portrait-primary` is
 * deliberately *not* set: the calendar's week view is the screen this is most
 * used for and it wants the long edge.
 */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  // Guarded exactly as the metadata function above it is: a database that is
  // down must produce a page that says so, not a manifest request that throws.
  let name = process.env.NEXT_PUBLIC_CLINIC_NAME?.trim() || 'Shehu Dental';
  try {
    name = clinicDisplayName(await getClinicProfile()) || name;
  } catch {
    // The product's name stands. A manifest is not worth failing a request for.
  }

  return {
    name,
    // What fits under a home-screen icon. The practice's own name is nearly
    // always short enough; a long one is truncated by the launcher rather than
    // by us, which at least truncates it the way that platform does everywhere.
    short_name: name,
    description: 'Dental practice organizer',
    // The locale-less dashboard. The proxy redirects it to whichever language
    // the browser asks for, so an install made on an Albanian tablet opens
    // Albanian and the same manifest still serves the Italian locum.
    //
    // Not `/` any more: that is the practice's public page now, and a front desk
    // that taps the home-screen icon wants the day's list, not the page patients
    // read. `scope` stays at the root because the app spans every locale and
    // every section beneath it — a narrower scope would kick `/patients` out of
    // the standalone window and into a browser tab.
    start_url: '/dashboard',
    scope: '/',
    display: 'standalone',
    // Both match the top of the navigation rail's gradient, so the launch screen
    // and the status bar are the colour the app actually starts in rather than a
    // white flash before it.
    background_color: '#0b8f86',
    theme_color: '#0b8f86',
    icons: [
      { src: '/icon.png', sizes: '32x32', type: 'image/png' },
      // `maskable` as well as `any`: without it Android draws the square inside
      // its own circle and crops the mark, which is how a logo ends up with its
      // corners shaved off on one platform and not the other.
      { src: '/icon1.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon1.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      { src: '/apple-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  };
}
