/**
 * Playoff odds: a Monte Carlo over the rest of the regular season.
 *
 * Every remaining matchup is played out thousands of times with each team's
 * score drawn from a normal distribution fitted to its completed weeks, and
 * each simulated season is ranked with the same comparator the real standings
 * use. With 8 of 10 teams making it, the interesting numbers are the odds of
 * *missing* and where each team is likely to be seeded, not just "in or out".
 *
 * Pure: takes the normalized season, returns plain data. The generator is
 * seeded from the season and the weeks played, so the same data always gives
 * the same odds — a build that reran every few hours and nudged every number
 * by a tenth of a percent each time would read as news when nothing happened.
 */

import { compareStandings } from './analytics.mjs';
import { hashSeed, mulberry32 } from './challenges.mjs';

export const DEFAULT_SIMULATIONS = 10000;

/**
 * How hard early-season numbers are pulled toward the league average.
 *
 * A team's modelled mean is (n * teamMean + K * leagueMean) / (n + K) after n
 * completed games, and its spread is blended the same way. K = 4 means a team's
 * own record and the league average carry equal weight after four weeks — a
 * third of a 13-week season — and the team's own numbers dominate from
 * mid-season on. Weekly fantasy scores swing by roughly 20-25 points around
 * the mean, so after two or three weeks the error in a team's raw average is
 * about as large as the real gap between good and bad teams; without the pull,
 * one lucky Week 1 would read as a lock for the top seed.
 */
export const SHRINK_K = 4;

const round1 = (n) => Number(n.toFixed(1));

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/** Sample standard deviation; 0 when there are fewer than two points. */
function sampleSd(xs) {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1));
}

const gameKey = (week, a, b) => `${week}:${Math.min(a, b)}:${Math.max(a, b)}`;

/**
 * Pulls the simulation's inputs out of the normalized season: who is in the
 * league, the games already decided, and the games still to play.
 *
 * A matchup counts as decided when ESPN has named a winner, or when a later
 * week has already been played (older caches can lack `winner`). The newest
 * week while it is still being played is UNDECIDED, so it is simulated from
 * scratch rather than half-counted on Thursday night's partial scores.
 */
export function oddsInputFromSeason(season) {
  const regularWeeks = season.league.regularSeasonWeeks;
  const playedWeeks = season.weeks.filter((w) => w.played).map((w) => w.week);
  const latestPlayed = playedWeeks.length ? Math.max(...playedWeeks) : 0;

  const completed = [];
  const decided = new Set();
  const inProgress = [];

  for (const week of season.weeks) {
    if (!week.played || week.week > regularWeeks) continue;
    for (const m of week.matchups) {
      if (!m.home || !m.away) continue;
      if (m.playoffTierType && m.playoffTierType !== 'NONE') continue;
      const isDecided = m.winner !== 'UNDECIDED' || week.week < latestPlayed;
      const game = { week: week.week, homeTeamId: m.home.teamId, awayTeamId: m.away.teamId };
      if (isDecided) {
        completed.push({ ...game, homeScore: m.home.score, awayScore: m.away.score });
        decided.add(gameKey(game.week, game.homeTeamId, game.awayTeamId));
      } else {
        inProgress.push(game);
      }
    }
  }

  const remaining = [];
  const queued = new Set();
  const queue = (game) => {
    const key = gameKey(game.week, game.homeTeamId, game.awayTeamId);
    if (decided.has(key) || queued.has(key)) return;
    queued.add(key);
    remaining.push(game);
  };
  for (const game of inProgress) queue(game);
  for (const g of season.schedule ?? []) {
    if (g.week > regularWeeks || g.homeTeamId == null || g.awayTeamId == null) continue;
    if (g.playoffTierType && g.playoffTierType !== 'NONE') continue;
    queue({ week: g.week, homeTeamId: g.homeTeamId, awayTeamId: g.awayTeamId });
  }

  const inAGame = new Set([...completed, ...remaining].flatMap((g) => [g.homeTeamId, g.awayTeamId]));
  const teams = season.teams
    .filter((t) => !t.isPlaceholder || inAGame.has(t.id))
    .map((t) => ({ teamId: t.id, teamName: t.name, managerName: t.managerName ?? null }));

  const completedWeeks = [...new Set(completed.map((g) => g.week))];

  return {
    season: season.league.season,
    teams,
    completed,
    remaining,
    playoffTeams: season.league.playoffTeams,
    seedingRule: season.league.playoffSeedingRule ?? null,
    regularSeasonWeeks: regularWeeks,
    weeksPlayed: completedWeeks.length,
    throughWeek: completedWeeks.length ? Math.max(...completedWeeks) : 0,
  };
}

