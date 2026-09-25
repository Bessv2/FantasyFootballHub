/**
 * Pulls every league season from ESPN into data/raw/{season}/.
 *
 * Re-runs are cheap: finished weeks are cached and skipped. Only the in-progress
 * week (and anything missing) is re-fetched. Pass --force to ignore the cache.
 *
 *   node scripts/fetch.mjs
 *   node scripts/fetch.mjs --force
 *   node scripts/fetch.mjs --season 2025
 */

import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

import {
  createClient,
  loadConfig,
  loadSecrets,
  projectRoot,
  EspnAuthError,
  EspnNotFoundError,
} from './lib/espn.mjs';

const ROOT = projectRoot();
const RAW = path.join(ROOT, 'data', 'raw');

const args = process.argv.slice(2);
const FORCE = args.includes('--force');
const seasonFlag = args.indexOf('--season');
const ONLY_SEASON = seasonFlag >= 0 ? Number(args[seasonFlag + 1]) : null;

const log = (msg) => console.log(msg);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Be a good citizen — ESPN is doing us a favor by leaving this open. */
const POLITE_DELAY_MS = 250;

async function writeJson(file, data) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(data), 'utf8');
}

async function readJsonIfExists(file) {
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch {
    return null; // Corrupt cache entry — just refetch.
  }
}

// News is one request per player, so it is both the slowest step and the one
// most likely to get rate limited. Capped and paced accordingly.
const NEWS_PLAYER_LIMIT = 300;
const NEWS_DELAY_MS = 120;

