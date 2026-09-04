/**
 * Verification for the player hover cards.
 *
 * The stat-key tests are the ones that matter. ESPN keys everything four ways
 * (season, source, split, period) and reversing any pair returns real data of
 * the wrong kind — a projection instead of an actual, or one week instead of a
 * season — so nothing throws and every number on every card is quietly wrong.
 * `STAT_SPLIT` in constants.mjs was in fact reversed until this file existed.
 *
 *   npm test
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  STAT_LINES,
  buildPlayerCards,
  nameStats,
  normalizeNews,
  seasonActuals,
  statLine,
} from '../scripts/lib/playercard.mjs';
import { STAT_SPLIT, STAT_SOURCE, STAT_KEYS } from '../scripts/lib/constants.mjs';

/** A stats entry as ESPN shapes it. */
const entry = (seasonId, sourceId, splitId, stats, appliedTotal = 0) => ({
  seasonId,
  statSourceId: sourceId,
  statSplitTypeId: splitId,
  stats,
  appliedTotal,
});

const RB_2025 = { 23: 250, 24: 1412, 25: 16, 41: 52, 42: 517, 43: 4 };

// ---------------------------------------------------------------------------
describe('ESPN stat key constants', () => {
  test('a season total is split type 0, not 1', () => {
    // Pinned against HANDOFF.md and buildDraftPool(), which both use 0 for a
    // season total. This constant was defined the other way round and unused;
    // the first consumer would have silently read single weeks as seasons.
    assert.equal(STAT_SPLIT.SEASON, 0);
    assert.equal(STAT_SPLIT.WEEK, 1);
  });

  test('actual is 0 and projected is 1', () => {
    assert.equal(STAT_SOURCE.ACTUAL, 0);
    assert.equal(STAT_SOURCE.PROJECTED, 1);
  });
});

// ---------------------------------------------------------------------------
describe('naming raw stats', () => {
  test('numeric ids become readable fields', () => {
    const named = nameStats({ 24: 1412, 25: 16, 41: 52 });
    assert.deepEqual(named, { rushingYards: 1412, rushingTouchdowns: 16, receptions: 52 });
  });

  test('unknown ids are dropped, never rendered as a number', () => {
    const named = nameStats({ 24: 1412, 9999: 7 });
    assert.deepEqual(Object.keys(named), ['rushingYards']);
  });

  test('non-numeric values are dropped rather than printed as junk', () => {
    assert.deepEqual(nameStats({ 24: 'lots', 25: null, 41: 52 }), { receptions: 52 });
  });

  test('nothing in, empty object out', () => {
    assert.deepEqual(nameStats(undefined), {});
    assert.deepEqual(nameStats({}), {});
  });

  test('every STAT_LINES field is a name STAT_KEYS can actually produce', () => {
    // A typo in a stat line is invisible at runtime: the field is simply never
    // found and silently omitted from the card.
    const producible = new Set(Object.values(STAT_KEYS));
    for (const [position, spec] of Object.entries(STAT_LINES)) {
      for (const [key] of spec) {
        assert.ok(producible.has(key), `${position} wants "${key}", which STAT_KEYS never emits`);
      }
    }
  });
});

// ---------------------------------------------------------------------------
describe('reading a season out of stats[]', () => {
  const player = {
    id: 1,
    stats: [
      entry(2025, STAT_SOURCE.ACTUAL, STAT_SPLIT.SEASON, RB_2025, 301.4),
      entry(2025, STAT_SOURCE.PROJECTED, STAT_SPLIT.SEASON, { 24: 1, 25: 1 }, 999),
      entry(2025, STAT_SOURCE.ACTUAL, STAT_SPLIT.WEEK, { 24: 88 }, 14.2),
      entry(2026, STAT_SOURCE.PROJECTED, STAT_SPLIT.SEASON, { 24: 2 }, 888),
    ],
  };

  test('finds what actually happened, not the projection', () => {
    const out = seasonActuals(player, 2025);
    assert.equal(out.fantasyPoints, 301.4);
    assert.equal(out.stats.rushingYards, 1412);
  });

  test('finds the season, not a single week', () => {
    assert.notEqual(seasonActuals(player, 2025).stats.rushingYards, 88);
  });

  test('does not reach into the wrong season', () => {
    assert.equal(seasonActuals(player, 2024), null);
  });

  test('a player with no stats returns null rather than throwing', () => {
    assert.equal(seasonActuals({ id: 2 }, 2025), null);
    assert.equal(seasonActuals(null, 2025), null);
  });
});

// ---------------------------------------------------------------------------
describe('per-position stat lines', () => {
  test('a running back gets carries and receptions', () => {
    const line = statLine('RB', nameStats(RB_2025));
    const labels = line.map((f) => f.label);
    assert.deepEqual(labels, ['Carries', 'Rush yds', 'Rush TD', 'Rec', 'Rec yds', 'Rec TD']);
  });

  test('a quarterback is never shown receptions', () => {
    const line = statLine('QB', { passingYards: 4306, receptions: 1 });
    assert.ok(!line.some((f) => f.key === 'receptions'));
  });

  test('missing fields are omitted, not shown as zero', () => {
    // "0 rushing TDs" and "we have no rushing data" look identical on screen
    // and are different claims.
    const line = statLine('RB', { rushingYards: 900 });
    assert.deepEqual(line.map((f) => f.key), ['rushingYards']);
  });

  test('a zero that really is zero survives', () => {
    const line = statLine('RB', { rushingYards: 900, rushingTouchdowns: 0 });
    assert.deepEqual(line.map((f) => f.value), [900, 0]);
  });

  test('an unknown position yields no line rather than throwing', () => {
    assert.deepEqual(statLine('LS', { rushingYards: 1 }), []);
    assert.deepEqual(statLine('RB', null), []);
  });
});

