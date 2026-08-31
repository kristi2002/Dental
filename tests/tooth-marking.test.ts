import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  applyFinding,
  statusTakesSurfaces,
  TOOTH_STATUSES,
  type ToothCondition,
  type ToothFindings,
} from '../src/lib/teeth';

const healthy: ToothFindings = [];
const at = (status: ToothCondition['status'], surfaces = ''): ToothCondition => ({
  status,
  surfaces,
});

/** Order is not significant — the same findings in a different order are the
 *  same tooth — so the comparison sorts before it looks. */
function same(actual: ToothFindings, expected: readonly ToothCondition[]) {
  const key = (list: readonly ToothCondition[]) =>
    [...list].map((f) => `${f.status}:${f.surfaces}`).sort();
  assert.deepEqual(key(actual), key(expected));
}

/**
 * The marking rule runs twice on every click — once in the browser to draw the
 * change, once on the server to store it. These are the cases where the two
 * would drift apart if it were written out twice instead of shared.
 */
describe('applyFinding — marking a face', () => {
  it('writes the finding onto the face that was clicked', () => {
    same(applyFinding(healthy, 'CARIES', 'D'), [at('CARIES', 'D')]);
  });

  it('adds faces rather than replacing them, so MOD is three clicks', () => {
    let tooth = applyFinding(healthy, 'CARIES', 'M');
    tooth = applyFinding(tooth, 'CARIES', 'O');
    tooth = applyFinding(tooth, 'CARIES', 'D');
    same(tooth, [at('CARIES', 'MOD')]);
  });

  it('stores the faces in anatomical order however they were clicked', () => {
    let tooth = applyFinding(healthy, 'FILLED', 'D');
    tooth = applyFinding(tooth, 'FILLED', 'M');
    tooth = applyFinding(tooth, 'FILLED', 'O');
    assert.equal(tooth[0]?.surfaces, 'MOD', 'so "DOM" and "MOD" are the same record');
  });

  it('takes a face off again when the same tool clicks it twice', () => {
    same(applyFinding([at('CARIES', 'MOD')], 'CARIES', 'O'), [at('CARIES', 'MD')]);
  });

  it('leaves the tooth healthy once the last face comes off', () => {
    // A caries on no surface is not a finding, and a tooth left flagged with
    // nothing named would be drawn as decay across the whole crown.
    same(applyFinding([at('CARIES', 'O')], 'CARIES', 'O'), []);
  });
});

/**
 * The rule that changed when a tooth stopped being one status.
 *
 * A tooth used to hold one finding, so painting a filling over caries *became*
 * the filling — right then, and wrong now. A tooth with an old filling on the
 * mesial and fresh decay on the distal is two findings and the commonest reason
 * a tooth is looked at twice; silently converting one into the other would
 * destroy a finding the chart can now hold.
 */
describe('applyFinding — a tooth holding several findings', () => {
  it('keeps the findings already on the tooth', () => {
    same(applyFinding([at('ROOT_CANAL')], 'CROWN', null), [at('CROWN'), at('ROOT_CANAL')]);
  });

  it('records decay on one face of a tooth already filled on another', () => {
    same(applyFinding([at('FILLED', 'M')], 'CARIES', 'D'), [at('FILLED', 'M'), at('CARIES', 'D')]);
  });

  it('gives a face to one finding at a time', () => {
    // The decay was cut out to place the filling. A chart showing both on the
    // same surface is showing a tooth that has never existed.
    same(applyFinding([at('CARIES', 'MOD')], 'FILLED', 'O'), [
      at('FILLED', 'O'),
      at('CARIES', 'MD'),
    ]);
  });

  it('drops a finding whose last face was taken by another', () => {
    same(applyFinding([at('CARIES', 'O')], 'FILLED', 'O'), [at('FILLED', 'O')]);
  });

  it('leaves the faces of findings it did not claim alone', () => {
    same(applyFinding([at('CARIES', 'MD')], 'FILLED', 'B'), [
      at('FILLED', 'B'),
      at('CARIES', 'MD'),
    ]);
  });
});

