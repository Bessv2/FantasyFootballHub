/**
 * Optimal-lineup solver.
 *
 * "What was the most this roster could have scored?" underpins lineup
 * efficiency, points-left-on-the-bench, perfect-lineup weeks, and several
 * prizes — so it needs to be exactly right, not approximately right.
 *
 * The approach: fill the most restrictive slots first, then progressively
 * looser ones. For standard football rosters (where the only overlapping slot
 * is FLEX) this is provably optimal — a dedicated RB slot can never do better
 * than the best available RB, and moving a better RB to FLEX only to demote a
 * worse one into the RB slot cannot increase the total.
 *
 * Leagues with several overlapping slot types (FLEX + superflex + WR/TE) are
 * where greedy could in principle drift from optimal, so those fall through to
 * an exhaustive search over the small candidate pool.
 */

/** Which player positions may legally fill each lineup slot. */
export const SLOT_ELIGIBILITY = {
  0: ['QB'],
  2: ['RB'],
  4: ['WR'],
  6: ['TE'],
  16: ['D/ST'],
  17: ['K'],
  18: ['P'],
  19: ['HC'],
  3: ['RB', 'WR'],
  5: ['WR', 'TE'],
  23: ['RB', 'WR', 'TE'],
  7: ['QB', 'RB', 'WR', 'TE'],
  1: ['QB'],
  8: ['DT'],
  9: ['DE'],
  10: ['LB'],
  11: ['DT', 'DE'],
  12: ['CB'],
  13: ['S'],
  14: ['CB', 'S'],
  15: ['DT', 'DE', 'LB', 'CB', 'S'],
};

/**
 * @param {Array<{playerId:number,name:string,position:string,points:number}>} roster
 *   Every player available that week — starters AND bench.
 * @param {Array<{slotId:number,count:number}>} startingSlots
 * @returns {{points:number, lineup:Array, benched:Array}}
 */
export function optimalLineup(roster, startingSlots) {
  const players = (roster ?? []).filter((p) => p && Number.isFinite(p.points));
  if (players.length === 0 || !startingSlots?.length) {
    return { points: 0, lineup: [], benched: [] };
  }

  // Expand {slotId, count:2} into two individual slots.
  const slots = [];
  for (const { slotId, count } of startingSlots) {
    for (let i = 0; i < count; i += 1) slots.push(slotId);
  }

  const eligibilityFor = (slotId) => SLOT_ELIGIBILITY[slotId] ?? [];
  const overlapping = slots.filter((s) => eligibilityFor(s).length > 1);
  const distinctOverlapTypes = new Set(overlapping.map((s) => eligibilityFor(s).join('/')));

  const result =
    distinctOverlapTypes.size > 1
      ? exhaustive(players, slots, eligibilityFor)
      : greedy(players, slots, eligibilityFor);

  const usedIds = new Set(result.lineup.map((p) => p.playerId));
  return {
    points: Number(result.points.toFixed(2)),
    lineup: result.lineup,
    benched: players.filter((p) => !usedIds.has(p.playerId)),
  };
}

/** Most-restrictive-slot-first fill. Exact when at most one flex type exists. */
function greedy(players, slots, eligibilityFor) {
  const order = [...slots].sort((a, b) => eligibilityFor(a).length - eligibilityFor(b).length);
  const remaining = [...players].sort((a, b) => b.points - a.points);
  const lineup = [];
  let points = 0;

  for (const slotId of order) {
    const eligible = eligibilityFor(slotId);
    const idx = remaining.findIndex((p) => eligible.includes(p.position));
    if (idx === -1) continue; // No legal player for this slot — leave it empty.
    const [picked] = remaining.splice(idx, 1);
    lineup.push({ ...picked, slotId });
    points += picked.points;
  }
  return { points, lineup };
}

/**
 * Exhaustive assignment for exotic slot configurations.
 *
 * Only the top few scorers per position can ever appear in an optimal lineup —
 * if a position has at most N startable slots, the (N+1)th-best player at that
 * position is never needed. Trimming to that keeps the search tiny.
 */
function exhaustive(players, slots, eligibilityFor) {
  const capacity = new Map();
  for (const slotId of slots) {
    for (const pos of eligibilityFor(slotId)) {
      capacity.set(pos, (capacity.get(pos) ?? 0) + 1);
    }
  }

  const byPosition = new Map();
  for (const p of players) {
    if (!byPosition.has(p.position)) byPosition.set(p.position, []);
    byPosition.get(p.position).push(p);
  }
  const pool = [];
  for (const [pos, list] of byPosition) {
    list.sort((a, b) => b.points - a.points);
    pool.push(...list.slice(0, capacity.get(pos) ?? 0));
  }

  const order = [...slots].sort((a, b) => eligibilityFor(a).length - eligibilityFor(b).length);
  let best = { points: -1, lineup: [] };
  const used = new Set();
  const current = [];

  const remainingUpperBound = (slotIdx) => {
    // Optimistic bound: every unfilled slot takes the best unused player.
    const unused = pool.filter((p) => !used.has(p.playerId)).sort((a, b) => b.points - a.points);
    let bound = 0;
    for (let i = slotIdx; i < order.length && i - slotIdx < unused.length; i += 1) {
      bound += unused[i - slotIdx].points;
    }
    return bound;
  };

  const recurse = (slotIdx, points) => {
    if (slotIdx === order.length) {
      if (points > best.points) best = { points, lineup: [...current] };
      return;
    }
    if (points + remainingUpperBound(slotIdx) <= best.points) return; // prune

    const slotId = order[slotIdx];
    const eligible = eligibilityFor(slotId);
    let placedAny = false;

    for (const p of pool) {
      if (used.has(p.playerId) || !eligible.includes(p.position)) continue;
      placedAny = true;
      used.add(p.playerId);
      current.push({ ...p, slotId });
      recurse(slotIdx + 1, points + p.points);
      current.pop();
      used.delete(p.playerId);
    }
    if (!placedAny) recurse(slotIdx + 1, points); // no legal filler; skip slot
  };

  recurse(0, 0);
  return best.points < 0 ? { points: 0, lineup: [] } : best;
}

/**
 * How well a manager set their lineup, as a percentage of what was achievable.
 * 100% means a perfect lineup that week.
 */
export function lineupEfficiency(actualPoints, optimalPoints) {
  if (!optimalPoints) return null;
  return Number(((actualPoints / optimalPoints) * 100).toFixed(1));
}
