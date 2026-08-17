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