async function fetchSeason(client, season) {
  const dir = path.join(RAW, String(season));
  log(`\n=== Season ${season} ===`);

  // ---- Core league views -------------------------------------------------
  // Fetched in small groups: ESPN drops fields from some view combinations.
  const core = await client.getView(season, ['mSettings', 'mTeam', 'mStandings', 'mRoster']);
  await writeJson(path.join(dir, 'league.json'), core);
  await sleep(POLITE_DELAY_MS);

  const teamCount = core.teams?.length ?? 0;
  const leagueName = core.settings?.name ?? '(unnamed)';
  log(`  league: ${leagueName} — ${teamCount} teams`);

  // How far along is this season?
  const status = core.status ?? {};
  const finalPeriod = status.finalScoringPeriod ?? 17;
  const latestPeriod = status.latestScoringPeriod ?? finalPeriod;
  const isComplete = Boolean(status.isActive === false || latestPeriod >= finalPeriod);
  const lastPlayed = Math.min(latestPeriod, finalPeriod);
  log(`  weeks played: ${lastPlayed} of ${finalPeriod}${isComplete ? ' (complete)' : ' (in progress)'}`);

  // ---- Draft -------------------------------------------------------------
  // ESPN pre-builds the full draft board before anyone picks, so a non-empty
  // `picks` array does NOT mean the draft happened. Unfilled slots carry
  // playerId -1. Count real selections, not slots.
  try {
    const draft = await client.getView(season, ['mDraftDetail']);
    await writeJson(path.join(dir, 'draft.json'), draft);
    const allPicks = draft.draftDetail?.picks ?? [];
    const realPicks = allPicks.filter((p) => p.playerId > 0);
    if (realPicks.length === 0) {
      log(`  draft: not held yet (${allPicks.length} empty slots on the board)`);
    } else {
      log(`  draft: ${realPicks.length} of ${allPicks.length} picks made`);
    }
  } catch (error) {
    log(`  draft: unavailable (${error.message})`);
  }
  await sleep(POLITE_DELAY_MS);

  // ---- Transactions ------------------------------------------------------
  // Only the filter values below are accepted; adding TRADE_* or DRAFT to the
  // list gets the whole request rejected with a bare 400.
  try {
    const transactions = await client.getView(season, ['mTransactions2'], {
      filter: { transactions: { filterType: { value: ['FREEAGENT', 'WAIVER', 'WAIVER_ERROR'] } } },
    });
    await writeJson(path.join(dir, 'transactions.json'), transactions);
    log(`  transactions: ${transactions.transactions?.length ?? 0}`);
  } catch (error) {
    log(`  transactions: unavailable (${error.message})`);
  }
  await sleep(POLITE_DELAY_MS);

  // ---- Activity feed (where trade detail actually lives) -----------------
  try {
    const activity = await client.getActivity(season);
    await writeJson(path.join(dir, 'activity.json'), activity);
    log(`  activity: ${activity.topics?.length ?? 0} topics`);
  } catch (error) {
    log(`  activity: unavailable (${error.message})`);
  }
  await sleep(POLITE_DELAY_MS);

  // ---- Player universe ---------------------------------------------------
  // Draft picks and transactions reference players by bare ID. Box-score
  // rosters carry full player objects, but only for players who were rostered
  // during a week we fetched — a player drafted and cut before week 1 would
  // otherwise show up as "Player 3139477". This fills that gap.
  try {
    const players = await client.getPlayers(season);
    await writeJson(path.join(dir, 'players.json'), players);
    log(`  players: ${Array.isArray(players) ? players.length : 0}`);
  } catch (error) {
    log(`  players: unavailable (${error.message}) — names will fall back to roster data`);
  }
  await sleep(POLITE_DELAY_MS);

  // ---- Per-week box scores ----------------------------------------------
  // This is the expensive part and the most valuable: it carries every player's
  // slot and score for every week, which powers lineup efficiency, bench
  // points, and most of the side prizes.
  let fetched = 0;
  let cached = 0;

  for (let week = 1; week <= lastPlayed; week += 1) {
    const file = path.join(dir, 'weeks', `${week}.json`);

    // A finished week never changes, so trust the cache. The most recent week
    // can still be moving, so always refresh it.
    const isSettledWeek = week < lastPlayed;
    if (!FORCE && isSettledWeek) {
      const existing = await readJsonIfExists(file);
      if (existing) {
        cached += 1;
        continue;
      }
    }

    try {
      const box = await client.getView(season, ['mMatchup', 'mMatchupScore', 'mScoreboard'], {
        params: { scoringPeriodId: week },
        filter: { schedule: { filterMatchupPeriodIds: { value: [week] } } },
      });
      await writeJson(file, box);
      fetched += 1;
    } catch (error) {
      log(`  week ${week}: failed (${error.message})`);
    }
    await sleep(POLITE_DELAY_MS);
  }
  log(`  box scores: ${fetched} fetched, ${cached} from cache`);

  // ---- Full-season schedule ---------------------------------------------
  // Box scores only exist for weeks already played. The playoff-odds
  // simulation needs who plays whom in every remaining week, and that is only
  // in the league's schedule. One request, no rosters, refreshed every run
  // because ESPN fills in the playoff bracket as the season goes.
  try {
    const schedule = await client.getView(season, ['mMatchupScore']);
    await writeJson(path.join(dir, 'schedule.json'), { schedule: schedule.schedule ?? [] });
    log(`  schedule: ${schedule.schedule?.length ?? 0} matchups`);
  } catch (error) {
    log(`  schedule: unavailable (${error.message}) — playoff odds will be skipped`);
  }
  await sleep(POLITE_DELAY_MS);

  // ---- Current rosters + free agents (for the roster advisor) -----------
  // The week to advise on is the next one that has not been played. Fetching
  // rosters with that scoringPeriodId is what makes ESPN return projections for
  // the right week rather than whatever period it defaults to.
  const adviceWeek = Math.min(finalPeriod, lastPlayed + 1);
  try {
    const current = await client.getRostersForWeek(season, adviceWeek);
    await writeJson(path.join(dir, "current.json"), { adviceWeek, ...current });
    const rostered = (current.teams ?? []).reduce(
      (total, t) => total + (t.roster?.entries?.length ?? 0), 0
    );
    log(`  current rosters: ${rostered} players across ${current.teams?.length ?? 0} teams (week ${adviceWeek})`);
  } catch (error) {
    log(`  current rosters: unavailable (${error.message})`);
  }
  await sleep(POLITE_DELAY_MS);

  // ---- Draft pool (for the mock draft) -----------------------------------
  // Ranked for THIS league's format. Josh Allen is SUPERFLEX #1 but PPR #36 —
  // a board built with the wrong rankType is one nobody here would draft from.
  try {
    const rankType = core.settings?.rosterSettings?.lineupSlotCounts?.['7'] > 0 ? 'SUPERFLEX' : 'PPR';
    const pool = await client.getDraftPool(season, { limit: 400, rankType });
    await writeJson(path.join(dir, 'draftpool.json'), { rankType, ...pool });
    log(`  draft pool: ${pool.players?.length ?? 0} players (${rankType} ranks)`);
  } catch (error) {
    log(`  draft pool: unavailable (${error.message})`);
  }
  await sleep(POLITE_DELAY_MS);

  try {
    const fa = await client.getFreeAgents(season, adviceWeek);
    await writeJson(path.join(dir, "freeagents.json"), { adviceWeek, ...fa });
    log(`  free agents: ${fa.players?.length ?? 0}`);
  } catch (error) {
    log(`  free agents: unavailable (${error.message})`);
  }
  await sleep(POLITE_DELAY_MS);

  // ---- Player news (for the hover cards) --------------------------------
  // One request per player, so this is scoped to the people who actually
  // appear on a card people would hover: the draft pool's top ranks plus
  // everyone currently rostered. Fetching news for all 11,600 players would be
  // 11,600 requests for data nobody will read.
  //
  // Entirely optional. Every failure mode here — endpoint moved, rate limited,
  // offline — degrades to a card with stats and injury status and no news,
  // which is why nothing in this block throws.
  try {
    const newsIds = new Set();
    for (const entry of (await readJsonIfExists(path.join(dir, 'draftpool.json')))?.players ?? []) {
      const id = entry?.player?.id;
      if (id) newsIds.add(id);
      if (newsIds.size >= NEWS_PLAYER_LIMIT) break;
    }
    for (const team of (await readJsonIfExists(path.join(dir, 'current.json')))?.teams ?? []) {
      for (const entry of team?.roster?.entries ?? []) {
        if (entry?.playerId) newsIds.add(entry.playerId);
      }
    }

    const feeds = [];
    let withNews = 0;
    for (const id of newsIds) {
      const feed = await client.getPlayerNews(id);
      if (feed) {
        feeds.push(feed);
        withNews += 1;
      }
      await sleep(NEWS_DELAY_MS);
    }
    await writeJson(path.join(dir, 'news.json'), { fetchedAt: new Date().toISOString(), feeds });
    log(`  player news: ${withNews} of ${newsIds.size} players have items`);
  } catch (error) {
    log(`  player news: skipped (${error.message}) — cards will show stats only`);
  }

  await writeJson(path.join(dir, 'meta.json'), {
    season,
    fetchedAt: new Date().toISOString(),
    finalScoringPeriod: finalPeriod,
    lastPlayedWeek: lastPlayed,
    isComplete,
    teamCount,
  });

  return { season, teamCount, lastPlayed, isComplete };
}

