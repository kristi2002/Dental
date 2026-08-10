'use client';

import { Check, Copy, MessageCircle, Printer } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

/**
 * Getting the brief off the screen: onto paper, into the clipboard, or into the
 * clinic's group chat. The text is composed on the server so all three carry
 * exactly the same words.
 */
export function DigestActions({ text }: { text: string }) {
  const t = useTranslations('digest');
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be refused; the print and WhatsApp routes still work.
      setCopied(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2" data-print-hide>
      <button type="button" className="btn btn-secondary" onClick={() => window.print()}>
        <Printer size={19} aria-hidden />
        {t('print')}
      </button>

      <button type="button" className="btn btn-secondary" onClick={copy}>
        {copied ? <Check size={19} aria-hidden /> : <Copy size={19} aria-hidden />}
        {copied ? t('copied') : t('copy')}
      </button>

      <a
        href={`https://wa.me/?text=${encodeURIComponent(text)}`}
        target="_blank"
        rel="noopener noreferrer"
        className="btn btn-primary"
      >
        <MessageCircle size={19} aria-hidden />
        {t('send')}
      </a>
    </div>
  );
}
