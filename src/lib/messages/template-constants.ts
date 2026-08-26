/**
 * The shape of a message template, and the one limit both sides enforce.
 *
 * Kept apart from `templates.ts` for exactly the reason `file-constants.ts` is
 * kept apart from `files.ts`: the composer is a client component and needs the
 * character limit and the type, while composing itself needs `next-intl/server`.
 * One import of the wrong module and the server half is bundled into the
 * browser — which fails the build if you are lucky, and ships if you are not.
 */

/**
 * The handful of things a practice actually writes to a patient about.
 *
 * Not a template *editor*. A settings screen where somebody composes their own
 * wording sounds like the generous version of this and is the wrong shape for
 * this app: the messages have to exist in three languages, they have to be
 * written in the *patient's* one — see `reminder-messages.ts` for why that was
 * worth fixing — and a free-text box in Settings can only ever hold one
 * language, which quietly undoes the whole arrangement. So the wording lives in
 * `messages/*.json` beside every other sentence the app says, and what the
 * front desk gets is a starting point they can edit before it goes.
 *
 * `FREE` is the escape hatch and deliberately the first one offered: most of
 * what a clinic needs to say is not on any list, and a picker that pretends
 * otherwise makes people fight it.
 */
export const TEMPLATE_IDS = [
  'FREE',
  'RECALL',
  'CONFIRM',
  'RUNNING_LATE',
  'POST_OP',
  'DOCUMENT_READY',
] as const;

export type TemplateId = (typeof TEMPLATE_IDS)[number];

export type ComposedTemplate = {
  id: TemplateId;
  /**
   * What the picker calls it — in the **reader's** language, because the picker
   * is read by whoever is standing at the desk.
   */
  label: string;
  /** Subject and body in the **patient's** language. Both empty for `FREE`. */
  subject: string;
  body: string;
};

export type ComposedTemplates = {
  /** Which language the bodies came out in. Shown when it is not the reader's. */
  locale: string;
  templates: ComposedTemplate[];
};

/**
 * The ceiling on anything typed into the composer.
 *
 * Generous for a message and far below anything that could be used to push a
 * payload through the practice's sending reputation. `Contact.body` is clipped
 * to 2000 by every caller that writes one, so a message longer than this would
 * be stored truncated and the log would stop matching what was sent.
 */
export const MAX_MESSAGE_LENGTH = 2000;
