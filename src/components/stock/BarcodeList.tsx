import { Barcode, ScanBarcode, Unlink } from 'lucide-react';
import { getFormatter, getTranslations } from 'next-intl/server';
import { ActionForm } from '@/components/ui/ActionForm';
import { Badge } from '@/components/ui/Badge';
import { Card, CardHeader } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { unlinkBarcode } from '@/lib/actions/scan';

export type LinkedBarcode = {
  id: string;
  code: string;
  packQty: number;
  label: string;
  createdAt: Date;
};

/**
 * What the scanner has been taught this material is.
 *
 * The one part of the storage room with no screen at all until now. A code is
 * linked from the scan that failed — deliberately, because "the person who knows
 * what the code means is the one holding the carton" — which is also the press
 * most likely to be mis-aimed: eleven composites in a select, read off a screen
 * by somebody with a box in their other hand.
 *
 * A wrong link is not a cosmetic mistake. Every future scan of that carton draws
 * down the wrong shelf, silently, and the only symptom is two counts drifting
 * apart with nothing on any screen to explain why. `unlinkBarcode` has existed —
 * written, guarded, audited — since codes did, and nothing called it, because
 * nothing anywhere listed a material's codes for there to be a button beside.
 *
 * Its own card below the form rather than a field inside it, and the subtitle
 * says why: unlinking happens the moment it is pressed. It is not one of the
 * answers **Save** is collecting, and dressing it as one would leave the reader
 * wondering whether cancelling put the code back.
 */
export async function BarcodeList({ barcodes }: { barcodes: ReadonlyArray<LinkedBarcode> }) {
  const t = await getTranslations('scan');
  const format = await getFormatter();

  return (
    <Card className="mt-6">
      <CardHeader
        title={t('linkedTitle')}
        subtitle={t('linkedSubtitle')}
        icon={<Barcode size={22} aria-hidden />}
      />

      {/* An empty list is not a failure. Most materials are handled by hand and
          carry no code on file, so the sentence says where linking happens
          instead of reporting an absence — this screen is exactly where somebody
          comes looking when a box is not being recognised. */}
      {barcodes.length === 0 ? (
        <EmptyState icon={<ScanBarcode size={40} aria-hidden />} title={t('linkedEmpty')} />
      ) : (
        <ul className="divide-y divide-line">
          {barcodes.map((barcode) => (
            <li
              key={barcode.id}
              className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 py-3.5"
            >
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2">
                  {/* Monospaced and tabular: this is the one string on the
                      screen somebody will compare digit by digit against the
                      number printed under the symbol on the box. */}
                  <span className="font-mono text-body font-bold tracking-tight text-ink tabular-nums">
                    {barcode.code}
                  </span>
                  {/* Only when it is not one. A carton and a single box carry
                      different codes, and one beep is one box in the ordinary
                      case — printing that on every row would bury the rows where
                      it actually matters. */}
                  {barcode.packQty > 1 ? (
                    <Badge tone="brand">{t('linkedPackQty', { qty: barcode.packQty })}</Badge>
                  ) : null}
                  {barcode.label ? <Badge>{barcode.label}</Badge> : null}
                </p>
                <p className="mt-0.5 text-meta text-ink-soft">
                  {t('linkedSince', {
                    date: format.dateTime(barcode.createdAt, {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    }),
                  })}
                </p>
              </div>

              {/* Confirmed, because it is destructive in the quiet way: the row
                  goes, and the next scan of that carton stops being recognised
                  rather than doing something visibly wrong. The code is in the
                  question, so it is answerable by somebody holding the box.

                  No permission branch — the only screen this appears on is
                  already gated on `stock.edit`, which is what `unlinkBarcode`
                  checks for itself anyway. */}
              <ActionForm
                action={unlinkBarcode}
                values={{ id: barcode.id }}
                confirmMessage={t('unlinkConfirm', { code: barcode.code })}
              >
                <button type="submit" className="btn btn-secondary btn-sm">
                  <Unlink size={16} aria-hidden />
                  {t('unlink')}
                </button>
              </ActionForm>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
