/**
 * Playoff odds. Every league here is built by hand so the expected numbers can
 * be reasoned out on paper — the comments say how, so a failure shows whether
 * the simulation or the expectation is wrong.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  simulatePlayoffOdds,
  oddsInputFromSeason,
  computePlayoffOdds,
  scoringModel,
} from '../scripts/lib/odds.mjs';
import { buildTeamWeeks, computeTeamStats, computeStandings } from '../scripts/lib/analytics.mjs';

const TEAMS = [1, 2, 3, 4].map((id) => ({ id, name: `Team ${'ABCD'[id - 1]}`, managerName: `m${id}`, isPlaceholder: false }));

/** A normalized season: weeks of [homeId, homeScore, awayId, awayScore]. */
function seasonOf({ played, future = [], regularSeasonWeeks, playoffTeams = 3, undecidedLast = false }) {
  const weeks = played.map((games, i) => ({
    week: i + 1,
    played: true,
    matchups: games.map(([h, hs, a, as]) => ({
      playoffTierType: 'NONE',
      winner: undecidedLast && i === played.length - 1 ? 'UNDECIDED' : hs > as ? 'HOME' : as > hs ? 'AWAY' : 'TIE',
      home: { teamId: h, score: hs, roster: [] },
      away: { teamId: a, score: as, roster: [] },
    })),
  }));
  const schedule = [
    ...played.flatMap((games, i) => games.map(([h, , a]) => ({ week: i + 1, homeTeamId: h, awayTeamId: a, playoffTierType: 'NONE' }))),
    ...future.flatMap((games, i) => games.map(([h, a]) => ({ week: played.length + i + 1, homeTeamId: h, awayTeamId: a, playoffTierType: 'NONE' }))),
  ];
  return {
    league: {
      season: 2026,
      regularSeasonWeeks: regularSeasonWeeks ?? played.length + future.length,
      playoffTeams,
      playoffSeedingRule: 'TOTAL_POINTS_SCORED',
      startingSlots: [],
    },
    teams: TEAMS,
    weeks,
    schedule,
  };
}

// Three weeks of a four-team round robin:
//   W1  A 120 - 100 B    C 110 - 90 D
//   W2  A 130 - 100 C    B 115 - 95 D
//   W3  A 125 - 105 D    B 110 - 105 C
// Records: A 3-0, B 2-1, C 1-2, D 0-3.
const THREE_WEEKS = [
  [[1, 120, 2, 100], [3, 110, 4, 90]],
  [[1, 130, 3, 100], [2, 115, 4, 95]],
  [[1, 125, 4, 105], [2, 110, 3, 105]],
];

describe('simulatePlayoffOdds', () => {
  test('a team that has clinched shows exactly 100%', () => {
    // One week left: A v B, C v D; three of four teams make it.
    // A's worst case is 3-1. Only B can also reach 3-1 (C tops out at 2-2),
    // so A finishes no lower than 2nd: in every simulation, never seeded 3/4.
    // D's best case is 1-3 and B's worst is 2-2, so D can never be seeded
    // above 3rd.
    const season = seasonOf({ played: THREE_WEEKS, future: [[[1, 2], [3, 4]]] });
    const odds = computePlayoffOdds(season, { simulations: 2000 });
    const a = odds.teams.find((t) => t.teamId === 1);
    const d = odds.teams.find((t) => t.teamId === 4);

    assert.equal(a.makePlayoffsPct, 100);
    assert.equal(a.missPlayoffsPct, 0);
    assert.equal(a.seedPct[3], 0);
    assert.equal(a.seedPct[4], 0);
    assert.equal(d.seedPct[1], 0);
    assert.equal(d.seedPct[2], 0);
    // A clinched team is never named in the bottom watch.
    assert.ok(!odds.bottomWatch.includes(1));
    assert.equal(odds.bottomWatch.length, 1, 'four teams, three spots: one team misses');
  });

  test('zero remaining games reproduces the real standings exactly', () => {
    // Two pairs tie on record here, so both orders come down to the points
    // tiebreak — the part a duplicated comparator would get wrong.
    //   W1  A 120 - 100 B   C 110 -  90 D
    //   W2  A 130 - 100 C   D 115 -  95 B
    //   W3  B 125 - 105 A   D 104 - 103 C
    // A: W W L = 2-1, 120 + 130 + 105 = 355.   D: L W W = 2-1, 90 + 115 + 104 = 309.
    // B: L L W = 1-2, 100 + 95 + 125 = 320.    C: W L L = 1-2, 110 + 100 + 103 = 313.
    // Standings: A (355) > D (309) at 2-1, then B (320) > C (313) at 1-2.
    const season = seasonOf({
      played: [
        [[1, 120, 2, 100], [3, 110, 4, 90]],
        [[1, 130, 3, 100], [4, 115, 2, 95]],
        [[2, 125, 1, 105], [4, 104, 3, 103]],
      ],
      playoffTeams: 2,
    });
    const teamWeeks = buildTeamWeeks(season);
    const standings = computeStandings(computeTeamStats(season, teamWeeks), season);
    assert.deepEqual(standings.map((s) => s.teamId), [1, 4, 2, 3]);

    const odds = simulatePlayoffOdds(oddsInputFromSeason(season), { simulations: 50 });
    for (const s of standings) {
      const t = odds.teams.find((o) => o.teamId === s.teamId);
      assert.equal(t.currentRank, s.rank);
      assert.equal(t.seedPct[s.rank], 100, `team ${s.teamId} should be seed ${s.rank} every time`);
      assert.equal(t.makePlayoffsPct, s.inPlayoffs ? 100 : 0);
      assert.equal(t.projectedWins, s.wins);
    }
    assert.equal(odds.generatedFrom.remainingGames, 0);
  });

  test('the same seed gives identical output', () => {
    const season = seasonOf({ played: THREE_WEEKS, future: [[[1, 2], [3, 4]], [[1, 3], [2, 4]]] });
    const one = computePlayoffOdds(season, { simulations: 3000 });
    const two = computePlayoffOdds(season, { simulations: 3000 });
    assert.deepEqual(one, two);
    // The default seed is derived from the season and weeks played.
    assert.equal(one.seed, 'roe-playoff-odds:2026:3');
  });

  test("each team's seed percentages sum to ~100", () => {
    const season = seasonOf({ played: THREE_WEEKS, future: [[[1, 2], [3, 4]], [[1, 3], [2, 4]]] });
    const odds = computePlayoffOdds(season, { simulations: 4000 });
    for (const t of odds.teams) {
      const sum = Object.values(t.seedPct).reduce((a, b) => a + b, 0);
      // Four values each rounded to 0.1 can drift by at most 0.2 in total.
      assert.ok(Math.abs(sum - 100) <= 0.2 + 1e-9, `team ${t.teamId} seeds sum to ${sum}`);
      assert.ok(Math.abs(t.makePlayoffsPct + t.missPlayoffsPct - 100) <= 0.1 + 1e-9);
    }
  });
});

