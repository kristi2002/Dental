'use client';

import { FileText, Paperclip, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  ALLOWED_MIME_TYPES,
  formatBytes,
  MAX_REQUEST_FILES,
  MAX_REQUEST_UPLOAD_BYTES,
} from '@/lib/file-constants';

/**
 * "Send us the X-ray you already have."
 *
 * A good share of the people filling this form in are choosing between clinics
 * in three countries, and what they have in their hand is a panoramic from a
 * dentist at home or a quotation from a clinic in Italy. Before this the form
 * took a sentence about it and the desk rang back to ask for the file by email —
 * a second round trip on the enquiry the practice most wants to answer well.
 *
 * **It is one ordinary `<input type="file" multiple name="files">` underneath,
 * and that is load-bearing.** Everything else on this page submits as named
 * fields with no JavaScript on the path, and the moment an upload becomes an
 * `fetch` to some endpoint of its own it stops being part of the same
 * submission: a visitor whose script did not run would be handed a form that
 * silently drops half of what they filled in. So the input is real, it is
 * inside the same `<form>`, and the enhancements below only ever *edit* its
 * `files` list.
 *
 * **What the enhancement buys** is the two things a bare multi-file input cannot
 * do. It cannot add to a selection — picking a second file replaces the first,
 * which is exactly wrong for somebody attaching an X-ray and then remembering
 * the report — and it cannot remove one. Both are done here by rebuilding a
 * `DataTransfer` and assigning it back, which is the only way to write to
 * `input.files`. Where that is unavailable the component quietly stays the plain
 * input it started as.
 *
 * **The limits are checked here and again in the action**, and neither check is
 * redundant: this one exists so somebody finds out before waiting through an
 * upload, and the one in `requestAppointment` exists because this one runs on a
 * machine the practice does not control. The type check is the sharpest example
 * — here it reads `File.type`, which is a guess from the file extension; there
 * it reads the file's own first bytes and believes nothing else.
 */
