/**
 * The weekly recap: fixed input, exact expected lines.
 *
 * Which phrasing each line uses is fixed by phraseIndex(week, type) — an FNV
 * hash — so the expected text below names the variant it expects. If a phrase
 * is edited, only that line should change here.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { buildWeeklyRecap, buildRecaps, completedWeeks, phraseIndex } from '../scripts/lib/recap.mjs';

const teams = [
  { id: 1, name: 'Aces' },
  { id: 2, name: 'Bears' },
  { id: 3, name: 'Colts' },
  { id: 4, name: 'Dogs' },
];

/** A played game as two teamWeeks rows. bench: [homeBench, awayBench]. */
function game(week, [h, hs], [a, as], [hb = 0, ab = 0] = []) {
  const row = (teamId, score, oppId, oppScore, bench) => ({
    week, teamId, opponentId: oppId, score, opponentScore: oppScore,
    margin: Number((score - oppScore).toFixed(2)),
    result: score > oppScore ? 'WIN' : score < oppScore ? 'LOSS' : 'TIE',
    optimalScore: score + bench, benchPoints: bench, isPerfectLineup: bench === 0,
  });
  return [row(h, hs, a, as, hb), row(a, as, h, hs, ab)];
}

//   Week 1  Aces 150 - 120 Bears     Colts 100 -  80 Dogs
//   Week 2  Bears 110 -  90 Aces     Dogs  170 - 130 Colts
// Aces left 25 on the bench in Week 2 (best lineup 115, beats Bears' 110);
// Bears 5, Colts 3.
const teamWeeks = [
  ...game(1, [1, 150], [2, 120]),
  ...game(1, [3, 100], [4, 80]),
  ...game(2, [2, 110], [1, 90], [5, 25]),
  ...game(2, [4, 170], [3, 130], [0, 3]),
];

const season = {
  teams,
  weeks: [1, 2].map((week) => ({ week, played: true, matchups: [{ winner: 'HOME' }, { winner: 'HOME' }] })),
};

const challengeWeeks = [
  { week: 2, label: 'Closest to 100', winner: { teamId: 2, teamName: 'Bears', detail: 'scored 110.0, 10.0 away' }, tiedWith: [] },
];

describe('buildWeeklyRecap', () => {
  test('Week 2: every item type, exact text', () => {
    // Power rankings (50% all-play, 30% avg / best avg, 20% recent all-play):
    //   through Week 1: Aces 100, Bears 70.7, Colts 43.3, Dogs 16 -> A B C D
    //   through Week 2 every team is 3-3 all-play (50%); averages A 120,
    //   B 115, C 115, D 125, so D 65, A 63.8, B 62.6, C 62.6 -> D A B C.
    //   Dogs climbed 4th -> 1st, the biggest move.
    // Colts' 130 lost but was 2nd of 4, inside the top half: unluckiest.
    const recap = buildWeeklyRecap(season, 2, { teamWeeks, challengeWeeks });
    assert.deepEqual(recap, {
      week: 2,
      items: [
        // topScore variant 0
        { type: 'topScore', text: 'Dogs put up 170.0, the top score of the week.', teamIds: [4] },
        // blowout variant 2
        { type: 'blowout', text: 'Colts never had a chance against Dogs, losing by 40.0.', teamIds: [4, 3] },
        // closest variant 1
        { type: 'closest', text: 'Photo finish: Bears beat Aces by 20.0.', teamIds: [2, 1] },
        // unluckiest variant 2
        { type: 'unluckiest', text: 'Unluckiest loss: Colts, with the 2nd-highest score (130.0).', teamIds: [3, 4] },
        // lineup variant 1; 90 + 25 = 115 > 110, so the loss would have flipped
        {
          type: 'lineup',
          text: "Lineup regret: Aces' best possible lineup was 25.0 points better — enough to have beaten Bears.",
          teamIds: [1, 2],
        },
        // challenge variant 1
        { type: 'challenge', text: 'Closest to 100: Bears took it (scored 110.0, 10.0 away).', teamIds: [2] },
        // powerMover variant 0
        { type: 'powerMover', text: 'Dogs climbed from 4th to 1st in the power rankings.', teamIds: [4] },
      ],
    });
  });

  test('Week 1: items without data are skipped', () => {
    // No bench points, no challenge, and no earlier week to move from, so
    // lineup, challenge and powerMover are absent. Bears' 120 was 2nd of 4.
    const recap = buildWeeklyRecap(season, 1, { teamWeeks, challengeWeeks });
    assert.deepEqual(recap.items, [
      { type: 'topScore', text: "Nobody topped Aces' 150.0.", teamIds: [1] },
      { type: 'blowout', text: 'Bears never had a chance against Aces, losing by 30.0.', teamIds: [1, 2] },
      { type: 'closest', text: 'Dogs came up just short against Colts, 100.0–80.0.', teamIds: [3, 4] },
      { type: 'unluckiest', text: 'Bears scored 120.0 — 2nd-best of the week — and still lost to Aces.', teamIds: [2, 1] },
    ]);
  });

  test('a low-scoring loss is not called unlucky', () => {
    // Only loser scores 80 of [100, 80]: 2nd of 2 is outside the top half (1).
    const rows = game(1, [1, 100], [2, 80]);
    const recap = buildWeeklyRecap({ teams, weeks: [] }, 1, { teamWeeks: rows });
    assert.ok(!recap.items.some((i) => i.type === 'unluckiest'));
    // One game: the closest game is the blowout, so it is said once.
    assert.ok(!recap.items.some((i) => i.type === 'closest'));
  });

  test('phrasing is stable per week and type', () => {
    assert.equal(phraseIndex(2, 'topScore'), phraseIndex(2, 'topScore'));
    assert.deepEqual(
      buildWeeklyRecap(season, 2, { teamWeeks, challengeWeeks }),
      buildWeeklyRecap(season, 2, { teamWeeks, challengeWeeks }),
    );
  });
});

describe('buildRecaps', () => {
  test('newest first, one per completed week', () => {
    const recaps = buildRecaps(season, { teamWeeks, challengeWeeks });
    assert.deepEqual(recaps.map((r) => r.week), [2, 1]);
  });

  test('a week still being played is left out', () => {
    const live = { ...season, weeks: [season.weeks[0], { week: 2, played: true, matchups: [{ winner: 'HOME' }, { winner: 'UNDECIDED' }] }] };
    assert.deepEqual(completedWeeks(live), [1]);
  });
});
