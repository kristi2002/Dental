import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { today, toDay } from '../src/lib/dates';

/**
 * Every "what day is it" answer in this app is supposed to come from `today()`,
 * which reads the wall clock in `CLINIC_TIME_ZONE`. The container runs UTC, so
 * anything deriving a calendar day from `new Date()` instead is answering with
 * the wrong clock for however many hours the offset is — silently, and only near
 * midnight, which is why four separate places had drifted into doing it and
 * nothing noticed.
 *
 * The consequences were not cosmetic: a visit filed on the wrong day and linked
 * to no appointment, a tooth chart attributed to nothing, an expired lot
 * allocated to a patient, and a scanner telling somebody a box was still good.
 *
 * A behavioural test cannot catch this — it only misfires inside the offset
 * window, so it would pass all day and fail at 00:30. So this reads the source
 * instead, the way `backup.test.ts` reads the schema: the rule is about how the
 * day is obtained, and that is visible statically.
 */

const ROOTS = [path.join(process.cwd(), 'src', 'lib'), path.join(process.cwd(), 'src', 'app')];

/** `dates.ts` is where the clinic clock is *defined*, so it is the one exemption. */
const ALLOWED = new Set([path.join('src', 'lib', 'dates.ts')]);

/**
 * Ways of turning "now" into a calendar day that bypass the clinic's timezone.
 * Both are real bugs that were found and fixed, kept here so they cannot return.
 *
 * Deliberately narrow. A `now: Date = new Date()` default is *not* on this list,
 * even though two of the four bugs looked exactly like one: `nextSlotTime` and
 * `parseGs1Date` both take that default and both are right, because the first
 * hands the instant to `clinicMinutesNow` and the second is choosing a century
 * for a two-digit year, which no timezone offset can move. A rule that flagged
 * them would be a rule somebody deletes the third time it cries wolf. What is
 * always wrong is deriving the *day* directly, which is what these two match.
 */
const FORBIDDEN: Array<{ pattern: RegExp; why: string }> = [
  {
    pattern: /toDay\(\s*new Date\(\)\s*\)/,
    why: "`toDay(new Date())` takes the server's UTC day — use `today()`",
  },
  {
    pattern: /setUTCHours\(\s*0\s*,/,
    why: "rounding `new Date()` down to UTC midnight is the server's day — use `today()`",
  },
];

/**
 * The modules whose job is to classify a *day* — is this lot expired, may it be
 * allocated. Their `now` parameter is a day, not an instant, so its default has
 * to be the clinic's. This is where the rule above cannot reach: the mistake
 * there is not in how the day is derived but in which clock the fallback comes
 * from, and it is invisible until it is read next to the body that consumes it.
 */
const DAY_CLASSIFIERS = [
  path.join('src', 'lib', 'expiry.ts'),
  path.join('src', 'lib', 'batch-allocation.ts'),
];

async function sourceFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const out: string[] = [];

  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'generated' || entry.name === 'node_modules') continue;
      out.push(...(await sourceFiles(full)));
    } else if (/\.tsx?$/.test(entry.name)) {
      out.push(full);
    }
  }

  return out;
}

describe('the clinic clock is the only clock', () => {
  it('nothing derives a calendar day from the server clock', async () => {
    const files = (await Promise.all(ROOTS.map(sourceFiles))).flat();
    assert.ok(files.length > 100, `expected the whole tree, saw ${files.length} files`);

    const offences: string[] = [];

    for (const file of files) {
      const relative = path.relative(process.cwd(), file);
      if (ALLOWED.has(relative)) continue;

      const source = await readFile(file, 'utf8');
      // Split on `\r?\n`, not `\n`. The repo checks out CRLF on Windows, and a
      // trailing `\r` is a line terminator to a JS regex — so `//.*$` matched
      // nothing, every comment survived the strip below, and this test's first
      // run reported the sentence describing the bug as the bug.
      for (const line of source.split(/\r?\n/)) {
        // Comments explain these patterns by name — the rule is about code.
        const code = line.replace(/\/\/.*$/, '').replace(/^\s*\*.*$/, '');
        for (const { pattern, why } of FORBIDDEN) {
          if (pattern.test(code)) offences.push(`${relative}: ${why}`);
        }
      }
    }

    assert.deepEqual(offences, [], `\n${offences.join('\n')}\n`);
  });

  it('the modules that classify a day default to the clinic day', async () => {
    for (const relative of DAY_CLASSIFIERS) {
      const source = await readFile(path.join(process.cwd(), relative), 'utf8');

      assert.match(
        source,
        /now\s*:\s*Date\s*=\s*today\(\)/,
        `${relative} should default \`now\` to \`today()\``,
      );
      assert.doesNotMatch(
        source.replace(/\/\/.*/g, ''),
        /now\s*:\s*Date\s*=\s*new Date\(\)/,
        `${relative} still defaults a day to the server clock`,
      );
    }
  });

  /**
   * The property the rule protects, stated directly: a calendar day is one exact
   * value, and normalising one must not move it. `toDay` is applied to whatever
   * callers pass into the expiry helpers, so if it shifted a day produced by
   * `today()` the defaults would be wrong in precisely the zones the rule exists
   * for.
   */
  it('normalising the clinic day leaves it where it is', () => {
    const day = today();
    assert.equal(toDay(day).getTime(), day.getTime());
  });

  it('the clinic day is UTC midnight, so a day is one comparable value', () => {
    const day = today();
    assert.equal(day.getUTCHours(), 0);
    assert.equal(day.getUTCMinutes(), 0);
    assert.equal(day.getUTCSeconds(), 0);
    assert.equal(day.getUTCMilliseconds(), 0);
  });
});
