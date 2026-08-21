/**
 * Verification for the analytics engines.
 *
 * The real league has no data until Sept 5 2026, so these tests are the only
 * thing standing between "the math is right" and "the math runs". Expected
 * values are computed by hand in the comments so a failure tells you which is
 * wrong — the code or the expectation.
 *
 *   npm test
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { optimalLineup, lineupEfficiency, SLOT_ELIGIBILITY } from '../scripts/lib/lineup.mjs';
import {
  buildTeamWeeks,
  computeAllPlay,
  computeTeamStats,
  computeStandings,
  computePrizes,
} from '../scripts/lib/analytics.mjs';
import { computeLedger } from '../scripts/lib/money.mjs';
import { recommendLineup, coachingReport, waiverTargets } from '../scripts/lib/advisor.mjs';
import {
  buildBigBoard,
  computeReplacementLevels,
  simulateConsensusDraft,
  picksForSlot,
} from '../scripts/lib/bigboard.mjs';
import { normalizeSeason, PHASE } from '../scripts/lib/normalize.mjs';
import { resolvePosition } from '../scripts/lib/constants.mjs';

const p = (playerId, name, position, points, started = true) => ({
  playerId,
  name,
  position,
  points,
  started,
});

const STANDARD_SLOTS = [
  { slotId: 0, count: 1 }, // QB
  { slotId: 2, count: 2 }, // RB
  { slotId: 4, count: 2 }, // WR
  { slotId: 6, count: 1 }, // TE
  { slotId: 23, count: 1 }, // FLEX
  { slotId: 16, count: 1 }, // D/ST
  { slotId: 17, count: 1 }, // K
];

// ---------------------------------------------------------------------------
describe('optimalLineup', () => {
  test('fills every slot with the best eligible player', () => {
    const roster = [
      p(1, 'QB1', 'QB', 20),
      p(2, 'RB1', 'RB', 15),
      p(3, 'RB2', 'RB', 12),
      p(4, 'RB3', 'RB', 10),
      p(5, 'WR1', 'WR', 18),
      p(6, 'WR2', 'WR', 9),
      p(7, 'TE1', 'TE', 7),
      p(8, 'K1', 'K', 8),
      p(9, 'DST1', 'D/ST', 6),
    ];
    // QB 20 + RB 15,12 + WR 18,9 + TE 7 + FLEX(best leftover RB/WR/TE = RB3 10)
    //   + K 8 + D/ST 6 = 105
    const result = optimalLineup(roster, STANDARD_SLOTS);
    assert.equal(result.points, 105);
    assert.equal(result.lineup.length, 9);
  });

  test('puts a spare RB in FLEX rather than leaving points on the bench', () => {
    const roster = [
      p(1, 'QB1', 'QB', 10),
      p(2, 'RB1', 'RB', 30),
      p(3, 'RB2', 'RB', 25),
      p(4, 'RB3', 'RB', 22), // must land in FLEX
      p(5, 'WR1', 'WR', 5),
      p(6, 'WR2', 'WR', 4),
      p(7, 'TE1', 'TE', 3),
      p(8, 'K1', 'K', 2),
      p(9, 'DST1', 'D/ST', 1),
    ];
    // 10 + 30 + 25 + 5 + 4 + 3 + 22 + 2 + 1 = 102
    const result = optimalLineup(roster, STANDARD_SLOTS);
    assert.equal(result.points, 102);
    const flex = result.lineup.find((x) => x.slotId === 23);
    assert.equal(flex.playerId, 4);
  });

  test('never counts a player twice', () => {
    const roster = [p(1, 'RB1', 'RB', 20), p(2, 'RB2', 'RB', 10)];
    const result = optimalLineup(roster, [
      { slotId: 2, count: 2 },
      { slotId: 23, count: 1 },
    ]);
    const ids = result.lineup.map((x) => x.playerId);
    assert.equal(new Set(ids).size, ids.length);
    assert.equal(result.points, 30); // FLEX goes empty, not duplicated
  });

  test('leaves a slot empty when no eligible player exists', () => {
    const roster = [p(1, 'RB1', 'RB', 20)];
    const result = optimalLineup(roster, [
      { slotId: 0, count: 1 }, // QB — none rostered
      { slotId: 2, count: 1 },
    ]);
    assert.equal(result.points, 20);
    assert.equal(result.lineup.length, 1);
  });

  test('handles an empty roster without throwing', () => {
    assert.deepEqual(optimalLineup([], STANDARD_SLOTS), { points: 0, lineup: [], benched: [] });
    assert.deepEqual(optimalLineup(null, STANDARD_SLOTS), { points: 0, lineup: [], benched: [] });
  });

  test('reports benched players', () => {
    const roster = [p(1, 'QB1', 'QB', 20), p(2, 'QB2', 'QB', 30)];
    const result = optimalLineup(roster, [{ slotId: 0, count: 1 }]);
    assert.equal(result.points, 30);
    assert.equal(result.benched.length, 1);
    assert.equal(result.benched[0].playerId, 1);
  });

  test('superflex uses the exhaustive path and still beats greedy-by-points', () => {
    // Two overlapping slot types (FLEX and OP) trigger exhaustive search.
    const roster = [
      p(1, 'QB1', 'QB', 25),
      p(2, 'QB2', 'QB', 24),
      p(3, 'RB1', 'RB', 20),
      p(4, 'WR1', 'WR', 18),
      p(5, 'TE1', 'TE', 6),
    ];
    const slots = [
      { slotId: 0, count: 1 }, // QB
      { slotId: 7, count: 1 }, // OP (superflex): QB/RB/WR/TE
      { slotId: 23, count: 1 }, // FLEX: RB/WR/TE
    ];
    // QB 25 + OP(QB2 24) + FLEX(RB1 20) = 69
    const result = optimalLineup(roster, slots);
    assert.equal(result.points, 69);
  });

  test("Roe Leauge's actual superflex roster picks the second QB for the OP slot", () => {
    // The real league starts 1 QB / 2 RB / 2 WR / 1 TE / 1 OP / 1 D-ST / 1 K.
    // Slot 7 (OP) accepts a QB, so a second quarterback outscoring every flex
    // option must be started there. Only one overlapping slot type exists, so
    // this exercises the greedy path rather than the exhaustive one.
    const slots = [
      { slotId: 0, count: 1 }, { slotId: 2, count: 2 }, { slotId: 4, count: 2 },
      { slotId: 6, count: 1 }, { slotId: 7, count: 1 }, { slotId: 16, count: 1 },
      { slotId: 17, count: 1 },
    ];
    const roster = [
      p(1, 'QB1', 'QB', 32), p(2, 'QB2', 'QB', 27),
      p(3, 'RB1', 'RB', 18), p(4, 'RB2', 'RB', 14), p(5, 'RB3', 'RB', 11),
      p(6, 'WR1', 'WR', 16), p(7, 'WR2', 'WR', 12),
      p(8, 'TE1', 'TE', 9), p(9, 'K1', 'K', 8), p(10, 'DST1', 'D/ST', 7),
    ];
    // 32 + 18 + 14 + 16 + 12 + 9 + OP(QB2 27) + 7 + 8 = 143
    const result = optimalLineup(roster, slots);
    assert.equal(result.points, 143);
    const op = result.lineup.find((x) => x.slotId === 7);
    assert.equal(op.playerId, 2, 'OP slot should take the second QB, not a flex player');
  });

  test('lineupEfficiency is a percentage and guards divide-by-zero', () => {
    assert.equal(lineupEfficiency(90, 100), 90);
    assert.equal(lineupEfficiency(100, 100), 100);
    assert.equal(lineupEfficiency(50, 0), null);
  });

  test('FLEX eligibility does not include QB', () => {
    assert.deepEqual(SLOT_ELIGIBILITY[23], ['RB', 'WR', 'TE']);
    assert.ok(!SLOT_ELIGIBILITY[23].includes('QB'));
  });
});

// ---------------------------------------------------------------------------
describe('all-play and luck', () => {
  const teams = [{ id: 1 }, { id: 2 }, { id: 3 }];

  test('one week, three teams: 100 / 90 / 80', () => {
    const rows = [
      { week: 1, teamId: 1, score: 100 },
      { week: 1, teamId: 2, score: 90 },
      { week: 1, teamId: 3, score: 80 },
    ];
    const ap = computeAllPlay(rows, teams);
    assert.deepEqual(
      { w: ap.get(1).wins, l: ap.get(1).losses },
      { w: 2, l: 0 },
      'top scorer beats both'
    );
    assert.deepEqual({ w: ap.get(2).wins, l: ap.get(2).losses }, { w: 1, l: 1 });
    assert.deepEqual({ w: ap.get(3).wins, l: ap.get(3).losses }, { w: 0, l: 2 });
  });

  test('ties count as ties, not wins', () => {
    const rows = [
      { week: 1, teamId: 1, score: 100 },
      { week: 1, teamId: 2, score: 100 },
      { week: 1, teamId: 3, score: 50 },
    ];
    const ap = computeAllPlay(rows, teams);
    assert.equal(ap.get(1).wins, 1);
    assert.equal(ap.get(1).ties, 1);
    assert.equal(ap.get(1).losses, 0);
  });

  test('no games played produces zeros, not NaN', () => {
    const ap = computeAllPlay([], teams);
    assert.equal(ap.get(1).winPct, 0);
    assert.ok(Number.isFinite(ap.get(1).winPct));
  });
});

// ---------------------------------------------------------------------------
/** Minimal two-team, two-week season in normalized shape. */
function miniSeason() {
  const mkRoster = (base) => [
    p(base + 1, 'QB', 'QB', 20),
    p(base + 2, 'RB', 'RB', 15),
    p(base + 3, 'RB', 'RB', 10),
    p(base + 4, 'WR', 'WR', 12),
    p(base + 5, 'WR', 'WR', 8),
    p(base + 6, 'TE', 'TE', 5),
    p(base + 7, 'DST', 'D/ST', 6),
    p(base + 8, 'K', 'K', 4),
    p(base + 9, 'FLEXRB', 'RB', 9),
    p(base + 10, 'BENCH', 'WR', 30, false), // 30 points wasted on the bench
  ];

  return {
    league: {
      size: 2,
      startingSlots: STANDARD_SLOTS,
      regularSeasonWeeks: 2,
      playoffTeams: 1,
      playoffSeedingRule: 'TOTAL_POINTS_SCORED',
    },
    status: { weeksPlayed: 2 },
    teams: [
      { id: 1, name: 'Alpha', abbrev: 'ALP', managerName: 'A', isPlaceholder: false, transactionCounter: {} },
      { id: 2, name: 'Beta', abbrev: 'BET', managerName: 'B', isPlaceholder: false, transactionCounter: {} },
    ],
    weeks: [
      {
        week: 1,
        played: true,
        matchups: [
          {
            playoffTierType: 'NONE',
            home: { teamId: 1, score: 89, roster: mkRoster(100) },
            away: { teamId: 2, score: 70, roster: mkRoster(200) },
          },
        ],
      },
      {
        week: 2,
        played: true,
        matchups: [
          {
            playoffTierType: 'NONE',
            home: { teamId: 1, score: 60, roster: mkRoster(300) },
            away: { teamId: 2, score: 95, roster: mkRoster(400) },
          },
        ],
      },
    ],
  };
}

