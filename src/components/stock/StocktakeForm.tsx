'use client';

import { ScanBarcode } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useActionState, useCallback, useEffect, useId, useRef, useState } from 'react';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { saveStocktake } from '@/lib/actions/stock';
import { IDLE_STATE } from '@/lib/actions/types';
import { parseScan } from '@/lib/barcode';
import type { ScanIndex } from '@/lib/scan-index';
import { parseStockLabel } from '@/lib/stock-labels';
import { useWedgeScanner } from '@/lib/use-scanner';
import { cn } from '@/lib/utils';

export type StocktakeItem = {
  id: string;
  name: string;
  /** The article number, when the practice numbers its shelves. */
  code: string;
  /** Which cupboard it is in. Empty in a practice where every box has one home. */
  location: string;
  category: string;
  /** Boxes on record — what the count is compared against. */
  quantity: number;
};

/**
 * Where a half-counted shelf waits out a navigation.
 *
 * Scoped by shelf, because two shelves are two counts: opening the second must
 * not restore numbers typed against the first, and finishing one must not
 * discard the other. See `BASKET_KEY` in `ScanConsole` for the same idea on the
 * other screen — this exists because that one did and this one did not, which
 * was an inconsistency in the screen *more* likely to be used on a phone in a
 * room with bad signal.
 */
const COUNT_KEY = 'stocktake-counts';

/**
 * The whole cupboard as one list of number fields.
 *
 * Counting is done walking the room, so the screen is built to be typed
 * straight down rather than opened one dialog at a time — ten dialogs is ten
 * chances to lose a count you already made.
 *
 * A row is only submitted once it has been edited. The prefilled figure is
 * there to save typing on the many lines that have not moved, and treating it
 * as a count nobody made is how a stocktake would quietly overwrite whatever a
 * colleague consumed while the page sat open.
 */

