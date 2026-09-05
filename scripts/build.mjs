/**
 * Turns data/raw/ into the JSON the site actually loads (data/derived/).
 *
 *   node scripts/build.mjs
 *   node scripts/build.mjs --fixtures   (build from synthetic test data instead)
 *
 * Safe to run against an empty league: it produces a valid, complete payload
 * that says "nothing has happened yet" rather than failing or inventing zeros.
 */

import { mkdir, writeFile, readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

import { projectRoot } from './lib/espn.mjs';
import { normalizeSeason, PHASE } from './lib/normalize.mjs';
import { resolvePosition, PRO_TEAM } from './lib/constants.mjs';
import {
  buildTeamWeeks,
  computeTeamStats,
  computeStandings,
  computePowerRankings,
  computePrizes,
  computeWeeklyHighScores,
  computePositionalStats,
} from './lib/analytics.mjs';
import { analyzeDraft } from './lib/draft.mjs';
import { computeLedger, computePayouts, challengePayout, splitPot } from './lib/money.mjs';
import { buildChallengeSchedule, computeChallenges, challengeLeaderboard } from './lib/challenges.mjs';
import { sanitizeTeamLogo } from './lib/images.mjs';
import { buildPlayerCards, normalizeNews } from './lib/playercard.mjs';
import { recommendLineup, coachingReport, waiverTargets } from './lib/advisor.mjs';
import { buildBigBoard } from './lib/bigboard.mjs';

const ROOT = projectRoot();
const args = process.argv.slice(2);
const USE_FIXTURES = args.includes('--fixtures');
const RAW = path.join(ROOT, 'data', USE_FIXTURES ? 'fixtures' : 'raw');
// The site is served straight out of docs/, which is what GitHub Pages
// publishes. Writing derived JSON there keeps the published site
// self-contained — no copy step, no chance of the site and its data drifting.
const DERIVED = path.join(ROOT, 'docs', 'data');

const readJson = async (file, fallback = null) => {
  if (!existsSync(file)) return fallback;
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch (error) {
    console.warn(`  ! could not parse ${path.relative(ROOT, file)}: ${error.message}`);
    return fallback;
  }
};

async function writeJson(file, data) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(data), 'utf8');
  const kb = (Buffer.byteLength(JSON.stringify(data)) / 1024).toFixed(1);
  console.log(`  wrote ${path.relative(ROOT, file)} (${kb} KB)`);
}

async function loadSeasonRaw(season) {
  const dir = path.join(RAW, String(season));
  if (!existsSync(dir)) return null;

  const weeksDir = path.join(dir, 'weeks');
  const weeks = [];
  if (existsSync(weeksDir)) {
    const files = (await readdir(weeksDir)).filter((f) => f.endsWith('.json'));
    for (const file of files.sort((a, b) => parseInt(a, 10) - parseInt(b, 10))) {
      const week = parseInt(file, 10);
      const data = await readJson(path.join(weeksDir, file));
      if (data) weeks.push({ week, data });
    }
  }

  return {
    league: await readJson(path.join(dir, 'league.json')),
    draft: await readJson(path.join(dir, 'draft.json')),
    transactions: await readJson(path.join(dir, 'transactions.json')),
    activity: await readJson(path.join(dir, 'activity.json')),
    players: await readJson(path.join(dir, 'players.json'), []),
    current: await readJson(path.join(dir, 'current.json')),
    freeAgents: await readJson(path.join(dir, 'freeagents.json')),
    draftPool: await readJson(path.join(dir, 'draftpool.json')),
    news: await readJson(path.join(dir, 'news.json')),
    weeks,
  };
}

