/**
 * The big board — every draftable player, graded.
 *
 * A grade is only meaningful against a baseline, and the honest baseline is
 * REPLACEMENT LEVEL: the worst player at a position you would still start.
 * 300 projected points is elite for a tight end and unremarkable for a
 * quarterback, so raw projections cannot be compared across positions.
 *
 * Replacement level is not hardcoded. It is derived by greedily filling all
 * twelve starting lineups from the projection-ranked pool, then reading off the
 * worst starter at each position. That matters enormously here: this league
 * starts an OP slot, so quarterbacks absorb most of the flex and QB replacement
 * level sits far deeper than it would in a standard league. Hardcoding "QB12"
 * would misprice every quarterback on the board.
 */

const SLOT_ELIGIBILITY = {
  0: ['QB'], 2: ['RB'], 4: ['WR'], 6: ['TE'], 16: ['D/ST'], 17: ['K'],
  23: ['RB', 'WR', 'TE'], 7: ['QB', 'RB', 'WR', 'TE'],
  3: ['RB', 'WR'], 5: ['WR', 'TE'],
};

const round1 = (n) => Number((n ?? 0).toFixed(1));

/**
 * Simulates every team filling its starting lineup with the best players
 * available, then reports the worst starter at each position.
 *
 * Self-adjusting: change the league to superflex, or to two flex slots, and the
 * baselines move on their own.
 */
export function computeReplacementLevels(players, startingSlots, teamCount) {
  const pool = players
    .filter((p) => Number.isFinite(p.projected))
    .sort((a, b) => b.projected - a.projected);

  // One entry per starting slot across the whole league, most restrictive
  // first so flex slots take genuine leftovers rather than premium players.
  const slots = [];
  for (const { slotId, count } of startingSlots ?? []) {
    for (let t = 0; t < teamCount; t += 1) {
      for (let i = 0; i < count; i += 1) slots.push(slotId);
    }
  }
  slots.sort((a, b) => (SLOT_ELIGIBILITY[a] ?? []).length - (SLOT_ELIGIBILITY[b] ?? []).length);

  const taken = new Set();
  const startersByPosition = new Map();

  for (const slotId of slots) {
    const eligible = SLOT_ELIGIBILITY[slotId] ?? [];
    const pick = pool.find((p) => !taken.has(p.playerId) && eligible.includes(p.position));
    if (!pick) continue;
    taken.add(pick.playerId);
    if (!startersByPosition.has(pick.position)) startersByPosition.set(pick.position, []);
    startersByPosition.get(pick.position).push(pick);
  }

  const levels = {};
  const counts = {};
  for (const [position, list] of startersByPosition) {
    counts[position] = list.length;
    // The worst player still starting at this position.
    levels[position] = round1(Math.min(...list.map((p) => p.projected)));
  }

  return { levels, startersNeeded: counts };
}

/**
 * Tiers are computed WITHIN each position, at the biggest cliffs.
 *
 * Two false starts got here. Tiering the whole board by absolute VORP gap puts
 * every break in the top ten — gaps between elite players are enormous and
 * gaps in the middle are fractions of a point — so 240 of 250 players land in
 * one meaningless bucket. And a global tier answers the wrong question anyway:
 * `valueRank` already says who is best overall, whereas what a drafter needs at
 * the table is "how far does it fall if I miss this group of tight ends?"
 *
 * So: tier per position, breaking at that position's largest drops.
 */
function assignPositionalTiers(sorted, { tiersPerPosition = 6 } = {}) {
  const byPosition = new Map();
  for (const p of sorted) {
    if (!byPosition.has(p.position)) byPosition.set(p.position, []);
    byPosition.get(p.position).push(p);
  }

  for (const list of byPosition.values()) {
    if (list.length < 2) {
      list.forEach((p) => { p.tier = 1; });
      continue;
    }

    const gaps = [];
    for (let i = 1; i < list.length; i += 1) {
      gaps.push({ index: i, gap: Math.max(0, list[i - 1].vorp - list[i].vorp) });
    }
    const breaks = new Set(
      [...gaps]
        .sort((a, b) => b.gap - a.gap)
        .slice(0, Math.max(0, tiersPerPosition - 1))
        .map((g) => g.index)
    );

    let tier = 1;
    list[0].tier = 1;
    for (let i = 1; i < list.length; i += 1) {
      if (breaks.has(i)) tier += 1;
      list[i].tier = tier;
    }
  }
}

/**
 * A→F, banded in standard deviations of the actual delta spread.
 *
 * Fixed thresholds do not survive a change of scale: ±40 places was calibrated
 * for a short board and, applied across 250 players where deltas routinely
 * exceed 100, put 54% of the league at A+ or F. Grading in units of the
 * observed spread keeps the distribution sane at any board size while
 * preserving the absolute anchor that matters — a delta of zero means a player
 * is priced exactly where his value says he belongs, and lands at B-.
 */
