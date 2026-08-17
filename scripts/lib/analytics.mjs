/**
 * Season analytics: standings, power rankings, luck, manager skill, and the
 * side-prize catalog.
 *
 * Every function here tolerates an empty or partial season — the league does
 * not draft until Sept 5 2026, so "no data yet" is the normal case for a while
 * and must produce empty results rather than NaN or a crash.
 */

import { optimalLineup, lineupEfficiency } from './lineup.mjs';

const round2 = (n) => Number((n ?? 0).toFixed(2));
const round1 = (n) => Number((n ?? 0).toFixed(1));

function mean(values) {
  if (!values.length) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function stdDev(values) {
  if (values.length < 2) return 0;
  const m = mean(values);
  return Math.sqrt(mean(values.map((v) => (v - m) ** 2)));
}

/**
 * The spine of everything else: one record per team per played week, with the
 * actual score, the best score that roster could have produced, and the result.
 */
export function buildTeamWeeks(season) {
  const startingSlots = season.league.startingSlots;
  const rows = [];

  for (const week of season.weeks) {
    if (!week.played) continue;

    for (const matchup of week.matchups) {
      const pairs = [
        [matchup.home, matchup.away],
        [matchup.away, matchup.home],
      ];

      for (const [side, opponent] of pairs) {
        if (!side) continue;

        const optimal = optimalLineup(side.roster, startingSlots);
        const starters = side.roster.filter((p) => p.started);
        const bench = side.roster.filter((p) => !p.started);

        let result = 'TIE';
        if (opponent) {
          if (side.score > opponent.score) result = 'WIN';
          else if (side.score < opponent.score) result = 'LOSS';
        } else {
          result = 'BYE';
        }

        rows.push({
          week: week.week,
          teamId: side.teamId,
          opponentId: opponent?.teamId ?? null,
          score: round2(side.score),
          opponentScore: round2(opponent?.score ?? 0),
          margin: round2(side.score - (opponent?.score ?? 0)),
          result,
          isPlayoff: matchup.playoffTierType && matchup.playoffTierType !== 'NONE',
          optimalScore: optimal.points,
          efficiency: lineupEfficiency(side.score, optimal.points),
          benchPoints: round2(Math.max(0, optimal.points - side.score)),
          isPerfectLineup: optimal.points > 0 && Math.abs(optimal.points - side.score) < 0.01,
          starters,
          benchPlayers: bench,
          topStarter: starters.length
            ? starters.reduce((a, b) => (a.points >= b.points ? a : b))
            : null,
          worstStarter: starters.length
            ? starters.reduce((a, b) => (a.points <= b.points ? a : b))
            : null,
        });
      }
    }
  }

  return rows;
}

/**
 * All-play: what each team's record would be if it played every other team
 * every week. Removes schedule luck, which is the single biggest distortion in
 * a 12-team head-to-head league.
 */
export function computeAllPlay(teamWeeks, teams) {
  const byWeek = new Map();
  for (const row of teamWeeks) {
    if (!byWeek.has(row.week)) byWeek.set(row.week, []);
    byWeek.get(row.week).push(row);
  }

  const tally = new Map(teams.map((t) => [t.id, { wins: 0, losses: 0, ties: 0 }]));

  for (const rows of byWeek.values()) {
    for (const row of rows) {
      const rec = tally.get(row.teamId);
      if (!rec) continue;
      for (const other of rows) {
        if (other.teamId === row.teamId) continue;
        if (row.score > other.score) rec.wins += 1;
        else if (row.score < other.score) rec.losses += 1;
        else rec.ties += 1;
      }
    }
  }

  const out = new Map();
  for (const [teamId, rec] of tally) {
    const games = rec.wins + rec.losses + rec.ties;
    out.set(teamId, {
      ...rec,
      winPct: games ? rec.wins / games : 0,
    });
  }
  return out;
}

/** Per-team season aggregates. */
export function computeTeamStats(season, teamWeeks) {
  const allPlay = computeAllPlay(teamWeeks, season.teams);
  const byTeam = new Map(season.teams.map((t) => [t.id, []]));
  for (const row of teamWeeks) {
    if (byTeam.has(row.teamId)) byTeam.get(row.teamId).push(row);
  }

  const stats = season.teams.map((team) => {
    const rows = (byTeam.get(team.id) ?? []).sort((a, b) => a.week - b.week);
    const scores = rows.map((r) => r.score);
    const played = rows.length;

    const wins = rows.filter((r) => r.result === 'WIN').length;
    const losses = rows.filter((r) => r.result === 'LOSS').length;
    const ties = rows.filter((r) => r.result === 'TIE').length;

    const ap = allPlay.get(team.id) ?? { wins: 0, losses: 0, ties: 0, winPct: 0 };
    const expectedWins = played ? ap.winPct * played : 0;

    // Current streak, walking back from the most recent week.
    let streakType = null;
    let streakLength = 0;
    for (let i = rows.length - 1; i >= 0; i -= 1) {
      if (streakType === null) {
        streakType = rows[i].result;
        streakLength = 1;
      } else if (rows[i].result === streakType) {
        streakLength += 1;
      } else break;
    }

    const optimalTotal = rows.reduce((a, r) => a + r.optimalScore, 0);
    const pointsFor = rows.reduce((a, r) => a + r.score, 0);

    return {
      teamId: team.id,
      teamName: team.name,
      abbrev: team.abbrev,
      managerName: team.managerName,
      logo: team.logo,
      isPlaceholder: team.isPlaceholder,

      gamesPlayed: played,
      wins,
      losses,
      ties,
      winPct: played ? (wins + ties * 0.5) / played : 0,

      pointsFor: round2(pointsFor),
      pointsAgainst: round2(rows.reduce((a, r) => a + r.opponentScore, 0)),
      pointDiff: round2(rows.reduce((a, r) => a + r.margin, 0)),
      avgScore: round2(mean(scores)),
      highScore: scores.length ? round2(Math.max(...scores)) : 0,
      lowScore: scores.length ? round2(Math.min(...scores)) : 0,
      stdDev: round2(stdDev(scores)),
      // Lower spread = more predictable week to week.
      consistency: scores.length > 1 ? round1(100 - (stdDev(scores) / mean(scores)) * 100) : null,

      allPlayWins: ap.wins,
      allPlayLosses: ap.losses,
      allPlayTies: ap.ties,
      allPlayWinPct: round1(ap.winPct * 100),
      expectedWins: round2(expectedWins),
      // Positive = winning more than the scores deserved.
      luck: round2(wins - expectedWins),

      optimalPointsFor: round2(optimalTotal),
      benchPoints: round2(Math.max(0, optimalTotal - pointsFor)),
      efficiency: optimalTotal ? round1((pointsFor / optimalTotal) * 100) : null,
      perfectLineups: rows.filter((r) => r.isPerfectLineup).length,

      streakType,
      streakLength,

      transactions: team.transactionCounter,
      weeks: rows,
    };
  });

  return stats;
}

/**
 * Power ranking blends result-independent signals so a team that keeps losing
 * by two points is not ranked below one that keeps winning by two.
 *
 *   50% all-play win rate  (how good the scores actually were)
 *   30% average score      (raw output, normalized across the league)
 *   20% recent form        (last three weeks, same all-play basis)
 */
export function computePowerRankings(teamStats, teamWeeks) {
  const active = teamStats.filter((t) => t.gamesPlayed > 0);
  if (!active.length) return [];

  const maxAvg = Math.max(...active.map((t) => t.avgScore), 1);
  const weeksPlayed = Math.max(...active.map((t) => t.gamesPlayed));
  const recentFrom = Math.max(1, weeksPlayed - 2);
  const recentRows = teamWeeks.filter((r) => r.week >= recentFrom);
  const recentAllPlay = computeAllPlay(recentRows, teamStats);

  const scored = active.map((team) => {
    const recent = recentAllPlay.get(team.teamId) ?? { winPct: 0 };
    const score =
      (team.allPlayWinPct / 100) * 50 + (team.avgScore / maxAvg) * 30 + recent.winPct * 20;

    return {
      teamId: team.teamId,
      teamName: team.teamName,
      abbrev: team.abbrev,
      managerName: team.managerName,
      powerScore: round1(score),
      allPlayWinPct: team.allPlayWinPct,
      avgScore: team.avgScore,
      recentWinPct: round1(recent.winPct * 100),
      record: `${team.wins}-${team.losses}${team.ties ? `-${team.ties}` : ''}`,
    };
  });

  scored.sort((a, b) => b.powerScore - a.powerScore);
  return scored.map((t, i) => ({ ...t, rank: i + 1 }));
}

/** League standings, ordered the way ESPN orders them. */
export function computeStandings(teamStats, season) {
  const rule = season.league.playoffSeedingRule;
  const ranked = [...teamStats]
    .filter((t) => !t.isPlaceholder || t.gamesPlayed > 0)
    .sort((a, b) => {
      if (b.winPct !== a.winPct) return b.winPct - a.winPct;
      // ESPN's default tiebreak is total points scored.
      if (rule === 'TOTAL_POINTS_SCORED' || !rule) return b.pointsFor - a.pointsFor;
      return b.pointsFor - a.pointsFor;
    });

  const playoffCut = season.league.playoffTeams;
  return ranked.map((t, i) => ({
    ...t,
    rank: i + 1,
    inPlayoffs: i < playoffCut,
    isBubble: i >= playoffCut - 1 && i <= playoffCut,
  }));
}

// ---------------------------------------------------------------------------
// Side prizes
// ---------------------------------------------------------------------------

const prize = (id, label, description, winner, extras = {}) => ({
  id,
  label,
  description,
  winner,
  ...extras,
});

/** Best/worst single performances and the season-long skill awards. */
export function computePrizes(season, teamStats, teamWeeks) {
  const prizes = [];
  const nameOf = (teamId) =>
    teamStats.find((t) => t.teamId === teamId)?.teamName ?? `Team ${teamId}`;
  const managerOf = (teamId) =>
    teamStats.find((t) => t.teamId === teamId)?.managerName ?? null;

  if (teamWeeks.length === 0) return prizes;

  const best = (rows, pick) => (rows.length ? rows.reduce(pick) : null);
  const asWinner = (row, value, detail) =>
    row
      ? {
          teamId: row.teamId,
          teamName: nameOf(row.teamId),
          managerName: managerOf(row.teamId),
          week: row.week,
          value,
          detail,
        }
      : null;

  // ---- Single-week extremes ---------------------------------------------
  const highWeek = best(teamWeeks, (a, b) => (a.score >= b.score ? a : b));
  prizes.push(
    prize(
      'highestWeek',
      'Highest Single Week',
      'Most points scored by anyone in one week',
      asWinner(highWeek, highWeek?.score, `${highWeek?.score} pts in Week ${highWeek?.week}`)
    )
  );

  const lowWeek = best(teamWeeks, (a, b) => (a.score <= b.score ? a : b));
  prizes.push(
    prize(
      'lowestWeek',
      'Lowest Single Week',
      'Fewest points scored by anyone in one week',
      asWinner(lowWeek, lowWeek?.score, `${lowWeek?.score} pts in Week ${lowWeek?.week}`)
    )
  );

  // ---- Pain and suffering -----------------------------------------------
  const losses = teamWeeks.filter((r) => r.result === 'LOSS');
  const toughLuck = best(losses, (a, b) => (a.score >= b.score ? a : b));
  prizes.push(
    prize(
      'highestScoringLoss',
      'Tough Luck Award',
      'Highest score that still lost',
      asWinner(
        toughLuck,
        toughLuck?.score,
        `Scored ${toughLuck?.score} and still lost in Week ${toughLuck?.week}`
      )
    )
  );

  const wins = teamWeeks.filter((r) => r.result === 'WIN');
  const stolen = best(wins, (a, b) => (a.score <= b.score ? a : b));
  prizes.push(
    prize(
      'lowestScoringWin',
      'Stole One',
      'Lowest score that still won',
      asWinner(
        stolen,
        stolen?.score,
        `Won with only ${stolen?.score} in Week ${stolen?.week}`
      )
    )
  );

  const blowout = best(teamWeeks, (a, b) => (a.margin >= b.margin ? a : b));
  prizes.push(
    prize(
      'biggestBlowout',
      'Biggest Blowout',
      'Largest margin of victory',
      asWinner(
        blowout,
        blowout?.margin,
        `Won by ${blowout?.margin} in Week ${blowout?.week}`
      )
    )
  );

  const nailBiters = teamWeeks.filter((r) => r.result === 'WIN');
  const closest = best(nailBiters, (a, b) => (a.margin <= b.margin ? a : b));
  prizes.push(
    prize(
      'closestMargin',
      'Photo Finish',
      'Narrowest margin of victory',
      asWinner(
        closest,
        closest?.margin,
        `Won by ${closest?.margin} in Week ${closest?.week}`
      )
    )
  );

  const worstBench = best(teamWeeks, (a, b) => (a.benchPoints >= b.benchPoints ? a : b));
  prizes.push(
    prize(
      'mostPointsBenched',
      'Bench Warmer',
      'Most points left sitting on the bench in one week',
      asWinner(
        worstBench,
        worstBench?.benchPoints,
        `Left ${worstBench?.benchPoints} on the bench in Week ${worstBench?.week}`
      )
    )
  );

  // ---- Best and worst individual player games ---------------------------
  let bestPlayer = null;
  let worstStart = null;
  for (const row of teamWeeks) {
    if (row.topStarter && (!bestPlayer || row.topStarter.points > bestPlayer.points)) {
      bestPlayer = { ...row.topStarter, week: row.week, teamId: row.teamId };
    }
    if (row.worstStarter && (!worstStart || row.worstStarter.points < worstStart.points)) {
      worstStart = { ...row.worstStarter, week: row.week, teamId: row.teamId };
    }
  }
  prizes.push(
    prize('bestPlayerGame', 'Player of the Year', 'Best single game by a started player', {
      teamId: bestPlayer?.teamId,
      teamName: bestPlayer ? nameOf(bestPlayer.teamId) : null,
      managerName: bestPlayer ? managerOf(bestPlayer.teamId) : null,
      week: bestPlayer?.week,
      value: bestPlayer?.points,
      detail: bestPlayer
        ? `${bestPlayer.name} (${bestPlayer.position}) — ${bestPlayer.points} pts, Week ${bestPlayer.week}`
        : null,
    })
  );
  prizes.push(
    prize('worstStart', 'Why Did You Start Him', 'Worst single game by a started player', {
      teamId: worstStart?.teamId,
      teamName: worstStart ? nameOf(worstStart.teamId) : null,
      managerName: worstStart ? managerOf(worstStart.teamId) : null,
      week: worstStart?.week,
      value: worstStart?.points,
      detail: worstStart
        ? `${worstStart.name} (${worstStart.position}) — ${worstStart.points} pts, Week ${worstStart.week}`
        : null,
    })
  );

  // ---- Season-long manager skill ----------------------------------------
  const played = teamStats.filter((t) => t.gamesPlayed > 0);
  const seasonAward = (id, label, description, list, pick, format) => {
    if (!list.length) return;
    const w = list.reduce(pick);
    prizes.push(
      prize(id, label, description, {
        teamId: w.teamId,
        teamName: w.teamName,
        managerName: w.managerName,
        week: null,
        value: format(w).value,
        detail: format(w).detail,
      })
    );
  };

  seasonAward(
    'bestManager',
    'Best Manager',
    'Highest lineup efficiency — got the most out of the roster',
    played.filter((t) => t.efficiency !== null),
    (a, b) => (a.efficiency >= b.efficiency ? a : b),
    (t) => ({ value: t.efficiency, detail: `${t.efficiency}% of optimal lineup` })
  );

  seasonAward(
    'worstManager',
    'Room For Improvement',
    'Lowest lineup efficiency',
    played.filter((t) => t.efficiency !== null),
    (a, b) => (a.efficiency <= b.efficiency ? a : b),
    (t) => ({ value: t.efficiency, detail: `${t.efficiency}% of optimal lineup` })
  );

  seasonAward(
    'luckiest',
    'Horseshoe Award',
    'Won the most games above what the scores deserved',
    played,
    (a, b) => (a.luck >= b.luck ? a : b),
    (t) => ({ value: t.luck, detail: `${t.wins} wins vs ${t.expectedWins} expected` })
  );

  seasonAward(
    'unluckiest',
    'Snakebit',
    'Won the fewest games relative to how well they scored',
    played,
    (a, b) => (a.luck <= b.luck ? a : b),
    (t) => ({ value: t.luck, detail: `${t.wins} wins vs ${t.expectedWins} expected` })
  );

  seasonAward(
    'mostConsistent',
    'Old Reliable',
    'Smallest week-to-week swing in scoring',
    played.filter((t) => t.consistency !== null),
    (a, b) => (a.stdDev <= b.stdDev ? a : b),
    (t) => ({ value: t.stdDev, detail: `±${t.stdDev} pts per week` })
  );

  seasonAward(
    'mostVolatile',
    'Boom or Bust',
    'Largest week-to-week swing in scoring',
    played.filter((t) => t.consistency !== null),
    (a, b) => (a.stdDev >= b.stdDev ? a : b),
    (t) => ({ value: t.stdDev, detail: `±${t.stdDev} pts per week` })
  );

  seasonAward(
    'allPlayChamp',
    'True Champion',
    'Best record if everyone played everyone every week',
    played,
    (a, b) => (a.allPlayWinPct >= b.allPlayWinPct ? a : b),
    (t) => ({
      value: t.allPlayWinPct,
      detail: `${t.allPlayWins}-${t.allPlayLosses} all-play (${t.allPlayWinPct}%)`,
    })
  );

  seasonAward(
    'mostBenchedSeason',
    'Season-Long Bench Warmer',
    'Most total points left on the bench across the season',
    played,
    (a, b) => (a.benchPoints >= b.benchPoints ? a : b),
    (t) => ({ value: t.benchPoints, detail: `${t.benchPoints} pts benched all season` })
  );

  seasonAward(
    'perfectLineups',
    'Lineup Savant',
    'Most weeks with a perfect (optimal) lineup',
    played.filter((t) => t.perfectLineups > 0),
    (a, b) => (a.perfectLineups >= b.perfectLineups ? a : b),
    (t) => ({ value: t.perfectLineups, detail: `${t.perfectLineups} perfect week(s)` })
  );

  return prizes.filter((p) => p.winner && p.winner.teamId !== undefined);
}

/** Weekly high-score winners — usually its own small pot. */
export function computeWeeklyHighScores(teamWeeks, teamStats) {
  const byWeek = new Map();
  for (const row of teamWeeks) {
    if (!byWeek.has(row.week)) byWeek.set(row.week, []);
    byWeek.get(row.week).push(row);
  }

  return [...byWeek.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([week, rows]) => {
      const top = rows.reduce((a, b) => (a.score >= b.score ? a : b));
      const team = teamStats.find((t) => t.teamId === top.teamId);
      return {
        week,
        teamId: top.teamId,
        teamName: team?.teamName ?? `Team ${top.teamId}`,
        managerName: team?.managerName ?? null,
        score: top.score,
      };
    });
}

/** Points by position, to answer "who has the best RB corps". */
export function computePositionalStats(teamWeeks, teamStats) {
  const positions = ['QB', 'RB', 'WR', 'TE', 'K', 'D/ST'];
  const byTeam = new Map();

  for (const row of teamWeeks) {
    if (!byTeam.has(row.teamId)) {
      byTeam.set(row.teamId, Object.fromEntries(positions.map((p) => [p, 0])));
    }
    const bucket = byTeam.get(row.teamId);
    for (const starter of row.starters) {
      if (bucket[starter.position] !== undefined) bucket[starter.position] += starter.points;
    }
  }

  const rows = [...byTeam.entries()].map(([teamId, totals]) => {
    const team = teamStats.find((t) => t.teamId === teamId);
    return {
      teamId,
      teamName: team?.teamName ?? `Team ${teamId}`,
      managerName: team?.managerName ?? null,
      ...Object.fromEntries(Object.entries(totals).map(([k, v]) => [k, round2(v)])),
    };
  });

  const leaders = {};
  for (const pos of positions) {
    if (!rows.length) continue;
    const top = rows.reduce((a, b) => (a[pos] >= b[pos] ? a : b));
    leaders[pos] = { teamId: top.teamId, teamName: top.teamName, points: top[pos] };
  }

  return { rows, leaders };
}
