/**
 * Verification for the weekly challenge.
 *
 * The determinism tests are the important ones and are not a formality. This
 * feature pays real money off a random draw, and the draw runs on every build —
 * including the builds that happen *after* the games. If the shuffle were ever
 * to become non-reproducible, the site would silently re-pick Week 4's
 * challenge with Week 4's results already known, which is indistinguishable
 * from rigging it. A test that fails loudly is the only thing standing between
 * that and a league argument nobody can settle.
 *
 *   npm test
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  CHALLENGE_DECK,
  buildChallengeSchedule,
  challengeSeed,
  computeChallenges,
  challengeLeaderboard,
} from '../scripts/lib/challenges.mjs';
import { splitPot, computePayouts, challengePayout } from '../scripts/lib/money.mjs';

const LEAGUE = { leagueId: 274568741, season: 2026, weeks: 13 };

/** A started player. */
const s = (name, position, points, extra = {}) => ({
  playerId: name.length * 7,
  name,
  position,
  points,
  projected: points,
  started: true,
  slotId: 20,
  ...extra,
});

/**
 * One team's week. Mirrors what buildTeamWeeks() emits, which is what the
 * challenge scorers actually run against.
 */
function row(teamId, week, score, opts = {}) {
  const starters = opts.starters ?? [s(`P${teamId}`, 'QB', score)];
  const sorted = [...starters].sort((a, b) => b.points - a.points);
  return {
    week,
    teamId,
    opponentId: opts.opponentId ?? null,
    score,
    opponentScore: opts.opponentScore ?? 0,
    margin: Number((score - (opts.opponentScore ?? 0)).toFixed(2)),
    result: opts.result ?? 'WIN',
    optimalScore: opts.optimalScore ?? score,
    efficiency: opts.efficiency ?? 100,
    benchPoints: opts.benchPoints ?? 0,
    isPerfectLineup: true,
    starters,
    benchPlayers: opts.benchPlayers ?? [],
    topStarter: sorted[0] ?? null,
    worstStarter: sorted[sorted.length - 1] ?? null,
  };
}

// ---------------------------------------------------------------------------
describe('challenge schedule', () => {
  test('the same league and season always deal the same cards', () => {
    const a = buildChallengeSchedule(LEAGUE);
    const b = buildChallengeSchedule(LEAGUE);
    assert.deepEqual(
      a.weeks.map((w) => w.challengeId),
      b.weeks.map((w) => w.challengeId),
      'the draw must be reproducible — a build after the games must not re-pick'
    );
  });

  test('a different league gets a different deal', () => {
    const ours = buildChallengeSchedule(LEAGUE).weeks.map((w) => w.challengeId);
    const theirs = buildChallengeSchedule({ ...LEAGUE, leagueId: 999 }).weeks.map((w) => w.challengeId);
    assert.notDeepEqual(ours, theirs);
  });

  test('changing the salt reshuffles the season', () => {
    const before = buildChallengeSchedule(LEAGUE).weeks.map((w) => w.challengeId);
    const after = buildChallengeSchedule({ ...LEAGUE, salt: 'redo' }).weeks.map((w) => w.challengeId);
    assert.notDeepEqual(before, after);
  });

  test('nothing repeats within a season', () => {
    const ids = buildChallengeSchedule(LEAGUE).weeks.map((w) => w.challengeId);
    assert.equal(new Set(ids).size, ids.length);
  });

  test('one challenge per regular-season week', () => {
    const schedule = buildChallengeSchedule(LEAGUE);
    assert.equal(schedule.weeks.length, 13);
    assert.deepEqual(
      schedule.weeks.map((w) => w.week),
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]
    );
  });

  test('bi-weekly deals every other week', () => {
    const schedule = buildChallengeSchedule({ ...LEAGUE, cadence: 'biweekly' });
    assert.deepEqual(
      schedule.weeks.map((w) => w.week),
      [1, 3, 5, 7, 9, 11, 13]
    );
  });

  test('a season longer than the deck reshuffles instead of running dry', () => {
    const long = buildChallengeSchedule({ ...LEAGUE, weeks: CHALLENGE_DECK.length + 4 });
    assert.equal(long.weeks.length, CHALLENGE_DECK.length + 4);
    assert.ok(long.weeks.every((w) => w.challengeId));
  });

  test('every dealt card exists in the deck', () => {
    const ids = new Set(CHALLENGE_DECK.map((c) => c.id));
    for (const week of buildChallengeSchedule(LEAGUE).weeks) {
      assert.ok(ids.has(week.challengeId), `unknown challenge ${week.challengeId}`);
    }
  });

  test('the seed names the league and season, so it can be checked by hand', () => {
    assert.equal(challengeSeed({ leagueId: 1, season: 2026 }), 'roe-challenge:1:2026');
    assert.equal(challengeSeed({ leagueId: 1, season: 2026, salt: 'x' }), 'roe-challenge:1:2026:x');
  });

  test('deck ids are unique — a duplicate would silently drop a challenge', () => {
    const ids = CHALLENGE_DECK.map((c) => c.id);
    assert.equal(new Set(ids).size, ids.length);
  });
});