function gradeFromZ(z) {
  if (z >= 1.5) return 'A+';
  if (z >= 1.0) return 'A';
  if (z >= 0.6) return 'A-';
  if (z >= 0.3) return 'B+';
  if (z >= 0.1) return 'B';
  if (z >= -0.1) return 'B-';
  if (z >= -0.3) return 'C+';
  if (z >= -0.6) return 'C';
  if (z >= -1.0) return 'C-';
  if (z >= -1.5) return 'D';
  return 'F';
}

function standardDeviation(values) {
  if (values.length < 2) return 1;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, v) => a + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance) || 1;
}

/**
 * How many of each position a team can sensibly roster.
 *
 * Derived from the format rather than hardcoded: count the slots each position
 * can legally fill, then allow bench depth on top. Running backs and receivers
 * get more because they get hurt and have bye weeks; kickers and defences get
 * exactly one, because rostering two is throwing a pick away.
 */
function rosterCapacity(startingSlots) {
  const startable = {};
  for (const { slotId, count } of startingSlots ?? []) {
    for (const pos of SLOT_ELIGIBILITY[slotId] ?? []) {
      startable[pos] = (startable[pos] ?? 0) + count;
    }
  }

  const capacity = {};
  for (const [pos, slots] of Object.entries(startable)) {
    if (pos === 'K' || pos === 'D/ST') capacity[pos] = 1;
    else if (pos === 'QB' || pos === 'TE') capacity[pos] = slots + 1;
    else capacity[pos] = slots + 3;
  }
  return { startable, capacity };
}

/**
 * Where each player *should* go, from a deterministic draft in which all teams
 * draft well.
 *
 * Simply converting value rank into a pick number would be wrong: VORP likes
 * kickers more than it should (see `streamable`), so the sixth-best kicker
 * would be "recommended" in round four, which nobody sane would do. Simulating
 * a real draft applies the constraints that actually govern draft order —
 * rosters fill up, nobody carries three tight ends, and kickers go last —
 * so the recommendation is one a person could follow.
 *
 * Deterministic by design: no randomness, so the same board always yields the
 * same recommendations and two people reading the hub see the same advice.
 */
export function simulateConsensusDraft(rankedByValue, { startingSlots, teams, rounds }) {
  const { capacity } = rosterCapacity(startingSlots);
  const totalPicks = teams * rounds;

  const rosters = Array.from({ length: teams }, () => ({}));
  const taken = new Set();
  const result = new Map();

  for (let pickNumber = 1; pickNumber <= totalPicks; pickNumber += 1) {
    const round = Math.ceil(pickNumber / teams);
    const indexInRound = (pickNumber - 1) % teams;
    // Snake order.
    const teamIndex = round % 2 === 1 ? indexInRound : teams - 1 - indexInRound;
    const roster = rosters[teamIndex];

    // Kickers and defences are worth exactly one late pick each. Gating them
    // is what stops VORP from recommending a kicker in the middle rounds.
    const lateOnly = round >= rounds - 1;

    const pick = rankedByValue.find((p) => {
      if (taken.has(p.playerId)) return false;
      const max = capacity[p.position];
      if (max === undefined) return false;
      if ((roster[p.position] ?? 0) >= max) return false;
      if ((p.position === 'K' || p.position === 'D/ST') && !lateOnly) return false;
      return true;
    });

    if (!pick) continue;
    taken.add(pick.playerId);
    roster[pick.position] = (roster[pick.position] ?? 0) + 1;
    result.set(pick.playerId, { pick: pickNumber, round });
  }

  return result;
}

/** The overall pick numbers belonging to one draft slot in a snake draft. */
export function picksForSlot(slot, teams, rounds) {
  const picks = [];
  for (let round = 1; round <= rounds; round += 1) {
    const indexInRound = round % 2 === 1 ? slot - 1 : teams - slot;
    picks.push({ round, overall: (round - 1) * teams + indexInRound + 1 });
  }
  return picks;
}

/**
 * @param {object} pool  docs/data/draftpool payload (players, startingSlots, teams)
 * @param {object} [draft] analyzed draft, so picks can be attached once held
 * @param {number} [limit] how many players to publish
 */
