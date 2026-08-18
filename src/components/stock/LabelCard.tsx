'use client';

import { X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { PrintLabelsButton } from '@/components/stock/PrintLabelsButton';

/**
 * One sticker on the sheet, and the way to print just that one.
 *
 * The sheet's own button prints everything showing, which is right when a shelf
 * is being labelled in an afternoon and wrong for the case that comes up far
 * more often afterwards: one new material, one sticker, and no wish to put
 * sixty through the printer to get it.
 *
 * So the symbol is a button. Pressing it opens the label on its own, large
 * enough to check before committing paper to it.
 *
 * **What actually prints is this card, not the dialog.** The dialog is a preview
 * and is hidden from the printer; the page's print rules then drop every *other*
 * card, the heading and the filters, which leaves exactly one sticker on the
 * sheet at exactly the size the sheet was set to. Printing the dialog itself
 * would have meant trusting how each browser renders top-layer content on paper,
 * which is the one part of this that is not worth relying on.
 */
export function LabelCard({
  title,
  subtitle,
  footnote,
  children,
}: {
  title: string;
  subtitle: string | null;
  footnote: string | null;
  /** The symbol itself, drawn on the server. See `QrCode`. */
  children: ReactNode;
}) {
  const t = useTranslations('stock');
  const tc = useTranslations('common');

  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const titleId = useId();

  /**
   * Arm the page's single-label print rules for as long as this one is open.
   *
   * On the root element rather than in React state, because the rules have to
   * reach the heading and the *other* cards, which are nowhere near this
   * component. It also means Ctrl+P does the same thing as the button — with a
   * label open on screen, the label is what comes out either way, which is the
   * only behaviour that would not surprise somebody.
   */
  useEffect(() => {
    if (!open) return;

    const root = document.documentElement;
    root.dataset.printSingle = '';
    return () => {
      delete root.dataset.printSingle;
    };
  }, [open]);

  /**
   * Follow the dialog itself, whatever opened or shut it.
   *
   * Watching the `open` attribute rather than listening for `close`, because the
   * event turned out not to be dependable here — neither React's `onClose` prop
   * nor a native `close` listener fired when the dialog was shut, while the
   * attribute changed every time without exception.
   *
   * Worth the belt and braces, because of what a missed close costs. It is not a
   * stuck dialog, which anyone would notice and shrug off; it is a page left
   * armed for single-label printing after the label is gone, so the next press
   * of "print all" quietly yields one sticker — and the only evidence is in the
   * printer, after the paper.
   *
   * The attribute also covers every route out at once: the two buttons, Escape,
   * and anything the browser decides on its own.
   */
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const sync = () => setOpen(dialog.open);
    const observer = new MutationObserver(sync);
    observer.observe(dialog, { attributes: true, attributeFilter: ['open'] });
    sync();

    return () => observer.disconnect();
  }, []);

  /** Shut it, and stand the print rules down without waiting to be told. */
  const close = () => {
    setOpen(false);
    dialogRef.current?.close();
  };

  return (
    <li className="label-card" data-print-one={open ? '' : undefined}>
      {/* The symbol is the target: it is the biggest thing on the card and the
          part somebody is already looking at. */}
      <button
        type="button"
        className="label-trigger"
        title={t('labelPrintThis')}
        aria-label={t('labelPrintThisFor', { name: [title, subtitle].filter(Boolean).join(' ') })}
        onClick={() => {
          setOpen(true);
          dialogRef.current?.showModal();
        }}
      >
        {children}
      </button>

      <p className="label-title">{title}</p>
      {subtitle ? <p className="label-subtitle">{subtitle}</p> : null}
      {footnote ? <p className="label-footnote">{footnote}</p> : null}

      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        className="m-auto w-[min(92vw,26rem)] overflow-visible rounded-[var(--radius-card)] border border-line bg-surface p-0 text-ink shadow-pop"
      >
        <header className="flex items-center justify-between gap-4 border-b border-line px-5 py-4">
          <h2 id={titleId} className="text-xl font-bold">
            {title}
          </h2>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            aria-label={tc('close')}
            onClick={close}
          >
            <X size={20} aria-hidden />
          </button>
        </header>

        <div className="space-y-3 px-5 py-5 text-center">
          {/* Only while it is open: the symbol is one node in the payload either
              way, so this costs nothing to send and keeps sixty spare copies of
              it out of the document. */}
          <div className="mx-auto w-[min(60vw,15rem)] rounded-lg bg-white p-3">
            {open ? children : null}
          </div>

          <div>
            <p className="text-[1.05rem] font-bold text-ink">{title}</p>
            {subtitle ? <p className="font-semibold text-ink-soft">{subtitle}</p> : null}
            {footnote ? <p className="text-[0.95rem] text-ink-faint">{footnote}</p> : null}
          </div>

          <p className="text-[0.95rem] text-ink-soft">{t('labelPrintOneHint')}</p>
        </div>

        <footer className="flex items-center justify-end gap-3 border-t border-line px-5 py-4">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={close}
          >
            {tc('close')}
          </button>
          <PrintLabelsButton label={t('labelPrintThis')} />
        </footer>
      </dialog>
    </li>
  );
}
