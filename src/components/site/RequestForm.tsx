'use client';

import { CalendarCheck, CheckCircle2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useActionState, useEffect, useRef } from 'react';
import { useTopicChoice } from '@/components/site/TopicChoice';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { requestAppointment } from '@/lib/actions/site';
import { IDLE_STATE } from '@/lib/actions/types';
import { REQUEST_LIMITS, REQUEST_TOPICS } from '@/lib/site-content';

/**
 * "Ring me back" — the one thing on this page that writes to the database.
 *
 * It asks for a name, a number, and optionally what it is about. Nothing else,
 * and deliberately nothing clinical: a public box inviting somebody to describe
 * a symptom would collect health data through an unauthenticated form, and this
 * practice has a whole application on the other side of the wall built to hold
 * that properly. The wording asks what treatment they are *interested in*, which
 * is a different question with a different answer.
 *
 * **It does not book anything.** The heading says so and the confirmation says
 * so again, because a form that looks like a booking and turns out to be a
 * callback request is how somebody misses an appointment they thought they had.
 * What it produces is a row on the desk's list; a person rings back and puts
 * them in the book.
 *
 * The `website` field is a honeypot — hidden from people and from assistive
 * technology, left empty by every human being, and filled in by most of the
 * things that are not. `requestAppointment` reports success and writes nothing
 * when it arrives full; a bot told that it failed comes back and tries a
 * different shape.
 */
export function RequestForm({
  idPrefix = 'request',
  anchor = true,
  className = 'card scroll-mt-20 p-6 sm:p-8',
}: {
  /**
   * Namespaces every field id. Two copies of this form live on the page — one
   * in `VisitUs`, one inside `BookDrawer` — and duplicate ids would silently
   * break every `<label for>`: clicking "Telephone number" in the drawer would
   * focus the field in the section behind it.
   */
  idPrefix?: string;
  /**
   * Whether this copy owns `id="request"`. Exactly one may, and it is the one in
   * the page flow — that anchor is what every "book a visit" link points at, and
   * what still works with no JavaScript.
   */
  anchor?: boolean;
  /**
   * The wrapper's classes. Defaults to the page's card; `BookDrawer` passes
   * nothing, because the drawer is already a surface and a card inside a panel
   * is a card inside a panel.
   */
  className?: string;
} = {}) {
  const field = (name: string) => `${idPrefix}-${name}`;
  const t = useTranslations('site');
  const [state, formAction] = useActionState(requestAppointment, IDLE_STATE);
  const headingRef = useRef<HTMLHeadingElement>(null);
  // Shared with `ConcernPicker` at the top of the page: somebody who said what
  // brings them in should find the box already filled in when they get here.
  // Empty until they do, which is what the server renders too.
  const { topic, setTopic } = useTopicChoice();

  // The panel swaps to a confirmation in place, which a screen reader has no way
  // of noticing on its own — the button that was pressed is simply gone. Moving
  // focus to the new heading is what announces it.
  useEffect(() => {
    if (state.status === 'ok') headingRef.current?.focus();
  }, [state]);

  if (state.status === 'ok') {
    return (
      <div id={anchor ? 'request' : undefined} className={className}>
        <CheckCircle2 size={34} aria-hidden className="text-gilt-deep" />
        <h3
          ref={headingRef}
          tabIndex={-1}
          className="mt-4 font-display text-[1.7rem] leading-tight font-normal text-bone-ink"
        >
          {t('form.sentTitle')}
        </h3>
        <p className="mt-3 text-[1.02rem] leading-relaxed text-bone-ink-soft">{t('form.sentBody')}</p>
      </div>
    );
  }

  return (
    <div id={anchor ? 'request' : undefined} className={className}>
      <h3 className="font-display text-[clamp(1.5rem,2.6vw,2rem)] leading-tight font-normal text-bone-ink">
        {t('form.title')}
      </h3>
      <p className="mt-3 text-[1.02rem] leading-relaxed text-bone-ink-soft">{t('form.lede')}</p>

      <form action={formAction} className="mt-7 space-y-5">
        {/* Not a person's field. `hidden` keeps it off the screen and out of the
            accessibility tree; `tabIndex` keeps it out of the keyboard's path
            even if a stylesheet fails to load. */}
        <div className="hidden" aria-hidden>
          <label htmlFor={field('website')}>Website</label>
          <input id={field('website')} name="website" type="text" tabIndex={-1} autoComplete="off" />
        </div>

        <div>
          <label htmlFor={field('name')} className="field-label">
            {t('form.name')}
          </label>
          <input
            id={field('name')}
            name="name"
            required
            maxLength={REQUEST_LIMITS.name}
            autoComplete="name"
            className="field-input"
          />
        </div>

        <div>
          <label htmlFor={field('phone')} className="field-label">
            {t('form.phone')}
          </label>
          <input
            id={field('phone')}
            name="phone"
            type="tel"
            required
            maxLength={REQUEST_LIMITS.phone}
            autoComplete="tel"
            className="field-input"
          />
          <p className="mt-1.5 text-[0.9rem] text-bone-ink-soft">{t('form.phoneHint')}</p>
        </div>

        <div>
          <label htmlFor={field('email')} className="field-label">
            {t('form.email')}{' '}
            <span className="font-normal text-bone-ink-soft">{t('form.optional')}</span>
          </label>
          <input
            id={field('email')}
            name="email"
            type="email"
            maxLength={REQUEST_LIMITS.email}
            autoComplete="email"
            className="field-input"
          />
        </div>

        <div>
          <label htmlFor={field('topic')} className="field-label">
            {t('form.topic')}
          </label>
          {/* Controlled rather than `defaultValue`, and that is the whole reason
              the topic lives in a context: an uncontrolled select cannot be
              changed by something four sections up the page without reaching
              into its DOM. It still submits as an ordinary form field. */}
          <select
            id={field('topic')}
            name="topic"
            value={topic}
            onChange={(event) => setTopic(event.target.value)}
            className="field-input"
          >
            <option value="">{t('form.topicAny')}</option>
            {REQUEST_TOPICS.map((option) => (
              <option key={option} value={option}>
                {t(`topics.${option}`)}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor={field('message')} className="field-label">
            {t('form.message')}{' '}
            <span className="font-normal text-bone-ink-soft">{t('form.optional')}</span>
          </label>
          <textarea
            id={field('message')}
            name="message"
            rows={4}
            maxLength={REQUEST_LIMITS.message}
            className="field-input resize-y"
          />
        </div>

        {state.status === 'error' ? (
          <p
            role="alert"
            className="rounded-lg border border-danger bg-danger-soft px-4 py-3 font-semibold text-danger"
          >
            {state.message}
          </p>
        ) : null}

        {/* Bronze rather than the app's teal: this is the storefront's one call to
            action and it is the same button as the two in the hero. The utility
            classes land in a later layer than `btn-primary`, so they win. */}
        <SubmitButton
          label={t('form.submit')}
          pendingLabel={t('form.submitting')}
          icon={<CalendarCheck size={20} aria-hidden />}
          className="w-full border-gilt bg-gilt text-navy hover:border-gilt hover:bg-gilt"
        />

        <p className="text-[0.88rem] leading-relaxed text-bone-ink-faint">{t('form.privacy')}</p>
      </form>
    </div>
  );
}
