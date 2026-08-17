/**
 * Lists every fantasy league attached to your ESPN account, so you can confirm
 * you configured the right leagueId (and find historical leagues you're in but
 * did not create).
 *
 *   node scripts/myleagues.mjs
 */
import { loadSecrets } from './lib/espn.mjs';

const secrets = await loadSecrets();
if (!secrets) {
  console.error('No config/secrets.json found — this needs your ESPN cookies.');
  process.exit(1);
}

const url =
  `https://fan.api.espn.com/apis/v2/fans/${encodeURIComponent(secrets.swid)}` +
  '?displayEvents=true&displayNow=true&displayRecs=false&featureFlags=expandAthlete' +
  '&source=ESPN.COM+-+FAM&lang=en';

const res = await fetch(url, {
  headers: {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
    Accept: 'application/json',
    Cookie: `espn_s2=${secrets.espnS2}; SWID=${secrets.swid}`,
  },
});

if (!res.ok) {
  console.error(`ESPN fan API returned ${res.status} ${res.statusText}`);
  process.exit(1);
}

const data = await res.json();
const prefs = data.preferences ?? [];

const leagues = prefs
  .map((p) => p.metaData?.entry)
  .filter((e) => e && e.groups?.length)
  .flatMap((e) =>
    e.groups.map((g) => ({
      sport: e.abbrev ?? '?',
      season: e.seasonId,
      leagueId: g.groupId,
      leagueName: g.groupName,
      teamName: `${e.entryLocation ?? ''} ${e.entryNickname ?? ''}`.trim(),
      teamId: e.entryId,
    }))
  );

if (leagues.length === 0) {
  console.log('No fantasy leagues found on this account.');
} else {
  console.log(`\nFound ${leagues.length} league entr${leagues.length === 1 ? 'y' : 'ies'}:\n`);
  for (const l of leagues.sort((a, b) => b.season - a.season)) {
    console.log(
      `  ${l.season}  ${String(l.sport).padEnd(4)} leagueId=${String(l.leagueId).padEnd(12)} ` +
        `"${l.leagueName}"  (your team: ${l.teamName || '—'})`
    );
  }
}
console.log();