export function buildBigBoard(pool, draft = null, limit = 250) {
  const all = (pool?.players ?? []).filter((p) => Number.isFinite(p.projected));
  if (!all.length) {
    return { available: false, players: [], replacement: {}, scarcity: [], rankType: pool?.rankType ?? null };
  }

  const teamCount = pool.teams ?? 12;
  const { levels, startersNeeded } = computeReplacementLevels(all, pool.startingSlots, teamCount);

  // Where each player was actually taken, once a draft exists.
  const pickByPlayer = new Map();
  for (const pick of draft?.picks ?? []) {
    pickByPlayer.set(pick.playerId, pick);
  }

  const withVorp = all.map((p) => {
    const replacement = levels[p.position];
    // A position nobody starts (P, HC) has no replacement level and no VORP.
    const vorp = replacement === undefined ? null : round1(p.projected - replacement);
    return { ...p, replacement: replacement ?? null, vorp };
  });

  // Rank by value, which is the whole point — this is the order the board
  // *should* be in, as opposed to the order ESPN publishes.
  const rankable = withVorp.filter((p) => p.vorp !== null).sort((a, b) => b.vorp - a.vorp);
  rankable.forEach((p, i) => { p.valueRank = i + 1; });
  assignPositionalTiers(rankable);

  // Positional rank, so "the 4th-best TE" is answerable at a glance.
  const posCounter = new Map();
  for (const p of rankable) {
    const n = (posCounter.get(p.position) ?? 0) + 1;
    posCounter.set(p.position, n);
    p.positionRank = n;
  }

  // Where each player should actually go, under real roster constraints.
  const rounds = pool.rounds ?? 16;
  const consensus = simulateConsensusDraft(rankable, {
    startingSlots: pool.startingSlots,
    teams: teamCount,
    rounds,
  });

  // Deltas first, so the grade curve can be scaled to their real spread.
  const published = rankable.slice(0, limit);
  for (const p of published) {
    const costRank = p.adp ?? p.rank; // ADP where ESPN has one, else board rank.
    p.valueDelta = costRank === null ? null : Math.round(costRank - p.valueRank);
  }
  const deltaSpread = standardDeviation(
    published.map((p) => p.valueDelta).filter((d) => d !== null)
  );

  const players = published
    .map((p) => {
      const pick = pickByPlayer.get(p.playerId) ?? null;
      const delta = p.valueDelta;
      const rec = consensus.get(p.playerId) ?? null;
      // Positive = the market lets him fall past where he should go.
      const adpVsRecommended =
        rec && p.adp !== null ? Math.round(p.adp - rec.pick) : null;

      return {
        recommendedPick: rec?.pick ?? null,
        recommendedRound: rec?.round ?? null,
        // Players outside the simulated draft are genuinely undraftable in a
        // league this size — worth saying so rather than showing a blank.
        draftable: Boolean(rec),
        adpVsRecommended,
        playerId: p.playerId,
        name: p.name,
        position: p.position,
        proTeam: p.proTeam,
        injuryStatus: p.injuryStatus,

        boardRank: p.rank,
        pprRank: p.pprRank,
        adp: p.adp,
        auctionValue: p.auctionValue,

        projected: p.projected,
        lastSeason: p.lastSeason,
        replacement: p.replacement,
        vorp: p.vorp,

        valueRank: p.valueRank,
        positionRank: p.positionRank,
        tier: p.tier,
        streamable: p.position === 'K' || p.position === 'D/ST',
        valueDelta: delta,
        grade: delta === null ? null : gradeFromZ(delta / deltaSpread),

        drafted: Boolean(pick),
        pick: pick
          ? {
              overall: pick.overall, round: pick.round,
              teamId: pick.teamId, teamName: pick.teamName,
              managerName: pick.managerName ?? null,
            }
          : null,
      };
    });

  // How thin each position gets, which is what drives draft urgency.
  const scarcity = Object.entries(startersNeeded)
    .map(([position, needed]) => {
      const atPos = rankable.filter((p) => p.position === position);
      const startable = atPos.slice(0, needed);
      return {
        position,
        startersNeeded: needed,
        totalRanked: atPos.length,
        replacement: levels[position],
        bestProjection: atPos[0]?.projected ?? null,
        // The drop from the best to the last startable player: a big number
        // means the position is top-heavy and worth paying up for.
        eliteAdvantage: startable.length
          ? round1(startable[0].projected - startable[startable.length - 1].projected)
          : null,
      };
    })
    .sort((a, b) => (b.eliteAdvantage ?? 0) - (a.eliteAdvantage ?? 0));

  /**
   * Average value gap by position — the superflex effect, quantified.
   *
   * ADP is collected across mostly-standard leagues, so in a superflex format
   * it systematically underprices quarterbacks. This is not noise to correct
   * for; it is the single biggest edge available in this draft, and it deserves
   * to be stated as a number rather than left for someone to infer from 250
   * individual grades.
   */
  const positionValue = [...new Set(players.map((p) => p.position))]
    .map((position) => {
      const group = players.filter((p) => p.position === position && p.valueDelta !== null);
      if (!group.length) return null;
      const avg = group.reduce((a, p) => a + p.valueDelta, 0) / group.length;
      return {
        position,
        count: group.length,
        avgValueDelta: Math.round(avg),
        // Positive = the market drafts this position later than its value warrants.
        underpriced: avg > 0,
        // VORP overstates draft-day value for kickers and defences. It treats
        // 26 points above replacement as 26 points regardless of position, but
        // K and D/ST are near-freely replaceable off waivers every week, so
        // that edge is not something you need a draft pick to capture. The
        // model cannot see this — week-to-week volatility is not in ESPN's
        // payload — so it is flagged rather than silently corrected.
        streamable: position === 'K' || position === 'D/ST',
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.avgValueDelta - a.avgValueDelta);

  return {
    available: true,
    rankType: pool.rankType ?? null,
    teamCount,
    limit,
    replacement: levels,
    startersNeeded,
    scarcity,
    positionValue,
    rounds,
    picksBySlot: Object.fromEntries(
      Array.from({ length: teamCount }, (_, i) => [i + 1, picksForSlot(i + 1, teamCount, rounds).map((p) => p.overall)])
    ),
    gradeSpread: Math.round(deltaSpread),
    players,
  };
}
