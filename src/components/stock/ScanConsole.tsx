'use client';

import {
  Camera,
  CameraOff,
  CircleAlert,
  CloudOff,
  PackageMinus,
  PackagePlus,
  ScanBarcode,
  Trash2,
  TriangleAlert,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  BarcodeLinkDialog,
  type LinkableCategory,
  type LinkableItem,
} from '@/components/stock/BarcodeLinkDialog';
import { Badge } from '@/components/ui/Badge';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { commitScan, lookupScan, type ScanDirection, type ScanResolution } from '@/lib/actions/scan';
import type { ScanFormat } from '@/lib/barcode';
import { useRecoveredForm } from '@/lib/form-recovery';
import type { ScanIndex } from '@/lib/scan-index';
import { resolveLocally } from '@/lib/scan-resolve';
import { useCameraScanner, useWedgeScanner } from '@/lib/use-scanner';
import { cn } from '@/lib/utils';

/** What kind of symbol it was, in words — shown only on codes needing a decision. */
const FORMAT_LABEL = {
  'gs1-element': 'formatElement',
  'gs1-digital-link': 'formatDigitalLink',
  plain: 'formatPlain',
} as const satisfies Record<ScanFormat, string>;

/** One material, one lot, however many times it was scanned. */
type BasketLine = {
  key: string;
  scan: ScanResolution;
  quantity: number;
};

/**
 * Where an uncommitted basket waits out a reload.
 *
 * Per-browser, not per-user: the console needs `stock.edit` to open at all, and
 * a shared storage-room tablet signing one person out and another in is a
 * handover of the same half-scanned delivery, not a leak. Cleared the moment the
 * basket commits.
 */
const BASKET_KEY = 'scan-basket';

/**
 * Two lots of one material are told apart by the lot number and the expiry and
 * by nothing else — so those are what decide whether a second beep is another
 * box of the same thing or a different row.
 */
function lineKey(scan: ScanResolution): string {
  return `${scan.key}|${scan.lotNumber ?? ''}|${scan.expiryDate ?? ''}`;
}

/**
 * Say something, because nobody is looking at the screen.
 *
 * The whole gesture is eyes-on-the-box: pick up carton, beep, put down carton.
 * A scan that silently failed to resolve is discovered at the end of a delivery,
 * when fifteen boxes are already on the shelf and nobody remembers which one it
 * was. Two tones cost nothing and make that impossible.
 */
function beep(ok: boolean) {
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;

    const context = new Ctor();
    const oscillator = context.createOscillator();
    const gain = context.createGain();

    oscillator.frequency.value = ok ? 880 : 220;
    gain.gain.value = 0.06;
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + (ok ? 0.08 : 0.24));
    oscillator.onended = () => context.close();
  } catch {
    // A browser that will not make a sound is not a reason to lose the scan.
  }
}

/**
 * The scanning screen.
 *
 * A basket, not a stream of writes. A delivery is fifteen cartons in ninety
 * seconds and the fifteenth is the one that was double-scanned; committing per
 * beep would make that impossible to take back without a stocktake. So scans
 * accumulate, are correctable, and hit the database once.
 *
 * Receiving and taking out share every part of that. The direction is a switch
 * at the top rather than two screens, because it is one gesture with two
 * meanings and duplicating the console would guarantee the two drifted.
 */
