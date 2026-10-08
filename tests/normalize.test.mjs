import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { receptionScoring, normalizeTeams, adviceWeekFor, normalizeTransactions } from '../scripts/lib/normalize.mjs';

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

describe('normalizeTransactions', () => {
  const teams = [{ id: 1, name: 'Alpha' }, { id: 2, name: 'Beta' }];
  const players = new Map([[10, { id: 10, name: 'Ten', position: 'RB', proTeam: 'SEA' }]]);
  const tx = (id, week, date, status = 'EXECUTED', teamId = 1) => ({
    id, type: 'WAIVER', status, teamId, scoringPeriodId: week, proposedDate: date,
    items: [{ playerId: 10, type: 'ADD', fromTeamId: 0, toTeamId: teamId }],
  });

  test('keeps every week, each under its own week, newest first', () => {
    const out = normalizeTransactions({ transactions: [tx('a', 1, 100), tx('b', 3, 300), tx('c', 2, 200), tx('d', 3, 350)] }, players, teams);
    assert.deepEqual(out.map((t) => [t.id, t.scoringPeriodId]), [['d', 3], ['b', 3], ['c', 2], ['a', 1]]);
  });
  test('drops failed and pending claims', () => {
    const out = normalizeTransactions({ transactions: [
      tx('ok', 2, 1), tx('failed', 2, 2, 'FAILED_INVALIDPLAYERSOURCE'), tx('pending', 2, 3, 'PENDING'),
    ] }, players, teams);
    assert.deepEqual(out.map((t) => t.id), ['ok']);
  });
  test('a move fetched twice appears once', () => {
    const out = normalizeTransactions({ transactions: [tx('a', 2, 1), tx('a', 2, 1)] }, players, teams);
    assert.equal(out.length, 1);
    assert.equal(out[0].teamName, 'Alpha');
    assert.equal(out[0].items[0].playerName, 'Ten');
    assert.equal(out[0].date, 1);
  });
});
