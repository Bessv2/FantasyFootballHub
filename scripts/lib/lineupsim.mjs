/**
 * Lineup simulation: 100 possible versions of the coming week, and the lineup
 * that holds up best across them.
 *
 * A projection is one number, but a player's week is a range — a boom-or-bust
 * receiver and a steady one can carry the same 12-point projection. So each
 * simulated week draws every rostered player's score from a normal centred on
 * his ESPN projection, with a spread fitted to how much he has actually varied
 * this season. For each draw the solver finds the best possible lineup, which
 * gives two things:
 *
 *   start rate   how often each player made the best lineup — "must start",
 *                "coin flip" and "bench" at a glance
 *   the pick     a few candidate lineups — the projection one, the most
 *                often started, an upside one and a safe-floor one — are each
 *                scored across all 100 weeks against the opponent's simulated
 *                score. The one that wins most often is recommended.
 *
 * Averaged over many weeks the projection lineup always scores the most — that
 * is what a projection is — so the simulation only departs from it when a
 * different lineup genuinely wins more often (an underdog wants upside, a
 * favourite wants a safe floor), and only by a clear margin: over 100 draws a
 * one- or two-game edge is noise, not a reason to change your lineup.
 *
 * Seeded on season, week and team, so a rebuild shows the same advice.
 */

import { optimalLineup } from './lineup.mjs';
import { hashSeed, mulberry32 } from './challenges.mjs';
import { LINEUP_SLOT } from './constants.mjs';

export const DEFAULT_SIMULATIONS = 100;

/**
 * How much a player's week swings when there is little history to go on, as a
 * share of his projection. Assumptions, not measurements: kickers and
 * quarterbacks are the steadiest, tight ends and defences the least. With a few
 * weeks of real scores the player's own spread takes over (see SPREAD_K).
 */
export const DEFAULT_CV = { QB: 0.35, RB: 0.5, WR: 0.55, TE: 0.6, K: 0.45, 'D/ST': 0.65 };
const FALLBACK_CV = 0.55;
/** No player's week is certain: a floor on the spread, in points. */
const MIN_SD = 1.5;
/**
 * Prior weight on the positional default, in games. A player's own spread
 * from n scored weeks carries weight n - 1, so after five weeks it counts as
 * much as the default. Same shrinkage idea as the playoff odds.
 */
export const SPREAD_K = 4;
/** Wins out of 100 a contender must add over the projection lineup to replace it. */
const MIN_WIN_EDGE = 3;

/** Lineup slots that do not score: bench, IR, and ESPN's extra-reserve slot. */
const BENCH_SLOTS = new Set([20, 21, 24]);

/** Statuses that mean the player will not play this week. */
const WILL_NOT_PLAY = new Set(['OUT', 'INJURY_RESERVE', 'SUSPENSION']);

const round1 = (n) => Number(n.toFixed(1));
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const sampleSd = (xs) => {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1));
};
const percentile = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];

/**
 * A player's simulated spread.
 * @param {object} player        { position, projected }
 * @param {number[]} history     his actual weekly scores this season (games played)
 */
export function playerSpread(player, history = [], k = SPREAD_K) {
  const projected = Math.max(0, player.projected ?? 0);
  const prior = Math.max(MIN_SD, (DEFAULT_CV[player.position] ?? FALLBACK_CV) * projected);
  const n = Math.max(0, history.length - 1);
  return Math.max(MIN_SD, (n * sampleSd(history) + k * prior) / (n + k));
}

const lineupKey = (lineup) => lineup.map((p) => p.playerId).sort((a, b) => a - b).join(',');

/**
 * @param {object}   input
 * @param {Array}    input.roster          current roster: { playerId, name, position, projected, slotId, injuryStatus }
 * @param {Array}    input.startingSlots   [{ slotId, count }]
 * @param {Array}    [input.opponentRoster] the opponent's roster, same shape, if known
 * @param {Map}      [input.history]       playerId -> weekly scores this season
 * @param {number}   [input.simulations]
 * @param {string}   [input.seed]
 */