describe('applyFinding — marking the whole tooth', () => {
  it('adds a whole-tooth finding with no faces on it', () => {
    for (const status of ['CROWN', 'VENEER', 'BRIDGE'] as const) {
      same(applyFinding(healthy, status, null), [at(status)]);
    }
  });

  it('clears the faces even when a face was the thing clicked', () => {
    // The wheel is still on screen under an extracted tooth. A stray click on
    // it must not record the mesial surface of a tooth that is not there.
    same(applyFinding([at('CARIES', 'MOD')], 'EXTRACTED', 'M'), [at('EXTRACTED')]);
  });

  it('resets a tooth completely when it is marked healthy', () => {
    same(applyFinding([at('CARIES', 'MOD'), at('CROWN')], 'HEALTHY', null), []);
    same(applyFinding([at('CARIES', 'MOD')], 'HEALTHY', 'M'), []);
  });

  it('toggles a whole-tooth finding off when it is picked again', () => {
    same(applyFinding([at('CROWN'), at('ROOT_CANAL')], 'CROWN', null), [at('ROOT_CANAL')]);
  });
});

/**
 * Gone is gone. Three findings say the tooth is not there in the ordinary sense,
 * and nothing coexists with them — including each other.
 */
describe('applyFinding — the exclusive findings', () => {
  it('sweeps everything else off the tooth', () => {
    for (const status of ['MISSING', 'EXTRACTED', 'IMPLANT'] as const) {
      same(applyFinding([at('CARIES', 'MOD'), at('CROWN')], status, null), [at(status)]);
    }
  });

  it('replaces one another rather than stacking', () => {
    same(applyFinding([at('MISSING')], 'IMPLANT', null), [at('IMPLANT')]);
    same(applyFinding([at('EXTRACTED')], 'MISSING', null), [at('MISSING')]);
  });

  it('leaves nothing behind when it is toggled off', () => {
    same(applyFinding([at('IMPLANT')], 'IMPLANT', null), []);
  });

  it('is not joined by an ordinary finding painted after it', () => {
    // A tooth that is gone has no faces left to have caries on, so the caries
    // arrives on a tooth the exclusive finding has already emptied.
    same(applyFinding([at('MISSING')], 'CARIES', 'M'), [at('CARIES', 'M')]);
  });
});

describe('applyFinding — what it never produces', () => {
  it('never leaves a surface on a status that cannot carry one', () => {
    for (const status of TOOTH_STATUSES) {
      for (const surface of ['M', 'O', 'D', 'B', 'L'] as const) {
        for (const finding of applyFinding([at('CARIES', 'MOD')], status, surface)) {
          if (!statusTakesSurfaces(finding.status)) {
            assert.equal(finding.surfaces, '', `${status} kept "${finding.surfaces}"`);
          }
        }
      }
    }
  });

  it('never produces HEALTHY as a finding', () => {
    for (const status of TOOTH_STATUSES) {
      for (const finding of applyFinding([at('CARIES', 'MOD')], status, null)) {
        assert.notEqual(finding.status, 'HEALTHY');
      }
    }
  });

  it('never lists the same status twice', () => {
    let tooth = applyFinding(healthy, 'CARIES', 'M');
    tooth = applyFinding(tooth, 'CARIES', 'O');
    tooth = applyFinding(tooth, 'FILLED', 'B');
    tooth = applyFinding(tooth, 'FILLED', 'L');
    const seen = tooth.map((finding) => finding.status);
    assert.equal(new Set(seen).size, seen.length, seen.join(', '));
  });

  it('normalises whatever surfaces it was handed', () => {
    // The stored string is trusted as far as this: junk in it is dropped rather
    // than carried forward into the next mark.
    same(applyFinding([at('CARIES', 'zzOm')], 'CARIES', 'D'), [at('CARIES', 'MOD')]);
  });

  it('is idempotent on the whole-tooth findings', () => {
    const once = applyFinding(healthy, 'IMPLANT', null);
    const thrice = applyFinding(applyFinding(once, 'IMPLANT', null), 'IMPLANT', null);
    same(thrice, once);
  });
});
