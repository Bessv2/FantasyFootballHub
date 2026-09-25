/**
 * Head-to-head by manager: records must follow the person across seasons even
 * when their team is renamed and ESPN hands them a different team id.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { buildHeadToHead, headToHeadFor, publicManagerKey } from '../scripts/lib/h2h.mjs';

const A = '{AAAAAAAA-0000-0000-0000-000000000001}';
const B = '{BBBBBBBB-0000-0000-0000-000000000002}';
const C = '{CCCCCCCC-0000-0000-0000-000000000003}';

/** teamWeeks rows for one game, both sides. */
function game(week, [h, hs], [a, as], isPlayoff = false) {
  const row = (teamId, score, oppId, oppScore) => ({
    week, teamId, opponentId: oppId, score, opponentScore: oppScore, isPlayoff,
    result: score > oppScore ? 'WIN' : score < oppScore ? 'LOSS' : 'TIE',
  });
  return [row(h, hs, a, as), row(a, as, h, hs)];
}

const decidedWeeks = (n) => Array.from({ length: n }, (_, i) => ({ week: i + 1, played: true, matchups: [{ winner: 'HOME' }] }));

// 2026: A is team 1 "Goblins".
//   W1 A 100 - 90 B    W2 A 80 - 95 C    W3 (playoff) A 110 - 105 B
// 2027: A is now team 5 "Goblin Kings".
//   W1 A 70 - 120 B    W2 A 101 - 100 B
const seasons = [
  {
    year: 2026,
    season: {
      teams: [
        { id: 1, name: 'Goblins', ownerIds: [A], managerName: 'gob' },
        { id: 2, name: 'Humans', ownerIds: [B], managerName: 'hum' },
        { id: 3, name: 'Cats', ownerIds: [C], managerName: 'cat' },
      ],
      weeks: decidedWeeks(3),
    },
    teamWeeks: [...game(1, [1, 100], [2, 90]), ...game(2, [1, 80], [3, 95]), ...game(3, [1, 110], [2, 105], true)],
  },
  {
    year: 2027,
    season: {
      teams: [
        { id: 5, name: 'Goblin Kings', ownerIds: [A], managerName: 'gob' },
        { id: 2, name: 'Humans', ownerIds: [B], managerName: 'hum' },
        { id: 3, name: 'Cats', ownerIds: [C], managerName: 'cat' },
      ],
      weeks: decidedWeeks(2),
    },
    teamWeeks: [...game(1, [5, 70], [2, 120]), ...game(2, [5, 101], [2, 100])],
  },
];

describe('buildHeadToHead', () => {
  const h2h = buildHeadToHead(seasons);

  test('a renamed team with a new id keeps its owner\'s record', () => {
    // A v B regular season, across both years:
    //   2026 W1 win 100-90, 2027 W1 loss 70-120, 2027 W2 win 101-100
    //   -> 2-1, PF 100 + 70 + 101 = 271, PA 90 + 120 + 100 = 310
    assert.deepEqual(h2h.records[A][B].regular, {
      games: 3, wins: 2, losses: 1, ties: 0, pointsFor: 271, pointsAgainst: 310,
    });
    // ...and the 2026 playoff game is kept apart: 1-0, 110-105.
    assert.deepEqual(h2h.records[A][B].playoffs, {
      games: 1, wins: 1, losses: 0, ties: 0, pointsFor: 110, pointsAgainst: 105,
    });
  });

  test('the other side is the mirror image', () => {
    assert.deepEqual(h2h.records[B][A].regular, {
      games: 3, wins: 1, losses: 2, ties: 0, pointsFor: 310, pointsAgainst: 271,
    });
  });

  test('last meeting is the most recent game, in either bucket', () => {
    assert.deepEqual(h2h.records[A][B].lastMeeting, {
      season: 2027, week: 2, isPlayoff: false, result: 'WIN', pointsFor: 101, pointsAgainst: 100,
    });
  });

  test('manager details come from the latest season', () => {
    assert.deepEqual(h2h.managers[A], {
      managerId: A, managerName: 'gob', teamName: 'Goblin Kings', teamId: 5, seasons: [2026, 2027],
    });
  });

  test('a week still in progress is not counted', () => {
    const live = structuredClone(seasons);
    live[1].season.weeks[1].matchups = [{ winner: 'UNDECIDED' }];
    const partial = buildHeadToHead(live);
    assert.equal(partial.records[A][B].regular.games, 2, '2027 Week 2 is still being played');
  });
});

describe('headToHeadFor', () => {
  test('rows by games played, and the rivalry needs two meetings', () => {
    // A has met B four times (3 regular + 1 playoff) and C once.
    const { rows, rivalry } = headToHeadFor(buildHeadToHead(seasons), A);
    assert.deepEqual(rows.map((r) => [r.opponentId, r.games]), [[B, 4], [C, 1]]);
    // Net margin v B: (271 + 110) - (310 + 105) = -34 over 4 games = -8.5.
    assert.deepEqual(rivalry, { opponentId: B, games: 4, avgMargin: -8.5 });
  });

  test('no rivalry after a single meeting', () => {
    const { rivalry } = headToHeadFor(buildHeadToHead(seasons), C);
    assert.equal(rivalry, null);
  });
});

describe('publicManagerKey', () => {
  test('stable, salted, and never shaped like a SWID', () => {
    const key = publicManagerKey(A, '274568741');
    assert.equal(key, publicManagerKey(A, '274568741'));
    assert.notEqual(key, publicManagerKey(A, 'another-league'));
    assert.match(key, /^m-[0-9a-f]{12}$/);
    assert.ok(!key.includes('{'));
  });
});
