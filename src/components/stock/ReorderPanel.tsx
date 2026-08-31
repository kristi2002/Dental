import { Mail, MessageCircle, PackageCheck, ShoppingCart, TrendingDown } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { ActionForm } from '@/components/ui/ActionForm';
import { Badge } from '@/components/ui/Badge';
import { Card, CardHeader } from '@/components/ui/Card';
import { CopyButton } from '@/components/ui/CopyButton';
import { markSupplierOrdered } from '@/lib/actions/stock';
import { mailtoLink, whatsappLink } from '@/lib/reminders';
import type { ReorderLine } from '@/lib/reorder';
import { bySupplier, orderAmount, reorderAsText } from '@/lib/reorder';
import { cn } from '@/lib/utils';

/**
 * The shopping list, cut the way it is actually placed: one order per supplier.
 *
 * Nothing here is ordered automatically — a purchase is the owner's decision.
 * What changed is that the decision is now taken once per company instead of
 * once per material: the message is addressed to the supplier who can fill it,
 * it goes to the number or address already on their record rather than to a
 * blank WhatsApp share sheet, and answering it marks the whole order at once.
 *
 * A server component, because the links are built from the supplier's own
 * details and none of this needs to react to anything in the browser.
 */
export async function ReorderPanel({
  lines,
  canEdit,
}: {
  lines: ReorderLine[];
  /** Whether the "ordered" flag may be set. Viewers get the list, not the verb. */
  canEdit: boolean;
}) {
  const t = await getTranslations('reorder');
  // The order is written in boxes, so the word for one comes from the storage
  // room's strings and is handed to `reorderAsText`, which cannot look it up.
  const ts = await getTranslations('stock');
  const boxes = (count: number) => ts('boxes', { count });

  if (lines.length === 0) return null;

  const groups = bySupplier(lines);

  return (
    <Card className="mb-6">
      <CardHeader
        title={t('title')}
        subtitle={t('subtitle', { count: lines.length })}
        icon={<ShoppingCart size={22} aria-hidden />}
      />

      <div className="divide-y divide-line">
        {groups.map((group) => {
          const text = reorderAsText(group.lines, t('messageHeading'), boxes);
          // Their own number, not a share sheet — `wa.me/` with no number opens
          // a contact picker, which is one more decision at the wrong moment.
          const whatsapp = group.supplierPhone
            ? whatsappLink(group.supplierPhone, text)
            : `https://wa.me/?text=${encodeURIComponent(text)}`;
          const mail = group.supplierEmail
            ? mailtoLink(group.supplierEmail, t('messageHeading'), text)
            : null;

          return (
            <section key={group.supplierId || 'none'}>
              <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 bg-surface-soft px-5 py-3">
                <p className="min-w-0 font-bold text-ink">
                  {group.supplierName || t('noSupplier')}
                  <span className="ml-2 font-normal text-ink-soft">
                    {t('linesInOrder', { count: group.lines.length })}
                  </span>
                </p>

                <div className="flex flex-wrap items-center gap-2">
                  {whatsapp ? (
                    <a
                      href={whatsapp}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-secondary btn-sm"
                    >
                      <MessageCircle size={17} aria-hidden />
                      {t('send')}
                    </a>
                  ) : null}

                  {mail ? (
                    <a href={mail} className="btn btn-secondary btn-sm" title={t('emailHint')}>
                      <Mail size={17} aria-hidden />
                      {t('sendEmail')}
                    </a>
                  ) : null}

                  {/* The one that always works. The mail link above hands the
                      order to whatever this workstation has registered for
                      `mailto:` — which on a browser-only front desk is nothing
                      at all, silently — and the WhatsApp link needs WhatsApp.
                      A supplier reached by neither is reached by pasting this
                      into whatever the practice does use. */}
                  <CopyButton
                    value={text}
                    label={t('copyOrder')}
                    copiedLabel={t('copiedOrder')}
                    className="btn btn-ghost btn-sm"
                    iconSize={17}
                  />

                  {/* Answering the whole order at once. Absent when every line in
                      the group is already on its way — there is nothing left to
                      say yes to. */}
                  {canEdit && group.pendingIds.length > 0 ? (
                    <ActionForm
                      action={markSupplierOrdered}
                      values={{
                        ids: group.pendingIds.join(','),
                        supplierName: group.supplierName,
                      }}
                    >
                      <button type="submit" className="btn btn-secondary btn-sm">
                        <PackageCheck size={17} aria-hidden />
                        {t('markAllOrdered', { count: group.pendingIds.length })}
                      </button>
                    </ActionForm>
                  ) : null}
                </div>
              </header>

              <ul>
                {group.lines.map((line) => (
                  <li
                    key={line.id}
                    className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-line px-5 py-3 last:border-b-0"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-body font-bold text-ink">
                          {line.name}
                        </span>
                        {line.urgent ? <Badge tone="danger">{t('urgent')}</Badge> : null}
                        {/* Already answered: shown, not hidden, so nobody
                            re-orders it and nobody forgets it is still not on
                            the shelf.

                            Past its promised date it is not an answer any more,
                            and painting it the same calm blue was how a
                            delivery that never came read as one that was on its
                            way. The reminder board says the same thing in the
                            same words — three screens showing one order must
                            not disagree about whether it is late. */}
                        {line.orderedAt ? (
                          line.orderLateDays > 0 ? (
                            <Badge tone="danger">
                              {t('onOrderLate', { days: line.orderLateDays })}
                            </Badge>
                          ) : (
                            <Badge tone="brand">{t('onOrder')}</Badge>
                          )
                        ) : null}
                      </p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-meta text-ink-soft">
                        {/* Bulk stock is counted on the shelf every few months,
                            so its burn rate is lumpy and "days left" would be a
                            made-up number. What is on the shelf against the
                            minimum is the only honest thing to show for it. */}
                        {line.stated ? (
                          <span>
                            {t('onShelf', {
                              qty: line.quantity,
                              min: line.minLimit,
                            })}
                          </span>
                        ) : (
                          <>
                            <span className="flex items-center gap-1.5">
                              <TrendingDown size={15} aria-hidden />
                              {t('monthlyUse', { qty: line.monthlyUse })}
                            </span>
                            <span
                              className={cn(
                                line.daysLeft !== null && line.daysLeft <= 14
                                  ? 'font-bold text-warn'
                                  : '',
                              )}
                            >
                              {line.daysLeft === null
                                ? t('noUsage')
                                : t('daysLeft', { days: line.daysLeft })}
                            </span>
                          </>
                        )}
                      </p>
                    </div>

                    <p className="shrink-0 text-right">
                      <span className="block text-lead font-bold text-brand-deep tabular-nums">
                        +{orderAmount(line, boxes)}
                      </span>
                      <span className="block text-meta text-ink-faint">{t('suggested')}</span>
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </Card>
  );
}
