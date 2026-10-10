/**
 * The 1,000-week lineup simulation. Rosters are one-slot (a lone QB slot) so the
 * right answer can be reasoned out by hand.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { simulateLineup, playerSpread, lognormalParams, PLAY_CHANCE } from '../scripts/lib/lineupsim.mjs';

const QB_ONLY = [{ slotId: 0, count: 1 }];
const qb = (playerId, projected, extra = {}) => ({ playerId, name: `QB${playerId}`, position: 'QB', projected, slotId: 20, ...extra });

describe('playerSpread', () => {
  test('blends his own spread with the positional default', () => {
    // WR projected 10: default spread 0.55 * 10 = 5.5.
    // History [4, 16]: sample SD 8.485, weight n - 1 = 1; default weight 4.
    //   (1 * 8.485 + 4 * 5.5) / 5 = 6.097
    const sd = playerSpread({ position: 'WR', projected: 10 }, [4, 16]);
    assert.ok(Math.abs(sd - (Math.sqrt(72) + 22) / 5) < 1e-9);
  });

  test('no history: the positional default, never below the floor', () => {
    assert.equal(playerSpread({ position: 'QB', projected: 20 }), 7); // 0.35 * 20
    assert.equal(playerSpread({ position: 'K', projected: 1 }), 1.5); // 0.45 floored to 1.5
  });
});

describe('simulateLineup', () => {
  test('same seed, same answer', () => {
    const input = { roster: [qb(1, 20), qb(2, 18)], startingSlots: QB_ONLY, seed: 'x' };
    assert.deepEqual(simulateLineup(input), simulateLineup(input));
  });

  test('start rates: a clear starter always, an out player never', () => {
    // QB1 has nine straight 30s, so his spread is (0 + 4 * 10.5) / 12 = 3.5:
    // 30 +/- 3.5 against the backup's 2 +/- 1.5 is some 7 SDs apart, so the
    // backup never outscores him. (With no history, 30 +/- 10.5 would dip
    // under 4 about once in 100 draws.)
    // QB3 is OUT and QB4 is on a bye (projected 0): neither can ever start.
    const sim = simulateLineup({
      roster: [qb(1, 30), qb(2, 2), qb(3, 25, { injuryStatus: 'OUT' }), qb(4, 0)],
      startingSlots: QB_ONLY,
      history: new Map([[1, Array(9).fill(30)]]),
    });
    const rate = Object.fromEntries(sim.players.map((p) => [p.playerId, p.startPct]));
    assert.deepEqual(rate, { 1: 100, 2: 0, 3: 0, 4: 0 });
    assert.equal(sim.simulations, 1000);
    assert.deepEqual(sim.recommended.starters.map((p) => p.playerId), [1]);
    assert.equal(sim.recommended.starters[0].slot, 'QB');
  });

  // Two quarterbacks a point apart on projection:
  //   QB1 20, steady: history of 20s (own SD 0, weight 4) -> (0 + 4 * 7) / 8 = 3.5
  //   QB2 19, boom or bust: 0/40 alternating (SD ~21.9, weight 5)
  //       -> (5 * 21.9 + 4 * 6.65) / 9 ~= 15.1
  const history = new Map([
    [1, [20, 20, 20, 20, 20]],
    [2, [0, 40, 0, 40, 0, 40]],
    [9, Array(9).fill(30)],
    [8, Array(9).fill(10)],
  ]);
  const roster = [qb(1, 20), qb(2, 19)];

  test('an underdog takes the boom-or-bust option', () => {
    // Opponent: a steady 30 (SD (0 + 4 * 10.5) / 12 = 3.5).
    // QB1 at 20 +/- 3.5 almost never reaches 30; QB2 at 19 +/- 15 does about a
    // quarter of the time. Projection says QB1; the upside lineup says QB2.
    const sim = simulateLineup({ roster, startingSlots: QB_ONLY, history, opponentRoster: [qb(9, 30)], seed: 'u' });
    assert.deepEqual(sim.recommended.starters.map((p) => p.playerId), [2]);
    assert.equal(sim.recommended.strategy, 'upside');
    assert.ok(sim.recommended.winPct >= sim.projectionLineup.winPct + 3);
    assert.deepEqual(sim.changes.start.map((p) => p.playerId), [2]);
    assert.deepEqual(sim.changes.sit.map((p) => p.playerId), [1]);
  });

  test('a favourite keeps the safe projection', () => {
    // Opponent: a steady 10. QB1 at 20 +/- 3.5 essentially always wins; QB2
    // busts to 0 often enough to lose. Nothing beats the projection.
    const sim = simulateLineup({ roster, startingSlots: QB_ONLY, history, opponentRoster: [qb(8, 10)], seed: 'f' });
    assert.equal(sim.recommended.strategy, 'projection');
    assert.deepEqual(sim.recommended.starters.map((p) => p.playerId), [1]);
    assert.deepEqual(sim.changes, { start: [], sit: [] });
  });

  test('with no opponent, the projection lineup stands and there are no win odds', () => {
    const sim = simulateLineup({ roster, startingSlots: QB_ONLY, history });
    assert.equal(sim.recommended.strategy, 'projection');
    assert.equal(sim.recommended.winPct, null);
    assert.equal(sim.opponent, null);
  });

  test('nothing to simulate', () => {
    assert.deepEqual(simulateLineup({ roster: [], startingSlots: QB_ONLY }), { available: false });
  });
});

describe('simulateLineup against the lineup set in ESPN', () => {
  test('lists the moves from the current lineup, and scores it', () => {
    // QB2 (projected 5) is in the QB slot; QB1 (projected 25) is on the bench.
    // The pick is QB1, so the move is start QB1, sit QB2 — and the current
    // lineup's expected score is QB2's 5-ish, well below the pick's 25-ish.
    const sim = simulateLineup({
      roster: [qb(1, 25, { slotId: 20 }), qb(2, 5, { slotId: 0 })],
      startingSlots: QB_ONLY,
    });
    assert.deepEqual(sim.fromCurrent.start.map((p) => p.playerId), [1]);
    assert.deepEqual(sim.fromCurrent.sit.map((p) => p.playerId), [2]);
    assert.ok(sim.currentLineup.mean < sim.recommended.mean);
  });

  test('no moves when the current lineup is already the pick', () => {
    const sim = simulateLineup({
      roster: [qb(1, 25, { slotId: 0 }), qb(2, 5, { slotId: 20 })],
      startingSlots: QB_ONLY,
    });
    assert.deepEqual(sim.fromCurrent, { start: [], sit: [] });
  });
});

describe('lognormalParams', () => {
  test('keeps the average at the projection and the spread as given', () => {
    const { m, s: sd } = lognormalParams(12, 6);
    const mean = Math.exp(m + sd ** 2 / 2);
    const variance = (Math.exp(sd ** 2) - 1) * Math.exp(2 * m + sd ** 2);
    assert.ok(Math.abs(mean - 12) < 1e-9);
    assert.ok(Math.abs(Math.sqrt(variance) - 6) < 1e-9);
  });

  test('nothing to shape for a zero projection', () => {
    assert.equal(lognormalParams(0, 3), null);
  });
});

describe('simulateLineup: what real weeks look like', () => {
  const ONE_FLEX = [{ slotId: 0, count: 1 }];

  test('simulated scores average out at the projection', () => {
    const sim = simulateLineup({ roster: [qb(1, 15)], startingSlots: ONE_FLEX, simulations: 4000, seed: 'avg' });
    assert.ok(Math.abs(sim.recommended.mean - 15) < 0.5, `mean ${sim.recommended.mean}`);
    // Skewed: the 90th percentile sits further above the average than the
    // 10th sits below it.
    assert.ok(sim.recommended.p90 - 15 > 15 - sim.recommended.p10);
  });

  test('a Questionable player loses ground to an equal healthy one', () => {
    const sim = simulateLineup({
      roster: [qb(1, 20, { injuryStatus: 'QUESTIONABLE' }), qb(2, 20)],
      startingSlots: ONE_FLEX,
      seed: 'q',
    });
    const rate = Object.fromEntries(sim.players.map((p) => [p.playerId, p.startPct]));
    assert.ok(rate[2] > rate[1], JSON.stringify(rate));
    assert.deepEqual(sim.recommended.starters.map((p) => p.playerId), [2]);
    assert.equal(sim.players.find((p) => p.playerId === 1).playChance, PLAY_CHANCE.QUESTIONABLE);
  });

  test('a locked starter keeps his slot and scores what he actually scored', () => {
    // QB2 already played and scored 4; QB1 projects 25 but cannot replace him.
    const sim = simulateLineup({
      roster: [qb(1, 25), qb(2, 18, { slotId: 0, locked: true, points: 4 })],
      startingSlots: ONE_FLEX,
    });
    assert.deepEqual(sim.recommended.starters.map((p) => p.playerId), [2]);
    assert.deepEqual(sim.fromCurrent, { start: [], sit: [] });
    assert.equal(sim.recommended.mean, 4);
  });

  test('a locked bench player cannot come in', () => {
    const sim = simulateLineup({
      roster: [qb(1, 30, { locked: true, points: 30 }), qb(2, 10, { slotId: 0 })],
      startingSlots: ONE_FLEX,
    });
    assert.deepEqual(sim.recommended.starters.map((p) => p.playerId), [2]);
  });

  test('teammates boom and bust together', () => {
    // Two receivers on the same NFL team against two on different teams: same
    // averages, but the stacked pair swings wider week to week.
    const wr = (playerId, proTeam) => ({ playerId, name: `WR${playerId}`, position: 'WR', proTeam, projected: 12, slotId: 4 });
    const TWO_WR = [{ slotId: 4, count: 2 }];
    const stacked = simulateLineup({ roster: [wr(1, 'DET'), wr(2, 'DET')], startingSlots: TWO_WR, simulations: 4000, seed: 'c' });
    const apart = simulateLineup({ roster: [wr(1, 'DET'), wr(2, 'MIA')], startingSlots: TWO_WR, simulations: 4000, seed: 'c' });
    const width = (s) => s.recommended.p90 - s.recommended.p10;
    assert.ok(width(stacked) > width(apart), `${width(stacked)} vs ${width(apart)}`);
  });
});

describe('simulateLineup: pickups and IR', () => {
  const ONE = [{ slotId: 0, count: 1 }];

  test('a free agent who would start is priced in win chance', () => {
    const sim = simulateLineup({
      roster: [qb(1, 10, { slotId: 0 })],
      startingSlots: ONE,
      opponentRoster: [qb(9, 18)],
      freeAgents: [qb(50, 22), qb(51, 6)],
      seed: 'p',
    });
    assert.deepEqual(sim.pickups.map((p) => p.playerId), [50]); // QB51 would not start
    assert.ok(sim.pickups[0].winGain > 10);
    assert.deepEqual(sim.pickups[0].replaces.map((p) => p.playerId), [1]);
  });

  test('an IR player cannot be started when the roster is full, but is offered', () => {
    // One starter + one bench spot, both filled; QB3 is healthy but in IR.
    const roster = [qb(1, 10, { slotId: 0 }), qb(2, 8), qb(3, 25, { slotId: 21 })];
    const sim = simulateLineup({ roster, startingSlots: ONE, benchSlots: 1, opponentRoster: [qb(9, 18)], seed: 'ir' });
    assert.deepEqual(sim.recommended.starters.map((p) => p.playerId), [1]);
    assert.deepEqual(sim.irActivations.map((p) => p.playerId), [3]);

    // With an open bench spot he can simply be activated and started.
    const roomy = simulateLineup({ roster, startingSlots: ONE, benchSlots: 2, opponentRoster: [qb(9, 18)], seed: 'ir' });
    assert.deepEqual(roomy.recommended.starters.map((p) => p.playerId), [3]);
    assert.deepEqual(roomy.irActivations, []);
  });
});