describe('team stats', () => {
  const season = miniSeason();
  const teamWeeks = buildTeamWeeks(season);
  const stats = computeTeamStats(season, teamWeeks);

  test('produces one row per team per played week', () => {
    assert.equal(teamWeeks.length, 4);
  });

  test('records are computed from actual scores', () => {
    const alpha = stats.find((t) => t.teamId === 1);
    assert.equal(alpha.wins, 1);
    assert.equal(alpha.losses, 1);
    assert.equal(alpha.pointsFor, 149); // 89 + 60
    assert.equal(alpha.pointsAgainst, 165); // 70 + 95
  });

  test('optimal lineup ignores the started flag and finds the bench points', () => {
    // Starters total 89. The 30-point bench WR does not displace the kicker —
    // K has its own slot — it takes a WR slot and pushes WR8 out of the lineup.
    // Optimal: QB20 + RB15,10 + WR30,12 + TE5 + FLEX(RB9, the best leftover)
    //          + DST6 + K4 = 111
    const row = teamWeeks.find((r) => r.teamId === 1 && r.week === 1);
    assert.equal(row.optimalScore, 111);
    assert.equal(row.benchPoints, 22); // 111 - 89
    assert.equal(row.isPerfectLineup, false);
  });

  test('luck is actual wins minus all-play expectation', () => {
    // Two teams, two weeks. Week 1 Alpha wins, week 2 Beta wins.
    // All-play in a two-team league equals the head-to-head record, so each
    // team expects exactly 1 win and luck is 0 for both.
    for (const t of stats) {
      assert.equal(t.expectedWins, 1);
      assert.equal(t.luck, 0);
    }
  });

  test('streak reflects the most recent result', () => {
    const alpha = stats.find((t) => t.teamId === 1);
    assert.equal(alpha.streakType, 'LOSS');
    assert.equal(alpha.streakLength, 1);
  });

  test('standings order by win pct then points', () => {
    const standings = computeStandings(stats, season);
    assert.equal(standings.length, 2);
    // Both 1-1, so total points breaks the tie. Beta 165 > Alpha 149.
    assert.equal(standings[0].teamId, 2);
    assert.equal(standings[0].rank, 1);
  });
});

