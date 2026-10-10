/**
 * Lineup simulation: 1,000 possible versions of the coming week, and the lineup
 * that holds up best across them.
 *
 * A projection is one number, but a player's week is a range — a boom-or-bust
 * receiver and a steady one can carry the same 12-point projection. So each
 * simulated week draws every rostered player's score around his ESPN
 * projection, with a spread fitted to how much he has actually varied this
 * season. The draw is shaped like real fantasy scoring:
 *
 *   skewed       lognormal, not normal: most weeks land a little under the
 *                projection and a few land far over it, and the average is
 *                still exactly the projection. (A normal clipped at zero
 *                quietly inflates every low-projected player.)
 *   injuries     a Questionable player sits out some weeks entirely, a
 *                Doubtful one most weeks (PLAY_CHANCE).
 *   teammates    players on the same NFL team share a good or bad day
 *                (TEAM_CORRELATION) — a stack booms and busts together, and
 *                so does an opponent who starts your players' teammates.
 *   locked       a player whose game has started is fixed at his actual
 *                points and cannot be moved in or out of the lineup.
 *
 * For each draw the solver finds the best possible lineup, which gives two
 * things:
 *
 *   start rate   how often each player made the best lineup — "must start",
 *                "coin flip" and "bench" at a glance
 *   the pick     a few candidate lineups — the projection one, the most
 *                often started, an upside one and a safe-floor one — are each
 *                scored across all 100 weeks against the opponent's simulated
 *                score. The one that wins most often is recommended.
 *
 * It also answers two "what if" questions on the same simulated weeks, so the
 * comparison is like for like: how much each free agent worth a look would
 * raise your chance of winning, and the same for a player stuck on IR when
 * there is no open roster spot to activate him into.
 *
 * Averaged over many weeks the projection lineup always scores the most — that
 * is what a projection is — so the simulation only departs from it when a
 * different lineup genuinely wins more often (an underdog wants upside, a
 * favourite wants a safe floor), and only by a clear margin: a one- or
 * two-point edge in win chance is noise, not a reason to change your lineup.
 *
 * Seeded on season, week and team, so a rebuild shows the same advice.
 */

import { optimalLineup } from './lineup.mjs';
import { hashSeed, mulberry32 } from './challenges.mjs';
import { LINEUP_SLOT } from './constants.mjs';

export const DEFAULT_SIMULATIONS = 1000;

/**
 * Chance a player with this status suits up. ESPN keeps projecting a
 * Questionable player as if he plays, so the risk is modelled here instead.
 * Assumptions, not measurements: most Questionable players do play; most
 * Doubtful ones do not.
 */
export const PLAY_CHANCE = { QUESTIONABLE: 0.85, DOUBTFUL: 0.25 };

/**
 * How much of a player's week is shared with his NFL teammates (the share of
 * variance from a common team factor). A shoot-out lifts the quarterback, his
 * receivers and his kicker together. Defences are left out: their good days
 * track the opposing offence, not their own.
 */
export const TEAM_CORRELATION = 0.2;
const CORRELATED_POSITIONS = new Set(['QB', 'RB', 'WR', 'TE', 'K']);

/** How many free agents to test as pickups at each position. */
const PICKUPS_PER_POSITION = 2;

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
/** Win chance, in points, a contender must add over the projection lineup to replace it. */
const MIN_WIN_EDGE = 3;
/** Win chance, in points, a pickup or IR activation must add to be worth listing. */
const MIN_WHATIF_EDGE = 1;

/** Lineup slots that do not score: bench, IR, and ESPN's extra-reserve slot. */
const BENCH_SLOTS = new Set([20, 21, 24]);
const IR_SLOT = 21;

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
 * Lognormal parameters with the given mean and SD. Fantasy scores are skewed —
 * a floor near zero, a long tail of big weeks — and a lognormal has exactly
 * that shape while keeping the average at the projection.
 */