/**
 * Each team's scoring distribution, shrunk toward the league (see SHRINK_K).
 *
 * The league spread is the pooled within-team deviation — how much a team's
 * score moves around its own average — not the spread of all scores together,
 * which would also count the gap between good and bad teams and overstate how
 * random a single team's week is.
 */
export function scoringModel(teams, completed, k = SHRINK_K) {
  const scores = new Map(teams.map((t) => [t.teamId, []]));
  for (const g of completed) {
    scores.get(g.homeTeamId)?.push(g.homeScore);
    scores.get(g.awayTeamId)?.push(g.awayScore);
  }

  const all = [...scores.values()].flat();
  const leagueMean = mean(all);

  let squares = 0;
  let dof = 0;
  for (const xs of scores.values()) {
    if (xs.length < 2) continue;
    const m = mean(xs);
    squares += xs.reduce((a, x) => a + (x - m) ** 2, 0);
    dof += xs.length - 1;
  }
  const leagueSd = dof > 0 ? Math.sqrt(squares / dof) : sampleSd(all);

  const model = new Map();
  for (const [teamId, xs] of scores) {
    const n = xs.length;
    // An SD from n scores rests on n - 1 degrees of freedom, so that is its weight.
    const sdWeight = Math.max(0, n - 1);
    model.set(teamId, {
      games: n,
      mean: (n * mean(xs) + k * leagueMean) / (n + k),
      sd: (sdWeight * sampleSd(xs) + k * leagueSd) / (sdWeight + k),
    });
  }
  return { model, leagueMean, leagueSd };
}

/** Current records from decided games only. */
function tally(teams, completed) {
  const rec = new Map(teams.map((t) => [t.teamId, { wins: 0, losses: 0, ties: 0, pointsFor: 0 }]));
  for (const g of completed) {
    const h = rec.get(g.homeTeamId);
    const a = rec.get(g.awayTeamId);
    if (!h || !a) continue;
    h.pointsFor += g.homeScore;
    a.pointsFor += g.awayScore;
    if (g.homeScore > g.awayScore) { h.wins += 1; a.losses += 1; }
    else if (g.awayScore > g.homeScore) { a.wins += 1; h.losses += 1; }
    else { h.ties += 1; a.ties += 1; }
  }
  return rec;
}

const winPctOf = (w, l, t) => {
  const games = w + l + t;
  return games ? (w + t * 0.5) / games : 0;
};

/**
 * A probability as a percentage that never claims more certainty than the
 * simulation has. 9,996 of 10,000 is not a clinch, so it shows as 99.9, not a
 * rounded-up 100; only every single run landing the same way reads 100 or 0.
 */
function pct(count, total) {
  if (count === total) return 100;
  if (count === 0) return 0;
  return Math.min(99.9, Math.max(0.1, round1((count / total) * 100)));
}

/**
 * The simulation itself. `input` is the shape oddsInputFromSeason() returns;
 * it is separate so tests can hand-build a league.
 */