// ---------------------------------------------------------------------------
describe('prizes', () => {
  const season = miniSeason();
  const teamWeeks = buildTeamWeeks(season);
  const stats = computeTeamStats(season, teamWeeks);
  const prizes = computePrizes(season, stats, teamWeeks);
  const byId = Object.fromEntries(prizes.map((x) => [x.id, x]));

  test('awards the highest and lowest weeks correctly', () => {
    assert.equal(byId.highestWeek.winner.value, 95);
    assert.equal(byId.highestWeek.winner.teamId, 2);
    assert.equal(byId.lowestWeek.winner.value, 60);
    assert.equal(byId.lowestWeek.winner.teamId, 1);
  });

  test('tough luck award goes to the highest-scoring loss', () => {
    // Losses were Beta 70 (wk1) and Alpha 60 (wk2). Highest is 70.
    assert.equal(byId.highestScoringLoss.winner.value, 70);
    assert.equal(byId.highestScoringLoss.winner.teamId, 2);
  });

  test('every prize names a real team', () => {
    for (const prize of prizes) {
      assert.ok(prize.winner, `${prize.id} has no winner`);
      assert.ok(
        season.teams.some((t) => t.id === prize.winner.teamId),
        `${prize.id} points at an unknown team`
      );
    }
  });

  test('an empty season produces no prizes rather than throwing', () => {
    const empty = { ...miniSeason(), weeks: [] };
    const rows = buildTeamWeeks(empty);
    const emptyStats = computeTeamStats(empty, rows);
    assert.deepEqual(computePrizes(empty, emptyStats, rows), []);
  });
});

