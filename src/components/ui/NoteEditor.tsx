'use client';

import { Bold, Eye, Italic, Link2, List, ListOrdered, PenLine } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRef, useState, type ReactNode } from 'react';
import { MarkdownText } from '@/components/ui/MarkdownText';
import { cn } from '@/lib/utils';

/**
 * One toolbar button.
 *
 * `type="button"` is the load-bearing part: this sits inside a form, where a
 * button with no type submits it — so "bold" would save the record.
 */
function ToolButton({
  title,
  icon,
  onClick,
}: {
  title: string;
  icon: ReactNode;
  onClick: () => void;
}) {
  return (
    <button type="button" title={title} onClick={onClick} className="btn btn-ghost btn-sm">
      {icon}
      <span className="sr-only">{title}</span>
    </button>
  );
}

/**
 * The notes field, with enough of an editor to be worth the name.
 *
 * A plain `<textarea>` posting plain text, with a strip of buttons that insert
 * Markdown around the selection and a tab that renders it. That is the entire
 * mechanism — there is no document model, no `contentEditable`, and nothing
 * client-side that has to agree with the server about what the value is, because
 * the value is exactly the characters in the box.
 *
 * The preview renders through the same `MarkdownText` the saved note is drawn
 * with, so what somebody sees while typing cannot drift from what the board
 * prints afterwards. See `markdown.ts` for why this is Markdown and not a rich
 * text editor.
 *
 * Degrades honestly: with the buttons never pressed it is the textarea it
 * replaced, and a note written before any of this existed renders unchanged,
 * because prose with no markers in it *is* valid Markdown.
 */