export function ScanConsole({
  items,
  categories,
  /**
   * Every symbol the practice has linked, sent with the page so a beep needs no
   * round trip and survives the wifi dropping. See `getScanIndex`.
   *
   * Optional, and empty is a working default: without it every scan simply waits
   * for the server exactly as it used to.
   */
  scanIndex = { codes: {}, items: {} },
  /** Set when the console was opened from a patient, so the ledger can say who. */
  visitRecordId,
}: {
  items: LinkableItem[];
  categories: LinkableCategory[];
  scanIndex?: ScanIndex;
  visitRecordId?: string;
}) {
  const t = useTranslations('scan');
  const tc = useTranslations('common');
  // The shelf is counted in boxes, and the word for one lives with the storage
  // room's own strings rather than being repeated in the scanner's.
  const tstock = useTranslations('stock');

  const [direction, setDirection] = useState<ScanDirection>('in');
  const [basket, setBasket] = useState<BasketLine[]>([]);
  /** Codes the app has never been told about. Kept apart so they cannot be committed. */
  const [unknown, setUnknown] = useState<ScanResolution[]>([]);
  const [busy, setBusy] = useState(false);

  /**
   * Teaching the scanner rather than moving stock. See the switch below.
   *
   * Not persisted with the basket: a linking session is a deliberate act
   * somebody starts, and a mode that survived a reload would be a mode people
   * forget they are in — which on this screen means beeping a delivery that
   * silently receives nothing.
   */
  const [linking, setLinking] = useState(false);
  /** Codes this pass has confirmed the app already knows. */
  const [surveyed, setSurveyed] = useState<Array<{ key: string; name: string }>>([]);

  const manualRef = useRef<HTMLInputElement>(null);
  const byNameRef = useRef<HTMLInputElement>(null);
  const [byNameError, setByNameError] = useState('');
  const { state, formAction, formRef } = useRecoveredForm(commitScan);
  const handledTs = useRef<number | undefined>(undefined);

  // A committed basket is gone: leaving the lines on screen after the shelf has
  // already moved is how the same delivery gets entered twice.
  useEffect(() => {
    if (state.status !== 'ok' || state.ts === handledTs.current) return;
    handledTs.current = state.ts;
    setBasket([]);
    setUnknown([]);
  }, [state]);

  /**
   * The basket, kept where a closed tab cannot take it.
   *
   * `useRecoveredForm` puts typed values back after the *server* refuses, which
   * is the wrong failure for this screen. The one that actually happens here is
   * a storage room with no signal: fifteen cartons are scanned, the commit
   * cannot reach anything, and the basket lives only in React state — so a
   * reload, a locked phone, or a tab closed by accident loses ninety seconds of
   * work with the boxes already on the shelf.
   *
   * Restored once, on mount, before anything is scanned. Wrapped because a
   * browser with site data blocked throws on the accessor itself, and a console
   * that will not open is worse than one that forgets.
   */
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(BASKET_KEY);
      if (!saved) return;
      const parsed = JSON.parse(saved) as { direction?: ScanDirection; lines?: BasketLine[] };
      if (Array.isArray(parsed.lines) && parsed.lines.length > 0) setBasket(parsed.lines);
      if (parsed.direction === 'in' || parsed.direction === 'out') setDirection(parsed.direction);
    } catch {
      // A basket that will not parse is one delivery to rescan, not a screen
      // that refuses to load.
    }
  }, []);

  useEffect(() => {
    try {
      if (basket.length === 0) window.localStorage.removeItem(BASKET_KEY);
      else window.localStorage.setItem(BASKET_KEY, JSON.stringify({ direction, lines: basket }));
    } catch {
      // Nothing to do and nothing worth saying: the basket still works, it just
      // will not outlive the tab.
    }
  }, [basket, direction]);

  /**
   * Whether the commit has anywhere to go.
   *
   * Scanning keeps working offline — that is the whole point of the index this
   * page came down with — but committing does not, and a person who does not
   * know that will press **Save**, see nothing happen, and reasonably conclude
   * the delivery is recorded. Saying so is the difference between a pause and a
   * lost stocktake.
   *
   * `navigator.onLine` is a weak signal — it means "there is a network", not
   * "the server answers" — so it is used only to *warn*, never to block. The
   * button stays live: a false negative must not stop somebody recording a
   * delivery that would have gone through perfectly well.
   */
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    const sync = () => setOffline(!navigator.onLine);
    sync();
    window.addEventListener('online', sync);
    window.addEventListener('offline', sync);
    return () => {
      window.removeEventListener('online', sync);
      window.removeEventListener('offline', sync);
    };
  }, []);

  /** Another box of something already in the basket adds to its line, not a second one. */
  const addToBasket = useCallback((scan: ScanResolution) => {
    setBasket((current) => {
      const key = lineKey(scan);
      const existing = current.find((line) => line.key === key);
      if (!existing) return [...current, { key, scan, quantity: scan.packQty }];
      return current.map((line) =>
        line.key === key ? { ...line, quantity: line.quantity + scan.packQty } : line,
      );
    });
  }, []);

  /**
   * Replace an optimistically-added line with the server's fuller answer.
   *
   * The local resolution knows the symbol and the material and cannot know
   * whether the lot it names is already on record — so enriching can change the
   * line's identity, because `lineKey` is built from the lot number and the
   * expiry. Matched on the old key and re-keyed on the new one, merging into an
   * existing line if the fuller answer turns out to be one already in the
   * basket.
   */
  const enrich = useCallback((previousKey: string, scan: ScanResolution) => {
    setBasket((current) => {
      const stale = current.find((line) => line.key === previousKey);
      if (!stale) return current;

      const key = lineKey(scan);
      if (key === previousKey) {
        return current.map((line) => (line.key === key ? { ...line, scan } : line));
      }

      const rest = current.filter((line) => line.key !== previousKey);
      const existing = rest.find((line) => line.key === key);
      if (existing) {
        return rest.map((line) =>
          line.key === key ? { ...line, quantity: line.quantity + stale.quantity } : line,
        );
      }
      return [...rest, { ...stale, key, scan }];
    });
  }, []);

  /**
   * A beep, answered from the page rather than from the network.
   *
   * The index came down with this page (see `getScanIndex`), so a recognised
   * symbol makes its sound and lands in the basket immediately — no round trip
   * in the middle of a gesture that has no pause in it, and no stall at all when
   * the storage room's wifi drops, which is where deliveries are actually
   * received.
   *
   * The server is still asked, for the one thing the index cannot hold: whether
   * the scanned lot is already on record. That answer arrives a moment later and
   * replaces the line. If it never arrives, the line stays exactly as it is and
   * commits correctly — a consumption with no lot attached falls back to
   * oldest-first, which is what every material without lots already does.
   *
   * A local hit the server then contradicts means the index is stale — the
   * material was archived or its link removed since the page loaded. Rare, and
   * handled rather than assumed away: the optimistic line is withdrawn and the
   * code goes to the unknown queue where it belongs.
   */
  const onScan = useCallback(
    async (raw: string) => {
      const code = raw.trim();
      if (!code) return;

      // A survey pass, not a delivery. A code the app already knows is recorded
      // as covered and moves no stock; one it does not falls through to the
      // unknown queue below, which is where the naming happens.
      if (linking) {
        const known = resolveLocally(code, scanIndex);
        if (known?.item) {
          beep(true);
          setSurveyed((current) =>
            current.some((entry) => entry.key === known.key)
              ? current
              : [...current, { key: known.key, name: known.item?.name ?? '' }],
          );
          return;
        }
        // Unknown, or known only to the server. Ask, then queue it to be named.
      }

      const local = linking ? null : resolveLocally(code, scanIndex);
      const localKey = local ? lineKey(local) : null;
      if (local) {
        beep(true);
        addToBasket(local);
      }

      setBusy(true);
      try {
        const scan = await lookupScan(code);

        if (!scan || !scan.item) {
          if (localKey) {
            // The index disagreed with the database. The database wins.
            setBasket((current) => current.filter((line) => line.key !== localKey));
          }
          beep(false);
          if (scan && !scan.item) {
            setUnknown((current) =>
              current.some((entry) => entry.key === scan.key) ? current : [...current, scan],
            );
          }
          return;
        }

        if (localKey) {
          enrich(localKey, scan);
          return;
        }

        // In a survey pass the server has just confirmed the code *is* known —
        // the local index was merely stale. Recorded as covered, and still no
        // stock moved: the whole point of the mode is that beeping a shelf
        // cannot receive it.
        if (linking) {
          beep(true);
          setSurveyed((current) =>
            current.some((entry) => entry.key === scan.key)
              ? current
              : [...current, { key: scan.key, name: scan.item?.name ?? '' }],
          );
          return;
        }

        beep(true);
        addToBasket(scan);
      } catch {
        // No network. The optimistic line stands and the delivery carries on;
        // the commit is what needs a server, and that is one press at the end
        // rather than one per box.
        if (!localKey) beep(false);
      } finally {
        setBusy(false);
      }
    },
    [addToBasket, enrich, linking, scanIndex],
  );

  /**
   * A code has just been linked. Ask again what it means.
   *
   * Asking is simpler than threading the new material back out of the dialog,
   * and it is the same call the scanner already makes — so a linked code lands
   * in the basket by exactly the path a recognised one does. It stops being a
   * question and becomes a scanned box, because somebody is still holding the
   * carton they just described.
   */
  const recheck = useCallback(
    async (scan: ScanResolution) => {
      const fresh = await lookupScan(scan.raw);
      if (!fresh?.item) return;

      setUnknown((current) => current.filter((entry) => entry.key !== scan.key));
      beep(true);
      addToBasket(fresh);
    },
    [addToBasket],
  );

  /**
   * Put a material in the basket by name, for a box that carries no symbol.
   *
   * Matched exactly first, then as a unique prefix — which is what a datalist
   * hands back once somebody picks a suggestion, and what half-typing "filtek"
   * should do when only one material starts that way. An ambiguous half-name
   * refuses rather than guessing: two shades of one composite differ by two
   * characters, and quietly picking the first would book a delivery onto the
   * wrong shelf with nothing on screen to say so.
   *
   * The line it builds carries no lot and no expiry, exactly like a plain
   * barcode with no GS1 data — which is a shape the basket and the commit both
   * already handle. Receiving one creates no lot row, as `commitScan`
   * documents: a delivery that named neither a lot number nor a date should not
   * invent one.
   */
  const addByName = useCallback(
    (raw: string) => {
      const query = raw.trim().toLowerCase();
      setByNameError('');
      if (!query) return;

      const exact = items.filter((item) => item.name.toLowerCase() === query);
      const matches = exact.length > 0
        ? exact
        : items.filter((item) => item.name.toLowerCase().startsWith(query));

      if (matches.length === 0) {
        beep(false);
        setByNameError(t('byNameNoMatch'));
        return;
      }
      if (matches.length > 1) {
        beep(false);
        setByNameError(t('byNameAmbiguous', { count: matches.length }));
        return;
      }

      const item = matches[0];
      const known = scanIndex.items[item.id];

      beep(true);
      addToBasket({
        // Keyed on the material rather than on a symbol, so beeping the same
        // material twice by name adds to one line — and so it can never collide
        // with a real code, which is never a uuid.
        raw: item.id,
        format: 'plain',
        key: `item:${item.id}`,
        lotNumber: null,
        serial: null,
        expiryDate: null,
        manufacturedAt: null,
        packQty: 1,
        item: {
          id: item.id,
          name: item.name,
          quantity: known?.quantity ?? 0,
          minLimit: known?.minLimit ?? 0,
          code: known?.code ?? null,
        },
        batch: null,
        expired: false,
      });
    },
    [addToBasket, items, scanIndex, t],
  );

  // The desk scanner. Always listening, because staff arrive holding a carton
  // rather than having clicked into a field first.
  useWedgeScanner(onScan);
  const camera = useCameraScanner(onScan);

  const setQuantity = (key: string, quantity: number) =>
    setBasket((current) =>
      current.map((line) => (line.key === key ? { ...line, quantity: Math.max(1, quantity) } : line)),
    );

  const remove = (key: string) => setBasket((current) => current.filter((line) => line.key !== key));

  // Taking out more than the shelf holds is worth saying *before* the commit.
  // The action takes what is there rather than refusing, but a count that was
  // already wrong is the thing worth a second look.
  const overdrawn =
    direction === 'out' &&
    basket.some((line) => line.scan.item && line.quantity > line.scan.item.quantity);

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
      <div className="space-y-4">
        {/* Which way the shelf moves. First, and unmissable: every scan below
            means the opposite thing if this is wrong. */}
        <div className="card p-4">
          <p className="field-label">{t('directionLabel')}</p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              aria-pressed={direction === 'in'}
              onClick={() => setDirection('in')}
              className={cn(
                'flex flex-col items-center gap-1 rounded-lg border px-3 py-3 font-bold transition-colors',
                direction === 'in'
                  ? 'border-ok bg-ok-soft text-ok'
                  : 'border-line-strong bg-surface text-ink-soft hover:border-ink hover:text-ink',
              )}
            >
              <PackagePlus size={22} aria-hidden />
              {t('directionIn')}
            </button>
            <button
              type="button"
              aria-pressed={direction === 'out'}
              onClick={() => setDirection('out')}
              className={cn(
                'flex flex-col items-center gap-1 rounded-lg border px-3 py-3 font-bold transition-colors',
                direction === 'out'
                  ? 'border-brand bg-brand-soft text-brand-deep'
                  : 'border-line-strong bg-surface text-ink-soft hover:border-ink hover:text-ink',
              )}
            >
              <PackageMinus size={22} aria-hidden />
              {t('directionOut')}
            </button>
          </div>
          <p className="mt-2 text-meta text-ink-soft">
            {direction === 'in' ? t('directionInHint') : t('directionOutHint')}
          </p>

          {/* Teaching the scanner, as a mode rather than as a side effect.

              Linking could only ever happen from a scan that *failed*, one
              carton at a time, by whoever was holding it. That is the right
              moment and a hopeless way to start: a practice adopting the
              scanner has seventy products to teach it, and the only way to walk
              the room beeping them was to beep them into a delivery — because a
              recognised code goes straight into the basket. So there was no way
              to survey the storeroom at all, and the realistic outcome is that
              nobody gets past ten and the scanner stays a curiosity.

              This makes the survey possible: nothing moves, known codes are
              counted so coverage is visible, and unknown ones queue up to be
              named. Its own switch and not a third direction, because it is not
              a direction — no stock moves either way. */}
          <div
            className={cn(
              'mt-3 rounded-lg border px-3 py-2.5',
              linking ? 'border-brand bg-brand-soft' : 'border-line',
            )}
          >
            <label className="flex items-center gap-2 font-bold text-ink">
              <input
                type="checkbox"
                checked={linking}
                onChange={(event) => {
                  setLinking(event.target.checked);
                  setSurveyed([]);
                }}
                className="h-4 w-4"
              />
              {t('linkModeLabel')}
            </label>
            <p className="mt-1 text-meta text-ink-soft">{t('linkModeHint')}</p>
          </div>
        </div>

        {/* The camera, for the phone at the chair. */}
        <div className="card overflow-hidden">
          <div className="relative aspect-[4/3] bg-ink">
            {/* A live camera feed has no captions to give. */}
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <video
              ref={camera.videoRef}
              muted
              playsInline
              className={cn(
                'h-full w-full object-cover',
                camera.state === 'running' ? 'opacity-100' : 'opacity-0',
              )}
            />

            {camera.state === 'running' ? (
              // A frame to aim with. A DataMatrix on a foil pouch is small
              // enough that "point the phone at it" is not sufficient
              // instruction.
              <span
                aria-hidden
                className="pointer-events-none absolute inset-x-[18%] inset-y-[26%] rounded-lg border-2 border-white/80 shadow-[0_0_0_100vmax_rgba(0,0,0,0.35)]"
              />
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center text-white/70">
                <ScanBarcode size={36} aria-hidden />
                <p className="text-meta">
                  {camera.state === 'unsupported'
                    ? t('cameraUnsupported')
                    : camera.state === 'denied'
                      ? t('cameraDenied')
                      : camera.state === 'error'
                        ? t('cameraError')
                        : t('cameraIdle')}
                </p>
              </div>
            )}
          </div>

          <div className="p-3">
            {camera.state === 'running' ? (
              <button type="button" className="btn btn-secondary w-full" onClick={camera.stop}>
                <CameraOff size={18} aria-hidden />
                {t('cameraStop')}
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-secondary w-full"
                disabled={!camera.supported || camera.state === 'starting'}
                onClick={camera.start}
              >
                <Camera size={18} aria-hidden />
                {camera.state === 'starting' ? t('cameraStarting') : t('cameraStart')}
              </button>
            )}
          </div>
        </div>

        {/* Typing it in. The fallback for a symbol too damaged to read, and
            where a desk scanner's characters land if one is focused. */}
        <form
          className="card space-y-2 p-4"
          onSubmit={(event) => {
            event.preventDefault();
            const value = manualRef.current?.value ?? '';
            if (manualRef.current) manualRef.current.value = '';
            void onScan(value);
          }}
        >
          <label className="field-label" htmlFor="scan-manual">
            {t('manualLabel')}
          </label>
          <input
            id="scan-manual"
            ref={manualRef}
            className="field-input font-mono"
            placeholder={t('manualPlaceholder')}
            autoComplete="off"
          />
          <p className="text-meta text-ink-soft">{t('wedgeHint')}</p>
        </form>

        {/* A box with no symbol on it at all.

            The console could already teach itself an unrecognised code, and even
            create the material from the name somebody types into the link
            dialog — but every one of those doors opens from a *scan*. A person
            holding a carton that never carried a barcode, or whose label has
            worn off, had to leave this screen, find the material in the storage
            list or fill in the new-material form, and come back. That is the
            path a delivery actually stalls on, and it is the one that had no
            fast version.

            By name, against the list already on this page, so it costs a
            round trip of nothing and works with the network down like the rest
            of the console. */}
        <form
          className="card space-y-2 p-4"
          onSubmit={(event) => {
            event.preventDefault();
            addByName(byNameRef.current?.value ?? '');
            if (byNameRef.current) byNameRef.current.value = '';
          }}
        >
          <label className="field-label" htmlFor="scan-by-name">
            {t('byNameLabel')}
          </label>
          <input
            id="scan-by-name"
            ref={byNameRef}
            list="scan-item-names"
            className="field-input"
            placeholder={t('byNamePlaceholder')}
            autoComplete="off"
          />
          <datalist id="scan-item-names">
            {items.map((item) => (
              <option key={item.id} value={item.name} />
            ))}
          </datalist>
          <p className="text-meta text-ink-soft">
            {byNameError ? (
              <span role="alert" className="font-semibold text-danger">
                {byNameError}
              </span>
            ) : (
              t('byNameHint')
            )}
          </p>
        </form>
      </div>

      <div className="space-y-4">
        {/* What a survey pass has covered so far.

            The tally is the point. Teaching the scanner is a job with no visible
            end — every carton looks the same whether the app knows it or not —
            and a job with no visible end is one people abandon halfway and never
            trust afterwards. Two counts turn it into something that can be
            finished: how many are already known, and how many are waiting to be
            named in the panel below. */}
        {linking ? (
          <section className="card border-brand/40 p-4">
            <h2 className="flex flex-wrap items-center gap-2 text-body font-bold text-brand-deep">
              <ScanBarcode size={19} aria-hidden />
              {t('linkModeTitle')}
              <Badge tone="brand">{t('linkModeKnown', { count: surveyed.length })}</Badge>
              {unknown.length > 0 ? (
                <Badge tone="warn">{t('linkModeToName', { count: unknown.length })}</Badge>
              ) : null}
            </h2>
            <p className="mt-1 text-body text-ink-soft">{t('linkModeBody')}</p>

            {surveyed.length > 0 ? (
              <ul className="mt-3 flex flex-wrap gap-1.5">
                {surveyed.map((entry) => (
                  <li
                    key={entry.key}
                    className="rounded-md bg-paper px-2 py-0.5 text-meta font-semibold text-ink-soft"
                  >
                    {entry.name}
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        ) : null}

        {/* Codes the app has never been told about, above the basket because
            they are the only thing here that needs a decision. */}
        {unknown.length > 0 ? (
          <section className="card border-warn/40 p-4">
            <h2 className="flex items-center gap-2 text-body font-bold text-warn">
              <CircleAlert size={19} aria-hidden />
              {t('unknownTitle', { count: unknown.length })}
            </h2>
            <p className="mt-1 mb-3 text-body text-ink-soft">{t('unknownHint')}</p>

            <ul className="space-y-2">
              {unknown.map((scan) => (
                <li
                  key={scan.key}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-surface-soft px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="font-mono text-body font-bold break-all text-ink">
                      {scan.key}
                    </p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-1.5">
                      <Badge>{t(FORMAT_LABEL[scan.format])}</Badge>
                      {scan.lotNumber ? <Badge>{t('lot', { lot: scan.lotNumber })}</Badge> : null}
                      {scan.expiryDate ? (
                        <Badge tone={scan.expired ? 'danger' : 'neutral'}>
                          {t('expiry', { date: scan.expiryDate })}
                        </Badge>
                      ) : null}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <BarcodeLinkDialog
                      scan={scan}
                      items={items}
                      categories={categories}
                      onLinked={() => void recheck(scan)}
                    />
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      title={t('unknownDismiss')}
                      onClick={() =>
                        setUnknown((current) => current.filter((entry) => entry.key !== scan.key))
                      }
                    >
                      <Trash2 size={17} aria-hidden />
                      <span className="sr-only">{t('unknownDismiss')}</span>
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <form ref={formRef} action={formAction} className="card">
          <input type="hidden" name="direction" value={direction} />
          {visitRecordId ? (
            <input type="hidden" name="visitRecordId" value={visitRecordId} />
          ) : null}

          <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
            <h2 className="text-lead font-bold text-ink">{t('basketTitle')}</h2>
            <span className="text-body font-semibold text-ink-soft tabular-nums">
              {t('basketCount', { count: basket.reduce((sum, line) => sum + line.quantity, 0) })}
            </span>
          </header>

          {basket.length === 0 ? (
            <p className="px-5 py-10 text-center text-ink-faint">
              {busy ? t('basketBusy') : t('basketEmpty')}
            </p>
          ) : (
            <ul className="divide-y-2 divide-line">
              {basket.map((line) => {
                const item = line.scan.item!;
                const short = direction === 'out' && line.quantity > item.quantity;

                return (
                  <li key={line.key} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                    <div className="min-w-0 flex-1">
                      <p className="text-body font-bold text-ink">{item.name}</p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-1.5">
                        {line.scan.lotNumber ? (
                          <Badge tone="brand">{t('lot', { lot: line.scan.lotNumber })}</Badge>
                        ) : null}
                        {line.scan.expiryDate ? (
                          <Badge tone={line.scan.expired ? 'danger' : 'neutral'}>
                            {t('expiry', { date: line.scan.expiryDate })}
                          </Badge>
                        ) : null}
                        {/* The lot in hand has expired. Recorded truthfully if
                            they go ahead — attributing it to a healthier lot
                            would put a number on a chart that never went near
                            the patient. */}
                        {line.scan.expired && direction === 'out' ? (
                          <Badge tone="danger">{t('expiredWarning')}</Badge>
                        ) : null}
                        {short ? <Badge tone="warn">{t('shortWarning', { have: item.quantity })}</Badge> : null}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={1}
                        step={1}
                        value={line.quantity}
                        aria-label={t('lineQuantity', { name: item.name })}
                        onChange={(event) => setQuantity(line.key, Number(event.target.value))}
                        className="field-input w-20 py-1.5 text-center tabular-nums"
                      />
                      <span className="w-16 shrink-0 text-meta text-ink-soft">
                        {tstock('boxes', { count: line.quantity })}
                      </span>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        title={tc('delete')}
                        onClick={() => remove(line.key)}
                      >
                        <Trash2 size={17} aria-hidden />
                        <span className="sr-only">{tc('delete')}</span>
                      </button>
                    </div>

                    <input
                      type="hidden"
                      name="line"
                      value={JSON.stringify({
                        itemId: item.id,
                        quantity: line.quantity,
                        lotNumber: line.scan.lotNumber,
                        expiryDate: line.scan.expiryDate,
                        manufacturedAt: line.scan.manufacturedAt,
                        batchId: line.scan.batch?.id ?? null,
                      })}
                    />
                  </li>
                );
              })}
            </ul>
          )}

          <footer className="space-y-3 border-t border-line px-5 py-4">
            {state.status === 'error' ? (
              <p
                role="alert"
                className="rounded-lg border border-danger bg-danger-soft px-3 py-2 font-semibold text-danger"
              >
                {state.message}
              </p>
            ) : null}

            {overdrawn ? (
              <p className="flex items-start gap-2 rounded-lg border border-warn/40 bg-warn-soft px-3 py-2.5 text-body text-warn">
                <TriangleAlert size={18} aria-hidden className="mt-0.5 shrink-0" />
                {t('overdrawnHint')}
              </p>
            ) : null}

            {/* Scanning survives the wifi dropping; committing does not. Said
                out loud, because the alternative is somebody pressing Save,
                seeing nothing happen, and walking away believing the delivery
                is recorded. The button below stays live on purpose —
                `navigator.onLine` means "there is a network", not "the server
                answers", and a false negative must not stop a delivery that
                would have gone through. */}
            {offline && basket.length > 0 ? (
              <p
                role="status"
                className="flex items-start gap-2 rounded-lg border border-warn/40 bg-warn-soft px-3 py-2.5 text-body text-warn"
              >
                <CloudOff size={18} aria-hidden className="mt-0.5 shrink-0" />
                {t('offlineHint')}
              </p>
            ) : null}

            <div className="flex flex-wrap items-center justify-end gap-3">
              <button
                type="button"
                className="btn btn-secondary"
                disabled={basket.length === 0}
                onClick={() => setBasket([])}
              >
                {t('basketClear')}
              </button>
              <SubmitButton
                label={direction === 'in' ? t('commitIn') : t('commitOut')}
                pendingLabel={tc('saving')}
                disabled={basket.length === 0}
              />
            </div>
          </footer>
        </form>
      </div>
    </div>
  );
}