// ---------------------------------------------------------------------------
describe('money ledger', () => {
  const season = {
    league: { size: 12 },
    teams: Array.from({ length: 12 }, (_, i) => ({
      id: i + 1,
      name: `Team ${i + 1}`,
      managerName: `M${i + 1}`,
      isPlaceholder: false,
    })),
  };
  const config = {
    currency: 'USD',
    buyIn: 50,
    payouts: {
      structure: [
        { id: 'first', label: '1st', pct: 58 },
        { id: 'second', label: '2nd', pct: 25 },
        { id: 'third', label: '3rd', pct: 8 },
        { id: 'sidePots', label: 'Side', pct: 9 },
      ],
    },
    payments: [
      { teamId: 1, paid: true },
      { teamId: 2, amountPaid: 25 },
    ],
  };

  test('pot and payouts are computed from the buy-in', () => {
    const ledger = computeLedger(config, season, []);
    assert.equal(ledger.expectedPot, 600); // 12 x 50
    assert.equal(ledger.collected, 75); // 50 + 25
    assert.equal(ledger.outstanding, 525);
    const amounts = Object.fromEntries(ledger.payouts.map((x) => [x.id, x.amount]));
    assert.equal(amounts.first, 348); // 58% of 600
    assert.equal(amounts.second, 150);
    assert.equal(amounts.third, 48);
    assert.equal(amounts.sidePots, 54);
    assert.equal(
      Object.values(amounts).reduce((a, b) => a + b, 0),
      600,
      'payouts must exhaust the pot'
    );
  });

  test('partial payments are tracked, not rounded to paid', () => {
    const ledger = computeLedger(config, season, []);
    const partial = ledger.members.find((m) => m.teamId === 2);
    assert.equal(partial.paid, false);
    assert.equal(partial.partial, true);
    assert.equal(partial.balance, 25);
    assert.equal(ledger.unpaid.length, 11);
  });

  test('warns when payout percentages do not total 100', () => {
    const bad = { ...config, payouts: { structure: [{ id: 'first', label: '1st', pct: 90 }] } };
    const ledger = computeLedger(bad, season, []);
    assert.ok(ledger.warnings.some((w) => w.includes('not 100')));
  });

  test('placeholder teams do not owe money', () => {
    const partialLeague = {
      league: { size: 12 },
      teams: [
        { id: 1, name: 'Real', managerName: 'A', isPlaceholder: false },
        { id: 2, name: 'Team 2', managerName: 'Unclaimed', isPlaceholder: true },
      ],
    };
    const ledger = computeLedger(config, partialLeague, []);
    assert.equal(ledger.expectedTeams, 1);
    assert.equal(ledger.expectedPot, 50);
  });
});

