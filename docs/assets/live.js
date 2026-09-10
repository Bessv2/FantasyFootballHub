/**
 * Live NFL scoreboard.
 *
 * Fetched in the browser, not at build time, because scores move by the minute
 * and the build only runs every few hours — a "live" panel that was three hours
 * stale would be worse than none. ESPN's public scoreboard sends
 * `Access-Control-Allow-Origin: *`, so the page can call it directly.
 *
 * This is the legitimate version of "watch the games from the hub": live score
 * and clock, the network actually carrying each game, and — the part no
 * streaming site can do — which of your own players are on the field right now.
 */

const SCOREBOARD_URL =
  'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard';

/**
 * ESPN uses different team abbreviations in its fantasy API and its scoreboard
 * API. Left is what the scoreboard says, right is what the fantasy side uses.
 * Without this, rosters silently fail to match games for these teams.
 */
const TEAM_ALIASES = {
  WSH: 'WSH', WAS: 'WSH',
  LAR: 'LAR', LA: 'LAR',
  LAC: 'LAC', SD: 'LAC',
  LV: 'LV', OAK: 'LV', LVR: 'LV',
  JAX: 'JAX', JAC: 'JAX',
  NE: 'NE', NWE: 'NE',
  NO: 'NO', NOR: 'NO',
  SF: 'SF', SFO: 'SF',
  TB: 'TB', TAM: 'TB',
  GB: 'GB', GNB: 'GB',
  KC: 'KC', KAN: 'KC',
  ARI: 'ARI', ARZ: 'ARI',
};

const normalizeTeam = (abbrev) => {
  if (!abbrev) return null;
  const upper = String(abbrev).toUpperCase();
  return TEAM_ALIASES[upper] ?? upper;
};

/** Fetches and flattens the scoreboard into something the view can render. */
export async function fetchScoreboard({ signal } = {}) {
  const res = await fetch(SCOREBOARD_URL, { signal, cache: 'no-store' });
  if (!res.ok) throw new Error(`ESPN scoreboard returned ${res.status}`);
  const json = await res.json();

  const games = (json.events ?? []).map((event) => {
    const comp = event.competitions?.[0] ?? {};
    const competitors = comp.competitors ?? [];
    const home = competitors.find((c) => c.homeAway === 'home') ?? competitors[0];
    const away = competitors.find((c) => c.homeAway === 'away') ?? competitors[1];

    const state = event.status?.type?.state ?? 'pre'; // pre | in | post

    // Broadcast: prefer the national listing, fall back to whatever geo entry
    // exists. This is what tells someone where they can legally watch.
    const networks = [
      ...new Set([
        ...(comp.broadcasts ?? []).flatMap((b) => b.names ?? []),
        ...(comp.geoBroadcasts ?? []).map((g) => g.media?.shortName).filter(Boolean),
      ]),
    ];

    const side = (c) => ({
      abbrev: normalizeTeam(c?.team?.abbreviation),
      name: c?.team?.shortDisplayName ?? c?.team?.displayName ?? '—',
      logo: c?.team?.logo ?? null,
      score: c?.score === undefined ? null : Number(c.score),
      record: c?.records?.find((r) => r.type === 'total')?.summary ?? null,
      winner: Boolean(c?.winner),
    });

    return {
      id: event.id,
      name: event.shortName ?? event.name,
      date: event.date,
      state,
      isLive: state === 'in',
      isFinal: state === 'post',
      statusDetail: event.status?.type?.shortDetail ?? event.status?.type?.description ?? '',
      // Down and distance, possession — only present mid-game.
      situation: comp.situation?.downDistanceText ?? null,
      possession: normalizeTeam(
        comp.competitors?.find((c) => c.id === comp.situation?.possession)?.team?.abbreviation
      ),
      venue: comp.venue?.fullName ?? null,
      networks,
      home: side(home),
      away: side(away),
      gamecast: (event.links ?? []).find((l) => l.text === 'Gamecast')?.href ?? null,
    };
  });

  // In-progress first, then upcoming, then finals — the order you care about.
  const rank = (g) => (g.isLive ? 0 : g.isFinal ? 2 : 1);
  games.sort((a, b) => rank(a) - rank(b) || new Date(a.date) - new Date(b.date));

  return {
    week: json.week?.number ?? null,
    seasonType: json.season?.type ?? null,
    fetchedAt: new Date().toISOString(),
    games,
  };
}

/**
 * Maps rostered players onto the games their NFL team is playing.
 *
 * This is the whole point of putting a scoreboard on a fantasy hub: not "what
 * is the score", which is everywhere, but "the game on right now contains three
 * of my starters".
 */
export function attachRoster(games, roster) {
  const byTeam = new Map();
  for (const player of roster ?? []) {
    const team = normalizeTeam(player.proTeam);
    if (!team || team === 'FA') continue;
    if (!byTeam.has(team)) byTeam.set(team, []);
    byTeam.get(team).push(player);
  }

  return games.map((game) => {
    const mine = [
      ...(byTeam.get(game.home.abbrev) ?? []),
      ...(byTeam.get(game.away.abbrev) ?? []),
    ];
    // Starters first — those are the ones actually scoring for you today.
    mine.sort((a, b) => Number(b.started) - Number(a.started) || (b.projected ?? 0) - (a.projected ?? 0));
    return {
      ...game,
      myPlayers: mine,
      myStarters: mine.filter((p) => p.started).length,
    };
  });
}

/** True while any game is in progress, which is when refreshing is worth it. */
export const hasLiveGames = (games) => games.some((g) => g.isLive);
