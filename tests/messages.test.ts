import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { PERMISSIONS } from '../src/lib/auth/permissions';
import { locales } from '../src/i18n/routing';

/**
 * The two ways a translation file goes wrong quietly.
 *
 * `next-intl` does not fail a build over a key it cannot find — it logs
 * `MISSING_MESSAGE` to the console and renders the key path where the words
 * should be. On the practice's own language that means an Albanian screen with
 * `permissions.request.view` written across it, and the only place it is
 * reported is a browser console nobody has open.
 *
 * The end-to-end pass does catch it, because `routes.spec.ts` fails a screen
 * that logs to the console — and that is exactly how the missing labels for
 * `request.view` and `request.edit` were found, two minutes into a browser run,
 * on a screen that has nothing to do with the feature that added them. This
 * suite answers the same question in a few milliseconds and says which key and
 * which language, which is the difference between a fix and an investigation.
 *
 * Deliberately not a full three-way key diff. Locale files legitimately drift in
 * shape — a plural rule that one language needs and another does not — and a
 * test that forbids all difference is a test that gets suppressed. These two
 * checks are the ones where a difference is always a bug.
 */

const MESSAGES = path.join(process.cwd(), 'messages');

async function load(locale: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(path.join(MESSAGES, `${locale}.json`), 'utf8'));
}

/** `permissions.patient.medical.view` → the string, or undefined. */
function lookup(messages: Record<string, unknown>, dotted: string): unknown {
  return dotted
    .split('.')
    .reduce<unknown>(
      (node, part) =>
        typeof node === 'object' && node !== null
          ? (node as Record<string, unknown>)[part]
          : undefined,
      messages,
    );
}

describe('translations', () => {
  /**
   * Every capability in the matrix is rendered as a sentence on the staff
   * screen, in whichever language the person editing roles is working in. A
   * permission added without its wording is a role editor with a key path in the
   * middle of it — and adding a permission is exactly the moment nobody
   * remembers there is a second place to write.
   */
  it('names every permission, in every language', async () => {
    for (const locale of locales) {
      const messages = await load(locale);
      const missing = PERMISSIONS.filter(
        (permission) => typeof lookup(messages, `permissions.${permission}`) !== 'string',
      );
      assert.deepEqual(
        missing,
        [],
        `${locale}.json has no wording for: ${missing.join(', ')}`,
      );
    }
  });

  /**
   * The practice's public page is the one surface a stranger reads, and the
   * Italian one is not a courtesy — a good share of the people who read it are
   * choosing between clinics in three countries. A half-translated storefront
   * shows English to somebody who asked for Italian.
   *
   * Checked against the Albanian file rather than a hand-written list, so a key
   * added to the page tomorrow is covered without anybody updating this test.
   */
  it('writes the whole storefront in every language', async () => {
    const flatten = (value: unknown, prefix = ''): string[] =>
      typeof value === 'object' && value !== null
        ? Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
            flatten(child, prefix ? `${prefix}.${key}` : key),
          )
        : [prefix];

    const source = await load('sq');
    const keys = flatten((source as { site: unknown }).site);
    assert.ok(keys.length > 40, 'the site namespace looks empty — did the lookup path change?');

    for (const locale of locales.filter((other) => other !== 'sq')) {
      const messages = await load(locale);
      const missing = keys.filter(
        (key) => typeof lookup(messages, `site.${key}`) !== 'string',
      );
      assert.deepEqual(missing, [], `${locale}.json is missing site keys: ${missing.join(', ')}`);
    }
  });
});
