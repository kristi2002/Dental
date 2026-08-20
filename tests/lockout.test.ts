import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ATTEMPTS_PER_LOCKOUT,
  LOCKOUT_LADDER_MINUTES,
  attemptsLeft,
  lockoutMinutes,
  shouldLock,
} from '../src/lib/auth/lockout';

/**
 * What a wrong PIN costs.
 *
 * The bug this replaced was not that the lockout was too short — it was that the
 * counter reset when the lock was applied, so the cost never grew. The test that
 * matters here is therefore not any single number but the last one in the file:
 * that guesses per day stop increasing, and stay small.
 */

describe('shouldLock — every fifth failure', () => {
  it('does not lock on the way to five', () => {
    for (const attempts of [1, 2, 3, 4]) {
      assert.equal(shouldLock(attempts), false, `${attempts} should not lock`);
    }
  });

  it('locks on the fifth', () => {
    assert.equal(shouldLock(5), true);
  });

  it('gives five more tries before locking again', () => {
    // Not "five or more": otherwise the first wrong PIN after a lock lapsed
    // would lock again at once, and a dentist who has forgotten their own PIN
    // would never get back in.
    for (const attempts of [6, 7, 8, 9]) {
      assert.equal(shouldLock(attempts), false, `${attempts} should not lock`);
    }
    assert.equal(shouldLock(10), true);
  });

  it('keeps locking at every rung, however far it goes', () => {
    for (const attempts of [15, 20, 25, 100, 1000]) {
      assert.equal(shouldLock(attempts), true, `${attempts} should lock`);
    }
  });

  it('does not lock on zero failures', () => {
    // 0 % 5 === 0, which would have locked a fresh account on sight.
    assert.equal(shouldLock(0), false);
  });
});

describe('lockoutMinutes — the ladder', () => {
  it('starts at five minutes, which is an inconvenience and not a punishment', () => {
    assert.equal(lockoutMinutes(5), 5);
  });

  it('climbs a rung per lockout', () => {
    assert.deepEqual(
      [5, 10, 15, 20, 25].map(lockoutMinutes),
      [...LOCKOUT_LADDER_MINUTES],
    );
  });

  it('holds at the top rung rather than growing without bound', () => {
    const top = LOCKOUT_LADDER_MINUTES.at(-1);
    for (const attempts of [25, 30, 100, 5000]) {
      assert.equal(lockoutMinutes(attempts), top, `${attempts} should sit at the cap`);
    }
  });

  it('never returns less than the first rung, whatever it is handed', () => {
    // Defensive: a caller that asks before the fifth failure should not get a
    // zero-length lockout, which would read as "locked" and let everything past.
    for (const attempts of [0, 1, 4]) {
      assert.equal(lockoutMinutes(attempts), LOCKOUT_LADDER_MINUTES[0]);
    }
  });

  it('is monotonic — a lockout is never shorter than the one before it', () => {
    let previous = 0;
    for (let attempts = 5; attempts <= 200; attempts += ATTEMPTS_PER_LOCKOUT) {
      const minutes = lockoutMinutes(attempts);
      assert.ok(minutes >= previous, `lockout shrank at ${attempts} attempts`);
      previous = minutes;
    }
  });
});

describe('attemptsLeft — the number the wrong-PIN message quotes', () => {
  it('counts down to the lockout', () => {
    assert.deepEqual([1, 2, 3, 4].map(attemptsLeft), [4, 3, 2, 1]);
  });

  it('resets after each lockout, so the message stays truthful past five', () => {
    // It quoted `5 - failedAttempts` before, which went negative the moment the
    // count stopped resetting — "-3 attempts left".
    assert.equal(attemptsLeft(5), ATTEMPTS_PER_LOCKOUT);
    assert.deepEqual([6, 7, 8, 9].map(attemptsLeft), [4, 3, 2, 1]);
    assert.equal(attemptsLeft(10), ATTEMPTS_PER_LOCKOUT);
  });

  it('is never negative and never above the block size', () => {
    for (let attempts = 0; attempts <= 200; attempts++) {
      const left = attemptsLeft(attempts);
      assert.ok(left >= 1 && left <= ATTEMPTS_PER_LOCKOUT, `out of range at ${attempts}`);
    }
  });
});

describe('the ladder actually stops a brute force', () => {
  /** Minutes an attacker must spend to reach `target` wrong guesses. */
  function minutesToReach(target: number): number {
    let minutes = 0;
    for (let attempts = 1; attempts <= target; attempts++) {
      if (shouldLock(attempts)) minutes += lockoutMinutes(attempts);
    }
    return minutes;
  }

  it('leaves the first five tries instant, for the person who mistyped', () => {
    assert.equal(minutesToReach(4), 0);
  });

  /** How many guesses an attacker gets in the first `budgetMinutes`. */
  function guessesWithin(budgetMinutes: number): number {
    let minutes = 0;
    let attempts = 0;
    while (true) {
      const next = attempts + 1;
      const cost = shouldLock(next) ? lockoutMinutes(next) : 0;
      if (minutes + cost > budgetMinutes) return attempts;
      minutes += cost;
      attempts = next;
    }
  }

  it('settles to a handful of guesses a day rather than sixty an hour', () => {
    // The old behaviour was a flat five-minute lock with a resetting counter:
    // five guesses per five minutes, 1 440 a day, for ever. Now a whole year of
    // grinding buys fewer guesses than the old scheme bought before lunch.
    const day = 24 * 60;
    assert.ok(guessesWithin(365 * day) < 2000, 'a year should buy under 2 000 guesses');
    // And the rate is flat at the cap rather than still improving.
    const firstYear = guessesWithin(365 * day);
    const secondYear = guessesWithin(730 * day) - firstYear;
    assert.ok(
      secondYear <= firstYear,
      'the guess rate must not keep growing once the ladder caps',
    );
  });

  it('puts 10 000 guesses — the whole 4-digit space — out of reach', () => {
    const years = minutesToReach(10_000) / (60 * 24 * 365);
    assert.ok(years > 3, `exhausting a 4-digit PIN should take years, takes ${years.toFixed(1)}`);
  });
});
