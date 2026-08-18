/**
 * The roster advisor — per-team, forward-looking guidance.
 *
 * Three distinct questions, with very different confidence levels:
 *
 *   1. "What should I start this week?"  Uses ESPN's own projections. Advice,
 *      not prophecy — projections are wrong all the time. It is still strictly
 *      better than the default, which is whatever you set last week and forgot.
 *
 *   2. "What did I get wrong?"  Retrospective, from actual results. This one is
 *      not a guess: the points were scored or they weren't.
 *
 *   3. "Who should I pick up?"  Compares free agents' projections against the
 *      weakest starter at each position.
 *
 * Everything degrades to an empty result when the data isn't there, because
 * until the Sept 5 draft there are no rosters at all.
 */

import { optimalLineup, SLOT_ELIGIBILITY } from './lineup.mjs';

const round2 = (n) => Number((n ?? 0).toFixed(2));

/** Slots a player does not score from. */
const BENCH_SLOTS = new Set([20, 21, 24]);

/**
 * Start/sit recommendation for the upcoming week.
 *
 * Runs the optimal-lineup solver over PROJECTED points rather than actual, then
 * diffs the result against who is currently slotted in.
 */
export function recommendLineup(roster, startingSlots) {
  const players = (roster ?? []).filter((p) => p && Number.isFinite(p.projected));
  if (players.length === 0 || !startingSlots?.length) {
    return {
      available: false, alreadyOptimal: true,
      toStart: [], toSit: [], recommended: [],
      projectedGain: 0, projectedTotal: 0, currentProjected: 0,
    };
  }

  // The solver optimises `points`, so project into that field.
  const byProjection = players.map((p) => ({ ...p, points: p.projected }));
  const best = optimalLineup(byProjection, startingSlots);

  const recommendedIds = new Set(best.lineup.map((p) => p.playerId));
  const currentStarters = players.filter((p) => !BENCH_SLOTS.has(p.slotId));
  const currentIds = new Set(currentStarters.map((p) => p.playerId));
  const currentProjected = currentStarters.reduce((a, p) => a + p.projected, 0);

  const describe = (p) => ({
    playerId: p.playerId, name: p.name, position: p.position,
    slot: p.slot ?? null, projected: round2(p.projected),
  });

  // Two independent lists, NOT zipped into pretend 1:1 swaps.
  //
  // It is tempting to pair "start X" with "sit Y" so each row reads as one
  // decision, but that quietly lies whenever the two occupy different slots:
  // pairing a bench QB against a starting TE produces "start the QB instead of
  // the TE", which is not a legal move in a lineup with a fixed QB slot and a
  // fixed TE slot. The honest framing is who belongs in, who belongs out, and
  // what the whole change is worth.
  const toStart = best.lineup
    .filter((p) => !currentIds.has(p.playerId))
    .sort((a, b) => b.projected - a.projected)
    .map(describe);
  const toSit = currentStarters
    .filter((p) => !recommendedIds.has(p.playerId))
    .sort((a, b) => a.projected - b.projected)
    .map(describe);

  const projectedGain = round2(Math.max(0, best.points - currentProjected));

  // Projections are nowhere near precise enough for a sub-point "improvement"
  // to mean anything, and surfacing one teaches people to ignore the feature.
  const worthDoing = projectedGain >= 1 && toStart.length > 0;

  return {
    available: true,
    alreadyOptimal: !worthDoing,
    toStart: worthDoing ? toStart : [],
    toSit: worthDoing ? toSit : [],
    projectedGain,
    projectedTotal: round2(best.points),
    currentProjected: round2(currentProjected),
    recommended: best.lineup.map((p) => ({
      playerId: p.playerId, name: p.name, position: p.position,
      slotId: p.slotId, projected: round2(p.projected),
    })),
  };
}

/**
 * What this manager actually got wrong, week by week. Not a projection — these
 * points were left on the bench in reality.
 */
