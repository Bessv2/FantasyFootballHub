import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { receptionScoring, normalizeTeams, adviceWeekFor } from '../scripts/lib/normalize.mjs';

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

describe('normalizeTeams', () => {
  const members = [
    { id: 'A', firstName: 'Real', lastName: 'Person', displayName: 'gridirongoblin' },
    { id: 'B', firstName: 'Other', lastName: 'Human', displayName: '' },
  ];
  test('uses ESPN display name, never first/last', () => {
    const [t] = normalizeTeams([{ id: 1, name: 'Goblins', owners: ['A'] }], members);
    assert.equal(t.managerName, 'gridirongoblin');
    assert.ok(!JSON.stringify(t).includes('Person'));
  });
  test('no display name falls back to team name, not real name', () => {
    const [t] = normalizeTeams([{ id: 2, name: 'Humans', owners: ['B'] }], members);
    assert.equal(t.managerName, 'Humans');
    assert.ok(!JSON.stringify(t).includes('Human '));
  });
});

describe('adviceWeekFor', () => {
  test('advises on the week being played, not the one after', () => {
    // Sunday of Week 3: ESPN is on scoring period 3 until the week is over.
    assert.equal(adviceWeekFor({ latestScoringPeriod: 3, finalScoringPeriod: 17 }), 3);
  });
  test('before the season: Week 1', () => {
    assert.equal(adviceWeekFor({ latestScoringPeriod: 0 }), 1);
    assert.equal(adviceWeekFor(undefined), 1);
  });
  test('never past the final week', () => {
    assert.equal(adviceWeekFor({ latestScoringPeriod: 18, finalScoringPeriod: 17 }), 17);
  });
});