function buildSeason(raw, moneyConfig) {
  const season = normalizeSeason(raw);

  // Fantasy team logos are URLs ESPN hands back, and ESPN lets a manager point
  // one anywhere. Filtering here — at the top, before anything copies the value
  // downstream — means every consumer sees an already-safe logo or none at all.
  // See scripts/lib/images.mjs for what this is actually protecting against.
  for (const team of season.teams) team.logo = sanitizeTeamLogo(team.logo);

  const teamWeeks = buildTeamWeeks(season);
  const teamStats = computeTeamStats(season, teamWeeks);
  const standings = computeStandings(teamStats, season);
  const power = computePowerRankings(teamStats, teamWeeks);
  const prizes = computePrizes(season, teamStats, teamWeeks);
  const weeklyHigh = computeWeeklyHighScores(teamWeeks, teamStats);
  const positional = computePositionalStats(teamWeeks, teamStats);
  const draft = analyzeDraft(season);

  const playerCards = buildPlayerCards({
    players: playerObjectsFor(raw),
    seasonId: season.league.season,
    news: normalizeNews(raw.news?.feeds),
  });

  const challenges = buildChallenges(season, teamStats, teamWeeks, moneyConfig);
  // The ledger needs the same week list the challenges were dealt for, so the
  // pot it splits and the pot the site pays out are the same pot.
  const ledger = computeLedger(moneyConfig, season, standings, {
    challengeWeeks: challenges.schedule.weeks.map((w) => w.week),
  });

  const teamDetail = buildTeamDetail(season, teamStats, teamWeeks, standings, draft);

  return {
    season, teamWeeks, teamStats, standings, power, prizes,
    weeklyHigh, positional, draft, ledger, teamDetail, challenges, playerCards,
  };
}

/**
 * The weekly challenge: deal the season's schedule, then score the weeks that
 * have actually been played.
 *
 * The per-week cash is computed here rather than read out of the ledger,
 * because the ledger is never published — the league still has to be able to
 * see what this week is worth. Both sides call splitPot() on the same payout
 * slot, so they cannot drift.
 */
function buildChallenges(season, teamStats, teamWeeks, moneyConfig) {
  const config = moneyConfig.weeklyChallenge ?? {};
  const schedule = buildChallengeSchedule({
    leagueId: season.league.id,
    season: season.league.season,
    weeks: season.league.regularSeasonWeeks,
    salt: config.salt ?? '',
    cadence: config.cadence ?? 'weekly',
    startWeek: config.startWeek ?? 1,
    overrides: config.overrides ?? {},
  });

  const weekNumbers = schedule.weeks.map((w) => w.week);

  const expectedPot =
    (Number(moneyConfig.buyIn) || 0) * (moneyConfig.members?.length || season.league.size);
  const { payouts } = computePayouts(moneyConfig, expectedPot);
  const pot = Math.max(0, challengePayout(payouts, moneyConfig));
  const perWeek = new Map(splitPot(pot, weekNumbers).map((w) => [w.week, w.amount]));

  const resolved = computeChallenges({
    schedule,
    teamWeeks,
    teamStats,
    weeksPlayed: season.status.weeksPlayed,
    payouts: perWeek,
  });

  return {
    enabled: config.enabled !== false,
    seed: schedule.seed,
    cadence: schedule.cadence,
    currency: moneyConfig.currency ?? 'USD',
    pot: Number(pot.toFixed(2)),
    totalWeeks: weekNumbers.length,
    schedule,
    weeks: resolved,
    leaderboard: challengeLeaderboard(resolved, teamStats),
  };
}

/**
 * Everything a single manager wants about their own team: the season log, what
 * they got wrong, what to start next week, and who to pick up.
 *
 * Built per team at build time so the site can deep-link straight to it without
 * shipping the whole league's roster history to every visitor.
 */