// ---------------------------------------------------------------------------
describe('challenge scoring', () => {
  const deck = CHALLENGE_DECK;
  const only = (id) => deck.filter((c) => c.id === id);
  const scheduleFor = (id, week = 1) => ({
    seed: 'test',
    cadence: 'weekly',
    startWeek: 1,
    weeks: [{ week, challengeId: id, label: id, rule: '' }],
  });

  const resolve = (id, teamWeeks, opts = {}) =>
    computeChallenges({
      schedule: scheduleFor(id),
      teamWeeks,
      weeksPlayed: 1,
      deck: only(id),
      payouts: new Map([[1, 15]]),
      ...opts,
    })[0];

  test('highest score wins Top Gun', () => {
    const out = resolve('highScore', [row(1, 1, 110), row(2, 1, 130), row(3, 1, 99)]);
    assert.equal(out.winner.teamId, 2);
    assert.equal(out.winner.amount, 15);
  });

  test('Price Is Right busts anyone over 100', () => {
    // Team 2 scores highest but goes over, so 99.5 beats it.
    const out = resolve('closestTo100', [row(1, 1, 99.5), row(2, 1, 140), row(3, 1, 80)]);
    assert.equal(out.winner.teamId, 1);
  });

  test('Price Is Right has no winner when everybody busts', () => {
    const out = resolve('closestTo100', [row(1, 1, 120), row(2, 1, 140)]);
    assert.equal(out.winner, null);
    assert.equal(out.noWinner, true);
  });

  test('Photo Finish wants the smallest winning margin, not the largest', () => {
    const out = resolve('narrowestWin', [
      row(1, 1, 100, { opponentScore: 99, result: 'WIN' }),
      row(2, 1, 150, { opponentScore: 100, result: 'WIN' }),
      row(3, 1, 90, { opponentScore: 120, result: 'LOSS' }),
    ]);
    assert.equal(out.winner.teamId, 1);
  });

  test('Stole One wants the lowest winning score', () => {
    const out = resolve('uglyWin', [
      row(1, 1, 80, { opponentScore: 79, result: 'WIN' }),
      row(2, 1, 150, { opponentScore: 100, result: 'WIN' }),
      row(3, 1, 60, { opponentScore: 200, result: 'LOSS' }),
    ]);
    assert.equal(out.winner.teamId, 1, 'the 60 lost, so it must not win a prize for winning');
  });

  test('Robbed only considers losses', () => {
    const out = resolve('toughLuck', [
      row(1, 1, 160, { opponentScore: 100, result: 'WIN' }),
      row(2, 1, 150, { opponentScore: 155, result: 'LOSS' }),
    ]);
    assert.equal(out.winner.teamId, 2);
  });

  test('a position challenge reads only that position', () => {
    const out = resolve('bestTE', [
      row(1, 1, 100, { starters: [s('Big QB', 'QB', 40), s('Small TE', 'TE', 8)] }),
      row(2, 1, 90, { starters: [s('Ok QB', 'QB', 20), s('Big TE', 'TE', 22)] }),
    ]);
    assert.equal(out.winner.teamId, 2);
    assert.match(out.winner.detail, /Big TE/);
  });

  test('a team with nobody at that position simply does not qualify', () => {
    const out = resolve('bestTE', [
      row(1, 1, 100, { starters: [s('QB only', 'QB', 40)] }),
      row(2, 1, 50, { starters: [s('A TE', 'TE', 5)] }),
    ]);
    assert.equal(out.winner.teamId, 2);
  });

  test('Best In Show counts how many teams you would have beaten', () => {
    const out = resolve('allPlayWeek', [row(1, 1, 100), row(2, 1, 120), row(3, 1, 90)]);
    assert.equal(out.winner.teamId, 2);
    assert.equal(out.winner.value, 2);
  });

  test('a tie splits the pot rather than inventing a tiebreak', () => {
    const out = resolve('highScore', [row(1, 1, 120), row(2, 1, 120), row(3, 1, 90)]);
    assert.equal(out.winner.amount, 7.5);
    assert.equal(out.tiedWith.length, 1);
    assert.equal(out.tiedWith[0].amount, 7.5);
    assert.equal(out.winner.amount + out.tiedWith[0].amount, 15);
  });

  test('every challenge in the deck scores a normal week without throwing', () => {
    const starters = [
      s('QB', 'QB', 24, { slotId: 0 }),
      s('RB1', 'RB', 14, { slotId: 2 }),
      s('RB2', 'RB', 9, { slotId: 2 }),
      s('WR1', 'WR', 18, { slotId: 4 }),
      s('WR2', 'WR', 11, { slotId: 4 }),
      s('TE', 'TE', 7, { slotId: 6 }),
      s('OP', 'QB', 21, { slotId: 7 }),
      s('DST', 'D/ST', 6, { slotId: 16 }),
      s('K', 'K', 8, { slotId: 17 }),
    ];
    const teamWeeks = [
      row(1, 1, 118, { starters, opponentScore: 100, result: 'WIN', benchPoints: 12, efficiency: 91 }),
      row(2, 1, 100, { starters, opponentScore: 118, result: 'LOSS', benchPoints: 3, efficiency: 97 }),
    ];

    for (const card of CHALLENGE_DECK) {
      const out = computeChallenges({
        schedule: scheduleFor(card.id),
        teamWeeks,
        weeksPlayed: 1,
        payouts: new Map([[1, 15]]),
      })[0];
      assert.ok(out.winner || out.noWinner, `${card.id} produced neither a winner nor a void`);
      if (out.winner) {
        assert.equal(typeof out.winner.value, 'number', `${card.id} scored a non-number`);
        assert.ok(!Number.isNaN(out.winner.value), `${card.id} scored NaN`);
      }
    }
  });
});