async function main() {
  const config = await loadConfig();
  const secrets = await loadSecrets();

  log(`League ${config.leagueId}`);
  log(secrets ? 'Auth: using espn_s2 + SWID cookies' : 'Auth: none (assuming public league)');

  const client = createClient({ leagueId: config.leagueId, secrets, log });

  const seasons = ONLY_SEASON ? [ONLY_SEASON] : config.seasons;
  const results = [];
  const failures = [];

  for (const season of seasons) {
    try {
      results.push(await fetchSeason(client, season));
    } catch (error) {
      if (error instanceof EspnAuthError) {
        // No point continuing — every remaining season will fail the same way.
        console.error(`\n${error.message}`);
        process.exitCode = 1;
        return;
      }
      if (error instanceof EspnNotFoundError) {
        log(`\n=== Season ${season} ===\n  skipped: ${error.message}`);
        failures.push({ season, reason: error.message });
        continue;
      }
      throw error;
    }
  }

  await writeJson(path.join(RAW, 'index.json'), {
    leagueId: config.leagueId,
    fetchedAt: new Date().toISOString(),
    seasons: results,
    failures,
  });

  log(`\nDone. ${results.length} season(s) written to data/raw/.`);
  if (failures.length) {
    log(`${failures.length} season(s) skipped — see data/raw/index.json.`);
  }
  log('Next: npm run build');
}

main().catch((error) => {
  console.error(`\nFetch failed: ${error.message}`);
  if (process.env.DEBUG) console.error(error.stack);
  process.exitCode = 1;
});
