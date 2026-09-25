/**
 * The weekly random challenge.
 *
 * Instead of a fixed catalogue of season awards handed out once in December,
 * every regular-season week draws one challenge from a deck and pays cash to
 * whoever wins it. Somebody eliminated from playoff contention in Week 6 still
 * has twelve reasons left to set a lineup.
 *
 * Three properties make this fair rather than a gimmick, and each one is a
 * deliberate design constraint rather than an implementation detail:
 *
 *  1. **The draw is deterministic.** The schedule is a seeded shuffle keyed on
 *     the league id and season, so every build produces the same challenge for
 *     the same week, forever. Anything else and the site would quietly reroll
 *     Week 4 every time the data refreshed — and since the refresh happens
 *     *after* the games, that reroll would be picking a winner from known
 *     results. `Math.random()` here would not be a bug, it would be a rigged
 *     league.
 *
 *  2. **No challenge repeats** until the deck runs out. Dealing without
 *     replacement, not sampling with it, so 13 weeks means 13 different games.
 *
 *  3. **Nothing is scored before it is announced.** Weeks that have not been
 *     played yet are sealed — the schedule exists, but the site does not show
 *     future challenges beyond the one currently in play. The seed is published
 *     so anyone can verify after the fact that the deck was never restacked.
 *
 * Every challenge scores off the same `teamWeeks` rows the rest of the
 * analytics use, so a challenge cannot measure anything the box score does not
 * already prove.
 */

const round2 = (n) => Number((n ?? 0).toFixed(2));

// ---------------------------------------------------------------------------
// Deterministic randomness
// ---------------------------------------------------------------------------

/**
 * FNV-1a. Turns the seed string into the 32 bits the generator needs.
 * Exported so the playoff-odds simulation draws from the same generator.
 */