// ---------------------------------------------------------------------------
describe('roster advisor', () => {
  /** Roster where the best QB is wrongly benched behind a worse one. */
  const proj = (playerId, name, position, projected, slotId) => ({
    playerId, name, position, projected, slotId,
    slot: slotId === 20 ? 'BE' : position,
  });

  const SLOTS = [
    { slotId: 0, count: 1 }, { slotId: 2, count: 2 }, { slotId: 4, count: 2 },
    { slotId: 6, count: 1 }, { slotId: 23, count: 1 }, { slotId: 16, count: 1 },
    { slotId: 17, count: 1 },
  ];

  const badLineup = [
    proj(1, 'Bad QB', 'QB', 9, 0), // starting
    proj(2, 'Good QB', 'QB', 24, 20), // benched — should start
    proj(3, 'RB1', 'RB', 16, 2), proj(4, 'RB2', 'RB', 13, 2),
    proj(5, 'WR1', 'WR', 15, 4), proj(6, 'WR2', 'WR', 11, 4),
    proj(7, 'TE1', 'TE', 8, 6), proj(8, 'FLEX', 'RB', 10, 23),
    proj(9, 'DST', 'D/ST', 7, 16), proj(10, 'K', 'K', 6, 17),
  ];

  test('recommends the benched player who should be starting', () => {
    const advice = recommendLineup(badLineup, SLOTS);
    assert.equal(advice.available, true);
    assert.equal(advice.alreadyOptimal, false);
    assert.deepEqual(advice.toStart.map((p) => p.name), ['Good QB']);
    assert.deepEqual(advice.toSit.map((p) => p.name), ['Bad QB']);
    assert.equal(advice.projectedGain, 15); // 24 - 9
  });

  test('never pairs players across incompatible slots', () => {
    // The failure this guards against: zipping "start" and "sit" lists by index
    // produces advice like "start this QB instead of that TE", which is not a
    // legal move. The two lists must stay independent.
    const advice = recommendLineup(badLineup, SLOTS);
    assert.ok(!('swaps' in advice), 'must not emit invented 1:1 swaps');
    assert.equal(advice.toStart.length, advice.toSit.length);
  });

  test('says nothing when the lineup is already optimal', () => {
    const good = [
      proj(1, 'QB', 'QB', 24, 0),
      proj(3, 'RB1', 'RB', 16, 2), proj(4, 'RB2', 'RB', 13, 2),
      proj(5, 'WR1', 'WR', 15, 4), proj(6, 'WR2', 'WR', 11, 4),
      proj(7, 'TE1', 'TE', 8, 6), proj(8, 'FLEX', 'RB', 10, 23),
      proj(9, 'DST', 'D/ST', 7, 16), proj(10, 'K', 'K', 6, 17),
      proj(11, 'Scrub', 'WR', 2, 20),
    ];
    const advice = recommendLineup(good, SLOTS);
    assert.equal(advice.alreadyOptimal, true);
    assert.deepEqual(advice.toStart, []);
  });

  test('stays quiet about sub-point improvements', () => {
    const marginal = [
      proj(1, 'QB', 'QB', 20, 0),
      proj(3, 'RB1', 'RB', 16, 2), proj(4, 'RB2', 'RB', 13, 2),
      proj(5, 'WR1', 'WR', 15, 4), proj(6, 'WR2', 'WR', 11, 4),
      proj(7, 'TE1', 'TE', 8, 6), proj(8, 'FLEX', 'RB', 10, 23),
      proj(9, 'DST', 'D/ST', 7, 16), proj(10, 'K', 'K', 6, 17),
      proj(11, 'Barely better', 'RB', 10.4, 20), // +0.4 over the flex
    ];
    const advice = recommendLineup(marginal, SLOTS);
    assert.equal(advice.alreadyOptimal, true, 'a 0.4-point edge is noise, not advice');
  });

  test('handles an empty roster without throwing', () => {
    const advice = recommendLineup([], SLOTS);
    assert.equal(advice.available, false);
    assert.deepEqual(advice.toStart, []);
  });

  test('coaching report costs a loss only when the points would have flipped it', () => {
    const rows = [
      {
        week: 1, result: 'LOSS', margin: -5, benchPoints: 20, score: 100, optimalScore: 120,
        starters: [p(1, 'Started', 'QB', 5)],
        benchPlayers: [p(2, 'Benched', 'QB', 25)],
      },
      {
        week: 2, result: 'LOSS', margin: -40, benchPoints: 20, score: 100, optimalScore: 120,
        starters: [p(3, 'Started', 'QB', 5)],
        benchPlayers: [p(4, 'Benched', 'QB', 25)],
      },
    ];
    const report = coachingReport(rows, [{ slotId: 0, count: 1 }]);
    assert.equal(report.available, true);
    assert.equal(report.worstCalls.length, 2);
    // Week 1 lost by 5 with 20 points benched — the lineup call lost it.
    // Week 2 lost by 40; the same mistake would not have saved it.
    assert.equal(report.gamesCostByBadLineups, 1);
    assert.equal(report.worstCalls.find((c) => c.week === 1).changedResult, true);
    assert.equal(report.worstCalls.find((c) => c.week === 2).changedResult, false);
  });

  test('waiver targets must clearly beat the weakest starter', () => {
    const roster = [
      proj(1, 'QB', 'QB', 20, 0),
      proj(3, 'RB1', 'RB', 16, 2), proj(4, 'RB2', 'RB', 8, 2),
      proj(5, 'WR1', 'WR', 15, 4), proj(6, 'WR2', 'WR', 12, 4),
      proj(7, 'TE1', 'TE', 9, 6), proj(8, 'FLEX', 'RB', 7, 23),
      proj(9, 'DST', 'D/ST', 7, 16), proj(10, 'K', 'K', 6, 17),
    ];
    const fas = [
      { playerId: 90, name: 'Clear upgrade', position: 'RB', projected: 14 },
      { playerId: 91, name: 'Marginal', position: 'RB', projected: 8.5 },
      { playerId: 92, name: 'Worse', position: 'WR', projected: 3 },
    ];
    const result = waiverTargets(fas, roster, SLOTS);
    assert.equal(result.available, true);
    const names = result.targets.map((t) => t.name);
    assert.ok(names.includes('Clear upgrade'));
    assert.ok(!names.includes('Marginal'), 'a sub-2-point edge is not worth a roster move');
    assert.ok(!names.includes('Worse'));
  });

  test('waiver targets flag injured starters', () => {
    const roster = [{ ...proj(1, 'Hurt QB', 'QB', 18, 0), injuryStatus: 'OUT' }];
    const result = waiverTargets(
      [{ playerId: 90, name: 'Healthy QB', position: 'QB', projected: 15 }],
      roster,
      [{ slotId: 0, count: 1 }]
    );
    assert.equal(result.injuryGaps.length, 1);
    assert.equal(result.injuryGaps[0].name, 'Hurt QB');
  });
});

