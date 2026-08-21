/**
 * Pre-flight check. Verifies config, credentials, and connectivity, then
 * reports which seasons ESPN actually has for this league.
 *
 *   node scripts/check.mjs
 *
 * Run this first, and any time fetching starts behaving oddly.
 */

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

import { createClient, loadSecrets, projectRoot, EspnAuthError } from './lib/espn.mjs';

const ROOT = projectRoot();

function ok(msg) {
  console.log(`  [ok]   ${msg}`);
}
function warn(msg) {
  console.log(`  [warn] ${msg}`);
}
function fail(msg) {
  console.log(`  [FAIL] ${msg}`);
}

async function main() {
  console.log('\nFantasy Football Hub — pre-flight check\n');

  // ---- Config ------------------------------------------------------------
  console.log('Config');
  const configFile = path.join(ROOT, 'config', 'league.json');
  const config = JSON.parse(await readFile(configFile, 'utf8'));

  if (!config.leagueId) {
    fail('config/league.json has no leagueId. Add the number from your league URL.');
    process.exitCode = 1;
    return;
  }
  ok(`leagueId ${config.leagueId}`);

  // ---- Credentials -------------------------------------------------------
  console.log('\nCredentials');
  const exampleFile = path.join(ROOT, 'config', 'secrets.example.json');
  if (existsSync(exampleFile)) {
    const example = await readFile(exampleFile, 'utf8');
    // The template is committed. Real cookies must never end up in it.
    if (!example.includes('PASTE_YOUR_ESPN_S2_VALUE_HERE')) {
      fail('config/secrets.example.json looks like it contains real values.');
      fail('That file IS committed to git. Move your cookies to config/secrets.json.');
      process.exitCode = 1;
      return;
    }
    ok('secrets.example.json still holds placeholders only');
  }

  const secrets = await loadSecrets();
  if (secrets) {
    ok(`espn_s2 loaded (${secrets.espnS2.length} chars)`);
    ok(`swid loaded (${secrets.swid})`);
    if (secrets.espnS2.length < 100) {
      warn('espn_s2 looks short — it is normally 250+ characters. Re-copy it if auth fails.');
    }
    if (!/^\{[0-9A-Fa-f-]{36}\}$/.test(secrets.swid)) {
      warn('swid does not look like {8-4-4-4-12 hex}. Re-copy it if auth fails.');
    }
  } else {
    warn('No credentials found. That is fine for a public league; private leagues need them.');
  }

  // ---- Connectivity + season discovery ----------------------------------
  console.log('\nConnectivity');
  const client = createClient({ leagueId: config.leagueId, secrets, log: () => {} });

  const thisYear = new Date().getFullYear();
  let anchor = null;
  let anchorSeason = null;

  // Walk back from the current year until a season responds.
  for (let season = thisYear; season >= thisYear - 3 && !anchor; season -= 1) {
    try {
      anchor = await client.getView(season, ['mSettings']);
      anchorSeason = season;
    } catch (error) {
      if (error instanceof EspnAuthError) {
        fail(error.message.split('\n')[0]);
        console.log(`\n${error.message}\n`);
        process.exitCode = 1;
        return;
      }
      // Season doesn't exist — keep walking back.
    }
  }

  if (!anchor) {
    fail(`Could not reach league ${config.leagueId} for any season ${thisYear - 3}-${thisYear}.`);
    fail('Check that the leagueId is correct and that you are a member of the league.');
    process.exitCode = 1;
    return;
  }

  ok(`reached ESPN — league resolves for ${anchorSeason}`);
  ok(`league name: ${anchor.settings?.name ?? '(unnamed)'}`);
  ok(`size: ${anchor.settings?.size ?? '?'} teams`);

  // ---- League size vs who is actually playing ---------------------------
  // Everything downstream keys off the ESPN league size: replacement levels,
  // roster capacity, the snake order, the mock draft, and the recommended pick
  // for all 250 players. If the real league has a different number of managers,
  // all of it is quietly computed for the wrong league.
  const moneyFile = path.join(ROOT, 'config', 'money.json');
  if (existsSync(moneyFile)) {
    const money = JSON.parse(await readFile(moneyFile, 'utf8'));
    const payers = money.members?.length ?? 0;
    const espnSize = anchor.settings?.size ?? 0;

    console.log('\nLeague size');
    if (payers && payers !== espnSize) {
      warn(`ESPN is set to ${espnSize} teams, but config/money.json lists ${payers} managers.`);
      warn('Change the size in ESPN (League Settings -> Basic Settings -> Number of Teams).');
      warn('Until then the draft board, mock draft and recommended picks all assume');
      warn(`${espnSize} teams — and the real draft would run with ${espnSize - payers} auto-drafting`);
      warn('team(s). This is the one mismatch worth fixing before draft day.');
    } else if (payers) {
      ok(`ESPN size (${espnSize}) matches the ${payers} managers in the ledger`);
    }
  }

  // ESPN reports the league's own history, which beats guessing.
  const previous = anchor.status?.previousSeasons ?? [];
  const seasons = [...new Set([...previous, anchorSeason])].sort((a, b) => a - b);

  console.log('\nSeasons');
  ok(`ESPN reports ${seasons.length} season(s): ${seasons.join(', ')}`);

  const configured = config.seasons ?? [];
  const missing = seasons.filter((s) => !configured.includes(s));
  if (missing.length) {
    warn(`config/league.json is missing: ${missing.join(', ')}`);
    console.log('\n  Suggested config/league.json "seasons":');
    console.log(`    ${JSON.stringify(seasons)}`);
  } else {
    ok('config/league.json seasons match');
  }

  console.log('\nAll checks passed. Next: npm run fetch\n');
}

main().catch((error) => {
  console.error(`\nCheck failed: ${error.message}`);
  if (process.env.DEBUG) console.error(error.stack);
  process.exitCode = 1;
});