export function lognormalParams(mu, sd) {
  if (!(mu > 0) || !(sd > 0)) return null;
  const s2 = Math.log(1 + (sd / mu) ** 2);
  return { m: Math.log(mu) - s2 / 2, s: Math.sqrt(s2) };
}

/**
 * Which players a lineup may use this week.
 *
 * A player in an IR slot can only be started once he is moved back to the
 * active roster, which needs an open roster spot. When the active roster is
 * full, starting him would mean dropping somebody — so he is left out of the
 * lineup and offered separately as an "activate from IR" option instead.
 */
function irRoomFor(list, startingSlots, benchSlots) {
  if (!Number.isFinite(benchSlots)) return true; // unknown: assume room, as before
  const starters = startingSlots.reduce((a, s) => a + s.count, 0);
  const active = list.filter((p) => p.slotId !== IR_SLOT).length;
  return active < starters + benchSlots;
}

/**
 * @param {object}   input
 * @param {Array}    input.roster          current roster: { playerId, name, position, proTeam, projected,
 *                                         slotId, injuryStatus, locked?, points? }
 * @param {Array}    input.startingSlots   [{ slotId, count }]
 * @param {number}   [input.benchSlots]    bench size, for whether an IR player can be activated
 * @param {Array}    [input.opponentRoster] the opponent's roster, same shape, if known
 * @param {Array}    [input.freeAgents]    pickup candidates: { playerId, name, position, proTeam, projected, ... }
 * @param {Map}      [input.history]       playerId -> weekly scores this season
 * @param {number}   [input.simulations]
 * @param {string}   [input.seed]
 */