// ---------------------------------------------------------------------------
describe('sealing future weeks', () => {
  const schedule = buildChallengeSchedule(LEAGUE);

  test('an unplayed season reveals week 1 and seals the rest', () => {
    const out = computeChallenges({ schedule, teamWeeks: [], weeksPlayed: 0 });
    assert.equal(out[0].sealed, false, 'the week being played must be announced before kickoff');
    assert.equal(out[0].label !== null, true);
    assert.ok(out.slice(1).every((w) => w.sealed));
  });

  test('a sealed week gives away nothing — not even which challenge it is', () => {
    const out = computeChallenges({ schedule, teamWeeks: [], weeksPlayed: 0 });
    const sealed = out[5];
    assert.equal(sealed.label, null);
    assert.equal(sealed.rule, null);
    assert.equal(sealed.winner, null);
  });

  test('the reveal advances one week at a time', () => {
    const out = computeChallenges({ schedule, teamWeeks: [], weeksPlayed: 4 });
    assert.ok(out.slice(0, 5).every((w) => !w.sealed));
    assert.ok(out.slice(5).every((w) => w.sealed));
  });

  test('revealAll opens the whole schedule', () => {
    const out = computeChallenges({ schedule, teamWeeks: [], weeksPlayed: 0, revealAll: true });
    assert.ok(out.every((w) => !w.sealed));
  });

  test('a sealed week still shows what it is worth', () => {
    const out = computeChallenges({
      schedule,
      teamWeeks: [],
      weeksPlayed: 0,
      payouts: new Map(schedule.weeks.map((w) => [w.week, 15])),
    });
    assert.equal(out[8].sealed, true);
    assert.equal(out[8].amount, 15);
  });
});