export function simulatePlayoffOdds(input, { simulations = DEFAULT_SIMULATIONS, seed, shrinkK = SHRINK_K } = {}) {
  const { teams, completed, remaining, playoffTeams, seedingRule } = input;
  const n = teams.length;
  const index = new Map(teams.map((t, i) => [t.teamId, i]));
  const seedText = seed ?? `roe-playoff-odds:${input.season}:${input.weeksPlayed}`;
  const rand = mulberry32(hashSeed(seedText));

  // Box-Muller. 1 - rand() keeps the log argument in (0, 1].
  const normal = () => Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());

  const { model, leagueMean, leagueSd } = scoringModel(teams, completed, shrinkK);
  const base = tally(teams, completed);

  const baseWins = teams.map((t) => base.get(t.teamId).wins);
  const baseLosses = teams.map((t) => base.get(t.teamId).losses);
  const baseTies = teams.map((t) => base.get(t.teamId).ties);
  const basePf = teams.map((t) => base.get(t.teamId).pointsFor);
  const mu = teams.map((t) => model.get(t.teamId).mean);
  const sigma = teams.map((t) => model.get(t.teamId).sd);

  // Current order, with the input order breaking exact ties the way the
  // stable sort in computeStandings does.
  const currentOrder = teams
    .map((t, i) => ({ i, winPct: winPctOf(baseWins[i], baseLosses[i], baseTies[i]), pointsFor: basePf[i] }))
    .sort((a, b) => compareStandings(a, b, seedingRule) || a.i - b.i)
    .map((r) => r.i);
  const currentRank = new Array(n);
  currentOrder.forEach((i, rank) => { currentRank[i] = rank + 1; });

  const games = remaining
    .map((g) => [index.get(g.homeTeamId), index.get(g.awayTeamId)])
    .filter(([h, a]) => h !== undefined && a !== undefined);

  const seedCounts = teams.map(() => new Array(n).fill(0));
  const winTotals = new Array(n).fill(0);
  const wins = new Array(n);
  const losses = new Array(n);
  const ties = new Array(n);
  const pf = new Array(n);
  const rows = teams.map((_, i) => ({ i, winPct: 0, pointsFor: 0 }));

  for (let s = 0; s < simulations; s += 1) {
    for (let i = 0; i < n; i += 1) {
      wins[i] = baseWins[i]; losses[i] = baseLosses[i]; ties[i] = baseTies[i]; pf[i] = basePf[i];
    }
    for (const [h, a] of games) {
      const hs = Math.max(0, mu[h] + sigma[h] * normal());
      const as = Math.max(0, mu[a] + sigma[a] * normal());
      pf[h] += hs;
      pf[a] += as;
      if (hs > as) { wins[h] += 1; losses[a] += 1; }
      else if (as > hs) { wins[a] += 1; losses[h] += 1; }
      else { ties[h] += 1; ties[a] += 1; }
    }
    for (let i = 0; i < n; i += 1) {
      rows[i].winPct = winPctOf(wins[i], losses[i], ties[i]);
      rows[i].pointsFor = pf[i];
      winTotals[i] += wins[i];
    }
    const order = [...rows].sort((a, b) => compareStandings(a, b, seedingRule) || currentRank[a.i] - currentRank[b.i]);
    order.forEach((row, place) => { seedCounts[row.i][place] += 1; });
  }

  const out = teams.map((t, i) => {
    const made = seedCounts[i].slice(0, playoffTeams).reduce((a, b) => a + b, 0);
    const m = model.get(t.teamId);
    return {
      teamId: t.teamId,
      teamName: t.teamName,
      managerName: t.managerName,
      currentRank: currentRank[i],
      wins: baseWins[i],
      losses: baseLosses[i],
      ties: baseTies[i],
      pointsFor: Number(basePf[i].toFixed(2)),
      modelMean: round1(m.mean),
      modelSd: round1(m.sd),
      makePlayoffsPct: pct(made, simulations),
      missPlayoffsPct: pct(simulations - made, simulations),
      topSeedPct: pct(seedCounts[i][0], simulations),
      // Keyed by seed number: seedPct[1] is the top seed.
      seedPct: Object.fromEntries(seedCounts[i].map((c, place) => [place + 1, pct(c, simulations)])),
      projectedWins: round1(winTotals[i] / simulations),
    };
  }).sort((a, b) => a.currentRank - b.currentRank);

  // The teams most likely to miss, as many as there are non-playoff spots.
  // Anyone who made it in every single run is left out, so a mathematically
  // safe team is never named just to fill the list.
  const missSpots = Math.max(0, n - playoffTeams);
  const bottomWatch = [...out]
    .filter((t) => t.missPlayoffsPct > 0)
    .sort((a, b) => b.missPlayoffsPct - a.missPlayoffsPct || b.currentRank - a.currentRank)
    .slice(0, missSpots)
    .map((t) => t.teamId);

  return {
    simulations,
    seed: seedText,
    weeksPlayed: input.weeksPlayed,
    regularSeasonWeeks: input.regularSeasonWeeks,
    playoffTeams,
    generatedFrom: {
      throughWeek: input.throughWeek,
      completedGames: completed.length,
      remainingGames: games.length,
      model: 'normal',
      shrinkK,
      leagueMean: round1(leagueMean),
      leagueSd: round1(leagueSd),
    },
    teams: out,
    bottomWatch,
  };
}

/**
 * Odds for the published site, or null when there is nothing to simulate:
 * before Week 1 (no data to fit), once the regular season is over (the seeds
 * are simply the standings), or when the remaining schedule is unknown — an
 * older raw cache with no schedule.json cannot say who plays whom, and odds
 * that silently skipped the rest of the season would be confidently wrong.
 */
export function computePlayoffOdds(season, options = {}) {
  const input = oddsInputFromSeason(season);
  if (!input.completed.length || !input.teams.length) return null;
  if (!input.remaining.length) return null;

  const scheduledWeeks = new Set(input.remaining.map((g) => g.week));
  for (let w = input.throughWeek + 1; w <= input.regularSeasonWeeks; w += 1) {
    if (!scheduledWeeks.has(w)) return null;
  }

  return simulatePlayoffOdds(input, options);
}
