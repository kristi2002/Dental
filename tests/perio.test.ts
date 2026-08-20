import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  BUCCAL_SITES,
  formatBleeding,
  formatPockets,
  hasPerio,
  LINGUAL_SITES,
  parseBleeding,
  parseMobility,
  parsePockets,
  perioLayout,
  perioOverview,
  perioSummaryOf,
  pocketBand,
  POCKET_MAX,
  PERIO_SITE_COUNT,
  toPocketDepth,
} from '../src/lib/perio';

describe('toPocketDepth — the one place the range lives', () => {
  it('takes a reading a mouth can produce, typed or numbered', () => {
    assert.equal(toPocketDepth('4'), 4);
    assert.equal(toPocketDepth(' 12 '), 12);
    assert.equal(toPocketDepth(POCKET_MAX), POCKET_MAX);
  });

  it('refuses a zero, because a sulcus that measures nothing does not exist', () => {
    // The reading that started this: 0 passed `Number.isInteger` where the
    // column refused it, so the depth was dropped and its bleeding tick was not.
    assert.equal(toPocketDepth('0'), null);
    assert.equal(toPocketDepth(0), null);
  });

  it('refuses everything else that is not a depth', () => {
    assert.equal(toPocketDepth(POCKET_MAX + 1), null);
    assert.equal(toPocketDepth(-3), null);
    assert.equal(toPocketDepth('abc'), null);
    assert.equal(toPocketDepth(''), null);
    assert.equal(toPocketDepth(null), null);
    assert.equal(toPocketDepth(undefined), null);
    assert.equal(toPocketDepth(3.5), null);
  });

  it('agrees with the column in both directions, for every value', () => {
    // The three callers that have to say the same thing: what `parsePockets`
    // reads, what `formatPockets` writes, and what the save asks before it
    // records a bleeding tick beside a depth.
    for (const raw of ['0', '1', '3', '15', '16', '99', '-1', '', 'x']) {
      const depth = toPocketDepth(raw);
      assert.equal(parsePockets(`${raw},,,,,`)[0], depth, `parsePockets disagrees on "${raw}"`);
      assert.equal(
        formatPockets([depth, null, null, null, null, null]),
        depth === null ? null : `${depth},,,,,`,
        `formatPockets disagrees on "${raw}"`,
      );
    }
  });
});

describe('parsePockets — reading six probe readings off one column', () => {
  it('reads the six sites in the order they were written', () => {
    assert.deepEqual(parsePockets('3,2,3,4,3,2'), [3, 2, 3, 4, 3, 2]);
  });

  it('always answers with six slots, however short the string', () => {
    assert.equal(parsePockets('3,2').length, 6);
    assert.deepEqual(parsePockets('3,2'), [3, 2, null, null, null, null]);
    assert.deepEqual(parsePockets(''), [null, null, null, null, null, null]);
    assert.deepEqual(parsePockets(null), [null, null, null, null, null, null]);
  });

  it('keeps an unprobed site distinct from a shallow one', () => {
    // The gap in the middle is a site nobody probed. Reading it as 0 would put
    // a depth on the chart that no mouth can produce, and would then be
    // averaged in as the healthiest reading there is.
    assert.deepEqual(parsePockets('3,,4,,,2'), [3, null, 4, null, null, 2]);
  });

  it('refuses a reading no mouth produces rather than storing it', () => {
    assert.deepEqual(parsePockets('0,99,-4,abc,,3'), [null, null, null, null, null, 3]);
    assert.equal(parsePockets(`${POCKET_MAX},`)[0], POCKET_MAX, 'the limit itself is a reading');
    assert.equal(parsePockets(`${POCKET_MAX + 1},`)[0], null, 'one past it is a typo');
  });
});

describe('formatPockets — what gets stored', () => {
  it('round-trips an examination through the column it lives in', () => {
    const raw = '3,2,3,4,3,2';
    assert.equal(formatPockets(parsePockets(raw)), raw);
  });

  it('keeps the gaps, so a partial examination stays partial', () => {
    assert.equal(formatPockets(parsePockets('3,,4,,,2')), '3,,4,,,2');
  });

  it('stores nothing at all rather than an empty shape', () => {
    // `",,,,,"` is truthy, and every `if (pockets)` downstream would read a
    // cleared examination as an examination.
    assert.equal(formatPockets([null, null, null, null, null, null]), null);
    assert.equal(formatPockets(parsePockets('0,0,0,0,0,0')), null);
  });
});

