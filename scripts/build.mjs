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
import { computeLedger } from './lib/money.mjs';

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
    weeks,
  };
}

function buildSeason(raw, moneyConfig) {
  const season = normalizeSeason(raw);
  const teamWeeks = buildTeamWeeks(season);
  const teamStats = computeTeamStats(season, teamWeeks);
  const standings = computeStandings(teamStats, season);
  const power = computePowerRankings(teamStats, teamWeeks);
  const prizes = computePrizes(season, teamStats, teamWeeks);
  const weeklyHigh = computeWeeklyHighScores(teamWeeks, teamStats);
  const positional = computePositionalStats(teamWeeks, teamStats);
  const draft = analyzeDraft(season);
  const ledger = computeLedger(moneyConfig, season, standings);

  return { season, teamWeeks, teamStats, standings, power, prizes, weeklyHigh, positional, draft, ledger };
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
    built.push({ year, ...buildSeason(raw, moneyConfig) });
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
      transactions: b.season.transactions,
      trades: b.season.trades,
    });

    await writeJson(path.join(DERIVED, `draft-${b.year}.json`), b.draft);

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