export function hashSeed(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32 — small, fast, and identical on every machine and Node version. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher-Yates against a supplied generator, so the order is reproducible. */
function shuffle(items, rand) {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// ---------------------------------------------------------------------------
// The deck
// ---------------------------------------------------------------------------

const sum = (rows, pick) => rows.reduce((total, row) => total + pick(row), 0);

const startersAt = (row, position) => row.starters.filter((s) => s.position === position);

const bestStarterAt = (row, position) => {
  const list = startersAt(row, position);
  return list.length ? list.reduce((a, b) => (a.points >= b.points ? a : b)) : null;
};

const positionPoints = (row, position) => round2(sum(startersAt(row, position), (s) => s.points));

/**
 * A challenge scores every team's week and the highest score wins.
 *
 * `score` returning null means "this team did not qualify this week" — an
 * inverted challenge with no eligible team simply has no winner, which reads
 * better than crowning someone on a technicality.
 *
 * `detail` explains the number in the language of the challenge, because
 * "18.4" means nothing next to a name and "Josh Allen, 18.4 more than his
 * projection" means everything.
 */
const challenge = (id, label, rule, score, detail) => ({ id, label, rule, score, detail });

export const CHALLENGE_DECK = [
  challenge(
    'highScore',
    'Top Gun',
    'Most points scored this week.',
    (row) => row.score,
    (row) => `${row.score} points`
  ),

  challenge(
    'closestTo100',
    'Price Is Right',
    'Closest to 100 points without going over. Bust and you are out.',
    (row) => (row.score > 100 ? null : row.score),
    (row) => `${row.score} points — ${round2(100 - row.score)} under the line`
  ),

  challenge(
    'biggestBlowout',
    'Woodshed',
    'Largest margin of victory.',
    (row) => (row.result === 'WIN' ? row.margin : null),
    (row) => `won by ${row.margin}`
  ),

  challenge(
    'narrowestWin',
    'Photo Finish',
    'Won by the smallest margin. Ugly counts.',
    (row) => (row.result === 'WIN' ? -row.margin : null),
    (row) => `won by ${row.margin}`
  ),

  challenge(
    'perfectLineup',
    'Nailed It',
    'Highest lineup efficiency — the closest to starting the right nine.',
    (row) => row.efficiency,
    (row) => `${row.efficiency}% of a perfect lineup`
  ),

  challenge(
    'benchWarmer',
    'Sitting On A Gold Mine',
    'Most points left on the bench. A prize for the worst decision of the week.',
    (row) => row.benchPoints,
    (row) => `${row.benchPoints} points benched`
  ),

  challenge(
    'bestPlayer',
    'One Man Army',
    'Highest-scoring single starter.',
    (row) => row.topStarter?.points ?? null,
    (row) =>
      row.topStarter ? `${row.topStarter.name} (${row.topStarter.position}) — ${row.topStarter.points}` : null
  ),

  challenge(
    'bestQB',
    'Gunslinger',
    'Highest-scoring started quarterback.',
    (row) => bestStarterAt(row, 'QB')?.points ?? null,
    (row) => {
      const qb = bestStarterAt(row, 'QB');
      return qb ? `${qb.name} — ${qb.points}` : null;
    }
  ),

  challenge(
    'bestRB',
    'Ground Game',
    'Highest-scoring started running back.',
    (row) => bestStarterAt(row, 'RB')?.points ?? null,
    (row) => {
      const rb = bestStarterAt(row, 'RB');
      return rb ? `${rb.name} — ${rb.points}` : null;
    }
  ),

  challenge(
    'bestWR',
    'Hands Team',
    'Highest-scoring started wide receiver.',
    (row) => bestStarterAt(row, 'WR')?.points ?? null,
    (row) => {
      const wr = bestStarterAt(row, 'WR');
      return wr ? `${wr.name} — ${wr.points}` : null;
    }
  ),

  challenge(
    'bestTE',
    'Tight Window',
    'Highest-scoring started tight end.',
    (row) => bestStarterAt(row, 'TE')?.points ?? null,
    (row) => {
      const te = bestStarterAt(row, 'TE');
      return te ? `${te.name} — ${te.points}` : null;
    }
  ),

  challenge(
    'bestKicker',
    'Toe The Line',
    'Highest-scoring started kicker. The one week it pays to care.',
    (row) => bestStarterAt(row, 'K')?.points ?? null,
    (row) => {
      const k = bestStarterAt(row, 'K');
      return k ? `${k.name} — ${k.points}` : null;
    }
  ),

  challenge(
    'bestDefense',
    'Bend Don’t Break',
    'Highest-scoring started defence.',
    (row) => bestStarterAt(row, 'D/ST')?.points ?? null,
    (row) => {
      const d = bestStarterAt(row, 'D/ST');
      return d ? `${d.name} — ${d.points}` : null;
    }
  ),

  challenge(
    'uglyWin',
    'Stole One',
    'Lowest score that still won.',
    (row) => (row.result === 'WIN' ? -row.score : null),
    (row) => `won with just ${row.score}`
  ),

  challenge(
    'toughLuck',
    'Robbed',
    'Highest score that still lost. The only prize for a bad schedule.',
    (row) => (row.result === 'LOSS' ? row.score : null),
    (row) => `${row.score} points and still lost by ${round2(Math.abs(row.margin))}`
  ),

  challenge(
    'overProjection',
    'Overachiever',
    'Beat your own projected total by the most.',
    (row) => {
      const projected = sum(row.starters, (s) => s.projected ?? 0);
      return projected > 0 ? round2(row.score - projected) : null;
    },
    (row) => {
      const projected = round2(sum(row.starters, (s) => s.projected ?? 0));
      return projected > 0 ? `${row.score} scored vs ${projected} projected` : null;
    }
  ),

  challenge(
    'balanced',
    'No Weak Links',
    'Smallest gap between your best and worst starter. Depth, not a hero.',
    (row) =>
      row.topStarter && row.worstStarter
        ? -round2(row.topStarter.points - row.worstStarter.points)
        : null,
    (row) =>
      row.topStarter && row.worstStarter
        ? `${row.topStarter.points} high, ${row.worstStarter.points} low`
        : null
  ),

  challenge(
    'supportingCast',
    'Second Fiddle',
    'Highest-scoring *second*-best starter. Your stud does not count.',
    (row) => {
      const ranked = [...row.starters].sort((a, b) => b.points - a.points);
      return ranked.length > 1 ? ranked[1].points : null;
    },
    (row) => {
      const ranked = [...row.starters].sort((a, b) => b.points - a.points);
      return ranked.length > 1 ? `${ranked[1].name} — ${ranked[1].points}` : null;
    }
  ),

  challenge(
    'runningBackRoom',
    'Committee Approach',
    'Most combined points from started running backs.',
    (row) => (startersAt(row, 'RB').length ? positionPoints(row, 'RB') : null),
    (row) => `${positionPoints(row, 'RB')} from ${startersAt(row, 'RB').length} RBs`
  ),

  challenge(
    'receiverRoom',
    'Air Raid',
    'Most combined points from started receivers and tight ends.',
    (row) => {
      const pass = [...startersAt(row, 'WR'), ...startersAt(row, 'TE')];
      return pass.length ? round2(sum(pass, (s) => s.points)) : null;
    },
    (row) => {
      const pass = [...startersAt(row, 'WR'), ...startersAt(row, 'TE')];
      return `${round2(sum(pass, (s) => s.points))} from ${pass.length} pass-catchers`;
    }
  ),

  challenge(
    'flexPlay',
    'Best Use Of The Flex',
    'Most points from the OP/FLEX slot — the one lineup decision that is genuinely yours.',
    (row) => {
      const flex = row.starters.filter((s) => s.slotId === 7 || s.slotId === 23);
      return flex.length ? round2(sum(flex, (s) => s.points)) : null;
    },
    (row) => {
      const flex = row.starters.filter((s) => s.slotId === 7 || s.slotId === 23);
      return flex.length ? `${flex.map((s) => s.name).join(', ')} — ${round2(sum(flex, (s) => s.points))}` : null;
    }
  ),

  challenge(
    'allPlayWeek',
    'Best In Show',
    'Would have beaten the most other teams this week, whoever you actually played.',
    (row, ctx) => {
      const others = ctx.week.filter((r) => r.teamId !== row.teamId);
      return others.filter((r) => row.score > r.score).length;
    },
    (row, value, ctx) => `would have beaten ${value} of ${ctx.week.length - 1}`
  ),

  challenge(
    'underdog',
    'Giant Killer',
    'Beat the highest-scoring opponent of anyone who won.',
    (row) => (row.result === 'WIN' ? row.opponentScore : null),
    (row) => `beat a ${row.opponentScore}-point opponent`
  ),
];

// ---------------------------------------------------------------------------
// The schedule
// ---------------------------------------------------------------------------

/**
 * The seed string. Everything that identifies *this* league's deck goes in it
 * and nothing else — no date, no build number, nothing that changes between
 * runs.
 *
 * `salt` is the escape hatch: change it in config and the whole season
 * reshuffles. That is a thing a commissioner might legitimately want to do
 * before the season starts, and must never do during it.
 */
export const challengeSeed = ({ leagueId, season, salt = '' }) =>
  `roe-challenge:${leagueId}:${season}${salt ? `:${salt}` : ''}`;

/**
 * Deals one challenge per week for the whole regular season, up front.
 *
 * Dealt without replacement so nothing repeats. If a season is somehow longer
 * than the deck, the deck is reshuffled and dealt again rather than running
 * out — with a different shuffle each pass, so the second time through is not
 * a rerun of the first in the same order.
 */
export function buildChallengeSchedule({
  leagueId,
  season,
  weeks,
  salt = '',
  cadence = 'weekly',
  startWeek = 1,
  deck = CHALLENGE_DECK,
  overrides = {},
}) {
  const seed = challengeSeed({ leagueId, season, salt });
  const rand = mulberry32(hashSeed(seed));
  const step = cadence === 'biweekly' ? 2 : 1;

  const playWeeks = [];
  for (let week = startWeek; week <= weeks; week += step) playWeeks.push(week);

  const cardById = new Map(deck.map((c) => [c.id, c]));
  // A commissioner-picked card for one week is pulled out of the shuffle deck
  // entirely, so it can never also land on a different week by chance.
  const overriddenIds = new Set(Object.values(overrides));
  const shuffleDeck = deck.filter((c) => !overriddenIds.has(c.id));

  const dealt = [];
  let pack = [];
  for (const week of playWeeks) {
    const overrideId = overrides[week];
    const card = overrideId ? cardById.get(overrideId) : null;
    if (overrideId && !card) {
      throw new Error(`weekly challenge override for week ${week} names an unknown challenge "${overrideId}"`);
    }
    if (!card && !pack.length) pack = shuffle(shuffleDeck, rand);
    const dealtCard = card ?? pack.shift();
    dealt.push({
      week,
      challengeId: dealtCard.id,
      label: dealtCard.label,
      rule: dealtCard.rule,
      // Bi-weekly challenges cover the week they are scored in, not a range —
      // the schedule just skips the weeks in between.
      cadence,
    });
  }

  return { seed, cadence, startWeek, weeks: dealt };
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

/**
 * Resolves each scheduled week into a winner, a pending week, or a sealed one.
 *
 * `revealThrough` is the last week whose challenge may be shown. It is the
 * highest played week plus one, so the week currently being played is always
 * announced before kickoff and everything after it stays face-down. Passing
 * `revealAll` opens the whole schedule, which is the right thing before a
 * season starts and the wrong thing during one.
 */
export function computeChallenges({
  schedule,
  teamWeeks,
  teamStats = [],
  weeksPlayed = 0,
  revealAll = false,
  payouts = new Map(),
  deck = CHALLENGE_DECK,
}) {
  const cardById = new Map(deck.map((c) => [c.id, c]));
  const statsById = new Map(teamStats.map((t) => [t.teamId, t]));

  const byWeek = new Map();
  for (const row of teamWeeks) {
    if (!byWeek.has(row.week)) byWeek.set(row.week, []);
    byWeek.get(row.week).push(row);
  }

  const revealThrough = revealAll ? Infinity : weeksPlayed + 1;

  return schedule.weeks.map((slot) => {
    const card = cardById.get(slot.challengeId);
    const rows = byWeek.get(slot.week) ?? [];
    const amount = payouts.get(slot.week) ?? 0;
    const sealed = slot.week > revealThrough;

    const base = {
      week: slot.week,
      challengeId: slot.challengeId,
      amount,
      sealed,
      played: rows.length > 0,
      // A sealed week gives away nothing — not even which challenge it is.
      label: sealed ? null : (card?.label ?? slot.label),
      rule: sealed ? null : (card?.rule ?? slot.rule),
      winner: null,
    };

    if (sealed || !rows.length || !card) return base;

    const ctx = { week: rows };
    const scored = rows
      .map((row) => ({ row, value: card.score(row, ctx) }))
      .filter((entry) => entry.value !== null && entry.value !== undefined && !Number.isNaN(entry.value));

    if (!scored.length) {
      return { ...base, noWinner: true };
    }

    const best = scored.reduce((a, b) => (b.value > a.value ? b : a));

    // Two teams can genuinely tie — same score, same margin. Splitting the pot
    // is the only answer that does not invent a tiebreak nobody agreed to.
    const tied = scored.filter((entry) => Math.abs(entry.value - best.value) < 0.001);
    const share = round2(amount / tied.length);

    return {
      ...base,
      winner: {
        teamId: best.row.teamId,
        teamName: statsById.get(best.row.teamId)?.teamName ?? `Team ${best.row.teamId}`,
        managerName: statsById.get(best.row.teamId)?.managerName ?? null,
        logo: statsById.get(best.row.teamId)?.logo ?? null,
        value: round2(best.value),
        detail: card.detail(best.row, best.value, ctx),
        amount: share,
      },
      tiedWith: tied
        .filter((entry) => entry.row.teamId !== best.row.teamId)
        .map((entry) => ({
          teamId: entry.row.teamId,
          teamName: statsById.get(entry.row.teamId)?.teamName ?? `Team ${entry.row.teamId}`,
          managerName: statsById.get(entry.row.teamId)?.managerName ?? null,
          logo: statsById.get(entry.row.teamId)?.logo ?? null,
          detail: card.detail(entry.row, entry.value, ctx),
          amount: share,
        })),
    };
  });
}

/**
 * Season-to-date challenge winnings per team, so the standings can show who is
 * actually up on the year rather than just who is winning games.
 */
export function challengeLeaderboard(resolved, teamStats = []) {
  const tally = new Map();

  const add = (entry) => {
    if (!entry) return;
    if (!tally.has(entry.teamId)) tally.set(entry.teamId, { wins: 0, won: 0 });
    const rec = tally.get(entry.teamId);
    rec.wins += 1;
    rec.won += entry.amount ?? 0;
  };

  for (const week of resolved) {
    add(week.winner);
    for (const tie of week.tiedWith ?? []) add(tie);
  }

  const statsById = new Map(teamStats.map((t) => [t.teamId, t]));

  return [...tally.entries()]
    .map(([teamId, rec]) => ({
      teamId,
      teamName: statsById.get(teamId)?.teamName ?? `Team ${teamId}`,
      managerName: statsById.get(teamId)?.managerName ?? null,
      logo: statsById.get(teamId)?.logo ?? null,
      challengesWon: rec.wins,
      amountWon: round2(rec.won),
    }))
    .sort((a, b) => b.amountWon - a.amountWon || b.challengesWon - a.challengesWon);
}