export function RequestFiles({
  onCountChange,
}: {
  /**
   * How many files are attached, whenever that changes.
   *
   * The confirmation panel replaces this whole form, so by the time it wants to
   * say "and we have your two files" the input is gone. The count is the only
   * part of this component's state anything outside it needs, and handing it up
   * is cheaper than lifting the files themselves into a parent that has no use
   * for them.
   */
  onCountChange?: (count: number) => void;
}) {
  const t = useTranslations('site');
  const uid = useId();

  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [problem, setProblem] = useState<'tooMany' | 'tooLarge' | 'badType' | null>(null);
  const [dragging, setDragging] = useState(false);

  /**
   * Whether this browser lets us write back to `input.files`.
   *
   * Set in an effect rather than read during render, because the server has no
   * `DataTransfer` and a component that renders one thing on the server and
   * another on the client is a hydration mismatch. Until it flips, this is the
   * plain input — which is also exactly what somebody with no JavaScript keeps.
   */
  const [editable, setEditable] = useState(false);
  useEffect(() => setEditable(typeof DataTransfer !== 'undefined'), []);

  const total = useMemo(() => files.reduce((sum, file) => sum + file.size, 0), [files]);

  /**
   * Thumbnails for the images, so somebody can see they attached the right
   * radiograph rather than reading a filename their phone invented.
   *
   * Revoked when the list changes and when the component goes away: an object
   * URL pins the whole file in memory until it is, and these are photographs
   * off a phone.
   */
  const [previews, setPreviews] = useState<Array<string | null>>([]);

  useEffect(() => {
    const urls = files.map((file) =>
      file.type.startsWith('image/') ? URL.createObjectURL(file) : null,
    );
    setPreviews(urls);

    // In the effect rather than in a `useMemo`, deliberately: minting a URL is a
    // side effect, and a render React throws away — which under Strict Mode is
    // every second one — would mint a set nothing is left holding to revoke.
    return () => {
      for (const url of urls) if (url) URL.revokeObjectURL(url);
    };
  }, [files]);

  /**
   * Write a list back to the real input, which is the thing that actually gets
   * submitted. The state is only what this component draws.
   */
  const commit = useCallback((next: File[]) => {
    const input = inputRef.current;
    if (!input || typeof DataTransfer === 'undefined') return;

    const transfer = new DataTransfer();
    for (const file of next) transfer.items.add(file);
    input.files = transfer.files;

    setFiles(next);
    onCountChange?.(next.length);
  }, [onCountChange]);

  /**
   * Merge what was just chosen into what was already there.
   *
   * Duplicates are dropped on name, size and modification time — the same file
   * picked twice is one attachment, and somebody who opens the picker again
   * because they forgot what they had chosen should not end up sending their OPG
   * to the practice twice.
   */
  const accept = useCallback(
    (incoming: FileList | null) => {
      if (!incoming || incoming.length === 0) return;

      if (!editable) {
        // No `DataTransfer`: the browser's own selection is the selection, and
        // the only thing worth doing is telling them if it is over the limit.
        const chosen = [...incoming];
        setFiles(chosen);
        onCountChange?.(chosen.length);
        setProblem(
          chosen.length > MAX_REQUEST_FILES
            ? 'tooMany'
            : chosen.reduce((sum, file) => sum + file.size, 0) > MAX_REQUEST_UPLOAD_BYTES
              ? 'tooLarge'
              : null,
        );
        return;
      }

      const seen = new Set(files.map((file) => `${file.name}:${file.size}:${file.lastModified}`));
      const added = [...incoming].filter(
        (file) => !seen.has(`${file.name}:${file.size}:${file.lastModified}`),
      );

      /**
       * Refuse, and put the input back the way the list shows it.
       *
       * The `commit` is the part that is easy to leave out and wrong to. By the
       * time this runs the browser has *already* replaced `input.files` with
       * whatever was just picked — that is what a change event is — so simply
       * returning would leave the field holding a file the list below does not
       * show and the visitor has just been told cannot be sent. Writing the kept
       * list back is what makes the drawing and the submission agree.
       */
      const refuse = (why: 'tooMany' | 'tooLarge' | 'badType') => {
        setProblem(why);
        commit(files);
      };

      // The browser's `accept` attribute is a filter in the picker, not a rule —
      // a dropped file never passed through it at all.
      if (added.some((file) => !(ALLOWED_MIME_TYPES as readonly string[]).includes(file.type))) {
        return refuse('badType');
      }

      const next = [...files, ...added];
      if (next.length > MAX_REQUEST_FILES) return refuse('tooMany');
      if (next.reduce((sum, file) => sum + file.size, 0) > MAX_REQUEST_UPLOAD_BYTES) {
        return refuse('tooLarge');
      }

      setProblem(null);
      commit(next);
    },
    [commit, editable, files, onCountChange],
  );

  const remove = useCallback(
    (index: number) => {
      setProblem(null);
      commit(files.filter((_, at) => at !== index));
    },
    [commit, files],
  );

  const maxMegabytes = Math.floor(MAX_REQUEST_UPLOAD_BYTES / (1024 * 1024));

  return (
    <div>
      <label htmlFor={`${uid}-files`} className="field-label">
        {t('form.files')}{' '}
        <span className="font-normal text-bone-ink-soft">{t('form.optional')}</span>
      </label>

      <p className="mb-2 text-meta leading-relaxed text-bone-ink-soft">
        {t('form.filesHint', { count: MAX_REQUEST_FILES, max: maxMegabytes })}
      </p>

      {/* The whole panel is a drop target, not just the control inside it. A
          native file input already accepts a drop onto itself; what this adds is
          the eighty per cent of the box that is not the button, which is where
          somebody dragging an X-ray out of a mail client actually lets go. */}
      <div
        className="req-drop"
        data-dragging={dragging || undefined}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        // Only when the pointer has actually left the panel. `dragleave` also
        // fires crossing from the box onto the button inside it, and without
        // this the highlight flickers off and on under a steady hand.
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            setDragging(false);
          }
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          accept(event.dataTransfer.files);
        }}
      >
        <input
          id={`${uid}-files`}
          ref={inputRef}
          name="files"
          type="file"
          multiple
          accept={ALLOWED_MIME_TYPES.join(',')}
          onChange={(event) => accept(event.target.files)}
          className="req-file-input"
        />
        <p aria-hidden className="mt-2 text-meta text-bone-ink-faint">
          {t('form.filesDrop')}
        </p>
      </div>

      {problem ? (
        <p
          role="alert"
          className="mt-2.5 rounded-lg border border-danger bg-danger-soft px-3.5 py-2.5 text-meta font-semibold text-danger"
        >
          {problem === 'tooMany'
            ? t('form.filesTooMany', { max: MAX_REQUEST_FILES })
            : problem === 'tooLarge'
              ? t('form.filesTooLarge', { max: maxMegabytes })
              : t('form.filesType')}
        </p>
      ) : null}

      {/* Announced rather than merely drawn: the list changes in response to a
          file picker closing, which a screen reader has no other way of
          noticing. */}
      <div aria-live="polite">
        {files.length > 0 ? (
          <>
            <p className="mt-3 flex items-center gap-2 text-meta font-semibold text-bone-ink">
              <Paperclip size={15} aria-hidden className="text-gilt-deep" />
              {t('form.filesChosen', { count: files.length, size: formatBytes(total) })}
            </p>

            <ul className="mt-2 grid gap-2">
              {files.map((file, index) => (
                <li
                  key={`${file.name}:${file.size}:${file.lastModified}`}
                  className="req-file"
                >
                  {previews[index] ? (
                    // A blob URL for a file that has not left the browser yet —
                    // `next/image` has nothing to optimise and no loader that
                    // could reach it. `img-src blob:` in the CSP is here for
                    // exactly this.
                    // eslint-disable-next-line next/no-img-element, @next/next/no-img-element
                    <img src={previews[index]} alt="" className="req-file-thumb" />
                  ) : (
                    <span className="req-file-thumb grid place-items-center text-bone-ink-faint">
                      <FileText size={20} aria-hidden />
                    </span>
                  )}

                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold text-bone-ink">
                      {file.name}
                    </span>
                    <span className="block text-meta text-bone-ink-soft">
                      {formatBytes(file.size)}
                    </span>
                  </span>

                  {editable ? (
                    <button
                      type="button"
                      onClick={() => remove(index)}
                      className="req-file-remove"
                    >
                      <X size={16} aria-hidden />
                      <span className="sr-only">{t('form.filesRemove', { name: file.name })}</span>
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </div>
    </div>
  );
}