// ---------------------------------------------------------------------------
describe('big board', () => {
  /** Board with a clear talent gradient at every position. */
  const makePool = (startingSlots, teams = 12) => {
    const players = [];
    let id = 1;
    const add = (position, count, top, step) => {
      for (let i = 0; i < count; i += 1) {
        players.push({
          playerId: id, name: `${position}${i + 1}`, position,
          proTeam: 'FA', rank: id, pprRank: id, adp: id,
          projected: top - i * step, lastSeason: null, auctionValue: null,
          injuryStatus: null,
        });
        id += 1;
      }
    };
    add('QB', 40, 400, 5);
    add('RB', 60, 350, 4);
    add('WR', 70, 340, 3);
    add('TE', 30, 260, 5);
    add('D/ST', 20, 140, 2);
    add('K', 20, 150, 1);
    return { players, startingSlots, teams, rankType: 'SUPERFLEX' };
  };

  const SUPERFLEX_SLOTS = [
    { slotId: 0, count: 1 }, { slotId: 2, count: 2 }, { slotId: 4, count: 2 },
    { slotId: 6, count: 1 }, { slotId: 7, count: 1 }, { slotId: 16, count: 1 },
    { slotId: 17, count: 1 },
  ];
  const STANDARD_FLEX_SLOTS = [
    { slotId: 0, count: 1 }, { slotId: 2, count: 2 }, { slotId: 4, count: 2 },
    { slotId: 6, count: 1 }, { slotId: 23, count: 1 }, { slotId: 16, count: 1 },
    { slotId: 17, count: 1 },
  ];

  test('superflex pushes QB replacement level to QB24, not QB12', () => {
    // This is the whole reason replacement level is derived rather than
    // hardcoded. With an OP slot, quarterbacks absorb all 12 flex spots.
    const pool = makePool(SUPERFLEX_SLOTS);
    const { startersNeeded } = computeReplacementLevels(pool.players, SUPERFLEX_SLOTS, 12);
    assert.equal(startersNeeded.QB, 24, '12 QB slots + 12 OP slots all taken by QBs');
    assert.equal(startersNeeded.TE, 12);
  });

  test('a standard FLEX league keeps QB replacement at QB12', () => {
    const pool = makePool(STANDARD_FLEX_SLOTS);
    const { startersNeeded } = computeReplacementLevels(pool.players, STANDARD_FLEX_SLOTS, 12);
    assert.equal(startersNeeded.QB, 12, 'a RB/WR/TE flex must never take a QB');
    // The flex goes to whichever of RB/WR/TE is best; totals must still add up.
    assert.equal(startersNeeded.RB + startersNeeded.WR + startersNeeded.TE, 24 + 24 + 12 + 12);
  });

  test('VORP is measured against the same-position replacement', () => {
    const pool = makePool(SUPERFLEX_SLOTS);
    const board = buildBigBoard(pool, null, 250);
    const qb1 = board.players.find((p) => p.name === 'QB1');
    // QB24 is replacement: 400 - 23*5 = 285. QB1 projects 400. VORP = 115.
    assert.equal(qb1.replacement, 285);
    assert.equal(qb1.vorp, 115);
  });

  test('a 260-point TE outranks a 300-point QB when replacement says so', () => {
    // The point of VORP: raw projections are not comparable across positions.
    const pool = makePool(SUPERFLEX_SLOTS);
    const board = buildBigBoard(pool, null, 250);
    const te1 = board.players.find((p) => p.name === 'TE1'); // 260 proj
    const qb20 = board.players.find((p) => p.name === 'QB20'); // 305 proj
    assert.ok(te1.projected < qb20.projected, 'the TE really does project lower');
    assert.ok(te1.vorp > qb20.vorp, 'but is worth more above replacement');
    assert.ok(te1.valueRank < qb20.valueRank, 'so it must rank higher');
  });

  test('tiers are per position and produce usable groups, not tiers of one', () => {
    const pool = makePool(SUPERFLEX_SLOTS);
    const board = buildBigBoard(pool, null, 250);
    for (const position of ['QB', 'RB', 'WR']) {
      const group = board.players.filter((p) => p.position === position);
      const tiers = new Set(group.map((p) => p.tier));
      assert.ok(tiers.size >= 2, `${position} should have multiple tiers`);
      assert.ok(tiers.size <= 6, `${position} should not exceed the tier cap`);
      assert.equal(Math.min(...tiers), 1, `${position} tiers start at 1`);
    }
  });

  test('the grade curve stays sane rather than piling up at the extremes', () => {
    // The regression this guards: fixed ±40 thresholds applied to a 250-player
    // board put 54% of players at A+ or F.
    const pool = makePool(SUPERFLEX_SLOTS);
    const board = buildBigBoard(pool, null, 250);
    const extremes = board.players.filter((p) => p.grade === 'A+' || p.grade === 'F').length;
    assert.ok(
      extremes / board.players.length < 0.25,
      `expected under 25% at the extremes, got ${extremes}/${board.players.length}`
    );
    assert.ok(board.players.every((p) => p.grade !== null));
  });

  test('kickers and defences are flagged as streamable', () => {
    const pool = makePool(SUPERFLEX_SLOTS);
    const board = buildBigBoard(pool, null, 250);
    assert.equal(board.players.find((p) => p.position === 'K').streamable, true);
    assert.equal(board.players.find((p) => p.position === 'RB').streamable, false);
    assert.equal(board.positionValue.find((p) => p.position === 'K').streamable, true);
  });

  test('draft picks attach to players once the draft has happened', () => {
    const pool = makePool(SUPERFLEX_SLOTS);
    const target = pool.players[0];
    const draft = {
      held: true,
      picks: [{ playerId: target.playerId, overall: 3, round: 1, teamId: 7, teamName: 'Some Team', managerName: 'Sam' }],
    };
    const board = buildBigBoard(pool, draft, 250);
    const drafted = board.players.find((p) => p.playerId === target.playerId);
    assert.equal(drafted.drafted, true);
    assert.equal(drafted.pick.overall, 3);
    assert.equal(drafted.pick.teamName, 'Some Team');
    assert.equal(board.players.filter((p) => p.drafted).length, 1);
  });

  test('an empty pool returns unavailable rather than throwing', () => {
    const board = buildBigBoard({ players: [], startingSlots: SUPERFLEX_SLOTS, teams: 12 }, null, 250);
    assert.equal(board.available, false);
    assert.deepEqual(board.players, []);
  });

  test('recommended pick keeps kickers and defences out of the early rounds', () => {
    // The reason this is a simulation and not just "value rank as a pick
    // number": VORP rates kickers highly, so a naive mapping would recommend
    // one in round four. Nobody would follow that.
    const pool = makePool(SUPERFLEX_SLOTS);
    const board = buildBigBoard({ ...pool, rounds: 16 }, null, 250);
    const lateOnly = board.players.filter(
      (p) => (p.position === 'K' || p.position === 'D/ST') && p.recommendedPick !== null
    );
    assert.ok(lateOnly.length > 0, 'some kickers should be draftable');
    for (const p of lateOnly) {
      assert.ok(
        p.recommendedRound >= 15,
        `${p.name} recommended in round ${p.recommendedRound}, should be 15+`
      );
    }
  });

  test('recommended picks are unique and never exceed the draft', () => {
    const pool = makePool(SUPERFLEX_SLOTS);
    const board = buildBigBoard({ ...pool, rounds: 16 }, null, 250);
    const picks = board.players.map((p) => p.recommendedPick).filter((n) => n !== null);
    assert.equal(new Set(picks).size, picks.length, 'two players cannot share a pick');
    assert.ok(Math.max(...picks) <= 16 * 12);
  });

  test('the consensus draft respects roster capacity', () => {
    const pool = makePool(SUPERFLEX_SLOTS);
    const ranked = buildBigBoard({ ...pool, rounds: 16 }, null, 400).players;
    const result = simulateConsensusDraft(
      ranked.map((p) => ({ playerId: p.playerId, position: p.position })),
      { startingSlots: SUPERFLEX_SLOTS, teams: 12, rounds: 16 }
    );
    // Rebuild each roster from the pick order and check nobody hoarded.
    const positionOf = new Map(ranked.map((p) => [p.playerId, p.position]));
    const rosters = Array.from({ length: 12 }, () => ({}));
    for (const [playerId, { pick, round }] of result) {
      const idx = (pick - 1) % 12;
      const teamIndex = round % 2 === 1 ? idx : 11 - idx;
      const pos = positionOf.get(playerId);
      rosters[teamIndex][pos] = (rosters[teamIndex][pos] ?? 0) + 1;
    }
    for (const roster of rosters) {
      assert.ok((roster.K ?? 0) <= 1, 'never more than one kicker');
      assert.ok((roster['D/ST'] ?? 0) <= 1, 'never more than one defence');
      assert.ok((roster.QB ?? 0) <= 3, 'superflex allows 2 starters plus a backup');
      assert.ok((roster.TE ?? 0) <= 3);
    }
  });

  test('undraftable players are flagged rather than left blank', () => {
    const pool = makePool(SUPERFLEX_SLOTS);
    const board = buildBigBoard({ ...pool, rounds: 16 }, null, 250);
    const undraftable = board.players.filter((p) => !p.draftable);
    assert.ok(undraftable.length > 0, 'a 250-deep board exceeds 192 picks');
    for (const p of undraftable) assert.equal(p.recommendedPick, null);
  });

  test('snake pick numbers are right for the turn slots', () => {
    // Slot 1 picks first then waits the longest; slot 12 picks back to back.
    const first = picksForSlot(1, 12, 4).map((p) => p.overall);
    assert.deepEqual(first, [1, 24, 25, 48]);
    const last = picksForSlot(12, 12, 4).map((p) => p.overall);
    assert.deepEqual(last, [12, 13, 36, 37]);
    const middle = picksForSlot(6, 12, 3).map((p) => p.overall);
    assert.deepEqual(middle, [6, 19, 30]);
  });

  test('honours the publish limit', () => {
    const pool = makePool(SUPERFLEX_SLOTS);
    assert.equal(buildBigBoard(pool, null, 50).players.length, 50);
    assert.equal(buildBigBoard(pool, null, 250).players.length, 240); // pool has 240
  });
});

