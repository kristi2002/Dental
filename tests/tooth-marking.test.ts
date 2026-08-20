import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  applyCondition,
  statusTakesSurfaces,
  TOOTH_STATUSES,
  type ToothCondition,
} from '../src/lib/teeth';

const healthy: ToothCondition = { status: 'HEALTHY', surfaces: '' };
const at = (status: ToothCondition['status'], surfaces = ''): ToothCondition => ({
  status,
  surfaces,
});

/**
 * The marking rule runs twice on every click — once in the browser to draw the
 * change, once on the server to store it. These are the cases where the two
 * would drift apart if it were written out twice instead of shared.
 */
describe('applyCondition — marking a face', () => {
  it('writes the condition onto the face that was clicked', () => {
    assert.deepEqual(applyCondition(healthy, 'CARIES', 'D'), at('CARIES', 'D'));
  });

  it('adds faces rather than replacing them, so MOD is three clicks', () => {
    let tooth = applyCondition(healthy, 'CARIES', 'M');
    tooth = applyCondition(tooth, 'CARIES', 'O');
    tooth = applyCondition(tooth, 'CARIES', 'D');
    assert.deepEqual(tooth, at('CARIES', 'MOD'));
  });

  it('stores the faces in anatomical order however they were clicked', () => {
    let tooth = applyCondition(healthy, 'FILLED', 'D');
    tooth = applyCondition(tooth, 'FILLED', 'M');
    tooth = applyCondition(tooth, 'FILLED', 'O');
    assert.equal(tooth.surfaces, 'MOD', 'so "DOM" and "MOD" are the same record');
  });

  it('takes a face off again when the same tool clicks it twice', () => {
    const mod = at('CARIES', 'MOD');
    assert.deepEqual(applyCondition(mod, 'CARIES', 'O'), at('CARIES', 'MD'));
  });

  it('leaves the tooth healthy once the last face comes off', () => {
    // A caries on no surface is not a finding, and a tooth left flagged with
    // nothing named would be drawn as decay across the whole crown.
    assert.deepEqual(applyCondition(at('CARIES', 'O'), 'CARIES', 'O'), healthy);
  });

  it('replaces rather than merges when a different condition is painted', () => {
    // Painting caries onto a filled tooth means the caries is on that face —
    // not that the old filling grew one.
    assert.deepEqual(applyCondition(at('FILLED', 'MO'), 'CARIES', 'D'), at('CARIES', 'D'));
  });
});

describe('applyCondition — marking the whole tooth', () => {
  it('clears the faces for a condition that has none', () => {
    for (const status of ['EXTRACTED', 'MISSING', 'IMPLANT', 'CROWN'] as const) {
      assert.deepEqual(applyCondition(at('CARIES', 'MOD'), status, null), at(status));
    }
  });

  it('clears them even when a face was the thing clicked', () => {
    // The wheel is still on screen under an extracted tooth. A stray click on
    // it must not record the mesial surface of a tooth that is not there.
    assert.deepEqual(applyCondition(at('CARIES', 'MOD'), 'EXTRACTED', 'M'), at('EXTRACTED'));
  });

  it('carries the faces across when one restoration follows another', () => {
    // The filling goes where the caries was, so painting FILLED on the tooth
    // itself keeps MOD rather than starting again from the whole crown.
    assert.deepEqual(applyCondition(at('CARIES', 'MOD'), 'FILLED', null), at('FILLED', 'MOD'));
  });

  it('has no faces to carry across from a whole-tooth condition', () => {
    assert.deepEqual(applyCondition(at('CROWN'), 'CARIES', null), at('CARIES'));
  });

  it('resets a tooth completely when it is marked healthy', () => {
    assert.deepEqual(applyCondition(at('CARIES', 'MOD'), 'HEALTHY', null), healthy);
    assert.deepEqual(applyCondition(at('CARIES', 'MOD'), 'HEALTHY', 'M'), healthy);
  });
});

describe('applyCondition — what it never produces', () => {
  it('never leaves a surface on a status that cannot carry one', () => {
    for (const status of TOOTH_STATUSES) {
      for (const surface of ['M', 'O', 'D', 'B', 'L'] as const) {
        const result = applyCondition(at('CARIES', 'MOD'), status, surface);
        if (!statusTakesSurfaces(result.status)) {
          assert.equal(result.surfaces, '', `${status} kept "${result.surfaces}"`);
        }
      }
    }
  });

  it('normalises whatever surfaces it was handed', () => {
    // The stored string is trusted as far as this: junk in it is dropped rather
    // than carried forward into the next mark.
    assert.deepEqual(applyCondition(at('CARIES', 'zzOm'), 'CARIES', 'D'), at('CARIES', 'MOD'));
  });

  it('is idempotent on the whole-tooth conditions', () => {
    const twice = applyCondition(applyCondition(healthy, 'IMPLANT', null), 'IMPLANT', null);
    assert.deepEqual(twice, at('IMPLANT'));
  });
});
