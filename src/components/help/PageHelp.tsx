'use client';

import {
  AlarmClock,
  ArrowRight,
  BellRing,
  Boxes,
  Building2,
  CalendarClock,
  CalendarDays,
  CalendarX,
  ChartColumn,
  CircleQuestionMark,
  ClipboardCheck,
  ClipboardList,
  FileText,
  FlaskConical,
  Images,
  Inbox,
  Layers,
  LayoutDashboard,
  Lightbulb,
  ListChecks,
  NotebookPen,
  Package,
  PhoneIncoming,
  QrCode,
  ScanLine,
  ScrollText,
  Send,
  Stethoscope,
  Tags,
  Truck,
  Upload,
  UserCog,
  UserRound,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useId, useRef, useState, useTransition, type ReactNode } from 'react';
import { Link, usePathname } from '@/i18n/navigation';
import { markHelpSeen } from '@/lib/actions/preferences';
import { topicFor } from '@/lib/help/topics';
import { cn } from '@/lib/utils';
import { HelpDiagram } from './HelpDiagram';
import { HelpWireframe } from './HelpWireframe';

/**
 * The question mark in the top corner, and what it opens.
 *
 * One button, in one place, on every signed-in screen. That is the whole design
 * decision worth defending: help attached to a page is help nobody finds twice,
 * because the second time they are on a different page and it was somewhere
 * else. A dentist who learns that the corner answers questions has learnt the
 * whole system, once, and it keeps working on screens they have never opened.
 *
 * Which page it is standing on is read from the pathname rather than passed
 * down — see `topicFor`. That is what keeps this out of fifty-five page files,
 * and it is why a screen nobody has written a topic for shows no button at all
 * rather than a button that opens somebody else's explanation.
 *
 * The panel is not a paragraph of prose. A drawing of this screen with its parts
 * numbered, the same numbers against what each part is for, a drawing of how the
 * thing actually moves through the practice, one worked example with real names
 * in it, and the two or three things people get wrong. In that order, because
 * that is the order somebody standing in front of a screen they do not
 * understand asks the questions in.
 */

/**
 * A face per topic. Where a screen already has a glyph in the navigation rail
 * this is that glyph — the picture in the corner and the picture in the rail
 * being the same drawing is most of what makes the panel feel like it belongs
 * to the page rather than to the help system.
 */
const ICONS: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
  appointments: CalendarDays,
  daySheet: ClipboardCheck,
  patients: Users,
  patientRecord: UserRound,
  plans: ClipboardList,
  planDetail: ListChecks,
  works: FlaskConical,
  workProcedures: Layers,
  labs: Building2,
  prescriptions: NotebookPen,
  prescriptionsIssued: FileText,
  inbox: Inbox,
  requests: PhoneIncoming,
  followUps: AlarmClock,
  recalls: BellRing,
  outbox: Send,
  services: Stethoscope,
  serviceCategories: Tags,
  imports: Upload,
  stock: Package,
  stockCatalog: Images,
  stockLabels: QrCode,
  stockScan: ScanLine,
  stocktake: Boxes,
  stockExpiry: CalendarX,
  stockCategories: Tags,
  suppliers: Truck,
  analytics: ChartColumn,
  settings: CalendarClock,
  staff: UserCog,
  activity: ScrollText,
};

type Step = { title: string; body: string };

/**
 * The `<key>?</key>` in the footer's own sentence.
 *
 * Out here rather than written inline at the call site so it is one function
 * for the life of the module — a renderer defined during render is a new
 * function on every keystroke, and this one is handed to `t.rich`.
 */
const RICH = {
  key: (chunks: ReactNode) => (
    <kbd className="rounded border border-line-strong bg-paper px-1.5 py-0.5 font-sans text-caption font-bold text-ink">
      {chunks}
    </kbd>
  ),
};

/** `t.raw` on a key nobody wrote returns the key itself; this refuses it. */
function list<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