export function simulateLineup({
  roster,
  startingSlots,
  opponentRoster = null,
  history = new Map(),
  simulations = DEFAULT_SIMULATIONS,
  seed = 'roe-lineup',
}) {
  const eligible = (roster ?? []).filter((p) => p && Number.isFinite(p.projected));
  if (!eligible.length || !startingSlots?.length) return { available: false };

  const rand = mulberry32(hashSeed(seed));
  const normal = () => Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());

  const model = (list) => list.map((p) => {
    // A zero projection is ESPN saying he is not playing — usually a bye.
    const out = WILL_NOT_PLAY.has(p.injuryStatus) || p.projected <= 0;
    return {
      ...p,
      out,
      mu: out ? 0 : Math.max(0, p.projected),
      sd: out ? 0 : playerSpread(p, history.get(p.playerId) ?? []),
    };
  });
  // A defence can finish below zero; nobody else realistically does.
  const draw = (p) => (p.out ? 0 : Math.max(p.position === 'D/ST' ? -5 : 0, p.mu + p.sd * normal()));

  const mine = model(eligible);
  const theirs = opponentRoster ? model(opponentRoster.filter((p) => p && Number.isFinite(p.projected))) : null;

  // The opponent is assumed to start their best lineup on projections.
  const theirLineup = theirs?.length
    ? optimalLineup(theirs.map((p) => ({ ...p, points: p.mu })), startingSlots).lineup.map((p) => p.playerId)
    : null;
  const theirIndex = theirs ? new Map(theirs.map((p) => [p.playerId, p])) : null;

  // The projection lineup: best on the mean of every player.
  const projection = optimalLineup(mine.map((p) => ({ ...p, points: p.mu })), startingSlots).lineup;

  const draws = [];
  const opponentScores = [];
  const timesOptimal = new Map();
  const startCount = new Map(mine.map((p) => [p.playerId, 0]));

  for (let s = 0; s < simulations; s += 1) {
    const points = new Map(mine.map((p) => [p.playerId, draw(p)]));
    draws.push(points);
    if (theirLineup) {
      opponentScores.push(theirLineup.reduce((a, id) => a + draw(theirIndex.get(id)), 0));
    }

    const best = optimalLineup(mine.map((p) => ({ ...p, points: points.get(p.playerId) })), startingSlots).lineup;
    const key = lineupKey(best);
    timesOptimal.set(key, (timesOptimal.get(key) ?? 0) + 1);
    for (const p of best) startCount.set(p.playerId, startCount.get(p.playerId) + 1);
  }

  /** A lineup's record across every simulated week. */
  const evaluate = (lineup) => {
    const totals = draws.map((points) => lineup.reduce((a, p) => a + points.get(p.playerId), 0));
    let wins = 0;
    if (theirLineup) {
      totals.forEach((t, i) => {
        if (t > opponentScores[i]) wins += 1;
        else if (t === opponentScores[i]) wins += 0.5;
      });
    }
    const sorted = [...totals].sort((a, b) => a - b);
    return {
      mean: round1(mean(totals)),
      p10: round1(percentile(sorted, 0.1)),
      p90: round1(percentile(sorted, 0.9)),
      wins,
      winPct: theirLineup ? round1((wins / simulations) * 100) : null,
    };
  };

  const projectionKey = lineupKey(projection);
  const projectionStats = evaluate(projection);

  // The contenders. Each is the solver's answer to a different question, set
  // before looking at who wins the 100 weeks — so the pick is not simply
  // whichever lineup got lucky in these particular draws.
  //   mostStarted  the players who made the best lineup most often
  //   upside       judged at the 80th percentile of each player's range — what
  //                an underdog needs, since only a big week wins it
  //   floor        judged at the 20th percentile — what a favourite needs,
  //                since only a bust loses it
  const Z80 = 0.8416;
  const solveOn = (value) =>
    optimalLineup(mine.map((p) => ({ ...p, points: value(p) })), startingSlots).lineup;
  const contenders = [
    ['mostStarted', solveOn((p) => startCount.get(p.playerId) + p.mu / 1000)],
    ['upside', solveOn((p) => (p.out ? -1 : p.mu + Z80 * p.sd))],
    ['floor', solveOn((p) => (p.out ? -1 : p.mu - Z80 * p.sd))],
  ];

  let pick = { key: projectionKey, strategy: 'projection', lineup: projection, stats: projectionStats };
  const alternatives = [];
  const seen = new Set([projectionKey]);
  for (const [strategy, lineup] of contenders) {
    const key = lineupKey(lineup);
    if (seen.has(key)) continue;
    seen.add(key);
    const stats = evaluate(lineup);
    alternatives.push({ strategy, ...stats });
    // Only a lineup that beats the projection by a clear margin replaces it:
    // over 100 draws, one or two extra wins is noise. Without an opponent
    // there is nothing to win, and on average the projection always scores
    // the most, so it stands.
    if (theirLineup && stats.wins - projectionStats.wins >= MIN_WIN_EDGE * (simulations / 100) && stats.wins > pick.stats.wins) {
      pick = { key, strategy, lineup, stats };
    }
  }

  // The lineup as it is set in ESPN right now, so the page can say exactly
  // which moves to make rather than comparing two hypothetical lineups.
  const current = mine.filter((p) => !BENCH_SLOTS.has(p.slotId));
  const currentStats = current.length ? evaluate(current) : null;
  const currentIds = new Set(current.map((p) => p.playerId));

  const pickIds = new Set(pick.lineup.map((p) => p.playerId));
  const projectionIds = new Set(projection.map((p) => p.playerId));
  const describe = (p) => ({
    playerId: p.playerId,
    name: p.name,
    position: p.position,
    slotId: p.slotId,
    slot: LINEUP_SLOT[p.slotId] ?? String(p.slotId),
    projected: round1(p.mu),
  });

  const opponentSorted = [...opponentScores].sort((a, b) => a - b);

  return {
    available: true,
    simulations,
    seed,
    recommended: {
      strategy: pick.strategy,
      starters: pick.lineup.map(describe),
      timesOptimal: timesOptimal.get(pick.key) ?? 0,
      ...pick.stats,
    },
    projectionLineup: { timesOptimal: timesOptimal.get(projectionKey) ?? 0, ...projectionStats },
    // The other lineups tried, and how each did across the same 100 weeks.
    alternatives,
    // The lineup currently set in ESPN, and the moves from it to the pick.
    currentLineup: currentStats,
    fromCurrent: {
      start: pick.lineup.filter((p) => !currentIds.has(p.playerId)).map(describe),
      sit: current.filter((p) => !pickIds.has(p.playerId)).map(describe),
    },
    // Who the simulation would start instead of the projection lineup, and who
    // it would sit. Empty when the two agree.
    changes: {
      start: pick.lineup.filter((p) => !projectionIds.has(p.playerId)).map(describe),
      sit: projection.filter((p) => !pickIds.has(p.playerId)).map(describe),
    },
    opponent: theirLineup
      ? {
          mean: round1(mean(opponentScores)),
          p10: round1(percentile(opponentSorted, 0.1)),
          p90: round1(percentile(opponentSorted, 0.9)),
        }
      : null,
    players: mine
      .map((p) => ({
        playerId: p.playerId,
        name: p.name,
        position: p.position,
        projected: round1(p.mu),
        spread: round1(p.sd),
        out: p.out,
        startPct: Math.round((startCount.get(p.playerId) / simulations) * 100),
        recommended: pickIds.has(p.playerId),
      }))
      .sort((a, b) => b.startPct - a.startPct || b.projected - a.projected),
    distinctOptimalLineups: timesOptimal.size,
  };
}
