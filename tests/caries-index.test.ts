import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  applyFinding,
  cariesIndex,
  PERMANENT_TEETH,
  PRIMARY_TEETH,
  type ToothCondition,
  type ToothFindings,
} from '../src/lib/teeth';

const at = (status: ToothCondition['status'], surfaces = ''): ToothCondition => ({
  status,
  surfaces,
});

/** A mouth, as the chart hands one to `cariesIndex`: a lookup that answers with
 *  no findings for every tooth nobody has written on. */
function mouth(charted: Record<number, ToothFindings>) {
  return (toothNum: number): ToothFindings => charted[toothNum] ?? [];
}

/**
 * The score every dental record in the world is compared by, computed from a
 * chart that was never designed to produce one.
 *
 * The cases here are the ones where a plausible implementation is quietly wrong
 * in a direction nobody would notice: counting a tooth twice, counting a tooth
 * that is not there, or scoring an empty chart as a healthy mouth.
 */
describe('cariesIndex — DMFT', () => {
  it('scores an unexamined mouth as nought over thirty-two, not as healthy', () => {
    const index = cariesIndex(PERMANENT_TEETH, mouth({}));
    assert.equal(index.total, 0);
    // The denominator is what says this is an empty chart rather than a sound
    // mouth. Without it the two are the same number.
    assert.equal(index.counted, 32);
  });

  it('counts a tooth once however many findings are on it', () => {
    const index = cariesIndex(PERMANENT_TEETH, mouth({ 16: [at('CARIES', 'MOD')] }));
    assert.equal(index.decayed, 1);
    assert.equal(index.total, 1);
  });

  it('counts a filled tooth with fresh decay as decayed, not as both', () => {
    // The commonest tooth in an adult mouth, and the one that turns a score of
    // 28 into a score of 42 if each finding is counted on its own.
    const index = cariesIndex(
      PERMANENT_TEETH,
      mouth({ 26: [at('CARIES', 'D'), at('FILLED', 'MO')] }),
    );
    assert.equal(index.decayed, 1);
    assert.equal(index.filled, 0);
    assert.equal(index.total, 1);
  });

  it('counts an implant as a missing tooth, because the tooth is still gone', () => {
    const index = cariesIndex(PERMANENT_TEETH, mouth({ 36: [at('IMPLANT')] }));
    assert.equal(index.missing, 1);
  });

  it('counts a retained root as decay past the point of restoring', () => {
    const index = cariesIndex(PERMANENT_TEETH, mouth({ 47: [at('RETAINED_ROOT')] }));
    assert.equal(index.decayed, 1);
  });

  it('leaves an unerupted tooth out of the count altogether', () => {
    // Not missing: it is there. Scoring it as lost is the mistake the status was
    // added to stop, and it would put a wisdom tooth on every teenager's score.
    const index = cariesIndex(PERMANENT_TEETH, mouth({ 18: [at('IMPACTED')] }));
    assert.equal(index.missing, 0);
    assert.equal(index.total, 0);
    assert.equal(index.counted, 31);
  });

  it('does not score a sealant or a veneer as a restoration', () => {
    // A sealed fissure is prevention on a tooth that was never drilled, and a
    // veneer is usually cosmetic. Both would inflate F on the healthiest mouths
    // in the practice.
    const index = cariesIndex(PERMANENT_TEETH, mouth({ 16: [at('SEALANT', 'O')], 11: [at('VENEER')] }));
    assert.equal(index.filled, 0);
    assert.equal(index.total, 0);
  });

  it('scores crowns, root fillings and dressings as restored', () => {
    const index = cariesIndex(
      PERMANENT_TEETH,
      mouth({ 16: [at('CROWN')], 26: [at('ROOT_CANAL')], 36: [at('TEMPORARY', 'O')] }),
    );
    assert.equal(index.filled, 3);
  });

  it('keeps the milk teeth out of the permanent score and the other way round', () => {
    const charted = mouth({ 16: [at('CARIES', 'O')], 55: [at('CARIES', 'O')] });
    assert.equal(cariesIndex(PERMANENT_TEETH, charted).total, 1);
    assert.equal(cariesIndex(PRIMARY_TEETH, charted).total, 1);
    assert.equal(cariesIndex(PRIMARY_TEETH, charted).counted, 20);
  });

  it('adds up: the total is exactly D plus M plus F', () => {
    const index = cariesIndex(
      PERMANENT_TEETH,
      mouth({
        16: [at('CARIES', 'O')],
        17: [at('MISSING')],
        18: [at('IMPACTED')],
        26: [at('FILLED', 'MO')],
        27: [at('CROWN'), at('ROOT_CANAL')],
      }),
    );
    assert.equal(index.total, index.decayed + index.missing + index.filled);
    assert.deepEqual(
      { d: index.decayed, m: index.missing, f: index.filled },
      { d: 1, m: 1, f: 2 },
    );
  });
});

/**
 * A finding's date and author survive being amended.
 *
 * `applyFinding` runs in the browser to predict what the server will store, and
 * the server carries provenance across a rewrite by status. If the prediction
 * dropped it, the chart would blank the date and the name for as long as the
 * write was in flight and then have them reappear — which reads as the record
 * losing them.
 */
describe('applyFinding — provenance', () => {
  const found: ToothCondition = {
    status: 'CARIES',
    surfaces: 'M',
    on: '12 Mar 2024',
    by: 'Dr Shehu',
  };

  it('keeps the date and the finder when another face is added', () => {
    const [amended] = applyFinding([found], 'CARIES', 'D');
    assert.equal(amended.surfaces, 'MD');
    assert.equal(amended.on, '12 Mar 2024', 'learning more about the same decay does not re-date it');
    assert.equal(amended.by, 'Dr Shehu');
  });

  it('keeps them on a neighbouring finding that loses a face', () => {
    // A filling on the mesial, then decay recorded on the same face: the
    // filling keeps the distal and its own history with it.
    const filling: ToothCondition = {
      status: 'FILLED',
      surfaces: 'MD',
      on: '1 Jan 2020',
      by: 'Dr Berisha',
    };
    const after = applyFinding([filling], 'CARIES', 'M');
    const kept = after.find((finding) => finding.status === 'FILLED');
    assert.equal(kept?.surfaces, 'D');
    assert.equal(kept?.on, '1 Jan 2020');
    assert.equal(kept?.by, 'Dr Berisha');
  });

  it('gives a genuinely new finding none of its own', () => {
    const [fresh] = applyFinding([], 'FRACTURE', 'B');
    assert.equal(fresh.on, undefined, 'the server stamps it; the browser must not invent one');
    assert.equal(fresh.by, undefined);
  });
});