// ---------------------------------------------------------------------------
describe('challenge leaderboard', () => {
  test('adds up wins and cash across the season', () => {
    const resolved = [
      { winner: { teamId: 1, amount: 15 }, tiedWith: [] },
      { winner: { teamId: 1, amount: 15 }, tiedWith: [] },
      { winner: { teamId: 2, amount: 15 }, tiedWith: [] },
      { winner: null, tiedWith: [] },
    ];
    const board = challengeLeaderboard(resolved, [
      { teamId: 1, teamName: 'A', managerName: 'Ann' },
      { teamId: 2, teamName: 'B', managerName: 'Bo' },
    ]);
    assert.equal(board[0].teamId, 1);
    assert.equal(board[0].challengesWon, 2);
    assert.equal(board[0].amountWon, 30);
    assert.equal(board[1].amountWon, 15);
  });

  test('a split counts for both teams', () => {
    const board = challengeLeaderboard(
      [{ winner: { teamId: 1, amount: 7.5 }, tiedWith: [{ teamId: 2, amount: 7.5 }] }],
      []
    );
    assert.equal(board.length, 2);
    assert.equal(board[0].amountWon, 7.5);
    assert.equal(board[1].amountWon, 7.5);
  });
});

// ---------------------------------------------------------------------------
describe('splitting the challenge pot', () => {
  test('$195 across 13 weeks is a clean $15', () => {
    const split = splitPot(195, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
    assert.ok(split.every((w) => w.amount === 15));
  });

  test('an uneven split still adds back up to the pot exactly', () => {
    // 200 / 13 = 15.3846…, which naive rounding turns into 199.94.
    const weeks = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];
    const split = splitPot(200, weeks);
    const total = Math.round(split.reduce((a, w) => a + w.amount, 0) * 100) / 100;
    assert.equal(total, 200);
  });

  test('the leftover cents go to the earliest weeks, never lost', () => {
    const split = splitPot(10, [1, 2, 3]);
    assert.deepEqual(split.map((w) => w.amount), [3.34, 3.33, 3.33]);
  });

  test('no weeks or no pot yields nothing rather than dividing by zero', () => {
    assert.deepEqual(splitPot(195, []), []);
    assert.deepEqual(splitPot(0, [1, 2]), []);
  });
});

// ---------------------------------------------------------------------------
describe('the league’s actual payout structure', () => {
  const config = {
    buyIn: 75,
    payouts: {
      structure: [
        { id: 'first', label: '1st Place', amount: 350 },
        { id: 'second', label: '2nd Place', amount: 130 },
        { id: 'third', label: '3rd Place', amount: 75 },
        { id: 'challenges', label: 'Weekly Challenges', remainder: true },
      ],
    },
  };

  test('10 x $75 pays 350 / 130 / 75 and leaves 195 for the challenges', () => {
    const { payouts } = computePayouts(config, 750);
    assert.deepEqual(payouts.map((p) => p.amount), [350, 130, 75, 195]);
    assert.equal(
      payouts.reduce((a, p) => a + p.amount, 0),
      750,
      'the four slots must account for the whole pot'
    );
  });

  test('third place is exactly the buy-in back', () => {
    const { payouts } = computePayouts(config, 750);
    assert.equal(payouts.find((p) => p.id === 'third').amount, config.buyIn);
  });

  test('an eleventh manager grows the challenge pot and leaves the places alone', () => {
    const { payouts } = computePayouts(config, 825);
    assert.deepEqual(payouts.slice(0, 3).map((p) => p.amount), [350, 130, 75]);
    assert.equal(challengePayout(payouts), 270);
  });

  test('13 weekly challenges out of a 10-team pot are $15 each', () => {
    const { payouts } = computePayouts(config, 750);
    const split = splitPot(challengePayout(payouts), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
    assert.ok(split.every((w) => w.amount === 15));
  });
});