function buildTeamDetail(season, teamStats, teamWeeks, standings, draft) {
  const slots = season.league.startingSlots;

  return season.teams
    .filter((t) => !t.isPlaceholder || teamWeeks.some((r) => r.teamId === t.id))
    .map((team) => {
      const stats = teamStats.find((s) => s.teamId === team.id) ?? null;
      const rows = teamWeeks.filter((r) => r.teamId === team.id).sort((a, b) => a.week - b.week);
      const standing = standings.find((s) => s.teamId === team.id) ?? null;
      const roster = season.currentRosters?.[team.id] ?? [];

      // Head-to-head, so "I always lose to that guy" can be checked.
      const h2h = new Map();
      for (const row of rows) {
        if (row.opponentId === null) continue;
        if (!h2h.has(row.opponentId)) h2h.set(row.opponentId, { wins: 0, losses: 0, ties: 0, pointsFor: 0, pointsAgainst: 0 });
        const rec = h2h.get(row.opponentId);
        if (row.result === 'WIN') rec.wins += 1;
        else if (row.result === 'LOSS') rec.losses += 1;
        else rec.ties += 1;
        rec.pointsFor += row.score;
        rec.pointsAgainst += row.opponentScore;
      }

      return {
        teamId: team.id,
        teamName: team.name,
        abbrev: team.abbrev,
        managerName: team.managerName,
        logo: team.logo,
        isPlaceholder: team.isPlaceholder,
        rank: standing?.rank ?? null,
        inPlayoffs: standing?.inPlayoffs ?? false,
        stats: stats ? (({ weeks, ...rest }) => rest)(stats) : null,

        weekLog: rows.map(({ starters, benchPlayers, ...rest }) => rest),

        roster: roster.map((p) => ({
          playerId: p.playerId, name: p.name, position: p.position,
          proTeam: p.proTeam, slot: p.slot, slotId: p.slotId,
          started: p.started, projected: p.projected, injuryStatus: p.injuryStatus,
        })),

        lineupAdvice: recommendLineup(roster, slots),
        coaching: coachingReport(rows, slots),
        waivers: waiverTargets(season.freeAgents, roster, slots),

        draftPicks: draft.held
          ? draft.picks.filter((p) => p.teamId === team.id).map((p) => ({
              overall: p.overall, round: p.round, playerName: p.playerName,
              position: p.position, proTeam: p.proTeam,
              seasonPoints: p.seasonPoints, valueDelta: p.valueDelta,
            }))
          : [],

        transactions: season.transactions.filter((t) => t.teamId === team.id).length,

        headToHead: [...h2h.entries()].map(([opponentId, rec]) => ({
          opponentId,
          opponentName: season.teams.find((t) => t.id === opponentId)?.name ?? `Team ${opponentId}`,
          ...rec,
          pointsFor: Number(rec.pointsFor.toFixed(2)),
          pointsAgainst: Number(rec.pointsAgainst.toFixed(2)),
        })),
      };
    });
}

/**
 * teamStats carries every week's full roster so the analytics can reach it.
 * That must not reach the wire — it inflates the landing payload roughly 50x.
 */
const slim = (rows) => rows.map(({ weeks, ...rest }) => rest);

/**
 * Strips ESPN SWIDs before anything is written to docs/.
 *
 * `ownerIds` holds each manager's SWID — a permanent ESPN account identifier.
 * It cannot authenticate on its own (that needs espn_s2 as well), but docs/ is
 * published to a public GitHub Pages site and the front end only ever reads
 * `managerName`. There is no reason to broadcast every league member's account
 * ID, so it is dropped at the publish boundary rather than carried along.
 */
const stripOwnerIds = (teams) => teams.map(({ ownerIds, ...rest }) => rest);

/**
 * The draft board for the mock draft: one row per draftable player, ranked for
 * this league's actual format.
 */
