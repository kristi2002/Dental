import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

/**
 * Every string the messaging code asks for, in every language it may be read in.
 *
 * The failure this prevents is specific and nasty: next-intl renders a missing
 * key *as the key*, so a forgotten line does not throw, does not log, and does
 * not look broken to whoever added it — it looks broken to the patient, who
 * receives an email whose body is `reminders.workEmailBody`. Nothing else in the
 * app can catch that, because the wording is composed on a server with a locale
 * the developer is not using.
 *
 * `tests/outbox.test.ts` already does this for the notes on a queue row. This is
 * the same guard for everything else the outbox grew: four kinds of message, the
 * opt-out page a patient lands on, and the row that describes a held send.
 *
 * Listed by hand rather than scraped from the source. A scraper would have to
 * understand `t(\`kind_${message.kind}\`)`, which is exactly the construction
 * most likely to be missing a case — so the list is the thing being checked,
 * and it is checked against three catalogues that must all agree with it.
 */

const LOCALES = ['en', 'sq', 'it'] as const;

/** Namespace → the keys the code will ask for. Dotted keys walk into a group. */
const REQUIRED: Record<string, string[]> = {
  reminders: [
    // The appointment reminder, which has been here from the beginning.
    'whatsappTemplate',
    'emailSubject',
    'emailBody',
    'confirmAsk',
    // The recall.
    'recallWhatsapp',
    'recallEmailSubject',
    'recallEmailBody',
    // "How are you getting on?", queued now rather than waited for.
    'followUpWhatsapp',
    'followUpEmailSubject',
    'followUpEmailBody',
    // The case back from the laboratory.
    'workWhatsapp',
    'workEmailSubject',
    'workEmailBody',
    // The plan that stopped halfway — with a named next step and without one.
    'planWhatsapp',
    'planWhatsappPlain',
    'planEmailSubject',
    'planEmailBody',
    'planEmailBodyPlain',
    'theTreatment',
    // The way out, on every message the patient did not ask for.
    'optOutAsk',
  ],
  recalls: ['neverVisited'],
  outbox: [
    'kind_APPOINTMENT_REMINDER',
    'kind_RECALL_DUE',
    'kind_POST_OP_CHECK',
    'kind_WORK_READY',
    'kind_PLAN_NEXT_STEP',
    'heldTitle',
    'heldSubtitle',
    'treatedOn',
    'workBack',
    'triedTimes',
    'backAt',
    'emailBounced',
    'bouncedError',
    'lastSeen',
    'neverSeen',
    // One per `ContactChannel`, because the badge is built from the column.
    'prefers_WHATSAPP',
    'prefers_EMAIL',
    'prefers_PHONE',
    'prefers_IN_PERSON',
  ],
  appointments: ['bouncedAddress'],
  contacts: ['emailBounced'],
  reminderBoard: [
    'elsewhere.opened',
    'elsewhereHint.opened',
    'elsewhere.unreminded',
    'elsewhereHint.unreminded',
  ],
  unsubscribe: [
    'title',
    'greeting',
    'intro',
    'optOut',
    'optIn',
    'doneOut',
    'doneIn',
    'stillReachable',
    'invalidTitle',
    'invalidText',
    'tooMany',
    'errorInvalid',
    'errorGeneric',
  ],
};

/** The placeholders a string must carry, or it quietly drops a fact. */
const PLACEHOLDERS: Record<string, string[]> = {
  'reminders.workWhatsapp': ['name', 'work'],
  'reminders.workEmailSubject': ['work'],
  'reminders.workEmailBody': ['name', 'work'],
  'reminders.planWhatsapp': ['name', 'step'],
  'reminders.planWhatsappPlain': ['name', 'plan'],
  'reminders.planEmailBody': ['name', 'plan', 'step'],
  'reminders.planEmailBodyPlain': ['name', 'plan'],
  'reminders.optOutAsk': ['link'],
  'reminders.followUpWhatsapp': ['name', 'days'],
  'reminders.followUpEmailBody': ['name', 'days', 'services'],
  'outbox.treatedOn': ['date'],
  'outbox.workBack': ['work'],
  'outbox.backAt': ['time'],
  'unsubscribe.greeting': ['name'],
  'unsubscribe.intro': ['clinic'],
};

async function catalogue(locale: string): Promise<Record<string, unknown>> {
  const raw = await readFile(path.join(process.cwd(), 'messages', `${locale}.json`), 'utf8');
  return JSON.parse(raw) as Record<string, unknown>;
}

function lookup(source: Record<string, unknown>, dotted: string): unknown {
  return dotted
    .split('.')
    .reduce<unknown>(
      (node, part) =>
        node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined,
      source,
    );
}

describe('every message the app composes has words in every language', () => {
  for (const locale of LOCALES) {
    it(`${locale}.json has all of them`, async () => {
      const messages = await catalogue(locale);

      const missing: string[] = [];
      for (const [namespace, keys] of Object.entries(REQUIRED)) {
        for (const key of keys) {
          const value = lookup(messages, `${namespace}.${key}`);
          if (typeof value !== 'string' || value.trim() === '') {
            missing.push(`${namespace}.${key}`);
          }
        }
      }

      assert.deepEqual(missing, [], `${locale}.json is missing: ${missing.join(', ')}`);
    });

    /**
     * A translation that drops `{work}` still renders — as a sentence with a
     * hole in it, telling somebody their something is ready.
     */
    it(`${locale}.json keeps every placeholder`, async () => {
      const messages = await catalogue(locale);

      const wrong: string[] = [];
      for (const [dotted, names] of Object.entries(PLACEHOLDERS)) {
        const value = lookup(messages, dotted);
        if (typeof value !== 'string') continue;
        for (const name of names) {
          if (!value.includes(`{${name}}`)) wrong.push(`${dotted} has no {${name}}`);
        }
      }

      assert.deepEqual(wrong, [], `${locale}.json: ${wrong.join('; ')}`);
    });
  }

  /**
   * The opt-out line is the one string that must never appear in a WhatsApp
   * message, and the composer decides that — but a translator who helpfully
   * folded the link into `recallWhatsapp` would put a signed URL into the most
   * phishing-shaped place available. Cheap to assert, and it stays asserted.
   */
  it('keeps the opt-out link out of the WhatsApp wording', async () => {
    for (const locale of LOCALES) {
      const messages = await catalogue(locale);
      for (const key of ['recallWhatsapp', 'followUpWhatsapp', 'workWhatsapp', 'planWhatsapp']) {
        const value = String(lookup(messages, `reminders.${key}`) ?? '');
        assert.ok(!value.includes('{link}'), `${locale}: ${key} carries a link`);
      }
    }
  });
});
