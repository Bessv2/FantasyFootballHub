import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { receptionScoring } from '../scripts/lib/normalize.mjs';

describe('receptionScoring', () => {
  test('reads receptions from scoringItems, ignoring playerRankType', () => {
    const r = receptionScoring({ playerRankType: 'STANDARD', scoringItems: [{ statId: 53, points: 1 }] });
    assert.deepEqual(r, { isPPR: true, pointsPerReception: 1, scoringLabel: 'PPR' });
  });
  test('half PPR', () => {
    assert.equal(receptionScoring({ scoringItems: [{ statId: 53, points: 0.5 }] }).scoringLabel, 'Half PPR');
  });
  test('no reception item means standard', () => {
    const r = receptionScoring({ scoringItems: [{ statId: 42, points: 0.1 }] });
    assert.equal(r.isPPR, false); assert.equal(r.scoringLabel, 'Standard');
  });
  test('falls back to playerRankType when scoringItems is missing', () => {
    assert.equal(receptionScoring({ playerRankType: 'PPR' }).scoringLabel, 'PPR');
  });
  test('unknown when nothing is present', () => {
    assert.equal(receptionScoring(undefined).scoringLabel, null);
  });
});