// ---------------------------------------------------------------------------
describe('building the card index', () => {
  const players = [
    { id: 10, injuryStatus: 'ACTIVE', stats: [entry(2025, 0, 0, RB_2025, 301.4)] },
    { id: 11, injuryStatus: 'QUESTIONABLE', stats: [] },
    { id: 12, injuryStatus: 'ACTIVE', stats: [] },
  ];

  test('a player with last season’s stats gets a card', () => {
    const cards = buildPlayerCards({ players, seasonId: 2026 });
    assert.ok(cards[10]);
    assert.equal(cards[10].lastSeason.season, 2025);
    assert.equal(cards[10].lastSeason.stats.rushingYards, 1412);
  });

  test('an injury alone is enough to earn a card', () => {
    const cards = buildPlayerCards({ players, seasonId: 2026 });
    assert.ok(cards[11]);
    assert.equal(cards[11].injury, 'Questionable');
  });

  test('a healthy rookie with nothing to say gets no card at all', () => {
    // An empty popover teaches people the feature is broken.
    const cards = buildPlayerCards({ players, seasonId: 2026 });
    assert.equal(cards[12], undefined);
  });

  test('news alone is enough to earn a card', () => {
    const cards = buildPlayerCards({
      players,
      seasonId: 2026,
      news: { 12: [{ headline: 'Signed to the active roster', published: null }] },
    });
    assert.ok(cards[12]);
    assert.equal(cards[12].news.length, 1);
  });

  test('injury codes are humanized, not shown as ESPN enums', () => {
    const cards = buildPlayerCards({
      players: [{ id: 20, injuryStatus: 'INJURY_RESERVE', stats: [] }],
      seasonId: 2026,
    });
    assert.equal(cards[20].injury, 'IR');
  });

  test('placeholder ids are skipped', () => {
    // ESPN pre-builds draft slots with playerId -1.
    const cards = buildPlayerCards({
      players: [{ id: -1, injuryStatus: 'OUT', stats: [] }, { id: 0, injuryStatus: 'OUT', stats: [] }],
      seasonId: 2026,
    });
    assert.deepEqual(Object.keys(cards), []);
  });

  test('the first (richest) source wins for a duplicated player', () => {
    const cards = buildPlayerCards({
      players: [
        { id: 30, injuryStatus: 'OUT', stats: [entry(2025, 0, 0, RB_2025, 300)] },
        { id: 30, injuryStatus: 'ACTIVE', stats: [] },
      ],
      seasonId: 2026,
    });
    assert.equal(cards[30].injury, 'Out');
    assert.ok(cards[30].lastSeason);
  });

  test('no players at all produces an empty index, not a crash', () => {
    assert.deepEqual(buildPlayerCards({ seasonId: 2026 }), {});
    assert.deepEqual(buildPlayerCards(), {});
  });
});

// ---------------------------------------------------------------------------
describe('news normalization', () => {
  const raw = [
    {
      playerId: 5,
      items: [
        { headline: 'Old news', published: '2026-08-01T00:00:00Z' },
        { headline: 'Fresh news', published: '2026-09-01T00:00:00Z' },
        { headline: 'Middle news', published: '2026-08-20T00:00:00Z' },
      ],
    },
  ];

  test('newest first', () => {
    const out = normalizeNews(raw);
    assert.deepEqual(out[5].map((i) => i.headline), ['Fresh news', 'Middle news', 'Old news']);
  });

  test('capped per player', () => {
    assert.equal(normalizeNews(raw, { perPlayer: 2 })[5].length, 2);
  });

  test('an item with no headline is dropped', () => {
    const out = normalizeNews([{ playerId: 6, items: [{ published: '2026-09-01T00:00:00Z' }] }]);
    assert.equal(out[6], undefined);
  });

  test('undated news is kept but sorted last — it just cannot claim recency', () => {
    const out = normalizeNews([
      {
        playerId: 7,
        items: [
          { headline: 'No date' },
          { headline: 'Dated', published: '2026-09-01T00:00:00Z' },
        ],
      },
    ]);
    assert.deepEqual(out[7].map((i) => i.headline), ['Dated', 'No date']);
  });

  test('a missing or malformed feed yields nothing rather than throwing', () => {
    // The news endpoint is optional; every failure has to look like "no news".
    assert.deepEqual(normalizeNews(undefined), {});
    assert.deepEqual(normalizeNews(null), {});
    assert.deepEqual(normalizeNews([{ noPlayerId: true }]), {});
    assert.deepEqual(normalizeNews([{ playerId: 9 }]), {});
  });
});