export function coachingReport(teamWeeks, startingSlots) {
  const rows = (teamWeeks ?? []).filter((r) => r.starters?.length);
  if (!rows.length) return { available: false, weeks: [], worstCalls: [], totalBenched: 0 };

  const worstCalls = [];

  for (const row of rows) {
    const optimal = optimalLineup([...row.starters, ...row.benchPlayers], startingSlots ?? []);
    const startedIds = new Set(row.starters.map((p) => p.playerId));
    const optimalIds = new Set(optimal.lineup.map((p) => p.playerId));

    const shouldHaveStarted = optimal.lineup
      .filter((p) => !startedIds.has(p.playerId))
      .sort((a, b) => b.points - a.points);
    const shouldHaveSat = row.starters
      .filter((p) => !optimalIds.has(p.playerId))
      .sort((a, b) => a.points - b.points);

    for (let i = 0; i < Math.min(shouldHaveStarted.length, shouldHaveSat.length); i += 1) {
      const gain = shouldHaveStarted[i].points - shouldHaveSat[i].points;
      if (gain <= 0) continue;
      worstCalls.push({
        week: row.week,
        benched: {
          name: shouldHaveStarted[i].name, position: shouldHaveStarted[i].position,
          points: round2(shouldHaveStarted[i].points),
        },
        started: {
          name: shouldHaveSat[i].name, position: shouldHaveSat[i].position,
          points: round2(shouldHaveSat[i].points),
        },
        cost: round2(gain),
        // Did this actually lose the matchup, or was it harmless?
        changedResult: row.result === 'LOSS' && gain > Math.abs(row.margin),
      });
    }
  }

  worstCalls.sort((a, b) => b.cost - a.cost);

  return {
    available: true,
    totalBenched: round2(rows.reduce((a, r) => a + (r.benchPoints ?? 0), 0)),
    gamesCostByBadLineups: worstCalls.filter((c) => c.changedResult).length,
    worstCalls: worstCalls.slice(0, 10),
    weeks: rows.map((r) => ({
      week: r.week, score: r.score, optimalScore: r.optimalScore,
      efficiency: r.efficiency, benchPoints: r.benchPoints, result: r.result,
    })),
  };
}

/**
 * Free agents worth adding, judged against the weakest starter at each position.
 *
 * Deliberately conservative: a free agent has to clearly beat what you already
 * start before it justifies a roster move and a waiver claim.
 */
export function waiverTargets(freeAgents, roster, startingSlots, { minGain = 2, limit = 8 } = {}) {
  const fas = (freeAgents ?? []).filter((p) => Number.isFinite(p.projected) && p.projected > 0);
  const players = (roster ?? []).filter((p) => Number.isFinite(p.projected));
  if (!fas.length || !players.length) return { available: false, targets: [], injuryGaps: [] };

  // The bar is derived from the lineup you would actually field, not from a
  // per-position slot count.
  //
  // Counting slots per position double-counts every flex: with 2 RB + 2 WR +
  // 1 TE + 1 FLEX, each of RB, WR and TE separately believes it needs three
  // starters. A roster whose flex is filled then looks "short" at every
  // position, the bar collapses to zero, and any warm body clears it. Solving
  // the lineup once and reading the weakest starter off it avoids that.
  const best = optimalLineup(players.map((p) => ({ ...p, points: p.projected })), startingSlots);

  const bar = new Map();
  for (const pos of new Set(fas.map((f) => f.position))) {
    const usableSlots = new Set(
      (startingSlots ?? [])
        .filter((s) => (SLOT_ELIGIBILITY[s.slotId] ?? []).includes(pos))
        .map((s) => s.slotId)
    );
    // A position that never starts in this format is not a target at all.
    if (usableSlots.size === 0) continue;

    const occupying = best.lineup.filter((p) => usableSlots.has(p.slotId));
    // An eligible slot nobody is filling is a genuine hole.
    bar.set(pos, occupying.length ? Math.min(...occupying.map((p) => p.points)) : 0);
  }

  const targets = fas
    .map((fa) => {
      const threshold = bar.get(fa.position);
      if (threshold === undefined) return null;
      const gain = fa.projected - threshold;
      if (gain < minGain) return null;
      return {
        playerId: fa.playerId, name: fa.name, position: fa.position,
        proTeam: fa.proTeam, projected: round2(fa.projected),
        percentOwned: fa.percentOwned ?? null,
        injuryStatus: fa.injuryStatus ?? null,
        beats: round2(threshold), gain: round2(gain),
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.gain - a.gain)
    .slice(0, limit);

  // A hurt starter matters more than any marginal upgrade.
  const injuryGaps = players
    .filter((p) => !BENCH_SLOTS.has(p.slotId))
    .filter((p) => ['OUT', 'DOUBTFUL', 'INJURY_RESERVE', 'SUSPENSION'].includes(p.injuryStatus))
    .map((p) => ({
      playerId: p.playerId, name: p.name, position: p.position,
      injuryStatus: p.injuryStatus,
      replacement: targets.find((t) => t.position === p.position) ?? null,
    }));

  return { available: true, targets, injuryGaps };
}