describe('scoringModel', () => {
  test('early-season means are pulled toward the league average', () => {
    // One game: A 200, B 100. League mean is 150. With k = 4:
    //   A: (1 * 200 + 4 * 150) / 5 = 160
    //   B: (1 * 100 + 4 * 150) / 5 = 140
    const teams = [{ teamId: 1 }, { teamId: 2 }];
    const { model, leagueMean } = scoringModel(teams, [
      { homeTeamId: 1, awayTeamId: 2, homeScore: 200, awayScore: 100 },
    ], 4);
    assert.equal(leagueMean, 150);
    assert.equal(model.get(1).mean, 160);
    assert.equal(model.get(2).mean, 140);
  });

  test('spread is the pooled within-team deviation, blended the same way', () => {
    // A scores 100, 120 (sample SD 14.142); B scores 80, 80 (SD 0).
    // Pooled: sqrt((200 + 0) / (1 + 1)) = 10.
    // A's SD after 2 games weighs its own SD by n - 1 = 1:
    //   (1 * 14.142 + 4 * 10) / (1 + 4) = 10.828
    const teams = [{ teamId: 1 }, { teamId: 2 }];
    const { model, leagueSd } = scoringModel(teams, [
      { homeTeamId: 1, awayTeamId: 2, homeScore: 100, awayScore: 80 },
      { homeTeamId: 1, awayTeamId: 2, homeScore: 120, awayScore: 80 },
    ], 4);
    assert.equal(leagueSd, 10);
    assert.ok(Math.abs(model.get(1).sd - (Math.SQRT2 * 10 + 40) / 5) < 1e-9);
    assert.equal(model.get(2).sd, 8);
  });
});

describe('computePlayoffOdds', () => {
  test('null before Week 1', () => {
    const season = seasonOf({ played: [], future: [[[1, 2], [3, 4]]] });
    assert.equal(computePlayoffOdds(season), null);
  });

  test('null once the regular season is over', () => {
    assert.equal(computePlayoffOdds(seasonOf({ played: THREE_WEEKS })), null);
  });

  test('null when the rest of the schedule is unknown', () => {
    // An older raw cache without schedule.json: three of five weeks played and
    // nothing says who plays in Weeks 4 and 5.
    const season = { ...seasonOf({ played: THREE_WEEKS, regularSeasonWeeks: 5 }), schedule: [] };
    assert.equal(computePlayoffOdds(season), null);
  });

  test('a week still being played is simulated, not counted', () => {
    // Week 3 is UNDECIDED (Thursday night), so only Weeks 1-2 count and
    // Week 3's two games go back into the simulation.
    const season = seasonOf({ played: THREE_WEEKS, future: [[[1, 2], [3, 4]]], undecidedLast: true });
    const odds = computePlayoffOdds(season, { simulations: 100 });
    assert.equal(odds.weeksPlayed, 2);
    assert.equal(odds.generatedFrom.completedGames, 4);
    assert.equal(odds.generatedFrom.remainingGames, 4);
  });
});