export function StocktakeForm({
  items,
  scanIndex = { codes: {}, items: {} },
  scope = '',
}: {
  items: StocktakeItem[];
  /** Symbol → material, handed down with the page. See `getScanIndex`. */
  scanIndex?: ScanIndex;
  /** Which shelf is being counted, so two counts cannot overwrite each other. */
  scope?: string;
}) {
  const t = useTranslations('stock');
  const tc = useTranslations('common');
  const uid = useId();

  const [state, formAction] = useActionState(saveStocktake, IDLE_STATE);
  const [counts, setCounts] = useState<Record<string, string>>({});

  /**
   * Counting by scanner rather than by typing.
   *
   * Off by default, and it has to be: the two modes disagree about what a blank
   * field means. Typing starts from what is on record and corrects it, which is
   * right when most rows have not moved. Beeping starts from nothing and adds
   * one per box, which is the only thing a beep can honestly mean — a scanner
   * cannot tell you a shelf holds four, only that you showed it a box.
   *
   * Turning it on therefore zeroes every row in scope, and says so before it
   * does. A half-counted shelf saved against prefilled figures is worse than no
   * stocktake, because it looks like one.
   */
  const [scanning, setScanning] = useState(false);
  const [lastScan, setLastScan] = useState<{ name: string; count: number } | null>(null);
  const unknown = useRef(0);
  const [unknownCount, setUnknownCount] = useState(0);

  const storageKey = `${COUNT_KEY}:${scope}`;

  /**
   * A half-counted shelf, kept where a navigation cannot take it.
   *
   * The scan console already did this for its basket and this screen did not,
   * which was backwards: counting is the job most likely to be done on a phone,
   * walking a room, tapping a link by accident — and thirty typed numbers died
   * on any of those with the shelf half worked through.
   *
   * `scanning` is restored with the counts, and has to be. It is what decides
   * whether a row nobody touched means "unchanged" or "none left", so bringing
   * the numbers back under the other mode would turn a half-finished count into
   * a shelf that reads as empty.
   */
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(storageKey);
      if (!saved) return;
      const parsed = JSON.parse(saved) as { scanning?: boolean; counts?: Record<string, string> };
      if (parsed.counts && Object.keys(parsed.counts).length > 0) setCounts(parsed.counts);
      if (typeof parsed.scanning === 'boolean') setScanning(parsed.scanning);
    } catch {
      // A count that will not parse is one shelf to recount, not a screen that
      // refuses to open.
    }
  }, [storageKey]);

  useEffect(() => {
    try {
      if (Object.keys(counts).length === 0 && !scanning) {
        window.localStorage.removeItem(storageKey);
      } else {
        window.localStorage.setItem(storageKey, JSON.stringify({ scanning, counts }));
      }
    } catch {
      // The count still works; it just will not outlive the page.
    }
  }, [counts, scanning, storageKey]);

  // A saved count is gone, exactly as a committed basket is: leaving the
  // numbers on screen after the shelf has been written would invite the same
  // stocktake being applied twice.
  const savedTs = useRef<number | undefined>(undefined);
  useEffect(() => {
    // `ts` rather than `status`: two saves in a row are two events, and keying
    // on the status alone would leave the second one's numbers on screen —
    // the dependency never changes from 'ok' to 'ok'.
    if (state.status !== 'ok' || state.ts === savedTs.current) return;
    savedTs.current = state.ts;

    setCounts({});
    setScanning(false);
    unknown.current = 0;
    setUnknownCount(0);
    try {
      window.localStorage.removeItem(storageKey);
    } catch {
      // Nothing to do — the next save will overwrite it anyway.
    }
  }, [state, storageKey]);

  /** What the field shows: the typed figure once touched, else what is on record. */
  const shown = (item: StocktakeItem) =>
    counts[item.id] ?? (scanning ? '0' : String(item.quantity));

  /**
   * One box, counted.
   *
   * Resolved entirely in the browser — the index came down with the page, so a
   * beep costs no round trip and keeps working when the wifi does not. A
   * stocktake happens in the room where the signal is worst, and a scanner that
   * pauses is a scanner people stop using.
   *
   * Our own shelf label is tried first, exactly as `lookupScan` does on the
   * server: it names the material outright and needs no `ProductBarcode` row,
   * which is the whole point of printing one.
   */
  const onScan = useCallback(
    (raw: string) => {
      const label = parseStockLabel(raw);
      const key = parseScan(raw).key;
      const entry = key ? scanIndex.codes[key] : undefined;

      // A product label names a family rather than a box, so it cannot count
      // one. Item labels and linked symbols both land on a single material.
      const itemId = label?.kind === 'item' ? label.id : entry?.itemId;
      const item = itemId ? items.find((entry) => entry.id === itemId) : undefined;

      if (!item) {
        // Out of scope, or never linked. Counted rather than ignored: a shelf
        // whose count is right only because six boxes were silently skipped is
        // the failure this screen exists to prevent.
        unknown.current += 1;
        setUnknownCount(unknown.current);
        setLastScan(null);
        return;
      }

      const step = entry?.packQty && entry.packQty > 0 ? entry.packQty : 1;

      setCounts((current) => {
        const at = Number.parseInt(current[item.id] ?? '0', 10) || 0;
        const next = at + step;
        setLastScan({ name: item.name, count: next });
        return { ...current, [item.id]: String(next) };
      });
    },
    [scanIndex, items],
  );

  useWedgeScanner(onScan, scanning);

  /**
   * `null` for a row left alone or cleared — nothing to record either way.
   *
   * Except while scanning, where "left alone" is itself an answer. A shelf is
   * counted by beeping every box on it, so a row that was never beeped is a row
   * with no boxes: skipping it would let a count come out right only because
   * the missing material was never mentioned, which is the exact failure a
   * stocktake exists to catch.
   */
  function delta(item: StocktakeItem): number | null {
    const raw = counts[item.id] ?? (scanning ? '0' : undefined);
    if (raw === undefined || raw.trim() === '') return null;

    const value = Number.parseInt(raw, 10);
    if (!Number.isFinite(value) || value < 0) return null;
    return value - item.quantity;
  }

  const edited = items.filter((item) => (delta(item) ?? 0) !== 0);

  // Category is the closest thing the schema has to "which shelf" — grouping by
  // it means the screen can be worked through in roughly the order the room is.
  const groups = new Map<string, StocktakeItem[]>();
  for (const item of items) {
    const key = item.category || t('uncategorized');
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }

  return (
    <form action={formAction}>
      {/* Counting by scanner. A bar above the list rather than a setting
          elsewhere: it changes what every number below it means, so it has to
          be visible from the row somebody is looking at. */}
      <div
        className={cn(
          'mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border px-5 py-3',
          scanning ? 'border-brand bg-brand-soft' : 'border-line bg-surface',
        )}
      >
        <ScanBarcode
          size={20}
          aria-hidden
          className={scanning ? 'text-brand-deep' : 'text-ink-faint'}
        />

        <label className="flex items-center gap-2 font-bold text-ink">
          <input
            type="checkbox"
            checked={scanning}
            onChange={(event) => {
              // Asked before it happens, not explained afterwards. Switching on
              // sets every row in scope to nought, and a person who did not
              // expect that would be one press from saving an empty room.
              if (event.target.checked && !window.confirm(t('stocktakeScanConfirm'))) return;
              setScanning(event.target.checked);
              setCounts({});
              setLastScan(null);
              unknown.current = 0;
              setUnknownCount(0);
            }}
            className="h-4 w-4"
          />
          {t('stocktakeScanMode')}
        </label>

        {scanning ? (
          <p className="text-meta text-ink-soft" aria-live="polite">
            {/* What the last beep did. The whole gesture is eyes-on-the-box, so
                the confirmation has to be readable at a glance from across a
                shelf — the material and its running count, nothing else. */}
            {lastScan
              ? t('stocktakeScanned', { name: lastScan.name, count: lastScan.count })
              : t('stocktakeScanHint')}
          </p>
        ) : (
          <p className="text-meta text-ink-soft">{t('stocktakeScanOffHint')}</p>
        )}

        {/* Beeps that landed on nothing. Loud, because a stocktake whose count
            is right only because six boxes were skipped is worse than none. */}
        {unknownCount > 0 ? (
          <span
            role="status"
            className="ml-auto rounded-md bg-warn-soft px-2 py-0.5 text-meta font-bold text-warn"
          >
            {t('stocktakeScanUnknown', { count: unknownCount })}
          </span>
        ) : null}
      </div>

      <div className="card divide-y-2 divide-line">
        {[...groups].map(([category, groupItems]) => (
          <section key={category}>
            <h2 className="bg-paper px-5 py-2.5 text-meta font-bold tracking-wide text-ink-faint uppercase">
              {category}
            </h2>

            <ul className="divide-y divide-line">
              {groupItems.map((item) => {
                const difference = delta(item);
                const fieldId = `${uid}-${item.id}`;

                return (
                  <li
                    key={item.id}
                    className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3"
                  >
                    <div className="min-w-48 flex-1">
                      <label htmlFor={fieldId} className="text-body font-bold text-ink">
                        {item.name}
                        {/* Counting is done off the shelf labels, and the labels
                            are numbered. Matching the row to the box is the
                            slowest part of a stocktake without this. */}
                        {item.code ? (
                          <span className="ml-2 font-semibold tabular-nums text-ink-faint">
                            #{item.code}
                          </span>
                        ) : null}
                      </label>
                      <p className="text-meta text-ink-soft">
                        {t('stocktakeOnRecord', { qty: item.quantity })}
                        {/* What a person counting actually navigates by. The
                            category groups the list; this says which cupboard
                            to open. */}
                        {item.location ? ` · ${item.location}` : ''}
                      </p>
                    </div>

                    {/* The difference, as it is typed. A stocktake is where a
                        slipped digit does the most damage, and seeing "−90"
                        appear is what catches it before the save. */}
                    <span
                      className={cn(
                        'min-w-16 text-right text-body font-bold tabular-nums',
                        difference === null || difference === 0
                          ? 'text-ink-faint'
                          : difference < 0
                            ? 'text-warn'
                            : 'text-ok',
                      )}
                      aria-live="polite"
                    >
                      {difference === null || difference === 0
                        ? ''
                        : `${difference > 0 ? '+' : '−'}${Math.abs(difference)}`}
                    </span>

                    <input
                      id={fieldId}
                      type="number"
                      min={0}
                      inputMode="numeric"
                      value={shown(item)}
                      onChange={(event) =>
                        setCounts((current) => ({ ...current, [item.id]: event.target.value }))
                      }
                      aria-label={t('stocktakeCountOf', { name: item.name })}
                      className="field-input w-24 py-1.5 text-center tabular-nums"
                    />
                    <span className="w-16 shrink-0 text-meta text-ink-soft">
                      {t('boxes', { count: Number(shown(item)) || 0 })}
                    </span>

                    {difference !== null && difference !== 0 ? (
                      <input type="hidden" name="count" value={`${item.id}:${shown(item)}`} />
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>

      {/* Sticky: the list is longer than a screen, and a save button that has to
          be scrolled to is one that gets forgotten halfway down the room. */}
      <div className="sticky bottom-0 mt-4 flex flex-wrap items-center justify-end gap-3 rounded-xl border border-line bg-surface px-5 py-4 shadow-lg">
        {state.status === 'error' ? (
          <p role="alert" className="mr-auto font-semibold text-danger">
            {state.message}
          </p>
        ) : state.status === 'ok' ? (
          <p role="status" className="mr-auto font-semibold text-ok">
            {t('stocktakeSaved')}
          </p>
        ) : (
          <p className="mr-auto font-semibold text-ink-soft">
            {t('stocktakeChanged', { count: edited.length })}
          </p>
        )}

        <SubmitButton
          label={tc('save')}
          pendingLabel={tc('saving')}
          disabled={edited.length === 0}
        />
      </div>
    </form>
  );
}
