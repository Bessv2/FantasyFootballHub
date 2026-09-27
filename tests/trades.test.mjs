/**
 * Trade attribution, on a hand-built two-team league where every number can
 * be checked on paper.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { attributeTrades } from '../scripts/lib/trades.mjs';

const line = (playerId, points, started) => ({ playerId, name: `P${playerId}`, position: 'WR', points, started });

/** weeks: [[team1Roster, team2Roster], ...]; team 1 is home every week. */
function seasonOf(weeks, trades) {
  return {
    weeks: weeks.map(([home, away], i) => ({
      week: i + 1,
      played: true,
      matchups: [{ home: { teamId: 1, score: 0, roster: home }, away: { teamId: 2, score: 0, roster: away } }],
    })),
    trades,
  };
}

// P10 starts for team 1 in Week 1, then is swapped for P20 before Week 2.
//
//   Week  P10 (to team 2)          P20 (to team 1)
//   1     team 1, started, 15      team 2, started, 12   <- before the trade
//   2     team 2, started, 20      team 1, benched,  9
//   3     team 2, benched,  7      team 1, started, 11
//
// Team 1 received P20: total 9 + 11 = 20, started 11.
// Team 2 received P10: total 20 + 7 = 27, started 20.
// Net started (team 1 minus team 2): 11 - 20 = -9, so team 2 leads.
const SWAP = {
  id: 't1',
  date: null,
  scoringPeriodId: null,
  sides: [
    { teamId: 1, teamName: 'One', received: [{ id: 20, name: 'P20', position: 'WR' }] },
    { teamId: 2, teamName: 'Two', received: [{ id: 10, name: 'P10', position: 'WR' }] },
  ],
};
const THREE_WEEKS = [
  [[line(10, 15, true)], [line(20, 12, true)]],
  [[line(20, 9, false)], [line(10, 20, true)]],
  [[line(20, 11, true)], [line(10, 7, false)]],
];

describe('attributeTrades', () => {
  test('a two-player swap across three weeks', () => {
    const [t] = attributeTrades(seasonOf(THREE_WEEKS, [SWAP]));
    const [one, two] = t.sides;

    assert.equal(t.effectiveWeek, 2, 'first week either player shows up on his new team');
    assert.equal(t.tooEarly, false);
    assert.equal(t.weeksSince, 2, 'Weeks 2 and 3');

    assert.equal(one.pointsTotal, 20);
    assert.equal(one.pointsStarted, 11);
    assert.equal(two.pointsTotal, 27);
    assert.equal(two.pointsStarted, 20);
    assert.equal(one.weeksSince, 2);

    assert.equal(t.netStarted, -9);
    assert.equal(t.leaderTeamId, 2);
  });

  test("Week 1's pre-trade points never count", () => {
    // P10's 15 in Week 1 was scored for team 1, before team 2 had him.
    const [t] = attributeTrades(seasonOf(THREE_WEEKS, [SWAP]));
    assert.equal(t.sides[1].players[0].pointsTotal, 27);
  });

  test('a trade not yet in any box score is too early, not 0-0', () => {
    // Only Week 1 is played, and both players are still on their old teams.
    const [t] = attributeTrades(seasonOf(THREE_WEEKS.slice(0, 1), [SWAP]));
    assert.equal(t.tooEarly, true);
    assert.equal(t.effectiveWeek, null);
    assert.equal(t.sides[0].pointsStarted, null);
    assert.equal(t.sides[0].pointsTotal, null);
    assert.equal(t.netStarted, null);
    assert.equal(t.leaderTeamId, null);
  });

  test('points scored after the player is flipped again belong to his new team', () => {
    // Week 3: team 2 has passed P10 on to team 3, where he scores 30.
    const weeks = [
      ...THREE_WEEKS.slice(0, 2),
      [[line(20, 11, true)], []],
    ];
    const season = seasonOf(weeks, [SWAP]);
    season.weeks[2].matchups.push({ home: { teamId: 3, score: 0, roster: [line(10, 30, true)] }, away: null });
    const [t] = attributeTrades(season);
    assert.equal(t.sides[1].pointsTotal, 20, 'only Week 2 counts for team 2');
  });

  test('an explicit scoringPeriodId is used as-is', () => {
    // Says the trade landed in Week 3, so Week 2 is excluded:
    // team 1 gets 11 (started), team 2 gets 7 (benched).
    const [t] = attributeTrades(seasonOf(THREE_WEEKS, [{ ...SWAP, scoringPeriodId: 3 }]));
    assert.equal(t.effectiveWeek, 3);
    assert.equal(t.sides[0].pointsStarted, 11);
    assert.equal(t.sides[1].pointsStarted, 0);
    assert.equal(t.sides[1].pointsTotal, 7);
    assert.equal(t.leaderTeamId, 1);
  });

  test('level on started points is a tie, with no leader', () => {
    // Both received players sit on the bench every week after the trade.
    const weeks = [
      [[line(10, 15, true)], [line(20, 12, true)]],
      [[line(20, 9, false)], [line(10, 20, false)]],
    ];
    const [t] = attributeTrades(seasonOf(weeks, [SWAP]));
    assert.equal(t.netStarted, 0);
    assert.equal(t.leaderTeamId, null);
  });
});