export function simulateLineup({
  roster,
  startingSlots,
  benchSlots = undefined,
  opponentRoster = null,
  freeAgents = [],
  history = new Map(),
  simulations = DEFAULT_SIMULATIONS,
  seed = 'roe-lineup',
}) {
  const eligible = (roster ?? []).filter((p) => p && Number.isFinite(p.projected));
  if (!eligible.length || !startingSlots?.length) return { available: false };

  const rand = mulberry32(hashSeed(seed));
  const normal = () => Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());

  const model = (list, { irRoom = true } = {}) => list.map((p) => {
    // Once his game has kicked off, a player's score is what he has actually
    // put up and his lineup spot is fixed either way.
    const locked = Boolean(p.locked);
    // A zero projection is ESPN saying he is not playing — usually a bye.
    const out = !locked && (WILL_NOT_PLAY.has(p.injuryStatus) || p.projected <= 0);
    const mu = locked ? Number(p.points ?? 0) : out ? 0 : Math.max(0, p.projected);
    const sd = locked || out ? 0 : playerSpread(p, history.get(p.playerId) ?? []);
    const playChance = locked || out ? 1 : PLAY_CHANCE[p.injuryStatus] ?? 1;
    return {
      ...p,
      locked,
      out,
      mu,
      sd,
      playChance,
      // What he is worth on average, injury risk included.
      ev: mu * playChance,
      logn: p.position === 'D/ST' ? null : lognormalParams(mu, sd),
      // Starting him needs a free roster spot, or his game has already begun.
      usable: !(locked && BENCH_SLOTS.has(p.slotId)) && (p.slotId !== IR_SLOT || irRoom),
    };
  });

  /** One player's score in one simulated week, given that week's team factors. */
  const draw = (p, teamShock) => {
    if (p.out) return 0;
    if (p.locked) return p.mu;
    if (p.playChance < 1 && rand() >= p.playChance) return 0;
    // A defence can finish below zero; its range is roughly symmetric.
    if (!p.logn) return Math.max(-5, p.mu + p.sd * normal());
    const shared = CORRELATED_POSITIONS.has(p.position) && p.proTeam && p.proTeam !== 'FA'
      ? teamShock(p.proTeam) : null;
    const z = shared === null
      ? normal()
      : Math.sqrt(TEAM_CORRELATION) * shared + Math.sqrt(1 - TEAM_CORRELATION) * normal();
    return Math.exp(p.logn.m + p.logn.s * z);
  };

  /**
   * The best lineup by `value`, keeping locked players where they are: a
   * locked starter holds his slot, a locked bench player cannot come in.
   */
  const solve = (list, value) => {
    const pinned = list.filter((p) => p.locked && !BENCH_SLOTS.has(p.slotId));
    const slots = startingSlots
      .map((s) => ({ ...s, count: s.count - pinned.filter((p) => p.slotId === s.slotId).length }))
      .filter((s) => s.count > 0);
    const free = list.filter((p) => p.usable && !p.locked);
    const rest = optimalLineup(free.map((p) => ({ ...p, points: value(p) })), slots).lineup;
    return [...pinned, ...rest];
  };

  const roomMine = irRoomFor(eligible, startingSlots, benchSlots);
  const mine = model(eligible, { irRoom: roomMine });
  const theirList = opponentRoster ? opponentRoster.filter((p) => p && Number.isFinite(p.projected)) : null;
  const theirs = theirList?.length
    ? model(theirList, { irRoom: irRoomFor(theirList, startingSlots, benchSlots) })
    : null;

  const rosterIds = new Set(mine.map((p) => p.playerId));
  // The best few free agents at each position: a waiver QB can matter as much
  // as a waiver receiver in superflex, so the pool is not just the top overall.
  const perPosition = new Map();
  for (const p of [...(freeAgents ?? [])].sort((a, b) => (b?.projected ?? 0) - (a?.projected ?? 0))) {
    if (!p || !Number.isFinite(p.projected) || p.projected <= 0 || rosterIds.has(p.playerId)) continue;
    if (WILL_NOT_PLAY.has(p.injuryStatus)) continue;
    const list = perPosition.get(p.position) ?? [];
    if (list.length < PICKUPS_PER_POSITION) perPosition.set(p.position, [...list, p]);
  }
  const pickupPool = model([...perPosition.values()].flat().map((p) => ({ ...p, slotId: 20, locked: false })));
  // IR players who would play if there were room for them.
  const irStuck = roomMine ? [] : mine.filter((p) => p.slotId === IR_SLOT && !p.out && !p.locked);

  // The opponent is assumed to start their best lineup on projections.
  const theirLineup = theirs ? solve(theirs, (p) => p.ev).map((p) => p.playerId) : null;
  const theirIndex = theirs ? new Map(theirs.map((p) => [p.playerId, p])) : null;

  // The projection lineup: best on each player's average, injury risk included.
  const projection = solve(mine, (p) => p.ev);

  const draws = [];
  const opponentScores = [];
  const timesOptimal = new Map();
  const startCount = new Map(mine.map((p) => [p.playerId, 0]));
  const extras = [...pickupPool, ...irStuck.filter((p) => !pickupPool.includes(p))];

  for (let s = 0; s < simulations; s += 1) {
    // One shared factor per NFL team per week, for both rosters alike.
    const shocks = new Map();
    const teamShock = (team) => {
      if (!shocks.has(team)) shocks.set(team, normal());
      return shocks.get(team);
    };
    const points = new Map(mine.map((p) => [p.playerId, draw(p, teamShock)]));
    for (const p of extras) if (!points.has(p.playerId)) points.set(p.playerId, draw(p, teamShock));
    draws.push(points);
    if (theirLineup) {
      opponentScores.push(theirLineup.reduce((a, id) => a + draw(theirIndex.get(id), teamShock), 0));
    }

    const best = solve(mine, (p) => points.get(p.playerId));
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
  // before looking at who wins the simulated weeks — so the pick is not simply
  // whichever lineup got lucky in these particular draws.
  //   mostStarted  the players who made the best lineup most often
  //   upside       judged at the 80th percentile of each player's range — what
  //                an underdog needs, since only a big week wins it
  //   floor        judged at the 20th percentile — what a favourite needs,
  //                since only a bust loses it
  const Z80 = 0.8416;
  const solveOn = (value) => solve(mine, value);
  const contenders = [
    ['mostStarted', solveOn((p) => startCount.get(p.playerId) + p.ev / 1000)],
    ['upside', solveOn((p) => (p.out ? -1 : p.ev + Z80 * p.sd))],
    ['floor', solveOn((p) => (p.out ? -1 : p.ev - Z80 * p.sd * (2 - p.playChance)))],
  ];

  const minEdge = (MIN_WIN_EDGE / 100) * simulations;
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
    // a point or two of win chance is noise. Without an opponent there is
    // nothing to win, and on average the projection always scores the most,
    // so it stands.
    if (theirLineup && stats.wins - projectionStats.wins >= minEdge && stats.wins > pick.stats.wins) {
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

  /**
   * "What if he were on your active roster?" — the best projection lineup with
   * him added, scored on the same simulated weeks as the pick. Returns null
   * when he would not even start.
   */
  const whatIf = (extra) => {
    const onRoster = rosterIds.has(extra.playerId);
    const list = onRoster
      ? mine.map((p) => (p.playerId === extra.playerId ? { ...p, usable: true } : p))
      : [...mine, { ...extra, usable: true }];
    const lineup = solve(list, (p) => p.ev);
    if (!lineup.some((p) => p.playerId === extra.playerId)) return null;
    const stats = evaluate(lineup);
    const ids = new Set(lineup.map((p) => p.playerId));
    const replaces = pick.lineup.filter((p) => !ids.has(p.playerId));
    const winGain = theirLineup ? round1(((stats.wins - pick.stats.wins) / simulations) * 100) : null;
    const pointsGain = round1(stats.mean - pick.stats.mean);
    if (theirLineup ? winGain < MIN_WHATIF_EDGE : pointsGain < 1) return null;
    return {
      playerId: extra.playerId,
      name: extra.name,
      position: extra.position,
      proTeam: extra.proTeam ?? null,
      projected: round1(extra.mu),
      injuryStatus: extra.injuryStatus ?? null,
      percentOwned: extra.percentOwned ?? null,
      winPct: stats.winPct,
      winGain,
      pointsGain,
      replaces: replaces.map(describe),
    };
  };
  const byGain = (a, b) => (b.winGain ?? b.pointsGain) - (a.winGain ?? a.pointsGain);
  const pickups = pickupPool.map(whatIf).filter(Boolean).sort(byGain);
  const irActivations = irStuck.map(whatIf).filter(Boolean).sort(byGain);

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
    // The other lineups tried, and how each did across the same weeks.
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
    // Free agents who would start for you and raise your chance of winning.
    pickups,
    // IR players who would start, if a roster spot were freed to activate them.
    irActivations,
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
        locked: p.locked,
        playChance: p.playChance,
        // The middle 80% of his simulated weeks: 10th to 90th percentile.
        low: round1(lowHigh(p).low),
        high: round1(lowHigh(p).high),
        startPct: Math.round((startCount.get(p.playerId) / simulations) * 100),
        recommended: pickIds.has(p.playerId),
      }))
      .sort((a, b) => b.startPct - a.startPct || b.projected - a.projected),
    distinctOptimalLineups: timesOptimal.size,
  };
}

/** A player's 10th and 90th percentile week, from his own distribution. */
function lowHigh(p) {
  const Z90 = 1.2816;
  if (p.out || p.locked || p.sd === 0) return { low: p.mu, high: p.mu };
  if (!p.logn) return { low: Math.max(-5, p.mu - Z90 * p.sd), high: p.mu + Z90 * p.sd };
  return { low: Math.exp(p.logn.m - Z90 * p.logn.s), high: Math.exp(p.logn.m + Z90 * p.logn.s) };
}
