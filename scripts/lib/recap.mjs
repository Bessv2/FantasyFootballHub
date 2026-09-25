/**
 * "Week N in review": a handful of one-line headlines per completed week,
 * assembled from analytics that already exist.
 *
 * Deterministic templated text and nothing else — no model, no network. Each
 * item type has a few phrasings and the one used is picked by hashing the week
 * and the item type, so the recap does not read identically every week but a
 * rebuild never rewrites last week's.
 *
 * Every item is optional: if the data behind it is missing (no power rankings
 * before Week 2, no challenge that week, nobody left points on the bench) the
 * line is simply left out rather than filled with a zero.
 */

import { buildTeamWeeks, computeTeamStats, computePowerRankings } from './analytics.mjs';
import { hashSeed } from './challenges.mjs';

/** Scores read best at one decimal, but a 0.04-point margin must not print as 0.0. */
const pts = (n) => (Math.abs(n) < 1 ? n.toFixed(2) : n.toFixed(1));

const ordinal = (n) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
};

/** "Aces'" rather than "Aces's". */
const poss = (name) => (/s$/i.test(name) ? `${name}'` : `${name}'s`);

const PHRASES = {
  topScore: [
    ({ team, score }) => `${team} put up ${score}, the top score of the week.`,
    ({ team, score }) => `Nobody topped ${poss(team)} ${score}.`,
    ({ team, score }) => `${team} led the league with ${score}.`,
  ],
  blowout: [
    ({ winner, loser, margin, score }) => `${winner} flattened ${loser} by ${margin} (${score}).`,
    ({ winner, loser, margin, score }) => `Biggest blowout: ${winner} over ${loser}, ${score} — a ${margin}-point margin.`,
    ({ winner, loser, margin }) => `${loser} never had a chance against ${winner}, losing by ${margin}.`,
  ],
  closest: [
    ({ winner, loser, margin, score }) => `${winner} edged ${loser} by just ${margin} (${score}).`,
    ({ winner, loser, margin }) => `Photo finish: ${winner} beat ${loser} by ${margin}.`,
    ({ winner, loser, score }) => `${loser} came up just short against ${winner}, ${score}.`,
  ],
  unluckiest: [
    ({ team, score, rank, opponent }) => `${team} scored ${score} — ${rank}-best of the week — and still lost to ${opponent}.`,
    ({ team, score, opponent }) => `Tough draw for ${team}: ${score} would have beaten most of the league, but not ${opponent}.`,
    ({ team, score, rank }) => `Unluckiest loss: ${team}, with the ${rank}-highest score (${score}).`,
  ],
  lineup: [
    ({ team, bench, flip }) => `${team} left ${bench} on the bench${flip}.`,
    ({ team, bench, flip }) => `Lineup regret: ${poss(team)} best possible lineup was ${bench} points better${flip}.`,
  ],
  challenge: [
    ({ team, label, detail }) => `${team} won the ${label} challenge${detail}.`,
    ({ team, label, detail }) => `${label}: ${team} took it${detail}.`,
  ],
  powerMover: [
    ({ team, from, to, dir }) => `${team} ${dir === 'up' ? 'climbed' : 'slid'} from ${from} to ${to} in the power rankings.`,
    ({ team, from, to, dir }) => `Power rankings: ${team} ${dir === 'up' ? 'jumps' : 'drops'} ${from} → ${to}.`,
    ({ team, from, to, dir }) => `${dir === 'up' ? 'Biggest riser' : 'Biggest faller'}: ${team}, now ${to} (was ${from}).`,
  ],
};

/** Which phrasing a given item gets. Same week and type, same sentence, every build. */
export function phraseIndex(week, type) {
  return hashSeed(`recap:${week}:${type}`) % PHRASES[type].length;
}

const say = (week, type, values) => PHRASES[type][phraseIndex(week, type)](values);

/** Power ranking position per team, using only weeks up to `week`. */
function powerRanksThrough(season, teamWeeks, week) {
  const rows = teamWeeks.filter((r) => r.week <= week);
  if (!rows.length) return new Map();
  const ranked = computePowerRankings(computeTeamStats(season, rows), rows);
  return new Map(ranked.map((t) => [t.teamId, t.rank]));
}

/**
 * @param {object} season    the normalized season
 * @param {number} week
 * @param {object} [ctx]
 * @param {Array}  [ctx.teamWeeks]       buildTeamWeeks(season), if already computed
 * @param {Array}  [ctx.challengeWeeks]  resolved weeks from computeChallenges()
 */
