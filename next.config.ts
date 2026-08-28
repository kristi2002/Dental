import path from 'node:path';
import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const isDev = process.env.NODE_ENV === 'development';

const nextConfig: NextConfig = {
  reactStrictMode: true,

  // Emit `.next/standalone`: a self-contained server with only the traced
  // dependencies, so the deployed image carries neither the toolchain nor the
  // 700-odd MB of `node_modules` behind it.
  output: 'standalone',

  turbopack: {
    // Pin the workspace root — otherwise Turbopack walks up and finds unrelated
    // lockfiles in the parent directories.
    root: path.resolve(import.meta.dirname),
  },

  /**
   * `/gallery` was "The place" until its photographs were folded into
   * `/practice` — see the note on `PhotoWall` — and the route is gone.
   *
   * It cannot simply stop existing. It has been in `sitemap.ts` and allowed by
   * `robots.ts`, so it is a URL crawlers have been handed and readers may have
   * kept; a 404 throws away whatever standing it had and greets anybody who
   * saved it with an error page. Permanent, because the move is: a 308 passes
   * the ranking on, where a temporary redirect asks the crawler to keep coming
   * back to a page that is never returning.
   *
   * Two rules because the locale prefix is `always` and the bare path still
   * arrives from outside. Whichever of this and the next-intl middleware runs
   * first, the pair lands on `/<locale>/practice` either way — the wall's own
   * anchor is deliberately not appended, since somebody who bookmarked the page
   * wanted the place, and the place is now the whole of this one.
   */
  async redirects() {
    return [
      { source: '/gallery', destination: '/practice', permanent: true },
      {
        source: '/:locale(sq|en|it)/gallery',
        destination: '/:locale/practice',
        permanent: true,
      },
    ];
  },

  // The response headers this app ships with. It had none, while serving
  // radiographs to a browser on a shared reception machine — the document and
  // photo routes were carefully marked `Cache-Control: private` for exactly that
  // reason, and the headers that stop the page around them being framed, sniffed
  // or leaked were never added.
  async headers() {
    // Everything this app loads comes from its own origin: `next/font` self-hosts
    // Poppins, the barcode decoder's WebAssembly is copied into `public/` rather
    // than pulled from jsDelivr, and there is no analytics, no CDN and no
    // embedded anything. So the policy can be `'self'` almost throughout, and
    // each exception below is a specific thing the app does.
    const csp = [
      "default-src 'self'",
      // `'unsafe-inline'` is Next's hydration bootstrap, which is inline by
      // design; removing it needs a per-request nonce threaded through the proxy.
      // `'wasm-unsafe-eval'` is the barcode decoder — Chrome refuses to compile
      // WebAssembly without it, and the scanner is the stock module's whole point.
      // Dev additionally needs `'unsafe-eval'` for react-refresh.
      isDev
        ? "script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval'"
        : "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      // `data:` for the QR codes drawn onto labels, `blob:` for a photograph
      // being previewed before it is uploaded.
      "img-src 'self' data: blob:",
      // The camera stream the scanner puts on a <video> element.
      "media-src 'self' blob:",
      "font-src 'self'",
      "connect-src 'self'",
      "worker-src 'self' blob:",
      "object-src 'none'",
      "base-uri 'self'",
      // Nothing in this app posts anywhere but back to itself.
      "form-action 'self'",
      // Two Google hosts, and nothing else, for one frame: the map at the foot
      // of the visit page — see `ClinicMap`, which sets out why the storefront
      // took a third party at all after refusing every other one. `www` is what
      // the embed URL is built against and `maps` is where it redirects, so
      // both have to be named or the frame is blocked on the hop.
      //
      // ⚠️ This is the only hole in an otherwise `'self'` policy. Anything else
      // that wants to be framed needs its own argument, not this line widened:
      // an allowlist that has grown a second entry by habit is how a policy
      // stops meaning anything.
      "frame-src https://www.google.com https://maps.google.com",
      "frame-ancestors 'none'",
      // Deliberately no `upgrade-insecure-requests`: a clinic mini-PC is reached
      // over plain HTTP on the LAN (see `stock-labels.ts`), and upgrading would
      // break it on exactly the machines this is built for.
    ].join('; ');

    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
          // `frame-ancestors` above already says this; kept for browsers that
          // predate it, since the cost is one header.
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          // The app opens `wa.me` and `mailto:` links straight from a patient's
          // page, and that page's URL carries their record id. `no-referrer`
          // means it is never handed to WhatsApp or a mail client. Nothing here
          // reads a referrer, so there is nothing to lose by it.
          { key: 'Referrer-Policy', value: 'no-referrer' },
          // The scanner needs the camera. Nothing needs anything else.
          {
            key: 'Permissions-Policy',
            value: 'camera=(self), microphone=(), geolocation=(), payment=(), usb=()',
          },
          // Ignored by browsers over plain HTTP, so this is inert on a LAN
          // install and does its job behind Coolify's TLS.
          ...(isDev
            ? []
            : [
                {
                  key: 'Strict-Transport-Security',
                  value: 'max-age=63072000; includeSubDomains',
                },
              ]),
        ],
      },
    ];
  },

  // Patient files are read by a path computed at runtime (`src/lib/files.ts`),
  // which makes the build tracer assume it needs to ship the entire project.
  // These are the directories it must never pull in — above all `storage`,
  // which holds real radiographs and belongs nowhere near a deploy artifact.
  outputFileTracingExcludes: {
    '**/*': ['./storage/**', './.next/cache/**'],
  },
};

export default withNextIntl(nextConfig);
