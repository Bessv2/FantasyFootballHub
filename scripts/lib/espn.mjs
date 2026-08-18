/**
 * Thin, dependency-free client for ESPN's (unofficial, undocumented) fantasy
 * football API.
 *
 * ESPN exposes league data as a single endpoint that you shape with `view`
 * query params. Asking for several views at once returns a merged object, but
 * ESPN is inconsistent about it — some view combinations silently drop fields
 * that they return when requested alone. So we fetch views in small, known-good
 * groups rather than asking for everything at once.
 *
 * Everything here is read-only. Nothing in this project ever writes to ESPN.
 */

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const HOST = 'https://lm-api-reads.fantasy.espn.com';

/** Seasons at or after this year use the modern endpoint shape. */
const MODERN_SEASON_CUTOFF = 2018;

export class EspnAuthError extends Error {
  constructor(message) {
    super(message);
    this.name = 'EspnAuthError';
  }
}

export class EspnNotFoundError extends Error {
  constructor(message) {
    super(message);
    this.name = 'EspnNotFoundError';
  }
}

export function projectRoot() {
  return ROOT;
}

export async function loadConfig() {
  const file = path.join(ROOT, 'config', 'league.json');
  const raw = JSON.parse(await readFile(file, 'utf8'));

  if (raw.leagueId === null || raw.leagueId === undefined || raw.leagueId === '') {
    throw new Error(
      'config/league.json is missing "leagueId".\n' +
        'Find it in your ESPN league URL:\n' +
        '  https://fantasy.espn.com/football/league?leagueId=123456  ->  123456'
    );
  }
  if (!Array.isArray(raw.seasons) || raw.seasons.length === 0) {
    throw new Error('config/league.json needs at least one year in "seasons", e.g. [2024, 2025].');
  }
  return raw;
}

/**
 * Cookies are optional: public leagues read fine without them. We only error
 * if a request actually comes back unauthorized.
 */
export async function loadSecrets() {
  // Environment variables win, so CI can authenticate from repo secrets
  // without a secrets.json ever existing on the runner.
  const envS2 = process.env.ESPN_S2?.trim();
  const envSwid = process.env.ESPN_SWID?.trim();
  if (envS2 && envSwid) {
    return { espnS2: envS2, swid: normalizeSwid(envSwid) };
  }

  const file = path.join(ROOT, 'config', 'secrets.json');
  if (!existsSync(file)) return null;

  const raw = JSON.parse(await readFile(file, 'utf8'));
  const espnS2 = raw.espn_s2?.trim();
  const swid = raw.swid?.trim();

  if (!espnS2 || !swid) return null;
  if (espnS2.startsWith('PASTE_') || swid.startsWith('{PASTE')) return null;

  return { espnS2, swid: normalizeSwid(swid) };
}