export function buildWeeklyRecap(season, week, { teamWeeks, challengeWeeks = [] } = {}) {
  const allRows = teamWeeks ?? buildTeamWeeks(season);
  const rows = allRows.filter((r) => r.week === week && r.result !== 'BYE');
  const nameOf = (id) => season.teams.find((t) => t.id === id)?.name ?? `Team ${id}`;
  const items = [];
  if (!rows.length) return { week, items };

  const add = (type, teamIds, values) => items.push({ type, text: say(week, type, values), teamIds });

  // ---- Top score ---------------------------------------------------------
  const top = rows.reduce((a, b) => (b.score > a.score ? b : a));
  add('topScore', [top.teamId], { team: nameOf(top.teamId), score: pts(top.score) });

  // ---- Blowout and closest game -------------------------------------------
  const wins = rows.filter((r) => r.result === 'WIN');
  const scoreline = (r) => `${pts(r.score)}–${pts(r.opponentScore)}`;
  const game = (r) => ({
    winner: nameOf(r.teamId), loser: nameOf(r.opponentId), margin: pts(r.margin), score: scoreline(r),
  });
  if (wins.length) {
    const blowout = wins.reduce((a, b) => (b.margin > a.margin ? b : a));
    add('blowout', [blowout.teamId, blowout.opponentId], game(blowout));

    const closest = wins.reduce((a, b) => (b.margin < a.margin ? b : a));
    // With one game on the slate the closest game is the blowout; say it once.
    if (closest !== blowout) add('closest', [closest.teamId, closest.opponentId], game(closest));
  }

  // ---- Unluckiest loss ----------------------------------------------------
  // The highest score that still lost, but only if it would have beaten at
  // least half the league — losing with the seventh-best score is not bad luck.
  const losses = rows.filter((r) => r.result === 'LOSS');
  if (losses.length) {
    const unlucky = losses.reduce((a, b) => (b.score > a.score ? b : a));
    const rank = 1 + rows.filter((r) => r.score > unlucky.score).length;
    if (rank <= Math.ceil(rows.length / 2)) {
      add('unluckiest', [unlucky.teamId, unlucky.opponentId], {
        team: nameOf(unlucky.teamId), score: pts(unlucky.score), rank: ordinal(rank), opponent: nameOf(unlucky.opponentId),
      });
    }
  }

  // ---- Worst lineup decision ---------------------------------------------
  // benchPoints is optimal minus actual, from lineup.mjs.
  const benched = rows.filter((r) => r.benchPoints > 0);
  if (benched.length) {
    const worst = benched.reduce((a, b) => (b.benchPoints > a.benchPoints ? b : a));
    const flipped = worst.result === 'LOSS' && worst.optimalScore > worst.opponentScore;
    add('lineup', flipped ? [worst.teamId, worst.opponentId] : [worst.teamId], {
      team: nameOf(worst.teamId),
      bench: pts(worst.benchPoints),
      flip: flipped ? ` — enough to have beaten ${nameOf(worst.opponentId)}` : '',
    });
  }

  // ---- Weekly challenge --------------------------------------------------
  const challenge = challengeWeeks.find((w) => w.week === week && w.winner);
  if (challenge) {
    const winners = [challenge.winner, ...(challenge.tiedWith ?? [])];
    add('challenge', winners.map((w) => w.teamId), {
      team: winners.map((w) => w.teamName).join(' and '),
      label: challenge.label,
      detail: winners.length === 1 && challenge.winner.detail ? ` (${challenge.winner.detail})` : '',
    });
  }

  // ---- Power ranking mover ----------------------------------------------
  if (week > 1) {
    const before = powerRanksThrough(season, allRows, week - 1);
    const after = powerRanksThrough(season, allRows, week);
    let mover = null;
    for (const [teamId, rank] of after) {
      const prev = before.get(teamId);
      if (prev === undefined) continue;
      const change = prev - rank; // positive = climbed
      if (change === 0) continue;
      // Largest move wins; a rise beats an equal fall; then the higher finish.
      if (
        !mover ||
        Math.abs(change) > Math.abs(mover.change) ||
        (Math.abs(change) === Math.abs(mover.change) && change > mover.change) ||
        (change === mover.change && rank < mover.rank)
      ) {
        mover = { teamId, change, rank, prev };
      }
    }
    if (mover) {
      add('powerMover', [mover.teamId], {
        team: nameOf(mover.teamId),
        from: ordinal(mover.prev),
        to: ordinal(mover.rank),
        dir: mover.change > 0 ? 'up' : 'down',
      });
    }
  }

  return { week, items };
}

/**
 * Weeks whose results are final. The newest played week is left out while any
 * of its matchups is still UNDECIDED — a recap of Thursday night's partial
 * scores would crown the wrong top score.
 */
export function completedWeeks(season) {
  const played = season.weeks.filter((w) => w.played);
  const latest = played.length ? Math.max(...played.map((w) => w.week)) : 0;
  return played
    .filter((w) => w.week < latest || w.matchups.every((m) => m.winner !== 'UNDECIDED'))
    .map((w) => w.week);
}

/** Every completed week's recap, newest first. */
export function buildRecaps(season, ctx = {}) {
  const teamWeeks = ctx.teamWeeks ?? buildTeamWeeks(season);
  return completedWeeks(season)
    .sort((a, b) => b - a)
    .map((week) => buildWeeklyRecap(season, week, { ...ctx, teamWeeks }))
    .filter((r) => r.items.length);
}