function buildDraftPool(raw) {
  const rankType = raw.draftPool?.rankType ?? 'PPR';
  const players = (raw.draftPool?.players ?? [])
    .map((entry) => {
      const p = entry?.player;
      if (!p) return null;

      const ranks = p.draftRanksByRankType ?? {};
      const rank = ranks[rankType]?.rank ?? null;
      const stats = p.stats ?? [];
      // splitTypeId 0 + scoringPeriodId 0 is the season total, not a week.
      const seasonProjection = stats.find(
        (s) => s.seasonId === raw.league?.seasonId && s.statSourceId === 1 && s.statSplitTypeId === 0
      )?.appliedTotal;
      const lastSeason = stats.find(
        (s) => s.seasonId === (raw.league?.seasonId ?? 0) - 1 && s.statSourceId === 0 && s.statSplitTypeId === 0
      )?.appliedTotal;

      return {
        playerId: p.id,
        name: p.fullName ?? `Player ${p.id}`,
        position: resolvePosition(p),
        proTeam: PRO_TEAM[p.proTeamId] ?? 'FA',
        rank,
        pprRank: ranks.PPR?.rank ?? null,
        adp: p.ownership?.averageDraftPosition != null
          ? Number(p.ownership.averageDraftPosition.toFixed(1))
          : null,
        auctionValue: ranks[rankType]?.auctionValue ?? null,
        projected: seasonProjection != null ? Number(seasonProjection.toFixed(1)) : null,
        lastSeason: lastSeason != null ? Number(lastSeason.toFixed(1)) : null,
        injuryStatus: p.injuryStatus ?? null,
      };
    })
    .filter((p) => p && p.rank !== null)
    .sort((a, b) => a.rank - b.rank);

  return { rankType, players };
}

/**
 * Every full player object the raw payloads carry, for the card index.
 *
 * Three sources, in priority order — the draft pool is richest (it has the
 * per-stat breakdown), current rosters cover anyone drafted, and the weekly box
 * scores catch players who were rostered earlier and since dropped. First one
 * to claim an id wins, so the richest source is walked first.
 */
function playerObjectsFor(raw) {
  const out = [];

  for (const entry of raw.draftPool?.players ?? []) {
    if (entry?.player) out.push(entry.player);
  }
  for (const team of raw.current?.teams ?? []) {
    for (const entry of team?.roster?.entries ?? []) {
      if (entry?.playerPoolEntry?.player) out.push(entry.playerPoolEntry.player);
    }
  }
  for (const { data } of raw.weeks ?? []) {
    for (const game of data?.schedule ?? []) {
      for (const side of [game?.home, game?.away]) {
        for (const entry of side?.rosterForCurrentScoringPeriod?.entries ?? []) {
          if (entry?.playerPoolEntry?.player) out.push(entry.playerPoolEntry.player);
        }
      }
    }
  }

  return out;
}

/** Human-readable summary of what the league is currently doing. */
function describePhase(season) {
  const { phase, teamsJoined, weeksPlayed } = season.status;
  const size = season.league.size;
  const draftDate = season.league.draftDate ? new Date(season.league.draftDate) : null;

  switch (phase) {
    case PHASE.EMPTY:
      return {
        headline: 'Waiting on managers',
        detail: `${teamsJoined} of ${size} teams have joined. Send the rest of your invites.`,
        nextMilestone: draftDate ? `Draft: ${draftDate.toDateString()}` : 'Draft date not set yet',
      };
    case PHASE.PRE_DRAFT:
      return {
        headline: 'League is full — draft is next',
        detail: `All ${size} teams claimed. Nothing to analyze until picks are made.`,
        nextMilestone: draftDate ? `Draft: ${draftDate.toDateString()}` : 'Draft date not set yet',
      };
    case PHASE.DRAFTED:
      return {
        headline: 'Drafted — waiting on kickoff',
        detail: 'Draft analysis is live. Standings and prizes unlock after Week 1.',
        nextMilestone: 'Week 1',
      };
    case PHASE.IN_SEASON:
      return {
        headline: `Week ${weeksPlayed} complete`,
        detail: `${weeksPlayed} of ${season.league.regularSeasonWeeks} regular season weeks played.`,
        nextMilestone: `Week ${weeksPlayed + 1}`,
      };
    case PHASE.COMPLETE:
      return {
        headline: 'Season complete',
        detail: 'Final standings and all prizes are settled.',
        nextMilestone: null,
      };
    default:
      return { headline: 'Unknown', detail: '', nextMilestone: null };
  }
}