describe('bleeding — recorded per site or not at all', () => {
  it('round-trips the mask', () => {
    assert.deepEqual(parseBleeding('001010'), [false, false, true, false, true, false]);
    assert.equal(formatBleeding(parseBleeding('001010')), '001010');
  });

  it('stores nothing when nothing bled', () => {
    assert.equal(formatBleeding([false, false, false, false, false, false]), null);
    assert.deepEqual(parseBleeding(null), [false, false, false, false, false, false]);
  });
});

describe('parseMobility — a grade, or an honest nothing', () => {
  it('reads the four Miller grades, typed or numbered', () => {
    assert.equal(parseMobility(0), 0);
    assert.equal(parseMobility('2'), 2);
    assert.equal(parseMobility(3), 3);
  });

  it('will not invent a grade for a tooth nobody pressed', () => {
    assert.equal(parseMobility(null), null);
    assert.equal(parseMobility(''), null);
    assert.equal(parseMobility(4), null);
    assert.equal(parseMobility(-1), null);
    assert.equal(parseMobility('II'), null, 'the roman numeral is a label, not a value');
  });
});

describe('pocketBand — where watching starts and disease starts', () => {
  it('bands the readings the way the colours do', () => {
    assert.equal(pocketBand(null), 'UNPROBED');
    // Not the healthiest reading there is — the absence of one. The box being
    // typed into can hold a 0 for as long as it takes to press the next key,
    // and colouring it green says a reading was accepted that is about to go.
    assert.equal(pocketBand(0), 'UNPROBED');
    assert.equal(pocketBand(1), 'HEALTHY');
    assert.equal(pocketBand(3), 'HEALTHY');
    assert.equal(pocketBand(4), 'WATCH');
    assert.equal(pocketBand(5), 'WATCH');
    assert.equal(pocketBand(6), 'DISEASED');
    assert.equal(pocketBand(9), 'DISEASED');
  });
});

describe('perioLayout — putting each reading where the mouth puts it', () => {
  it('draws the cheek side away from the bite', () => {
    assert.equal(perioLayout(16).buccalFirst, true, 'an upper tooth hangs down, cheek side up');
    assert.equal(perioLayout(46).buccalFirst, false, 'a lower tooth stands up, cheek side down');
  });

  it('points mesial at the midline', () => {
    // The patient's right-hand quadrants are drawn on the left of the screen,
    // so for them the storage order — distal, buccal, mesial — reads straight
    // across. On the left-hand quadrants it has to be reversed, or the chart
    // records the distobuccal reading in the mesiobuccal corner.
    assert.deepEqual(perioLayout(16).buccal, [...BUCCAL_SITES]);
    assert.deepEqual(perioLayout(26).buccal, [...BUCCAL_SITES].reverse());
    assert.deepEqual(perioLayout(46).lingual, [...LINGUAL_SITES]);
    assert.deepEqual(perioLayout(36).lingual, [...LINGUAL_SITES].reverse());
  });

  it('never loses or repeats a site, whichever corner of the mouth it is', () => {
    for (const toothNum of [11, 21, 31, 41, 18, 28, 38, 48, 55, 65, 75, 85]) {
      const { buccal, lingual } = perioLayout(toothNum);
      assert.deepEqual(
        [...buccal, ...lingual].sort((a, b) => a - b),
        [0, 1, 2, 3, 4, 5],
        `tooth ${toothNum}`,
      );
    }
  });
});