export function NoteEditor({
  id,
  name,
  label,
  hint,
  optional,
  defaultValue = '',
  maxLength,
  rows = 6,
}: {
  id: string;
  name: string;
  label: string;
  hint?: string;
  optional?: string;
  defaultValue?: string;
  maxLength: number;
  rows?: number;
}) {
  const t = useTranslations('editor');
  const [value, setValue] = useState(defaultValue);
  const [previewing, setPreviewing] = useState(false);
  const box = useRef<HTMLTextAreaElement>(null);

  /**
   * Replace the selection, then put the caret where typing should continue.
   *
   * Restoring the selection has to wait for React to have painted the new value,
   * hence the frame: setting `selectionStart` on the old text would be undone by
   * the re-render a moment later.
   */
  const replace = (from: number, to: number, text: string, caret: number) => {
    const next = value.slice(0, from) + text + value.slice(to);
    if (next.length > maxLength) return;

    setValue(next);
    requestAnimationFrame(() => {
      const node = box.current;
      if (!node) return;
      node.focus();
      node.setSelectionRange(caret, caret);
    });
  };

  /**
   * Wrap the selection in a pair of markers — or, with nothing selected, drop
   * the pair in and park the caret between them, which is what every editor
   * does and what makes the button usable before the words exist.
   */
  const wrap = (marker: string, placeholder: string) => {
    const node = box.current;
    if (!node) return;

    const { selectionStart: from, selectionEnd: to } = node;
    const selected = value.slice(from, to) || placeholder;

    replace(from, to, `${marker}${selected}${marker}`, from + marker.length + selected.length);
  };

  /**
   * Put a marker at the head of every line the selection touches.
   *
   * Line-based rather than selection-based: pressing "list" with the caret in
   * the middle of a line means that line, and pressing it across three means
   * three items. Numbered items are counted from one down the run, which is what
   * `parseMarkdown` reads back.
   */
  const prefixLines = (marker: (index: number) => string) => {
    const node = box.current;
    if (!node) return;

    const start = value.lastIndexOf('\n', node.selectionStart - 1) + 1;
    const endOfLine = value.indexOf('\n', node.selectionEnd);
    const end = endOfLine === -1 ? value.length : endOfLine;

    const lines = (value.slice(start, end) || '').split('\n');
    const marked = lines
      .map((line, index) => {
        // Pressing it twice takes it off again — the button is a toggle, which
        // is the only behaviour that does not strand somebody with `- - item`.
        const bare = line.replace(/^\s*(?:[-*+]|\d+[.)])\s+/, '');
        return bare === line.trim() && line.trim() ? `${marker(index)}${line}` : bare;
      })
      .join('\n');

    replace(start, end, marked, start + marked.length);
  };

  const insertLink = () => {
    const node = box.current;
    if (!node) return;

    const { selectionStart: from, selectionEnd: to } = node;
    const selected = value.slice(from, to) || t('linkText');
    const snippet = `[${selected}](https://)`;

    // Caret lands inside the brackets, on the target, because the address is the
    // half somebody still has to type.
    replace(from, to, snippet, from + snippet.length - 1);
  };

  return (
    <div>
      <label className="field-label" htmlFor={id}>
        {label}
        {optional ? (
          <span className="ml-1.5 font-normal text-ink-faint">({optional})</span>
        ) : null}
      </label>
      {hint ? <p className="mb-1.5 text-[0.9rem] text-ink-soft">{hint}</p> : null}

      <div className="rounded-xl border border-line focus-within:border-line-strong">
        <div className="flex flex-wrap items-center gap-0.5 border-b border-line px-1.5 py-1">
          <ToolButton
            title={t('bold')}
            icon={<Bold size={16} aria-hidden />}
            onClick={() => wrap('**', t('boldText'))}
          />
          <ToolButton
            title={t('italic')}
            icon={<Italic size={16} aria-hidden />}
            onClick={() => wrap('*', t('italicText'))}
          />
          <ToolButton
            title={t('bullets')}
            icon={<List size={16} aria-hidden />}
            onClick={() => prefixLines(() => '- ')}
          />
          <ToolButton
            title={t('numbers')}
            icon={<ListOrdered size={16} aria-hidden />}
            onClick={() => prefixLines((index) => `${index + 1}. `)}
          />
          <ToolButton
            title={t('link')}
            icon={<Link2 size={16} aria-hidden />}
            onClick={insertLink}
          />

          <span className="flex-1" />

          <button
            type="button"
            onClick={() => setPreviewing((on) => !on)}
            aria-pressed={previewing}
            className={cn('btn btn-ghost btn-sm', previewing && 'text-accent')}
          >
            {previewing ? <PenLine size={16} aria-hidden /> : <Eye size={16} aria-hidden />}
            {previewing ? t('write') : t('preview')}
          </button>
        </div>

        {previewing ? (
          // Matched to the textarea's height so toggling does not make the
          // dialog jump under the pointer.
          <div className="min-h-32 px-3 py-2 text-ink" style={{ minHeight: `${rows * 1.6}rem` }}>
            {value.trim() ? (
              <MarkdownText source={value} />
            ) : (
              <p className="text-ink-faint">{t('previewEmpty')}</p>
            )}
          </div>
        ) : null}

        {/* Kept mounted while previewing, and hidden rather than unmounted, so
            the field still posts its value and the browser keeps the undo
            history somebody built up before they pressed preview. */}
        <textarea
          ref={box}
          id={id}
          name={name}
          rows={rows}
          maxLength={maxLength}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          className={cn(
            'w-full resize-y bg-transparent px-3 py-2 text-ink outline-none',
            previewing && 'hidden',
          )}
        />
      </div>

      <p className="mt-1 flex items-center justify-between gap-2 text-[0.85rem] text-ink-faint">
        <span>{t('hint')}</span>
        {/* Only once it is close enough to matter — a counter on an empty box is
            a limit advertised to somebody who was never going to reach it. */}
        {value.length > maxLength * 0.8 ? (
          <span className="tabular-nums">{t('remaining', { count: maxLength - value.length })}</span>
        ) : null}
      </p>
    </div>
  );
}