/** SWID is expected to carry its braces; add them back if they were stripped. */
function normalizeSwid(swid) {
  return swid.startsWith('{') ? swid : `{${swid.replace(/^\{|\}$/g, '')}}`;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * @param {object} opts
 * @param {number|string} opts.leagueId
 * @param {{espnS2: string, swid: string}|null} [opts.secrets]
 * @param {(msg: string) => void} [opts.log]
 */
export function createClient({ leagueId, secrets = null, log = () => {} }) {
  const headers = {
    // ESPN 403s requests that do not look like a browser.
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
    Accept: 'application/json',
  };
  if (secrets) {
    headers.Cookie = `espn_s2=${secrets.espnS2}; SWID=${secrets.swid}`;
  }

  function urlFor(season, views, extraParams) {
    const isModern = season >= MODERN_SEASON_CUTOFF;
    const base = isModern
      ? `${HOST}/apis/v3/games/ffl/seasons/${season}/segments/0/leagues/${leagueId}`
      : `${HOST}/apis/v3/games/ffl/leagueHistory/${leagueId}`;

    const url = new URL(base);
    if (!isModern) url.searchParams.set('seasonId', String(season));
    for (const view of views) url.searchParams.append('view', view);
    for (const [key, value] of Object.entries(extraParams ?? {})) {
      if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
    }
    return url.toString();
  }

  /**
   * Fetch one or more views for a season.
   *
   * @param {number} season
   * @param {string[]} views
   * @param {object} [options]
   * @param {object} [options.filter]  Sent as the X-Fantasy-Filter header.
   * @param {object} [options.params]  Extra query params (e.g. scoringPeriodId).
   * @returns {Promise<any>} Parsed JSON. Pre-2018 responses are unwrapped from
   *   their single-element array so callers see one consistent shape.
   */
  async function getView(season, views, options = {}) {
    const url = urlFor(season, views, options.params);
    const requestHeaders = { ...headers };
    if (options.filter) {
      requestHeaders['X-Fantasy-Filter'] = JSON.stringify(options.filter);
    }

    const maxAttempts = 4;
    let lastError;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const response = await fetch(url, { headers: requestHeaders });

        if (response.status === 401) {
          throw new EspnAuthError(
            `ESPN returned 401 Unauthorized for season ${season}.\n` +
              (secrets
                ? 'Your espn_s2 / SWID cookies are present but rejected — they have most ' +
                  'likely expired. Re-copy them from your browser into config/secrets.json.'
                : 'This league appears to be private. Copy config/secrets.example.json to ' +
                  'config/secrets.json and fill in your espn_s2 and SWID cookies.')
          );
        }
        if (response.status === 404) {
          throw new EspnNotFoundError(
            `ESPN returned 404 for league ${leagueId}, season ${season}. ` +
              'Either the league ID is wrong or the league did not exist that season.'
          );
        }
        // 429/5xx are transient — back off and retry.
        if (response.status === 429 || response.status >= 500) {
          throw new Error(`ESPN returned ${response.status} ${response.statusText}`);
        }
        if (!response.ok) {
          throw new EspnNotFoundError(`ESPN returned ${response.status} ${response.statusText}`);
        }

        const json = await response.json();
        // Pre-2018 leagueHistory responses arrive wrapped in an array.
        return Array.isArray(json) ? json[0] : json;
      } catch (error) {
        // Auth and not-found are terminal; retrying cannot help.
        if (error instanceof EspnAuthError || error instanceof EspnNotFoundError) throw error;

        lastError = error;
        if (attempt < maxAttempts) {
          const backoff = 600 * 2 ** (attempt - 1);
          log(`  retry ${attempt}/${maxAttempts - 1} after ${backoff}ms (${error.message})`);
          await sleep(backoff);
        }
      }
    }
    throw new Error(
      `Failed to fetch ${views.join('+')} for season ${season} after ${maxAttempts} attempts: ${lastError?.message}`
    );
  }

  /**
   * The full NFL player pool for a season, used to resolve the bare player IDs
   * that draft picks and transactions reference.
   *
   * This lives on a different path than the league views — it hangs off the
   * season rather than the league — so it does not go through getView.
   */
  async function getPlayers(season, { limit = 2000 } = {}) {
    const url = `${HOST}/apis/v3/games/ffl/seasons/${season}/players?scoringPeriodId=0&view=players_wl`;
    const response = await fetch(url, {
      headers: {
        ...headers,
        // The filter must be nested under `players`. A flat {limit, offset}
        // object here is rejected with a bare 400 and no explanation.
        'X-Fantasy-Filter': JSON.stringify({
          players: {
            limit,
            offset: 0,
            sortPercOwned: { sortPriority: 1, sortAsc: false },
          },
        }),
      },
    });
    if (!response.ok) {
      throw new Error(`player pool returned ${response.status} ${response.statusText}`);
    }
    return response.json();
  }

  /**
   * The league activity feed, which is where trade detail actually lives.
   *
   * This hangs off a `/communication/` sub-path. Requesting the same view on
   * the league root returns a 200 with a completely different (and far less
   * useful) `communication` payload instead of `topics`, so the path matters.
   */
  async function getActivity(season, { limit = 1000, msgTypes = [178, 180, 179, 239, 181, 244] } = {}) {
    const base = urlFor(season, ['kona_league_communication'], {});
    const url = base.replace(/\?/, '/communication/?');
    const response = await fetch(url, {
      headers: {
        ...headers,
        'X-Fantasy-Filter': JSON.stringify({
          topics: {
            filterType: { value: ['ACTIVITY_TRANSACTIONS'] },
            limit,
            limitPerMessageSet: { value: 100 },
            offset: 0,
            sortMessageDate: { sortPriority: 1, sortAsc: false },
            sortFor: { sortPriority: 2, sortAsc: false },
            filterIncludeMessageTypeIds: { value: msgTypes },
          },
        }),
      },
    });
    if (!response.ok) {
      throw new Error(`activity feed returned ${response.status} ${response.statusText}`);
    }
    return response.json();
  }

  /**
   * Free agents and waiver-wire players, with ESPN's own projections for the
   * given week. This is what makes "should I pick anyone up?" answerable.
   */
  async function getFreeAgents(season, scoringPeriodId, { limit = 200 } = {}) {
    const url = urlFor(season, ["kona_player_info"], { scoringPeriodId });
    const response = await fetch(url, {
      headers: {
        ...headers,
        "X-Fantasy-Filter": JSON.stringify({
          players: {
            filterStatus: { value: ["FREEAGENT", "WAIVERS"] },
            limit,
            offset: 0,
            sortPercOwned: { sortPriority: 1, sortAsc: false },
          },
        }),
      },
    });
    if (!response.ok) {
      throw new Error(`free agents returned ${response.status} ${response.statusText}`);
    }
    return response.json();
  }

  /**
   * Current rosters with projections for a specific week. The core mRoster call
   * returns whoever is rostered now, but its stats are keyed to whatever period
   * ESPN defaults to — asking for the week explicitly is what makes the
   * projections line up with the week being advised on.
   */
  async function getRostersForWeek(season, scoringPeriodId) {
    return getView(season, ["mRoster", "mTeam"], { params: { scoringPeriodId } });
  }

  /**
   * The draftable player pool, ranked for a specific format.
   *
   * rankType matters enormously: Josh Allen is SUPERFLEX #1 but PPR #36,
   * because a QB-eligible flex slot revalues the whole quarterback position.
   * Passing the wrong rankType here would produce a board nobody in this
   * league would actually draft from.
   */
  async function getDraftPool(season, { limit = 400, rankType = 'PPR' } = {}) {
    const url = urlFor(season, ['kona_player_info'], { scoringPeriodId: 0 });
    const response = await fetch(url, {
      headers: {
        ...headers,
        'X-Fantasy-Filter': JSON.stringify({
          players: {
            limit,
            sortDraftRanks: { sortPriority: 100, sortAsc: true, value: rankType },
          },
        }),
      },
    });
    if (!response.ok) {
      throw new Error(`draft pool returned ${response.status} ${response.statusText}`);
    }
    return response.json();
  }
  return { getView, getPlayers, getActivity, getFreeAgents, getRostersForWeek, getDraftPool, urlFor, hasAuth: Boolean(secrets) };
}
