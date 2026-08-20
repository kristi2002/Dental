'use client';

import { CalendarDays } from 'lucide-react';
import { useTranslations } from 'next-intl';
import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type InputHTMLAttributes,
  type KeyboardEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';
import { Calendar } from './Calendar';
import { FieldLabel, type FieldWrapper } from './FieldLabel';

/** Room the panel needs on a side before it will hang off it. */
const GAP = 8;

/**
 * Set an input's value the way a person would.
 *
 * React installs its own setter on the element and tracks the last value it
 * saw, so assigning `input.value` directly is invisible to it: a controlled
 * field snaps straight back on the next render, and `onChange` never fires at
 * all. Going through the prototype's setter updates the DOM *and* leaves
 * React's tracker stale, which is exactly what makes the dispatched event look
 * like a real edit.
 *
 * That is what lets this component stay a decoration on top of a plain
 * `<input type="date">` rather than a replacement for one — the seventeen
 * fields around the app that pass `value`/`onChange`, `defaultValue`,
 * `required`, `min` and `max` keep working without knowing it is here.
 */
function edit(input: HTMLInputElement, next: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  setter?.call(input, next);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

/**
 * A date field wearing the app's own calendar instead of the browser's.
 *
 * The control underneath is still `<input type="date">`, untouched: it posts
 * the same `YYYY-MM-DD`, validates `required` and `min`/`max` itself, and can
 * still be typed into a segment at a time by anyone who would rather not reach
 * for the mouse. All that changes is which calendar opens — the native
 * indicator is hidden (see `.field-date` in `globals.css`) and the button in
 * its place opens `Calendar`.
 *
 * Reached through `TextField type="date"` rather than imported directly, so
 * every date in the app is one decision rather than seventeen.
 *
 * Firefox is the exception and degrades gracefully: it has no hook for hiding
 * its own picker, so there it opens as it always has.
 */
export function DateField({
  label,
  hint,
  optional,
  className,
  labelHidden,
  id,
  onChange,
  ...props
}: FieldWrapper & InputHTMLAttributes<HTMLInputElement> & { id: string }) {
  const t = useTranslations('calendar');

  const wrapper = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  const [open, setOpen] = useState(false);
  const [spot, setSpot] = useState<{ top: number; left: number } | null>(null);
  const [host, setHost] = useState<HTMLElement | null>(null);

  // What the panel should show as chosen. A controlled field is the authority
  // on its own value; an uncontrolled one only ever changes through an event,
  // so mirroring those keeps this in step without taking the field over.
  const [mirror, setMirror] = useState(() => String(props.defaultValue ?? props.value ?? ''));
  const value = props.value !== undefined ? String(props.value) : mirror;

  const min = props.min === undefined ? undefined : String(props.min);
  const max = props.max === undefined ? undefined : String(props.max);
  const labelId = `${id}-label`;

  function close({ refocus = true }: { refocus?: boolean } = {}) {
    setOpen(false);
    setSpot(null);
    if (refocus) input.current?.focus();
  }

  // Where the panel lives. Inside a modal dialog it has to be a child of that
  // dialog: the top layer paints over everything else on the page, so a panel
  // sent to `<body>` would sit behind the backdrop of the form that opened it.
  // Anywhere else the body is right — half these fields are inside a scrolling
  // dialog body or a table that clips, and staying put means being cut off.
  useEffect(() => {
    if (!open) return;
    setHost(wrapper.current?.closest('dialog') ?? document.body);
  }, [open]);

  // Below the field unless the bottom of the window is nearer than the panel is
  // tall, and never off either side. `fixed` rather than absolute for the same
  // reason it is portalled: the field's own ancestors are the thing being
  // escaped, and inside a dialog the top layer has no transform, so viewport
  // coordinates still mean the viewport.
  useEffect(() => {
    if (!open) return;

    function place() {
      const field = wrapper.current;
      const box = panel.current;
      if (!field || !box) return;

      const at = field.getBoundingClientRect();
      const height = box.offsetHeight;
      const width = box.offsetWidth;
      const above = window.innerHeight - at.bottom < height + GAP && at.top > height + GAP;
      const top = above ? at.top - GAP - height : at.bottom + GAP;

      // Clamped on both axes, not just across. A field low in a tall dialog can
      // have room for the panel to the pixel and no more, and a calendar whose
      // last row is flush with the bottom of the window reads as cut off even
      // when every day of it is on screen. Overlapping the field by a few pixels
      // is the cheaper of the two.
      setSpot({
        top: Math.max(GAP, Math.min(top, window.innerHeight - height - GAP)),
        left: Math.max(GAP, Math.min(at.left, window.innerWidth - width - GAP)),
      });
    }

    place();
    // Capturing, because the scroll that matters is usually a dialog's own body
    // and a scroll event does not bubble out of the box that scrolled.
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [open, host]);

  useEffect(() => {
    if (!open) return;

    function ours(node: Node) {
      return [wrapper.current, panel.current].some((part) => part?.contains(node));
    }

    function onPointerDown(event: MouseEvent) {
      if (!ours(event.target as Node)) close({ refocus: false });
    }

    // Capturing, and stopped dead. Half these fields sit inside a `<dialog>`,
    // where Escape is the browser's own way of closing the form — and losing a
    // half-typed appointment because the calendar happened to be open is not
    // what anyone pressing it meant.
    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      close();
    }

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, [open]);

  function pick(next: string) {
    if (input.current) edit(input.current, next);
    setMirror(next);
    close();
  }

  function onFieldKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    // The combobox gesture, and only that one: the bare arrows already step the
    // segment under the caret, which is how a date input is meant to be typed.
    if (event.altKey && event.key === 'ArrowDown') {
      event.preventDefault();
      setOpen(true);
    }
  }

  function onFieldChange(event: ChangeEvent<HTMLInputElement>) {
    setMirror(event.target.value);
    onChange?.(event);
  }

  const calendar = open ? (
    <div
      ref={panel}
      id={`${id}-calendar`}
      // Its own, rather than inherited from wherever the field sits: once the
      // panel is portalled it is outside every `data-print-hide` on the page,
      // and a calendar left open is not part of the printed record.
      data-print-hide
      // Laid out first and placed a tick later, so it measures itself out of
      // sight rather than showing up in the corner and jumping.
      //
      // Transparent rather than `visibility: hidden` for that one frame, because
      // the calendar puts focus on its cursor cell as it mounts and a hidden
      // element cannot take focus — the panel would come up placed correctly and
      // dead to the keyboard, which is the whole of what it is for.
      style={{
        top: spot?.top ?? 0,
        left: spot?.left ?? 0,
        opacity: spot ? undefined : 0,
      }}
      className={cn('fixed z-50', !spot && 'pointer-events-none')}
    >
      <Calendar
        value={value}
        min={min}
        max={max}
        labelledBy={labelId}
        onPick={pick}
        onClear={props.required ? undefined : () => pick('')}
        onDismiss={close}
      />
    </div>
  ) : null;

  return (
    <div className={className}>
      <FieldLabel
        htmlFor={id}
        id={labelId}
        label={label}
        hint={hint}
        optional={optional}
        labelHidden={labelHidden}
      />

      <div ref={wrapper} className="relative">
        <input
          {...props}
          ref={input}
          id={id}
          type="date"
          onChange={onFieldChange}
          onKeyDown={onFieldKeyDown}
          className="field-input field-date"
        />

        <button
          type="button"
          // Sitting on top of the input rather than beside it, because the
          // field's box is what the whole app's forms are aligned to and a
          // button in the flow would make this one row taller than its
          // neighbours.
          className={cn(
            'absolute top-1/2 right-1.5 flex size-9 -translate-y-1/2 items-center',
            'justify-center rounded-lg text-ink-soft transition-colors',
            'hover:bg-brand-soft hover:text-brand-deep',
            'disabled:cursor-not-allowed disabled:text-ink-faint disabled:hover:bg-transparent',
          )}
          aria-label={t('open')}
          title={t('open')}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={open ? `${id}-calendar` : undefined}
          disabled={props.disabled}
          onClick={() => (open ? close() : setOpen(true))}
        >
          <CalendarDays size={19} aria-hidden />
        </button>
      </div>

      {host && calendar ? createPortal(calendar, host) : null}
    </div>
  );
}
