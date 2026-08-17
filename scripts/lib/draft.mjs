/**
 * Draft analysis.
 *
 * The hard part of grading a draft is deciding what a pick "should" have been
 * worth. With a single league and no external ADP feed there is no outside
 * baseline, so value is measured *within the draft itself*:
 *
 *   Rank every drafted player by the fantasy points they actually scored.
 *   Compare that rank to where they were taken.
 *
 * A player taken 40th who finished as the 12th-best drafted player returned
 * +28 slots of value. This is self-normalizing — it needs no ADP, no
 * projections, and no prior seasons — and it answers the question people
 * actually argue about: who got the steals and who reached.
 */

const round2 = (n) => Number((n ?? 0).toFixed(2));
const round1 = (n) => Number((n ?? 0).toFixed(1));

/** Total fantasy points each player scored this season, from all box scores. */
export function buildPlayerSeasonPoints(season) {
  const totals = new Map();

  for (const week of season.weeks) {
    if (!week.played) continue;
    for (const matchup of week.matchups) {
      for (const side of [matchup.home, matchup.away]) {
        if (!side) continue;
        for (const p of side.roster) {
          // Count every rostered player's output, started or benched — a draft
          // pick's value is what the player produced, not whether the manager
          // correctly guessed which weeks to start him.
          const prev = totals.get(p.playerId) ?? { points: 0, games: 0, name: p.name, position: p.position };
          prev.points += p.points;
          if (p.points !== 0) prev.games += 1;
          totals.set(p.playerId, prev);
        }
      }
    }
  }

  for (const v of totals.values()) v.points = round2(v.points);
  return totals;
}

export function analyzeDraft(season) {
  const { draft, teams } = season;

  if (!draft.held || draft.picks.length === 0) {
    return {
      held: false,
      rounds: draft.rounds,
      totalSlots: draft.totalSlots,
      picks: [],
      board: [],
      teamGrades: [],
      steals: [],
      reaches: [],
      positionRuns: [],
      hasResults: false,
    };
  }

  const seasonPoints = buildPlayerSeasonPoints(season);
  const hasResults = seasonPoints.size > 0;

  // Rank drafted players by what they actually produced.
  const withPoints = draft.picks.map((pick) => {
    const stat = seasonPoints.get(pick.playerId);
    return { ...pick, seasonPoints: stat?.points ?? 0, gamesPlayed: stat?.games ?? 0 };
  });

  const ranked = [...withPoints].sort((a, b) => b.seasonPoints - a.seasonPoints);
  const actualRank = new Map(ranked.map((p, i) => [p.playerId, i + 1]));

  const picks = withPoints.map((pick) => {
    const rank = actualRank.get(pick.playerId) ?? withPoints.length;
    // Positive = outperformed the slot they cost.
    const valueDelta = hasResults ? pick.overall - rank : null;
    return {
      ...pick,
      actualRank: hasResults ? rank : null,
      valueDelta,
      pointsPerGame: pick.gamesPlayed ? round2(pick.seasonPoints / pick.gamesPlayed) : 0,
    };
  });

  // ---- Draft board: rounds x teams, in snake order ------------------------
  const board = [];
  for (let round = 1; round <= draft.rounds; round += 1) {
    const roundPicks = picks
      .filter((p) => p.round === round)
      .sort((a, b) => a.pickInRound - b.pickInRound);
    if (roundPicks.length) board.push({ round, picks: roundPicks });
  }

  // ---- Per-manager grades ------------------------------------------------
  const teamGrades = teams
    .filter((t) => picks.some((p) => p.teamId === t.id))
    .map((team) => {
      const own = picks.filter((p) => p.teamId === team.id);
      const totalPoints = round2(own.reduce((a, p) => a + p.seasonPoints, 0));
      const totalValue = hasResults ? own.reduce((a, p) => a + (p.valueDelta ?? 0), 0) : null;

      const byPosition = {};
      for (const p of own) {
        byPosition[p.position] = (byPosition[p.position] ?? 0) + 1;
      }

      const bestPick = hasResults && own.length
        ? own.reduce((a, b) => ((a.valueDelta ?? 0) >= (b.valueDelta ?? 0) ? a : b))
        : null;
      const worstPick = hasResults && own.length
        ? own.reduce((a, b) => ((a.valueDelta ?? 0) <= (b.valueDelta ?? 0) ? a : b))
        : null;

      return {
        teamId: team.id,
        teamName: team.name,
        managerName: team.managerName,
        pickCount: own.length,
        totalPoints,
        avgPointsPerPick: own.length ? round2(totalPoints / own.length) : 0,
        totalValue,
        avgValue: hasResults && own.length ? round1(totalValue / own.length) : null,
        byPosition,
        firstPickOverall: own.length ? Math.min(...own.map((p) => p.overall)) : null,
        bestPick,
        worstPick,
        autoDraftedCount: own.filter((p) => p.autoDrafted).length,
      };
    });

  if (hasResults) {
    teamGrades.sort((a, b) => b.totalValue - a.totalValue);
    // Letter grades on a curve — the point is ranking within this league.
    const scale = ['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'F'];
    teamGrades.forEach((t, i) => {
      const idx = Math.min(scale.length - 1, Math.floor((i / teamGrades.length) * scale.length));
      t.grade = scale[idx];
      t.rank = i + 1;
    });
  } else {
    teamGrades.sort((a, b) => (a.firstPickOverall ?? 0) - (b.firstPickOverall ?? 0));
  }

  // ---- Steals and reaches -------------------------------------------------
  const sortedByValue = hasResults ? [...picks].sort((a, b) => b.valueDelta - a.valueDelta) : [];
  const steals = sortedByValue.slice(0, 10);
  const reaches = sortedByValue.slice(-10).reverse();

  // ---- Positional runs ----------------------------------------------------
  // Where each position came off the board, which is how you spot a run.
  const positionRuns = ['QB', 'RB', 'WR', 'TE', 'K', 'D/ST'].map((pos) => {
    const taken = picks.filter((p) => p.position === pos).sort((a, b) => a.overall - b.overall);
    return {
      position: pos,
      count: taken.length,
      firstOverall: taken[0]?.overall ?? null,
      firstPlayer: taken[0]?.playerName ?? null,
      lastOverall: taken[taken.length - 1]?.overall ?? null,
      medianOverall: taken.length
        ? taken[Math.floor(taken.length / 2)].overall
        : null,
    };
  });

  return {
    held: true,
    rounds: draft.rounds,
    totalSlots: draft.totalSlots,
    picksMade: draft.picksMade,
    hasResults,
    picks,
    board,
    teamGrades,
    steals,
    reaches,
    positionRuns,
  };
}
