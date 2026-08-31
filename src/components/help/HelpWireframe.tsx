import type { ReactNode } from 'react';
import type { HelpShape } from '@/lib/help/topics';
import { cn } from '@/lib/utils';

/**
 * The screen you are standing on, drawn small, with its parts numbered.
 *
 * Explaining an interface in prose alone asks the reader to hold two things at
 * once — the sentence, and where on the screen the sentence is pointing. A
 * numbered drawing removes the second job: ③ in the picture is ③ in the list of
 * steps underneath, and the eye does the matching for free.
 *
 * The drawing carries **no words**. That is deliberate and it is not laziness:
 * a wireframe captioned in English is a wireframe that has to be re-captioned
 * in Albanian and Italian, and captions inside a 200px-tall picture are illegible
 * in all three. Bars and chips say "a row of text" and "a status" perfectly well
 * — the words live in the numbered steps beside it, where there is room for
 * them and where they are already translated.
 *
 * Ten shapes cover thirty-odd screens because this app, like every application,
 * has far fewer *kinds* of screen than it has screens. A list is a list whether
 * it holds materials or laboratories.
 */

/** A line of text that isn't. Widths vary so a stack of them reads as prose. */
function Bar({ w = 'w-24', tone = 'quiet' }: { w?: string; tone?: 'quiet' | 'strong' }) {
  return (
    <span
      aria-hidden
      className={cn(
        'block h-2 rounded-full',
        w,
        tone === 'strong' ? 'bg-ink-faint/55' : 'bg-line-strong',
      )}
    />
  );
}

/** A status pill. */
function Chip({ tone = 'quiet' }: { tone?: 'quiet' | 'brand' | 'warn' | 'danger' | 'ok' }) {
  return (
    <span
      aria-hidden
      className={cn(
        'block h-3.5 w-9 rounded-full',
        tone === 'brand' && 'bg-brand/45',
        tone === 'warn' && 'bg-warn/45',
        tone === 'danger' && 'bg-danger/45',
        tone === 'ok' && 'bg-ok/40',
        tone === 'quiet' && 'bg-line-strong',
      )}
    />
  );
}

/** A control somebody presses. Teal, because in this app that is what a verb is. */
function Btn({ w = 'w-14' }: { w?: string }) {
  return <span aria-hidden className={cn('block h-4 rounded-md bg-brand-dark/75', w)} />;
}

/** A box: a card, a panel, a cell. */
function Box({ children, className }: { children?: ReactNode; className?: string }) {
  return (
    <span className={cn('block rounded-md border border-line bg-surface p-1.5', className)}>
      {children}
    </span>
  );
}

/**
 * The callout itself: the one thing in this drawing that means something.
 *
 * `n` is the step's place in the topic as it was *written*; what gets drawn is
 * its place in the list this particular person is *shown*. Those differ the
 * moment a step is dropped for want of a permission — a receptionist reading
 * the patient record does not get "record a visit", and if the picture still
 * said ⑤ over a region the list below numbered ④, the two halves of one
 * explanation would be pointing at each other and disagreeing.
 *
 * A step nobody was shown draws no callout at all, which is also why a topic
 * written with three steps never puts a ④ on the picture.
 */
function Mark({ n, visible, className }: { n: number; visible: number[]; className?: string }) {
  const shown = visible.indexOf(n);
  if (shown < 0) return null;
  return (
    <span
      aria-hidden
      className={cn(
        'z-10 grid size-5 shrink-0 place-items-center rounded-full bg-brand-dark',
        'text-micro leading-none font-bold text-on-brand ring-2 ring-paper',
        className,
      )}
    >
      {shown + 1}
    </span>
  );
}