async function main() {
  console.log(`\nBuilding from ${path.relative(ROOT, RAW)}\n`);

  const config = await readJson(path.join(ROOT, 'config', 'league.json'), {});
  const moneyConfig = await readJson(path.join(ROOT, 'config', 'money.json'), {});
  const seasons = config.seasons ?? [];

  if (!seasons.length) {
    console.error('config/league.json has no seasons listed. Run: node scripts/check.mjs');
    process.exitCode = 1;
    return;
  }

  const built = [];
  for (const year of seasons) {
    const raw = await loadSeasonRaw(year);
    if (!raw?.league) {
      console.log(`  season ${year}: no raw data (run npm run fetch)`);
      continue;
    }
    console.log(`  season ${year}: normalizing...`);
    built.push({ year, raw, ...buildSeason(raw, moneyConfig) });
  }

  if (!built.length) {
    console.error('\nNothing to build. Run: npm run fetch');
    process.exitCode = 1;
    return;
  }

  const current = built[built.length - 1];
  const phase = describePhase(current.season);

  console.log('');

  // ---- hub.json: everything the landing view needs -----------------------
  await writeJson(path.join(DERIVED, 'hub.json'), {
    generatedAt: new Date().toISOString(),
    league: {
      ...current.season.league,
      displayName: config.leagueName ?? current.season.league.name,
      tagline: config.tagline ?? '',
    },
    status: current.season.status,
    phase,
    seasons: built.map((b) => b.year),
    // Flags a build made from synthetic fixtures so the site can say so.
    synthetic: USE_FIXTURES,
    teams: stripOwnerIds(current.season.teams),
    standings: slim(current.standings),
    power: current.power,
    weeklyHigh: current.weeklyHigh,
    positional: current.positional,
    challenges: current.challenges,
    site: config.site ?? {},
  });

  // ---- Per-season detail -------------------------------------------------
  for (const b of built) {
    await writeJson(path.join(DERIVED, `season-${b.year}.json`), {
      year: b.year,
      league: b.season.league,
      status: b.season.status,
      teams: stripOwnerIds(b.season.teams),
      standings: slim(b.standings),
      power: b.power,
      teamStats: slim(b.teamStats),
      teamWeeks: b.teamWeeks.map(({ starters, benchPlayers, ...rest }) => rest),
      weeklyHigh: b.weeklyHigh,
      positional: b.positional,
      prizes: b.prizes,
      challenges: b.challenges,
      transactions: b.season.transactions,
      trades: b.season.trades,
    });

    await writeJson(path.join(DERIVED, `draft-${b.year}.json`), b.draft);

    // Draft board for the mock draft, ranked for this league's format.
    const pool = buildDraftPool(b.raw);
    if (pool.players.length) {
      const poolPayload = {
        year: b.year,
        rankType: pool.rankType,
        rounds: b.season.draft.rounds || 16,
        teams: b.season.league.size,
        startingSlots: b.season.league.startingSlots,
        benchSlots: b.season.league.benchSlots,
        players: pool.players,
      };
      await writeJson(path.join(DERIVED, `draftpool-${b.year}.json`), poolPayload);

      // The big board: same players, graded against replacement level and
      // annotated with who drafted them once the draft has happened.
      const board = buildBigBoard(poolPayload, b.draft, 250);
      await writeJson(path.join(DERIVED, `bigboard-${b.year}.json`), {
        year: b.year,
        draftHeld: b.draft.held,
        ...board,
      });
    }

    // Player cards: last season's real production, injury status and news,
    // keyed by player id. Its own file because the same player shows up on the
    // board, a roster, the draft board and the mock draft — inlining the card
    // in each would multiply the payload, and the landing page would pay for
    // data most visitors never hover.
    await writeJson(path.join(DERIVED, `players-${b.year}.json`), {
      year: b.year,
      priorSeason: b.year - 1,
      // When the news was pulled, so the front end can say how old it is
      // rather than presenting day-old injury notes as current.
      newsFetchedAt: b.raw.news?.fetchedAt ?? null,
      count: Object.keys(b.playerCards).length,
      cards: b.playerCards,
    });

    // Per-team detail: the personal view each manager lands on.
    await writeJson(path.join(DERIVED, `teams-${b.year}.json`), {
      year: b.year,
      adviceWeek: b.season.adviceWeek,
      freeAgentCount: b.season.freeAgents.length,
      teams: b.teamDetail,
    });

    // Full weekly rosters are the heaviest payload — kept separate so the
    // landing page does not pay for them.
    await writeJson(path.join(DERIVED, `weeks-${b.year}.json`), {
      year: b.year,
      weeks: b.season.weeks,
    });
  }

  // Always written so `npm run serve` shows the full ledger locally. When
  // site.showMoney is false it is gitignored, so it never reaches the public
  // site — local visibility without publishing who owes what.
  await writeJson(path.join(DERIVED, 'money.json'), current.ledger);
  if (config.site?.showMoney === false) {
    console.log('       (money.json is gitignored — local only, not published)');
  }

  // ---- Publish-boundary safety net --------------------------------------
  // docs/ goes to a public GitHub Pages site. Scan everything just written for
  // ESPN account IDs and session cookies. A future change to the normalizer
  // could reintroduce them without anyone noticing, so this fails the build
  // rather than trusting that stripOwnerIds() was remembered.
  const SWID_RE = /\{[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}\}/;
  const leaks = [];
  for (const file of await readdir(DERIVED)) {
    if (!file.endsWith('.json')) continue;
    const text = await readFile(path.join(DERIVED, file), 'utf8');
    if (SWID_RE.test(text)) leaks.push(`${file}: contains an ESPN SWID`);
    if (/espn_s2/i.test(text)) leaks.push(`${file}: mentions espn_s2`);
  }
  if (leaks.length) {
    console.error('\nBuild aborted — private identifiers found in publishable output:');
    for (const leak of leaks) console.error(`  ${leak}`);
    console.error('\ndocs/ is published publicly. Fix the build before committing.');
    process.exitCode = 1;
    return;
  }

  // ---- Console summary ---------------------------------------------------
  console.log(`\n${phase.headline}`);
  console.log(`  ${phase.detail}`);
  if (phase.nextMilestone) console.log(`  Next: ${phase.nextMilestone}`);

  const s = current.season;
  console.log('\nWhat is populated:');
  console.log(`  teams claimed     ${s.teams.filter((t) => !t.isPlaceholder).length}/${s.teams.length}`);
  console.log(`  draft picks       ${s.draft.picksMade}/${s.draft.totalSlots}`);
  console.log(`  weeks played      ${s.status.weeksPlayed}`);
  console.log(`  trades            ${s.trades.length}`);
  console.log(`  transactions      ${s.transactions.length}`);
  console.log(`  prizes computable ${current.prizes.length}`);
  console.log(
    `  player cards      ${Object.keys(current.playerCards).length}` +
      `${current.raw.news ? '' : ' (no news fetched)'}`
  );
  const settled = current.challenges.weeks.filter((w) => w.winner).length;
  console.log(
    `  challenges        ${settled}/${current.challenges.totalWeeks} settled ` +
      `(${current.challenges.cadence}, ${current.ledger.currency} ${current.challenges.pot} pot)`
  );
  if (current.ledger.warnings.length) {
    console.log('\nMoney ledger notes:');
    for (const w of current.ledger.warnings) console.log(`  - ${w}`);
  }
  console.log('\nDone. Open the site with: npm run serve\n');
}

main().catch((error) => {
  console.error(`\nBuild failed: ${error.message}`);
  if (process.env.DEBUG) console.error(error.stack);
  process.exitCode = 1;
});