// ---------------------------------------------------------------------------
describe('position resolution', () => {
  test('uses defaultPositionId, not lineupSlotId', () => {
    // defaultPositionId 3 is WR. On the lineup-slot scale, 3 means RB/WR.
    assert.equal(resolvePosition({ defaultPositionId: 3 }), 'WR');
    assert.equal(resolvePosition({ defaultPositionId: 4 }), 'TE');
    assert.equal(resolvePosition({ defaultPositionId: 1 }), 'QB');
    assert.equal(resolvePosition({ defaultPositionId: 5 }), 'K');
    assert.equal(resolvePosition({ defaultPositionId: 16 }), 'D/ST');
  });

  test('falls back to eligibleSlots when the id is unknown', () => {
    assert.equal(resolvePosition({ defaultPositionId: 999, eligibleSlots: [4, 23, 20] }), 'WR');
    assert.equal(resolvePosition({ eligibleSlots: [0, 20] }), 'QB');
  });

  test('returns UNKNOWN rather than guessing', () => {
    assert.equal(resolvePosition({}), 'UNKNOWN');
    assert.equal(resolvePosition(null), 'UNKNOWN');
  });
});

// ---------------------------------------------------------------------------
describe('phase detection', () => {
  const shell = (overrides = {}) => ({
    league: {
      id: 1,
      seasonId: 2026,
      settings: {
        name: 'Test',
        size: 2,
        rosterSettings: { lineupSlotCounts: { 0: 1, 20: 5 } },
        scheduleSettings: { matchupPeriodCount: 14, playoffTeamCount: 1 },
      },
      status: { teamsJoined: 1, finalScoringPeriod: 17, latestScoringPeriod: 0 },
      teams: [
        { id: 1, name: 'Claimed', owners: ['x'] },
        { id: 2, name: 'Team 2' },
      ],
      members: [{ id: 'x', firstName: 'A', lastName: 'B' }],
      ...overrides.league,
    },
    draft: overrides.draft ?? { draftDetail: { picks: [] } },
    weeks: overrides.weeks ?? [],
    players: [],
  });

  test('an unfilled, undrafted league is EMPTY', () => {
    const s = normalizeSeason(shell());
    assert.equal(s.status.phase, PHASE.EMPTY);
  });

  test('a pre-built draft board with playerId -1 does not count as drafted', () => {
    // This is exactly the real league's current state: 192 slots, none used.
    const s = normalizeSeason(
      shell({
        draft: {
          draftDetail: {
            drafted: false,
            picks: Array.from({ length: 192 }, (_, i) => ({
              playerId: -1,
              overallPickNumber: i + 1,
              roundId: 1,
              roundPickNumber: i + 1,
              teamId: 1,
            })),
          },
        },
      })
    );
    assert.equal(s.draft.held, false);
    assert.equal(s.draft.picksMade, 0);
    assert.equal(s.status.phase, PHASE.EMPTY);
  });

  test('unclaimed teams are flagged as placeholders', () => {
    const s = normalizeSeason(shell());
    assert.equal(s.teams[0].isPlaceholder, false);
    assert.equal(s.teams[1].isPlaceholder, true);
    assert.equal(s.teams[1].managerName, 'Unclaimed');
  });

  test('owner display names come from members, not team names', () => {
    const s = normalizeSeason(shell());
    assert.equal(s.teams[0].managerName, 'A B');
  });
});
