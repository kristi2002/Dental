'use client';

import {
  Camera,
  CameraOff,
  CircleAlert,
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
  /** Set when the console was opened from a patient, so the ledger can say who. */
  visitRecordId,
}: {
  items: LinkableItem[];
  categories: LinkableCategory[];
  visitRecordId?: string;
}) {
  const t = useTranslations('scan');
  const tc = useTranslations('common');

  const [direction, setDirection] = useState<ScanDirection>('in');
  const [basket, setBasket] = useState<BasketLine[]>([]);
  /** Codes the app has never been told about. Kept apart so they cannot be committed. */
  const [unknown, setUnknown] = useState<ScanResolution[]>([]);
  const [busy, setBusy] = useState(false);

  const manualRef = useRef<HTMLInputElement>(null);
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

  const onScan = useCallback(
    async (raw: string) => {
      const code = raw.trim();
      if (!code) return;

      setBusy(true);
      try {
        const scan = await lookupScan(code);
        if (!scan) {
          beep(false);
          return;
        }

        if (!scan.item) {
          beep(false);
          setUnknown((current) =>
            current.some((entry) => entry.key === scan.key) ? current : [...current, scan],
          );
          return;
        }

        beep(true);
        addToBasket(scan);
      } finally {
        setBusy(false);
      }
    },
    [addToBasket],
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
          <p className="mt-2 text-[0.9rem] text-ink-soft">
            {direction === 'in' ? t('directionInHint') : t('directionOutHint')}
          </p>
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
                <p className="text-[0.9rem]">
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
          <p className="text-[0.9rem] text-ink-soft">{t('wedgeHint')}</p>
        </form>
      </div>

      <div className="space-y-4">
        {/* Codes the app has never been told about, above the basket because
            they are the only thing here that needs a decision. */}
        {unknown.length > 0 ? (
          <section className="card border-warn/40 p-4">
            <h2 className="flex items-center gap-2 text-[1.05rem] font-bold text-warn">
              <CircleAlert size={19} aria-hidden />
              {t('unknownTitle', { count: unknown.length })}
            </h2>
            <p className="mt-1 mb-3 text-[0.95rem] text-ink-soft">{t('unknownHint')}</p>

            <ul className="space-y-2">
              {unknown.map((scan) => (
                <li
                  key={scan.key}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-surface-soft px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="font-mono text-[0.95rem] font-bold break-all text-ink">
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
            <h2 className="text-[1.15rem] font-bold text-ink">{t('basketTitle')}</h2>
            <span className="text-[0.95rem] font-semibold text-ink-soft tabular-nums">
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
                      <p className="text-[1.05rem] font-bold text-ink">{item.name}</p>
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
                      <span className="w-12 shrink-0 text-[0.9rem] text-ink-soft">{item.unit}</span>
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
              <p className="flex items-start gap-2 rounded-lg border border-warn/40 bg-warn-soft px-3 py-2.5 text-[0.95rem] text-warn">
                <TriangleAlert size={18} aria-hidden className="mt-0.5 shrink-0" />
                {t('overdrawnHint')}
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