describe('perioSummaryOf — the three questions the chart asks of a tooth', () => {
  it('names the worst reading, which is the one that decides the treatment', () => {
    const summary = perioSummaryOf({ pockets: '3,2,7,3,3,2' });
    assert.equal(summary.deepest, 7);
    assert.equal(summary.probed, 6);
    assert.equal(summary.concerning, true);
  });

  it('counts only what was probed', () => {
    const summary = perioSummaryOf({ pockets: '3,,,,,2' });
    assert.equal(summary.probed, 2);
    assert.equal(summary.deepest, 3);
  });

  it('treats an unexamined tooth as unexamined, not as healthy', () => {
    const summary = perioSummaryOf({});
    assert.equal(summary.recorded, false);
    assert.equal(summary.deepest, null);
    assert.equal(summary.mobility, null);
    assert.equal(summary.concerning, false);
  });

  it('raises a tooth that moves even where every pocket is shallow', () => {
    const summary = perioSummaryOf({ pockets: '2,2,2,2,2,2', mobility: 2 });
    assert.equal(summary.concerning, true, 'a firm socket is not the only way to fail');
  });

  it('does not raise bleeding on its own', () => {
    // Bleeding at a shallow site is a hygiene finding. Flagging it beside a
    // 7mm pocket would make the list of teeth that need attention useless.
    const summary = perioSummaryOf({ pockets: '2,2,2,2,2,2', bleeding: '100000' });
    assert.equal(summary.bleedingCount, 1);
    assert.equal(summary.concerning, false);
    assert.equal(summary.recorded, true);
  });

  it('counts a tooth recorded when only its mobility was', () => {
    assert.equal(perioSummaryOf({ mobility: 0 }).recorded, true);
  });

  it('drops a bleeding tick at a site with no depth beside it', () => {
    // Bleeding is recorded per site *alongside* the depth or not at all, so a
    // mask that outruns the readings is damage rather than a finding. Counting
    // it is how the mouth ends up bleeding at more sites than were probed.
    const summary = perioSummaryOf({ pockets: '3,,4,,,', bleeding: '111111' });
    assert.equal(summary.probed, 2);
    assert.equal(summary.bleedingCount, 2, 'only the two sites that carry a depth');
    assert.deepEqual(summary.bleeding, [true, false, true, false, false, false]);
  });

  it('never reports more bleeding sites than it probed', () => {
    const summary = perioSummaryOf({ pockets: null, bleeding: '111111' });
    assert.equal(summary.bleedingCount, 0);
    assert.equal(summary.recorded, false, 'a mask with no readings under it says nothing');
  });
});

describe('hasPerio — whether a row is carrying an examination', () => {
  it('is what stops clearing a condition from deleting the probing with it', () => {
    assert.equal(hasPerio({ pockets: null, bleeding: null, mobility: null }), false);
    assert.equal(hasPerio({ pockets: '3,2,3,3,2,3' }), true);
    assert.equal(hasPerio({ mobility: 0 }), true, 'a tooth checked and found firm was checked');
  });
});

describe('perioOverview — the mouth as the two numbers it gets reported as', () => {
  it('scores bleeding over the sites actually probed', () => {
    const overview = perioOverview([
      perioSummaryOf({ pockets: '3,2,3,4,3,2', bleeding: '000100' }),
      perioSummaryOf({ pockets: '2,2,2,2,2,2' }),
      // Never probed — it must not dilute the score towards good news.
      perioSummaryOf({}),
    ]);

    assert.equal(overview.teethProbed, 2);
    assert.equal(overview.sitesProbed, 12);
    assert.equal(overview.sitesBleeding, 1);
    assert.equal(overview.bleedingPercent, 8);
    assert.equal(overview.deepest, 4);
    assert.equal(overview.concerning, 1);
  });

  it('cannot report a mouth as bleeding at more than 100% of its sites', () => {
    // What the old arithmetic did: two teeth whose depths were all typed as 0
    // kept their six bleeding ticks each while the depths themselves were
    // dropped, and the score — bleeding sites over *probed* sites — came out at
    // 600%.
    const damaged = perioSummaryOf({ pockets: null, bleeding: '111111' });
    const real = perioSummaryOf({ pockets: '3,2,,,,', bleeding: null });
    const overview = perioOverview([damaged, damaged, real]);

    assert.equal(overview.sitesProbed, 2);
    assert.equal(overview.sitesBleeding, 0);
    assert.equal(overview.bleedingPercent, 0);
  });

  it('keeps the score inside its bounds for any mask the column can hold', () => {
    // The structural version of the same guarantee: whatever is in the two
    // columns, a site cannot bleed without having been probed.
    const masks = ['111111', '101010', '000001', null];
    const depths = ['3,2,3,4,3,2', '3,,4,,,2', '0,0,0,0,0,0', null];

    for (const bleeding of masks) {
      for (const pockets of depths) {
        const overview = perioOverview([perioSummaryOf({ pockets, bleeding })]);
        assert.ok(
          overview.sitesBleeding <= overview.sitesProbed,
          `${pockets} / ${bleeding} bled at more sites than it probed`,
        );
        assert.ok(
          overview.bleedingPercent === null || overview.bleedingPercent <= 100,
          `${pockets} / ${bleeding} scored ${overview.bleedingPercent}%`,
        );
        assert.ok(overview.sitesProbed <= PERIO_SITE_COUNT);
      }
    }
  });

  it('reports no percentage at all for a mouth nobody has probed', () => {
    const overview = perioOverview([perioSummaryOf({}), perioSummaryOf({})]);
    assert.equal(overview.bleedingPercent, null, '0% bleeding would read as good news');
    assert.equal(overview.deepest, null);
    assert.equal(overview.teethProbed, 0);
  });
});