function Shape({ shape, visible }: { shape: HelpShape; visible: number[] }) {
  const m = (n: number, className?: string) => (
    <Mark n={n} visible={visible} className={className} />
  );

  switch (shape) {
    case 'dashboard':
      return (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5">
            {m(1)}
            <div className="grid flex-1 grid-cols-4 gap-1.5">
              {[0, 1, 2, 3].map((i) => (
                <Box key={i} className="space-y-1.5">
                  <Bar w="w-8" />
                  <Bar w="w-5" tone="strong" />
                </Box>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-5 gap-2">
            <Box className="col-span-3 space-y-2">
              <div className="flex items-center justify-between">
                <Bar w="w-14" tone="strong" />
                {m(4)}
              </div>
              {[0, 1, 2].map((i) => (
                <span key={i} className="flex items-center gap-1.5">
                  <Bar w="w-6" />
                  <Bar w="w-16" />
                  <Chip tone={i === 0 ? 'brand' : 'quiet'} />
                </span>
              ))}
              <span className="flex items-center gap-1.5">
                {m(5)}
                <span
                  aria-hidden
                  className="block h-3 flex-1 rounded-full border border-dashed border-brand/60"
                />
              </span>
            </Box>
            <Box className="col-span-2 space-y-2">
              <div className="flex items-center justify-between">
                <Bar w="w-10" tone="strong" />
                {m(3)}
              </div>
              <span className="flex items-center gap-1.5">
                <Chip tone="danger" />
                <Bar w="w-10" />
              </span>
              <span className="flex items-center gap-1.5">
                <Chip tone="warn" />
                <Bar w="w-12" />
              </span>
            </Box>
          </div>
          <div className="flex items-center gap-1.5">
            {m(2)}
            <Btn />
            <Btn w="w-16" />
          </div>
        </div>
      );

    case 'calendar':
      return (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5">
              {m(1)}
              <span
                aria-hidden
                className="flex items-center gap-1 rounded-lg border border-line-strong bg-surface p-1"
              >
                <span className="block h-3.5 w-7 rounded bg-brand-dark/75" />
                <span className="block h-3.5 w-7 rounded bg-line-strong" />
                <span className="block h-3.5 w-7 rounded bg-line-strong" />
              </span>
            </span>
            <span className="flex items-center gap-1.5">
              <Bar w="w-16" tone="strong" />
              {m(2)}
            </span>
          </div>
          <div className="grid grid-cols-5 gap-1">
            {[0, 1, 2, 3, 4].map((day) => (
              <Box key={day} className="space-y-1 p-1">
                <Bar w="w-6" />
                {day === 1 ? (
                  <span className="flex items-start gap-1">
                    <span
                      aria-hidden
                      className="block h-8 flex-1 rounded bg-brand/40 ring-1 ring-brand/60"
                    />
                    {m(4, '-ml-3')}
                  </span>
                ) : (
                  <span aria-hidden className="block h-8 rounded bg-brand/20" />
                )}
                {day === 3 ? (
                  <span className="flex items-start gap-1">
                    <span
                      aria-hidden
                      className="block h-5 flex-1 rounded border border-dashed border-brand/60"
                    />
                    {m(5, '-ml-3')}
                  </span>
                ) : (
                  <span aria-hidden className="block h-5 rounded bg-line-strong/50" />
                )}
                <span aria-hidden className="block h-6 rounded bg-brand/20" />
              </Box>
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            {m(3)}
            <Bar w="w-20" />
          </div>
        </div>
      );

    case 'list':
      return (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5">
              {m(1)}
              <span
                aria-hidden
                className="block h-5 w-32 rounded-md border border-line-strong bg-surface"
              />
            </span>
            <span className="flex items-center gap-1.5">
              <Btn />
              {m(2)}
            </span>
          </div>
          <Box className="space-y-0 p-0">
            {[0, 1, 2].map((row) => (
              <span
                key={row}
                className={cn(
                  'flex items-center gap-2 px-2 py-2',
                  row > 0 && 'border-t border-line',
                )}
              >
                {row === 0 ? m(3) : <span aria-hidden className="size-5 shrink-0" />}
                <span aria-hidden className="size-4 shrink-0 rounded-full bg-brand-soft" />
                <span className="min-w-0 flex-1 space-y-1">
                  <Bar w={row === 1 ? 'w-20' : 'w-24'} tone="strong" />
                  <Bar w={row === 2 ? 'w-14' : 'w-16'} />
                </span>
                <span className="flex items-center gap-1.5">
                  <Chip tone={row === 1 ? 'warn' : row === 2 ? 'ok' : 'quiet'} />
                  {row === 1 ? m(4) : null}
                </span>
                <span className="flex items-center gap-1.5">
                  <span aria-hidden className="block h-4 w-4 rounded bg-line-strong" />
                  {row === 2 ? m(5) : null}
                </span>
              </span>
            ))}
          </Box>
        </div>
      );

    case 'record':
      return (
        <div className="space-y-2">
          <div className="flex items-start gap-2">
            {m(1)}
            <Box className="flex flex-1 items-center gap-2">
              <span aria-hidden className="size-8 shrink-0 rounded-full bg-brand-soft" />
              <span className="min-w-0 flex-1 space-y-1.5">
                <Bar w="w-28" tone="strong" />
                <Bar w="w-20" />
              </span>
              <Chip tone="danger" />
            </Box>
          </div>
          <div className="flex items-center gap-1.5">
            {m(2)}
            <span
              aria-hidden
              className="flex flex-1 items-center gap-1 rounded-lg border border-line-strong bg-surface p-1"
            >
              <span className="block h-3.5 flex-1 rounded bg-brand-dark/75" />
              <span className="block h-3.5 flex-1 rounded bg-line-strong" />
              <span className="block h-3.5 flex-1 rounded bg-line-strong" />
              <span className="block h-3.5 flex-1 rounded bg-line-strong" />
            </span>
          </div>
          <div className="grid grid-cols-5 gap-2">
            <Box className="col-span-3 space-y-2">
              <div className="flex items-center justify-between">
                <Bar w="w-16" tone="strong" />
                {m(3)}
              </div>
              <Bar w="w-full" />
              <Bar w="w-4/5" />
              {/* The sixth slot: what is *inside* the tab, as against the panel
                  it sits in. The record is the one screen where two people read
                  completely different halves of the same page, so it is the one
                  shape that needed a region for the other half. */}
              <span className="flex items-center gap-1.5">
                <Bar w="w-2/3" />
                {m(6)}
              </span>
            </Box>
            <Box className="col-span-2 space-y-2">
              <div className="flex items-center justify-between">
                <Bar w="w-10" tone="strong" />
                {m(4)}
              </div>
              <Bar w="w-full" />
              <span className="flex items-center gap-1.5">
                <Btn w="w-12" />
                {m(5)}
              </span>
            </Box>
          </div>
        </div>
      );

    case 'steps':
      return (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            {m(1)}
            <Box className="flex-1 space-y-1.5">
              <Bar w="w-28" tone="strong" />
              <span aria-hidden className="block h-2 w-full rounded-full bg-line-strong">
                <span className="block h-2 w-2/5 rounded-full bg-brand-dark/70" />
              </span>
            </Box>
          </div>
          <Box className="space-y-0 p-0">
            {[0, 1, 2].map((row) => (
              <span
                key={row}
                className={cn(
                  'flex items-center gap-2 px-2 py-2',
                  row > 0 && 'border-t border-line',
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    'grid size-4 shrink-0 place-items-center rounded border',
                    row === 0
                      ? 'border-brand-dark bg-brand-dark/75'
                      : 'border-line-strong bg-surface',
                  )}
                />
                {row === 0 ? m(3) : null}
                <span className="min-w-0 flex-1">
                  <Bar w={row === 0 ? 'w-24' : row === 1 ? 'w-28' : 'w-20'} tone="strong" />
                </span>
                {row === 1 ? m(2) : null}
                <Chip tone={row === 0 ? 'ok' : 'quiet'} />
                <Btn w="w-10" />
              </span>
            ))}
          </Box>
          <div className="flex items-center gap-1.5">
            {m(4)}
            <span
              aria-hidden
              className="block h-4 flex-1 rounded-md border border-dashed border-brand/60"
            />
          </div>
        </div>
      );

    case 'board':
      return (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5">
            {m(1)}
            <div className="grid flex-1 grid-cols-3 gap-1.5">
              <Box className="space-y-1">
                <Bar w="w-4" tone="strong" />
                <Bar w="w-10" />
              </Box>
              <Box className="space-y-1 ring-1 ring-danger/40">
                <Bar w="w-4" tone="strong" />
                <Bar w="w-12" />
              </Box>
              <Box className="space-y-1">
                <Bar w="w-4" tone="strong" />
                <Bar w="w-8" />
              </Box>
            </div>
          </div>
          {[0, 1].map((section) => (
            <div key={section} className="space-y-1.5">
              <span className="flex items-center gap-1.5">
                <Bar w="w-12" tone="strong" />
                {section === 0 ? m(2) : null}
              </span>
              <Box className="space-y-0 p-0">
                {[0, 1].map((row) => (
                  <span
                    key={row}
                    className={cn(
                      'flex items-center gap-2 px-2 py-1.5',
                      row > 0 && 'border-t border-line',
                    )}
                  >
                    {section === 0 && row === 0 ? m(3) : null}
                    <span className="min-w-0 flex-1">
                      <Bar w={row === 0 ? 'w-24' : 'w-20'} />
                    </span>
                    <Chip tone={section === 0 && row === 0 ? 'danger' : 'quiet'} />
                    <span className="flex items-center gap-1.5">
                      <Btn w="w-9" />
                      {section === 1 && row === 1 ? m(4) : null}
                    </span>
                  </span>
                ))}
              </Box>
            </div>
          ))}
        </div>
      );

    case 'gallery':
      return (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5">
            {m(1)}
            <span
              aria-hidden
              className="block h-5 w-32 rounded-md border border-line-strong bg-surface"
            />
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {[0, 1, 2, 3, 4, 5, 6, 7].map((cell) => (
              <Box key={cell} className="space-y-1">
                <span className="flex items-start justify-between gap-1">
                  <span
                    aria-hidden
                    className={cn(
                      'block h-9 flex-1 rounded',
                      cell === 0 ? 'bg-brand/30 ring-1 ring-brand/50' : 'bg-line-strong/45',
                    )}
                  />
                  {cell === 0 ? m(3, '-ml-4') : null}
                  {cell === 3 ? m(4, '-ml-4') : null}
                </span>
                <Bar w="w-10" />
                {cell === 3 ? <Chip tone="warn" /> : <Bar w="w-6" />}
              </Box>
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            {m(2)}
            <Bar w="w-24" />
          </div>
        </div>
      );

    case 'charts':
      return (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5">
              {m(1)}
              <span
                aria-hidden
                className="flex items-center gap-1 rounded-lg border border-line-strong bg-surface p-1"
              >
                <span className="block h-3.5 w-8 rounded bg-brand-dark/75" />
                <span className="block h-3.5 w-8 rounded bg-line-strong" />
              </span>
            </span>
            <span className="flex items-center gap-1.5">
              <Bar w="w-14" />
              {m(2)}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {[0, 1, 2].map((i) => (
              <Box key={i} className="space-y-1">
                <Bar w="w-8" />
                <Bar w="w-6" tone="strong" />
              </Box>
            ))}
          </div>
          {/* A chart, not a row of blocks: the bars need a floor to stand on and
              enough range between them to read as measurements. At a 20px
              spread they all looked the same height, which is a bar chart that
              has stopped being one. */}
          <Box className="flex h-16 items-end gap-1.5">
            {m(3, 'self-start')}
            {[16, 34, 24, 46, 38, 52, 28].map((h, i) => (
              <span
                key={i}
                aria-hidden
                className="block flex-1 rounded-t bg-brand-dark/60"
                style={{ height: `${h}px` }}
              />
            ))}
          </Box>
          <div className="flex items-center gap-1.5">
            {m(4)}
            <Bar w="w-28" />
          </div>
        </div>
      );

    case 'week':
      return (
        <div className="space-y-2">
          <Box className="space-y-0 p-0">
            {[0, 1, 2, 3].map((row) => (
              <span
                key={row}
                className={cn(
                  'flex items-center gap-2 px-2 py-1.5',
                  row > 0 && 'border-t border-line',
                )}
              >
                {row === 0 ? m(1) : <span aria-hidden className="size-5 shrink-0" />}
                <Bar w="w-12" tone="strong" />
                <span className="flex flex-1 items-center gap-1.5">
                  <span
                    aria-hidden
                    className="block h-4 w-12 rounded border border-line-strong bg-surface"
                  />
                  <span
                    aria-hidden
                    className="block h-4 w-12 rounded border border-line-strong bg-surface"
                  />
                  {row === 0 ? m(2) : null}
                </span>
                <span className="flex items-center gap-1.5">
                  <span
                    aria-hidden
                    className="block h-4 w-16 rounded border border-dashed border-line-strong"
                  />
                  {row === 1 ? m(3) : null}
                </span>
              </span>
            ))}
          </Box>
          <div className="flex items-center justify-end gap-1.5">
            {m(4)}
            <Btn />
          </div>
        </div>
      );

    case 'form':
      return (
        <div className="grid grid-cols-5 gap-2">
          <div className="col-span-3 space-y-2">
            {[0, 1].map((field) => (
              <div key={field} className="space-y-1">
                <span className="flex items-center gap-1.5">
                  <Bar w="w-12" tone="strong" />
                  {field === 0 ? m(1) : null}
                </span>
                <span
                  aria-hidden
                  className="block h-5 w-full rounded-md border border-line-strong bg-surface"
                />
                <span className="flex items-center gap-1.5">
                  <Bar w="w-24" />
                  {field === 1 ? m(2) : null}
                </span>
              </div>
            ))}
            <div className="flex items-center gap-1.5">
              <Btn />
              {m(4)}
            </div>
          </div>
          <Box className="col-span-2 space-y-2 bg-brand-soft/60">
            <span className="flex items-center justify-between">
              <Bar w="w-10" tone="strong" />
              {m(3)}
            </span>
            <Bar w="w-full" />
            <Bar w="w-4/5" />
            <Chip tone="brand" />
          </Box>
        </div>
      );
  }
}

/**
 * The frame, with the teal rail down its left so the picture is recognisably
 * *this* application rather than a generic sketch of a web page.
 */
export function HelpWireframe({
  shape,
  visible,
  label,
}: {
  shape: HelpShape;
  /**
   * The steps this reader is actually shown, as their positions in the topic as
   * written, in the order they appear. `[1, 2, 4]` means the third step was
   * dropped: the region it pointed at loses its callout, and the fourth step's
   * region is numbered ③ to match the list underneath.
   */
  visible: number[];
  /** What the drawing shows, for anybody who cannot see it. */
  label: string;
}) {
  return (
    <figure
      role="img"
      aria-label={label}
      className="overflow-hidden rounded-[var(--radius-card)] border border-line bg-paper"
    >
      <div className="flex">
        <div aria-hidden className="app-rail hidden w-8 shrink-0 sm:block" />
        <div className="min-w-0 flex-1 p-3">
          <Shape shape={shape} visible={visible} />
        </div>
      </div>
    </figure>
  );
}