export function PageHelp({
  destinations,
  permissions,
  pointer = false,
  tone = 'surface',
}: {
  /**
   * Every screen this person may open, with its name — the same array the
   * command palette is given. The "where next" links are resolved against it,
   * which permission-filters them for free: a related screen somebody's role
   * cannot open simply does not appear, rather than appearing and refusing.
   */
  destinations: ReadonlyArray<{ href: string; label: string }>;
  /**
   * What this person may do, so the panel stops describing buttons they do not
   * have — see `StepPermissions` in `lib/help/topics.ts`.
   *
   * The whole list rather than a pre-filtered answer, because the filtering is
   * per step and the steps live in the message file the browser already holds.
   * Nothing is disclosed by it: this is the same set of rights the surrounding
   * screen has already been drawn from.
   */
  permissions: readonly string[];
  /**
   * Whether this person has never been shown where the help is.
   *
   * Read from their account, not from a cookie: being told once should be once
   * per person, not once per browser — see `StaffUser.helpSeenAt`.
   */
  pointer?: boolean;
  /** `brand` on the phone's teal bar, `surface` on the pale row. As the bell. */
  tone?: 'surface' | 'brand';
}) {
  const t = useTranslations('help');
  const pathname = usePathname();
  const topic = topicFor(pathname);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const pointerId = useId();
  const [open, setOpen] = useState(false);

  // Dismissed here and then written to the account. Local state as well as the
  // server's answer, because the pointer has to disappear the instant it is
  // pressed rather than a round trip later — the one thing more irritating than
  // an onboarding hint is one that lingers after being dismissed.
  const [pointerGone, setPointerGone] = useState(false);
  const [, startTransition] = useTransition();

  /* Up only while the account says so and nobody has pressed it yet. */
  const showPointer = pointer && !pointerGone;

  function dismissPointer() {
    setPointerGone(true);
    startTransition(() => {
      void markHelpSeen();
    });
  }

  // `?` opens it, the way `Ctrl+K` opens the palette — but never while somebody
  // is typing, because in three of this app's languages the question mark is a
  // character people write.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== '?' || event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (
        target?.isContentEditable ||
        ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName ?? '')
      ) {
        return;
      }
      event.preventDefault();
      setOpen(true);
    }

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);

  // A click on the backdrop reports the dialog itself as its target — the same
  // trick every other modal here uses, and the reason nothing inside needs a
  // `stopPropagation`.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || !open) return;

    const onClick = (event: MouseEvent) => {
      if (event.target === dialog) setOpen(false);
    };

    dialog.addEventListener('click', onClick);
    return () => dialog.removeEventListener('click', onClick);
  }, [open]);

  // Walking to another screen while the panel is open would leave it explaining
  // the screen you just left.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // No topic, no button. See the note on `topicFor`.
  if (!topic) return null;

  const Icon = ICONS[topic.id] ?? CircleQuestionMark;
  const key = `topics.${topic.id}`;

  /*
   * The steps this particular person can actually follow, each carrying the
   * place it held in the topic as written.
   *
   * That second number is what keeps the drawing honest. Dropping "record a
   * visit" for a receptionist renumbers the list from five items to four, and
   * the wireframe has to renumber the region it was pointing at with it — see
   * `HelpWireframe`, which takes these positions and does exactly that.
   *
   * An untagged step is open to everybody, which is the common case: most of
   * what a screen is for is looking at it.
   */
  const steps = list<Step>(t.raw(`${key}.steps`))
    .map((step, index) => ({ step, at: index + 1, needs: topic.steps?.[index] ?? null }))
    .filter(({ needs }) => needs === null || permissions.includes(needs));

  const tips = list<string>(t.raw(`${key}.tips`));
  const related = (topic.related ?? [])
    .map((href) => destinations.find((destination) => destination.href === href))
    .filter((destination): destination is { href: string; label: string } => Boolean(destination));

  return (
    <>
      {/* `relative`, so the pointer below can hang off the button rather than
          off whatever ancestor happens to be positioned. */}
      <div className="relative shrink-0">
        <button
          type="button"
          onClick={() => {
            // Pressing it *is* having found it, so the pointer's job is done
            // whether it was dismissed or acted on.
            if (showPointer) dismissPointer();
            setOpen(true);
          }}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-label={t('button')}
          title={t('button')}
          aria-describedby={showPointer ? pointerId : undefined}
          className={cn(
            'flex min-h-11 min-w-11 items-center justify-center',
            tone === 'brand'
              ? 'on-brand-control rounded-lg focus-visible:outline-white'
              : 'rounded-xl border border-line-strong bg-surface text-ink-soft transition-colors hover:border-brand hover:bg-brand-soft hover:text-brand-deep focus-visible:outline focus-visible:outline-offset-2',
            // Lit while the pointer is up, so the sentence and the thing it is
            // about are obviously the same object.
            showPointer && 'border-brand bg-brand-soft text-brand-deep',
          )}
        >
          <CircleQuestionMark size={20} aria-hidden />
        </button>

        {/*
         * The one time this application asks for attention on its own behalf.
         *
         * Everything else in this feature waits to be pressed, which is the
         * right manners and also the reason it would have been read by nobody:
         * a question mark in a corner is invisible to somebody who has never
         * been told it does anything. So it is pointed at exactly once, per
         * person rather than per browser, and never again.
         *
         * Not a modal, deliberately. A dialog across the middle of the screen on
         * first sign-in is the pattern everybody has learnt to dismiss without
         * reading, and it would be in the way of the work on the morning
         * somebody most wants to get to it. A note beside the button, which is
         * the thing it is about, is read and then gone.
         */}
        {showPointer ? (
          <section
            id={pointerId}
            aria-labelledby={`${pointerId}-title`}
            className={cn(
              'absolute top-full right-0 z-30 mt-2',
              // Hangs from the button's right edge and grows leftwards, so the
              // width has to fit between that edge and the page's own margin.
              // On a phone the row is [search][?][sliders] inside `px-4`, which
              // leaves the button's right edge 72px in from the viewport —
              // 6rem is that plus slack. At 21rem the cap wins on any desktop.
              // Written as a calc rather than measured, because the callout
              // scrolls away with the row it belongs to and a JS-positioned box
              // would have to be told about that.
              'w-[min(21rem,calc(100vw-6rem))]',
              'rounded-[var(--radius-card)] border border-brand bg-surface p-4 text-left shadow-pop',
            )}
          >
            {/* A tail, because the callout is wide enough to sit under three
                buttons and the eye needs telling which one it is about. Two
                borders of a rotated square: the outer edge continues the
                panel's, and the fill hides the panel's own line behind it. */}
            <span
              aria-hidden
              className="absolute -top-[7px] right-[13px] size-3 rotate-45 border-t border-l border-brand bg-surface"
            />
            <h2
              id={`${pointerId}-title`}
              className="mb-1 flex items-center gap-2 text-body font-bold text-ink"
            >
              <CircleQuestionMark size={18} aria-hidden className="shrink-0 text-brand-deep" />
              {t('pointerTitle')}
            </h2>
            <p className="text-meta leading-relaxed text-ink-soft">{t('pointerBody')}</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => {
                  dismissPointer();
                  setOpen(true);
                }}
              >
                {t('pointerOpen')}
              </button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={dismissPointer}>
                {t('pointerDismiss')}
              </button>
            </div>
          </section>
        ) : null}
      </div>

      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        onClose={() => setOpen(false)}
        className={cn(
          'm-auto max-h-[min(90vh,56rem)] w-[min(96vw,54rem)] overflow-visible',
          'rounded-[var(--radius-card)] border border-line bg-surface p-0 text-ink shadow-pop',
        )}
      >
        <div className="flex max-h-[min(90vh,56rem)] flex-col">
          <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4 sm:px-6">
            <div className="flex min-w-0 items-start gap-3">
              <span
                aria-hidden
                className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand-deep"
              >
                <Icon size={22} />
              </span>
              <div className="min-w-0">
                <h2 id={titleId} className="text-title leading-tight font-bold text-ink">
                  {t(`${key}.title`)}
                </h2>
                <p className="mt-0.5 text-meta text-ink-soft">{t(`${key}.tagline`)}</p>
              </div>
            </div>

            <button
              type="button"
              className="btn btn-ghost btn-sm shrink-0"
              aria-label={t('close')}
              onClick={() => setOpen(false)}
            >
              <X size={20} aria-hidden />
            </button>
          </header>

          <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5 sm:px-6">
            {/* What it is, said once, in the largest text in the panel. Somebody
                who reads only this line should already be able to answer "why
                would I ever open this screen". */}
            <p className="text-lead leading-relaxed text-ink">{t(`${key}.what`)}</p>

            {/* The screen, drawn, with its parts numbered — and then the same
                numbers with words against them. Two halves of one explanation,
                so they sit together with nothing between them. */}
            <div className="space-y-4">
              <HelpWireframe
                shape={topic.shape}
                visible={steps.map(({ at }) => at)}
                label={t(`shapes.${topic.shape}`)}
              />

              <ol className="space-y-3">
                {steps.map(({ step }, index) => (
                  <li key={index} className="flex gap-3">
                    <span
                      aria-hidden
                      className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-brand-dark text-caption font-bold text-on-brand"
                    >
                      {index + 1}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-body font-bold text-ink">{step.title}</span>
                      <span className="block text-body leading-relaxed text-ink-soft">
                        {step.body}
                      </span>
                    </span>
                  </li>
                ))}
              </ol>
            </div>

            {/* How the thing itself moves, which is the question the buttons
                never answer on their own. */}
            {topic.diagram ? <HelpDiagram diagram={topic.diagram} /> : null}

            {/* One worked case, with a name and a number in it. The single most
                useful paragraph in the panel, and the reason the rest can stay
                short — an example is what turns "you can filter this list" into
                something somebody can repeat on Monday morning. */}
            <section className="rounded-[var(--radius-card)] border border-brand bg-brand-soft p-4">
              <h3 className="mb-1.5 flex items-center gap-2 text-caption font-bold tracking-wide text-brand-deep uppercase">
                <Lightbulb size={16} aria-hidden />
                {t('example')}
              </h3>
              <p className="text-body leading-relaxed text-ink">{t(`${key}.example`)}</p>
            </section>

            {tips.length > 0 ? (
              <section>
                <h3 className="mb-2 text-caption font-bold tracking-wide text-ink-faint uppercase">
                  {t('tips')}
                </h3>
                <ul className="space-y-2">
                  {tips.map((tip, index) => (
                    <li key={index} className="flex gap-2.5 text-body leading-relaxed text-ink-soft">
                      <span
                        aria-hidden
                        className="mt-1.5 block size-1.5 shrink-0 rounded-full bg-brand"
                      />
                      <span className="min-w-0">{tip}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {related.length > 0 ? (
              <section>
                <h3 className="mb-2 text-caption font-bold tracking-wide text-ink-faint uppercase">
                  {t('related')}
                </h3>
                <ul className="flex flex-wrap gap-2">
                  {related.map((destination) => (
                    <li key={destination.href}>
                      <Link
                        href={destination.href}
                        onClick={() => setOpen(false)}
                        className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-line-strong bg-surface px-3 py-1.5 text-meta font-semibold text-ink no-underline transition-colors hover:border-brand hover:bg-brand-soft hover:text-brand-deep"
                      >
                        {destination.label}
                        <ArrowRight size={15} aria-hidden />
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>

          <footer className="border-t border-line px-5 py-3 text-meta text-ink-soft sm:px-6">
            {t.rich('footer', RICH)}
          </footer>
        </div>
      </dialog>
    </>
  );
}
