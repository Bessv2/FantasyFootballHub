# Fantasy Football Hub — complete source

Every source file in one place, for reading or for handing to a fresh session.

- **Commit:** `233aa01` (2026-09-04 21:38:44 +0000)
- **Generated:** 2026-09-04T21:38:47.503Z
- **Regenerate with:** `npm run bundle`

**Read [HANDOFF.md](HANDOFF.md) first.** It carries the ESPN API gotchas,
the decisions that look wrong until explained, and what is verified versus
merely assumed. None of that is inferable from the code below.

> Check the commit above against the repo before trusting this file. A
> stale bundle that looks current is worse than no bundle at all.

Excluded: `config/secrets.json` (credentials), `data/` (raw API cache and
fixtures, both regenerable), `docs/data/` (build output).

---

## Contents

- **Configuration** — `league.json`, `money.json`, `secrets.example.json`
- **Data layer — talking to ESPN** — `espn.mjs`, `constants.mjs`, `normalize.mjs`
- **Analytics** — `lineup.mjs`, `analytics.mjs`, `challenges.mjs`, `draft.mjs`, `advisor.mjs`, `bigboard.mjs`, `images.mjs`, `playercard.mjs`, `money.mjs`
- **Pipeline scripts** — `check.mjs`, `fetch.mjs`, `build.mjs`, `serve.mjs`, `ship.mjs`, `myleagues.mjs`, `fixtures.mjs`
- **Site** — `index.html`, `style.css`, `app.js`, `mock.js`, `_headers`
- **Tests** — `analytics.test.mjs`, `challenges.test.mjs`, `images.test.mjs`, `playercard.test.mjs`
- **Automation** — `update.yml`, `package.json`

---

## Configuration

League identity, money rules, and the credentials template. Real credentials live in config/secrets.json, which is gitignored and never appears here.

### `config/league.json`

*28 lines*

```json
{
  "_readme": [
    "Core league configuration. Safe to commit — contains no secrets.",
    "leagueId: the number in your ESPN league URL, e.g.",
    "  https://fantasy.espn.com/football/league?leagueId=123456  ->  123456",
    "seasons: every season year you want pulled. ESPN keeps history for as long",
    "  as the league has existed, so list them all for career/all-time stats."
  ],

  "leagueId": 274568741,
  "seasons": [2026],
  "currentSeason": 2026,

  "leagueName": "Roe Leauge",
  "tagline": "",

  "regularSeasonWeeks": 14,
  "playoffTeams": 6,

  "site": {
    "theme": "auto",
    "showMoney": false,
    "showPrizes": true,
    "showDraft": true,
    "showTrades": true
  }
}
```

### `config/money.json`

*87 lines*

```json
{
  "_readme": [
    "The money ledger. ESPN knows nothing about this — it is entirely yours.",
    "",
    "PRIVACY: this file is committed, but the LEDGER IT GENERATES is not.",
    "docs/data/money.json is gitignored, so the Money tab shows locally via",
    "`npm run serve` and never reaches the public site. Payout AMOUNTS are",
    "published (the league has to know what a challenge is worth); who has paid",
    "and who still owes is not.",
    "",
    "MEMBERS: list everyone who is in the pot, whether or not they have claimed",
    "an ESPN team yet. People commit and pay long before they click the invite",
    "link. Add `teamId` once you know which ESPN team is theirs, and the ledger",
    "will pull their real team name through.",
    "",
    "A payout slot can be a fixed 'amount', a 'pct' share of the pot, or",
    "'remainder': true to absorb whatever is left."
  ],

  "currency": "USD",
  "buyIn": 75,
  "buyInDueDate": "2026-09-05",

  "_membersNote": "10 managers. Names are placeholders until teams are claimed — edit them and add teamId as people join. NOTE: paid flags below were set at the old $50 buy-in; re-check who has settled the $25 difference.",
  "members": [
    { "name": "Geordon Roe", "teamId": 1, "amountPaid": 75, "method": "Cash", "note": "" },
    { "name": "Anthony Steff", "teamId": 8, "amountPaid": 75, "method": "Cash", "note": "" },
    { "name": "Manager 3", "amountPaid": 75, "method": "Cash" },
    { "name": "Manager 4", "amountPaid": 75, "method": "Cash" },
    { "name": "Manager 5", "amountPaid": 75, "method": "Cash" },
    { "name": "Manager 6", "amountPaid": 75, "method": "Cash" },
    { "name": "Manager 7", "amountPaid": 75, "method": "Cash" },
    { "name": "Manager 8", "amountPaid": 75, "method": "Cash" },
    { "name": "Manager 9", "amountPaid": 75, "method": "Cash" },
    { "name": "Manager 10", "amountPaid": 75, "method": "Cash" }
  ],

  "payouts": {
    "_note": [
      "10 x $75 = $750.",
      "",
      "  1st         $350   the season",
      "  2nd         $130",
      "  3rd          $75   your buy-in back — third place costs you nothing",
      "  Challenges  $195   the remainder, $15 a week across 13 weeks",
      "",
      "The challenge slot is the remainder on purpose. If an eleventh manager",
      "joins, the three places stay exactly as announced and the weekly",
      "challenge grows to $20 — rather than every prize shifting by a few",
      "dollars and nobody being sure what was agreed."
    ],
    "structure": [
      { "id": "first", "label": "1st Place", "amount": 350, "note": "Champion" },
      { "id": "second", "label": "2nd Place", "amount": 130, "note": "Runner-up" },
      { "id": "third", "label": "3rd Place", "amount": 75, "note": "Buy-in back" },
      { "id": "challenges", "label": "Weekly Challenges", "remainder": true, "note": "A random challenge every week, paid in cash" }
    ]
  },

  "weeklyChallenge": {
    "_note": [
      "One challenge is drawn at random for each week from the deck in",
      "scripts/lib/challenges.mjs. The draw is SEEDED on the league id and",
      "season, so it is identical on every build — it cannot reshuffle itself",
      "after the games are played.",
      "",
      "cadence:  'weekly' or 'biweekly'",
      "startWeek: the first week that draws a challenge",
      "salt:      change this to reshuffle the entire season. Doing that mid-",
      "           season re-draws weeks that have already been played, so only",
      "           ever touch it before Week 1.",
      "payoutId:  which payout slot above funds the challenges."
    ],
    "enabled": true,
    "cadence": "weekly",
    "startWeek": 1,
    "salt": "",
    "payoutId": "challenges"
  },

  "_paymentsNote": "Only needed for per-team overrides once teams are claimed; `members` above covers the common case.",
  "payments": [],

  "_payoutsPaidNote": "Filled in at the end of the season as you pay winners out. Weekly challenge payouts go here too — { teamId, amount, note: 'Week 3 challenge' }.",
  "payoutsPaid": []
}
```

### `config/secrets.example.json`

*26 lines*

```json
{
  "_readme": [
    "Copy this file to 'secrets.json' (same folder) and fill in the two values.",
    "secrets.json is gitignored and will never be committed or published.",
    "",
    "Keep the key names on the LEFT and paste your cookie values on the RIGHT:",
    "    \"espn_s2\": \"AEB...long value here...\",",
    "    \"swid\": \"{ABCD1234-...}\"",
    "",
    "HOW TO GET THESE (takes about 60 seconds):",
    "  1. Open your league in Chrome or Edge and make sure you are logged in.",
    "  2. Press F12 to open DevTools.",
    "  3. Go to the 'Application' tab (Chrome/Edge) or 'Storage' tab (Firefox).",
    "  4. In the left sidebar expand 'Cookies' and click 'https://fantasy.espn.com'.",
    "  5. Find the row named 'espn_s2' and copy its Value (it is very long, ~250+ chars).",
    "  6. Find the row named 'SWID' and copy its Value (~38 chars, INCLUDING the { } braces).",
    "",
    "Paste the espn_s2 value EXACTLY as shown, including any %2B / %2F / %3D",
    "sequences. Those are part of the cookie, not an encoding artifact.",
    "",
    "These cookies expire periodically. If fetching starts returning 401, repeat the steps."
  ],
  "espn_s2": "PASTE_YOUR_ESPN_S2_VALUE_HERE",
  "swid": "{PASTE-YOUR-SWID-HERE-WITH-BRACES}"
}
```

## Data layer — talking to ESPN

Everything that knows ESPN exists. The API is undocumented, so most of the hard-won knowledge in this project is concentrated in these three files.

### `scripts/lib/espn.mjs`

*347 lines*

```javascript
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
   * Player news, for the hover cards.
   *
   * This is the one endpoint here that is NOT part of the fantasy league API —
   * it hangs off ESPN's public site API, takes no auth, and is the only source
   * for "why is this player questionable". It is fetched one player at a time,
   * so callers must pass a short list (the drafted/rostered players), never the
   * whole 11,600-player pool.
   *
   * Deliberately soft-failing: a null return means "no news for this player",
   * which is also what an unreachable endpoint looks like. News is a garnish on
   * the card, and the card must still render its stat line without it.
   */
  async function getPlayerNews(playerId, { limit = 3 } = {}) {
    const url =
      `https://site.api.espn.com/apis/fantasy/v2/games/ffl/news/players` +
      `?playerId=${encodeURIComponent(playerId)}&limit=${limit}`;
    try {
      const response = await fetch(url, { headers });
      if (!response.ok) return null;
      const json = await response.json();
      const feed = json?.feed ?? json?.items ?? [];
      return Array.isArray(feed) && feed.length ? { playerId, items: feed } : null;
    } catch {
      return null;
    }
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
  return { getView, getPlayers, getActivity, getFreeAgents, getRostersForWeek, getDraftPool, getPlayerNews, urlFor, hasAuth: Boolean(secrets) };
}
```

### `scripts/lib/constants.mjs`

*222 lines*

```javascript
/**
 * ESPN's numeric enums.
 *
 * IMPORTANT: ESPN uses TWO different position scales and they do not agree.
 * Mixing them up silently mislabels players (WR shows up as "RB/WR", TE as
 * "WR", and so on) which then quietly corrupts every draft and prize stat
 * downstream. They are kept strictly separate here.
 *
 *   LINEUP_SLOT  — `lineupSlotId`: the slot a player occupies on a roster.
 *                  QB is 0, K is 17, bench is 20, IR is 21.
 *   PLAYER_POS   — `defaultPositionId`: what the player actually is.
 *                  QB is 1, RB is 2, WR is 3, TE is 4, K is 5.
 */

/** `lineupSlotId` -> slot label. */
export const LINEUP_SLOT = {
  0: 'QB',
  1: 'TQB',
  2: 'RB',
  3: 'RB/WR',
  4: 'WR',
  5: 'WR/TE',
  6: 'TE',
  7: 'OP',
  8: 'DT',
  9: 'DE',
  10: 'LB',
  11: 'DL',
  12: 'CB',
  13: 'S',
  14: 'DB',
  15: 'DP',
  16: 'D/ST',
  17: 'K',
  18: 'P',
  19: 'HC',
  20: 'BE',
  21: 'IR',
  22: '',
  23: 'FLEX',
  24: 'ER',
  25: 'Rookie',
};

/** Slots that do NOT count toward a team's scored lineup. */
export const NON_SCORING_SLOTS = new Set([20, 21, 24]);

/** `defaultPositionId` -> the player's real position. */
export const PLAYER_POS = {
  1: 'QB',
  2: 'RB',
  3: 'WR',
  4: 'TE',
  5: 'K',
  7: 'P',
  9: 'DT',
  10: 'DE',
  11: 'LB',
  12: 'CB',
  13: 'S',
  14: 'DB',
  16: 'D/ST',
};

/**
 * Fallback: infer position from `eligibleSlots` when `defaultPositionId` is
 * missing or unrecognized. Ordered most- to least-specific so a WR/TE-eligible
 * player resolves to WR rather than the flex slot.
 */
const SLOT_TO_POS = [
  [0, 'QB'],
  [2, 'RB'],
  [4, 'WR'],
  [6, 'TE'],
  [17, 'K'],
  [16, 'D/ST'],
];

export function resolvePosition(player) {
  const byDefault = PLAYER_POS[player?.defaultPositionId];
  if (byDefault) return byDefault;

  const eligible = new Set(player?.eligibleSlots ?? []);
  for (const [slot, pos] of SLOT_TO_POS) {
    if (eligible.has(slot)) return pos;
  }
  return 'UNKNOWN';
}

/** `proTeamId` -> NFL team abbreviation. 0 means free agent / no team. */
export const PRO_TEAM = {
  0: 'FA',
  1: 'ATL',
  2: 'BUF',
  3: 'CHI',
  4: 'CIN',
  5: 'CLE',
  6: 'DAL',
  7: 'DEN',
  8: 'DET',
  9: 'GB',
  10: 'TEN',
  11: 'IND',
  12: 'KC',
  13: 'LV',
  14: 'LAR',
  15: 'MIA',
  16: 'MIN',
  17: 'NE',
  18: 'NO',
  19: 'NYG',
  20: 'NYJ',
  21: 'PHI',
  22: 'ARI',
  23: 'PIT',
  24: 'LAC',
  25: 'SF',
  26: 'SEA',
  27: 'TB',
  28: 'WSH',
  29: 'CAR',
  30: 'JAX',
  33: 'BAL',
  34: 'HOU',
};

/**
 * Activity-feed message type IDs, from the `kona_league_communication` view.
 * Several distinct IDs all mean "dropped" — ESPN distinguishes the source
 * (waiver vs free agent vs roster move) but the outcome is the same.
 */
export const ACTIVITY_TYPE = {
  178: 'FA_ADDED',
  180: 'WAIVER_ADDED',
  179: 'DROPPED',
  181: 'DROPPED',
  239: 'DROPPED',
  244: 'TRADED',
};

/** The message-type IDs worth pulling from the activity feed. */
export const ACTIVITY_TYPE_IDS = [178, 179, 180, 181, 239, 244];

/** `type` on a transaction record from `mTransactions2`. */
export const TRANSACTION_TYPES = [
  'DRAFT',
  'TRADE_ACCEPT',
  'TRADE_DECLINE',
  'TRADE_VETO',
  'TRADE_PROPOSE',
  'WAIVER',
  'WAIVER_ERROR',
  'FREEAGENT',
  'ROSTER',
  'LINEUP',
];

/** Injury status strings ESPN reports, normalized to something displayable. */
export const INJURY_STATUS = {
  ACTIVE: 'Active',
  NORMAL: 'Active',
  QUESTIONABLE: 'Questionable',
  DOUBTFUL: 'Doubtful',
  OUT: 'Out',
  INJURY_RESERVE: 'IR',
  SUSPENSION: 'Suspended',
  DAY_TO_DAY: 'Day-to-day',
};

/**
 * `stats[].statSourceId` — 0 is what actually happened, 1 is ESPN's projection.
 * Nearly every bug in fantasy analysis comes from accidentally mixing these.
 */
export const STAT_SOURCE = { ACTUAL: 0, PROJECTED: 1 };

/**
 * `stats[].statSplitTypeId` — 0 is a season total, 1 is a single week.
 *
 * This reads backwards from what you would guess, which is why it is spelled
 * out here and in HANDOFF.md: a season total is `scoringPeriodId 0` +
 * `statSplitTypeId 0`, and one week is `scoringPeriodId > 0` +
 * `statSplitTypeId 1`. Reversing them returns real data of the wrong kind, so
 * nothing crashes and every downstream number is quietly wrong.
 */
export const STAT_SPLIT = { SEASON: 0, WEEK: 1 };

/** Selected `stats` keys worth surfacing. ESPN defines 200+; these are the ones
 *  that make readable "fine detail" for a league hub. */
export const STAT_KEYS = {
  0: 'passingAttempts',
  1: 'passingCompletions',
  3: 'passingYards',
  4: 'passingTouchdowns',
  20: 'passingInterceptions',
  23: 'rushingAttempts',
  24: 'rushingYards',
  25: 'rushingTouchdowns',
  41: 'receptions',
  42: 'receivingYards',
  43: 'receivingTouchdowns',
  58: 'receivingTargets',
  72: 'fumblesLost',
  74: 'madeFieldGoalsFrom50Plus',
  77: 'madeFieldGoalsFrom40To49',
  80: 'madeFieldGoalsFromUnder40',
  85: 'missedFieldGoals',
  86: 'madeExtraPoints',
  88: 'defensiveBlockedReturnTouchdowns',
  89: 'defensivePointsAllowed',
  93: 'defensiveBlockedKicks',
  95: 'defensiveInterceptions',
  96: 'defensiveFumbles',
  97: 'defensiveSacks',
  99: 'defensiveTackles',
  101: 'kickoffReturnTouchdowns',
  102: 'puntReturnTouchdowns',
  103: 'interceptionReturnTouchdowns',
  104: 'fumbleReturnTouchdowns',
  123: 'defensivePointsAllowed',
  127: 'defensiveYardsAllowed',
};
```

### `scripts/lib/normalize.mjs`

*478 lines*

```javascript
/**
 * Turns raw ESPN payloads into a clean domain model.
 *
 * Two things this layer is responsible for getting right:
 *
 *  1. Phase detection. A league that has not drafted looks, to most of ESPN's
 *     fields, identical to one that has — the draft board is pre-built with
 *     192 empty slots and `drafted: false`. Everything downstream keys off
 *     `phase` to decide whether it has anything to say.
 *
 *  2. Keeping the two position scales apart (see constants.mjs).
 */

import {
  LINEUP_SLOT,
  NON_SCORING_SLOTS,
  PLAYER_POS,
  PRO_TEAM,
  STAT_SOURCE,
  resolvePosition,
} from './constants.mjs';

export const PHASE = {
  EMPTY: 'EMPTY', // league not full, nobody drafted
  PRE_DRAFT: 'PRE_DRAFT', // league full (or nearly), draft still ahead
  DRAFTED: 'DRAFTED', // draft done, no games yet
  IN_SEASON: 'IN_SEASON', // games being played
  COMPLETE: 'COMPLETE', // season finished
};

/** A pick slot ESPN has created but nobody has used yet. */
const isEmptyPick = (pick) => !pick || pick.playerId === undefined || pick.playerId <= 0;

/**
 * Builds playerId -> {name, position, proTeam} from every source available.
 * The season-wide player pool is the broad source; roster entries are richer
 * but only cover players who were actually rostered in a week we fetched.
 */
export function buildPlayerIndex({ players = [], weeks = [], teams = [] }) {
  const index = new Map();

  const add = (raw) => {
    if (!raw || raw.id === undefined) return;
    const id = raw.id;
    if (index.has(id)) return;
    index.set(id, {
      id,
      name: raw.fullName ?? (`${raw.firstName ?? ''} ${raw.lastName ?? ''}`.trim() || `Player ${id}`),
      position: resolvePosition(raw),
      proTeam: PRO_TEAM[raw.proTeamId] ?? 'FA',
      injuryStatus: raw.injuryStatus ?? null,
    });
  };

  for (const p of Array.isArray(players) ? players : []) add(p);

  for (const team of teams) {
    for (const entry of team?.roster?.entries ?? []) add(entry?.playerPoolEntry?.player);
  }

  for (const week of weeks) {
    for (const matchup of week?.schedule ?? []) {
      for (const side of ['home', 'away']) {
        const entries = matchup?.[side]?.rosterForCurrentScoringPeriod?.entries ?? [];
        for (const entry of entries) add(entry?.playerPoolEntry?.player);
      }
    }
  }

  return index;
}

function lookupPlayer(index, playerId) {
  return (
    index.get(playerId) ?? {
      id: playerId,
      name: `Player ${playerId}`,
      position: 'UNKNOWN',
      proTeam: 'FA',
      injuryStatus: null,
    }
  );
}

/** Pulls a roster entry's actual (not projected) points for a given week. */
function pointsForWeek(entry, week) {
  const stats = entry?.playerPoolEntry?.player?.stats ?? [];
  for (const stat of stats) {
    if (stat.scoringPeriodId === week && stat.statSourceId === STAT_SOURCE.ACTUAL) {
      return stat.appliedTotal ?? 0;
    }
  }
  // Fallback for shapes that carry the total directly on the entry.
  return entry?.playerPoolEntry?.appliedStatTotal ?? 0;
}

function projectedForWeek(entry, week) {
  const stats = entry?.playerPoolEntry?.player?.stats ?? [];
  for (const stat of stats) {
    if (stat.scoringPeriodId === week && stat.statSourceId === STAT_SOURCE.PROJECTED) {
      return stat.appliedTotal ?? 0;
    }
  }
  return null;
}

function normalizeRosterEntries(entries, week, playerIndex) {
  return (entries ?? []).map((entry) => {
    const raw = entry?.playerPoolEntry?.player;
    const id = entry?.playerId ?? raw?.id;
    const known = lookupPlayer(playerIndex, id);
    const slotId = entry?.lineupSlotId ?? 20;

    return {
      playerId: id,
      name: raw?.fullName ?? known.name,
      position: raw ? resolvePosition(raw) : known.position,
      proTeam: PRO_TEAM[raw?.proTeamId] ?? known.proTeam,
      slotId,
      slot: LINEUP_SLOT[slotId] ?? String(slotId),
      started: !NON_SCORING_SLOTS.has(slotId),
      points: Number((pointsForWeek(entry, week) ?? 0).toFixed(2)),
      projected: projectedForWeek(entry, week),
      injuryStatus: raw?.injuryStatus ?? known.injuryStatus,
    };
  });
}

function normalizeTeams(rawTeams, members) {
  const memberById = new Map((members ?? []).map((m) => [m.id, m]));

  return (rawTeams ?? []).map((team) => {
    const overall = team?.record?.overall ?? {};
    const ownerIds = team.owners ?? [];
    const ownerNames = ownerIds
      .map((id) => {
        const m = memberById.get(id);
        if (!m) return null;
        const full = `${m.firstName ?? ''} ${m.lastName ?? ''}`.trim();
        return full || m.displayName || null;
      })
      .filter(Boolean);

    // ESPN leaves unclaimed slots named "Team 4" with no owner.
    const isPlaceholder = ownerIds.length === 0 && /^Team \d+$/.test(team.name ?? '');

    return {
      id: team.id,
      name: team.name ?? `Team ${team.id}`,
      abbrev: team.abbrev ?? `TM${team.id}`,
      logo: team.logo ?? null,
      ownerIds,
      ownerNames,
      managerName: ownerNames[0] ?? (isPlaceholder ? 'Unclaimed' : team.name),
      isPlaceholder,
      divisionId: team.divisionId ?? 0,
      playoffSeed: team.playoffSeed ?? null,
      record: {
        wins: overall.wins ?? 0,
        losses: overall.losses ?? 0,
        ties: overall.ties ?? 0,
        pointsFor: Number((overall.pointsFor ?? 0).toFixed(2)),
        pointsAgainst: Number((overall.pointsAgainst ?? 0).toFixed(2)),
        streakLength: overall.streakLength ?? 0,
        streakType: overall.streakType ?? null,
      },
      transactionCounter: {
        acquisitions: team.transactionCounter?.acquisitions ?? 0,
        drops: team.transactionCounter?.drops ?? 0,
        trades: team.transactionCounter?.trades ?? 0,
      },
    };
  });
}

function normalizeDraft(rawDraft, playerIndex, teams) {
  const detail = rawDraft?.draftDetail ?? {};
  const allPicks = detail.picks ?? [];
  const realPicks = allPicks.filter((p) => !isEmptyPick(p));
  const held = realPicks.length > 0;

  const teamById = new Map(teams.map((t) => [t.id, t]));
  const rounds = allPicks.length && teams.length ? Math.round(allPicks.length / teams.length) : 0;

  return {
    held,
    inProgress: Boolean(detail.inProgress),
    rounds,
    totalSlots: allPicks.length,
    picksMade: realPicks.length,
    picks: realPicks.map((pick) => {
      const player = lookupPlayer(playerIndex, pick.playerId);
      const team = teamById.get(pick.teamId);
      return {
        overall: pick.overallPickNumber,
        round: pick.roundId,
        pickInRound: pick.roundPickNumber,
        teamId: pick.teamId,
        teamName: team?.name ?? `Team ${pick.teamId}`,
        managerName: team?.managerName ?? null,
        playerId: pick.playerId,
        playerName: player.name,
        position: player.position,
        proTeam: player.proTeam,
        keeper: Boolean(pick.keeper),
        bidAmount: pick.bidAmount ?? 0,
        autoDrafted: (pick.autoDraftTypeId ?? 0) !== 0,
      };
    }),
  };
}

function normalizeWeeks(rawWeeks, playerIndex) {
  const out = [];

  for (const { week, data } of rawWeeks) {
    const matchups = [];
    for (const game of data?.schedule ?? []) {
      // A schedule entry with no points on either side has not been played.
      const home = game.home;
      const away = game.away;
      if (!home && !away) continue;

      matchups.push({
        matchupId: game.id,
        matchupPeriodId: game.matchupPeriodId,
        playoffTierType: game.playoffTierType ?? 'NONE',
        winner: game.winner ?? 'UNDECIDED',
        home: home
          ? {
              teamId: home.teamId,
              score: Number((home.totalPoints ?? 0).toFixed(2)),
              roster: normalizeRosterEntries(
                home.rosterForCurrentScoringPeriod?.entries,
                week,
                playerIndex
              ),
            }
          : null,
        away: away
          ? {
              teamId: away.teamId,
              score: Number((away.totalPoints ?? 0).toFixed(2)),
              roster: normalizeRosterEntries(
                away.rosterForCurrentScoringPeriod?.entries,
                week,
                playerIndex
              ),
            }
          : null,
      });
    }

    const played = matchups.some(
      (m) => (m.home?.score ?? 0) > 0 || (m.away?.score ?? 0) > 0
    );
    out.push({ week, played, matchups });
  }

  return out;
}

function normalizeTransactions(rawTransactions, playerIndex, teams) {
  const teamById = new Map(teams.map((t) => [t.id, t]));

  return (rawTransactions?.transactions ?? []).map((tx) => ({
    id: tx.id,
    type: tx.type,
    status: tx.status,
    teamId: tx.teamId,
    teamName: teamById.get(tx.teamId)?.name ?? `Team ${tx.teamId}`,
    scoringPeriodId: tx.scoringPeriodId ?? null,
    bidAmount: tx.bidAmount ?? 0,
    proposedDate: tx.proposedDate ?? null,
    executionDate: tx.executionDate ?? null,
    items: (tx.items ?? []).map((item) => {
      const player = lookupPlayer(playerIndex, item.playerId);
      return {
        playerId: item.playerId,
        playerName: player.name,
        position: player.position,
        proTeam: player.proTeam,
        type: item.type,
        fromTeamId: item.fromTeamId ?? null,
        toTeamId: item.toTeamId ?? null,
      };
    }),
  }));
}

/**
 * Trades come out of the activity feed, not mTransactions2 — ESPN rejects
 * TRADE_* values in the transactions filter, so the feed is the only source.
 */
function normalizeTrades(rawActivity, playerIndex, teams) {
  const teamById = new Map(teams.map((t) => [t.id, t]));
  const trades = [];

  for (const topic of rawActivity?.topics ?? []) {
    const messages = (topic.messages ?? []).filter((m) => m.messageTypeId === 244);
    if (messages.length === 0) continue;

    // Each side of a trade shows up as its own message; group by team.
    const sides = new Map();
    for (const msg of messages) {
      const to = msg.to ?? msg.for ?? null;
      const from = msg.from ?? null;
      const player = lookupPlayer(playerIndex, msg.targetId);
      if (to !== null) {
        if (!sides.has(to)) sides.set(to, { teamId: to, received: [] });
        sides.get(to).received.push(player);
      }
      if (from !== null && !sides.has(from)) sides.set(from, { teamId: from, received: [] });
    }

    trades.push({
      id: topic.id,
      date: topic.date ?? null,
      scoringPeriodId: null,
      sides: [...sides.values()].map((side) => ({
        ...side,
        teamName: teamById.get(side.teamId)?.name ?? `Team ${side.teamId}`,
        managerName: teamById.get(side.teamId)?.managerName ?? null,
      })),
    });
  }

  return trades;
}

/**
 * Rosters as they stand right now, carrying ESPN's projections for the week
 * being advised on. Distinct from the weekly box-score rosters, which are
 * historical — this is who is on the team today.
 */
function normalizeCurrentRosters(current, playerIndex, adviceWeek) {
  const out = new Map();
  for (const team of current?.teams ?? []) {
    const entries = normalizeRosterEntries(team?.roster?.entries, adviceWeek, playerIndex);
    // ESPN reports actual points for a week that has not happened as 0, which
    // would read as "everyone scored nothing". Only the projection is
    // meaningful here, so drop the actual.
    out.set(
      team.id,
      entries.map(({ points, ...rest }) => ({ ...rest, projected: rest.projected ?? 0 }))
    );
  }
  return out;
}

/** Available players, with projections, for waiver suggestions. */
function normalizeFreeAgents(freeAgents, adviceWeek) {
  return (freeAgents?.players ?? [])
    .map((entry) => {
      const raw = entry?.player;
      if (!raw) return null;
      const stats = raw.stats ?? [];
      const projected = stats.find(
        (s) => s.scoringPeriodId === adviceWeek && s.statSourceId === STAT_SOURCE.PROJECTED
      )?.appliedTotal;

      return {
        playerId: raw.id,
        name: raw.fullName ?? `Player ${raw.id}`,
        position: resolvePosition(raw),
        proTeam: PRO_TEAM[raw.proTeamId] ?? 'FA',
        projected: Number.isFinite(projected) ? Number(projected.toFixed(2)) : null,
        percentOwned: raw.ownership?.percentOwned != null
          ? Number(raw.ownership.percentOwned.toFixed(1))
          : null,
        injuryStatus: raw.injuryStatus ?? null,
      };
    })
    .filter((p) => p && p.projected !== null);
}

function detectPhase({ status, draft, weeks, teams }) {
  const playedWeeks = weeks.filter((w) => w.played).length;
  const finalPeriod = status?.finalScoringPeriod ?? 17;
  const claimed = teams.filter((t) => !t.isPlaceholder).length;

  if (playedWeeks > 0) {
    const done = status?.isActive === false || (status?.latestScoringPeriod ?? 0) >= finalPeriod;
    return done ? PHASE.COMPLETE : PHASE.IN_SEASON;
  }
  if (draft.held) return PHASE.DRAFTED;
  if (claimed >= teams.length && teams.length > 0) return PHASE.PRE_DRAFT;
  return PHASE.EMPTY;
}

/**
 * @param {object} raw
 * @param {object} raw.league    league.json (mSettings + mTeam + mStandings + mRoster)
 * @param {object} [raw.draft]   draft.json
 * @param {object} [raw.transactions]
 * @param {object} [raw.activity]
 * @param {Array}  [raw.players]
 * @param {Array<{week:number,data:object}>} [raw.weeks]
 */
export function normalizeSeason(raw) {
  const { league, draft: rawDraft, transactions: rawTx, activity: rawActivity } = raw;
  const settings = league?.settings ?? {};
  const status = league?.status ?? {};

  const playerIndex = buildPlayerIndex({
    players: raw.players ?? [],
    weeks: (raw.weeks ?? []).map((w) => w.data),
    teams: league?.teams ?? [],
  });

  const teams = normalizeTeams(league?.teams, league?.members);
  const draft = normalizeDraft(rawDraft, playerIndex, teams);
  const weeks = normalizeWeeks(raw.weeks ?? [], playerIndex);
  const transactions = normalizeTransactions(rawTx, playerIndex, teams);
  const trades = normalizeTrades(rawActivity, playerIndex, teams);

  const slotCounts = settings.rosterSettings?.lineupSlotCounts ?? {};
  const startingSlots = Object.entries(slotCounts)
    .filter(([slotId, count]) => count > 0 && !NON_SCORING_SLOTS.has(Number(slotId)))
    .map(([slotId, count]) => ({
      slotId: Number(slotId),
      slot: LINEUP_SLOT[Number(slotId)] ?? slotId,
      count,
    }));

  const adviceWeek = raw.current?.adviceWeek ?? (status.latestScoringPeriod ?? 0) + 1;
  const currentRosters = normalizeCurrentRosters(raw.current, playerIndex, adviceWeek);
  const freeAgents = normalizeFreeAgents(raw.freeAgents, adviceWeek);

  const phase = detectPhase({ status, draft, weeks, teams });

  return {
    league: {
      id: league?.id,
      name: settings.name ?? 'Fantasy League',
      season: league?.seasonId,
      size: settings.size ?? teams.length,
      scoringType: settings.scoringSettings?.scoringType ?? null,
      isPPR: settings.scoringSettings?.playerRankType === 'PPR',
      regularSeasonWeeks: settings.scheduleSettings?.matchupPeriodCount ?? 14,
      playoffTeams: settings.scheduleSettings?.playoffTeamCount ?? 6,
      playoffSeedingRule: settings.scheduleSettings?.playoffSeedingRule ?? null,
      draftType: settings.draftSettings?.type ?? null,
      // ESPN calls this `date`, not `draftDate`. The `draftDate` key does not
      // exist on the payload at all, so reading it silently yielded null and
      // the site showed "TBD" even once the draft was scheduled.
      draftDate: settings.draftSettings?.date ?? null,
      // When the draft room opens — usually an hour before the draft itself.
      draftRoomOpens: settings.draftSettings?.availableDate ?? null,
      tradeDeadline: settings.tradeSettings?.deadlineDate ?? null,
      timePerPick: settings.draftSettings?.timePerSelection ?? null,
      startingSlots,
      benchSlots: slotCounts['20'] ?? 0,
      irSlots: slotCounts['21'] ?? 0,
    },
    status: {
      phase,
      teamsJoined: status.teamsJoined ?? 0,
      isFull: Boolean(status.isFull),
      firstScoringPeriod: status.firstScoringPeriod ?? 1,
      finalScoringPeriod: status.finalScoringPeriod ?? 17,
      latestScoringPeriod: status.latestScoringPeriod ?? 0,
      currentMatchupPeriod: status.currentMatchupPeriod ?? 1,
      weeksPlayed: weeks.filter((w) => w.played).length,
      activatedDate: status.activatedDate ?? null,
    },
    teams,
    draft,
    weeks,
    transactions,
    trades,
    adviceWeek,
    currentRosters: Object.fromEntries(currentRosters),
    freeAgents,
    playerCount: playerIndex.size,
  };
}
```

## Analytics

Pure functions over the normalized model. No I/O, no ESPN knowledge, fully unit-tested.

### `scripts/lib/lineup.mjs`

*173 lines*

```javascript
/**
 * Optimal-lineup solver.
 *
 * "What was the most this roster could have scored?" underpins lineup
 * efficiency, points-left-on-the-bench, perfect-lineup weeks, and several
 * prizes — so it needs to be exactly right, not approximately right.
 *
 * The approach: fill the most restrictive slots first, then progressively
 * looser ones. For standard football rosters (where the only overlapping slot
 * is FLEX) this is provably optimal — a dedicated RB slot can never do better
 * than the best available RB, and moving a better RB to FLEX only to demote a
 * worse one into the RB slot cannot increase the total.
 *
 * Leagues with several overlapping slot types (FLEX + superflex + WR/TE) are
 * where greedy could in principle drift from optimal, so those fall through to
 * an exhaustive search over the small candidate pool.
 */

/** Which player positions may legally fill each lineup slot. */
export const SLOT_ELIGIBILITY = {
  0: ['QB'],
  2: ['RB'],
  4: ['WR'],
  6: ['TE'],
  16: ['D/ST'],
  17: ['K'],
  18: ['P'],
  19: ['HC'],
  3: ['RB', 'WR'],
  5: ['WR', 'TE'],
  23: ['RB', 'WR', 'TE'],
  7: ['QB', 'RB', 'WR', 'TE'],
  1: ['QB'],
  8: ['DT'],
  9: ['DE'],
  10: ['LB'],
  11: ['DT', 'DE'],
  12: ['CB'],
  13: ['S'],
  14: ['CB', 'S'],
  15: ['DT', 'DE', 'LB', 'CB', 'S'],
};

/**
 * @param {Array<{playerId:number,name:string,position:string,points:number}>} roster
 *   Every player available that week — starters AND bench.
 * @param {Array<{slotId:number,count:number}>} startingSlots
 * @returns {{points:number, lineup:Array, benched:Array}}
 */
export function optimalLineup(roster, startingSlots) {
  const players = (roster ?? []).filter((p) => p && Number.isFinite(p.points));
  if (players.length === 0 || !startingSlots?.length) {
    return { points: 0, lineup: [], benched: [] };
  }

  // Expand {slotId, count:2} into two individual slots.
  const slots = [];
  for (const { slotId, count } of startingSlots) {
    for (let i = 0; i < count; i += 1) slots.push(slotId);
  }

  const eligibilityFor = (slotId) => SLOT_ELIGIBILITY[slotId] ?? [];
  const overlapping = slots.filter((s) => eligibilityFor(s).length > 1);
  const distinctOverlapTypes = new Set(overlapping.map((s) => eligibilityFor(s).join('/')));

  const result =
    distinctOverlapTypes.size > 1
      ? exhaustive(players, slots, eligibilityFor)
      : greedy(players, slots, eligibilityFor);

  const usedIds = new Set(result.lineup.map((p) => p.playerId));
  return {
    points: Number(result.points.toFixed(2)),
    lineup: result.lineup,
    benched: players.filter((p) => !usedIds.has(p.playerId)),
  };
}

/** Most-restrictive-slot-first fill. Exact when at most one flex type exists. */
function greedy(players, slots, eligibilityFor) {
  const order = [...slots].sort((a, b) => eligibilityFor(a).length - eligibilityFor(b).length);
  const remaining = [...players].sort((a, b) => b.points - a.points);
  const lineup = [];
  let points = 0;

  for (const slotId of order) {
    const eligible = eligibilityFor(slotId);
    const idx = remaining.findIndex((p) => eligible.includes(p.position));
    if (idx === -1) continue; // No legal player for this slot — leave it empty.
    const [picked] = remaining.splice(idx, 1);
    lineup.push({ ...picked, slotId });
    points += picked.points;
  }
  return { points, lineup };
}

/**
 * Exhaustive assignment for exotic slot configurations.
 *
 * Only the top few scorers per position can ever appear in an optimal lineup —
 * if a position has at most N startable slots, the (N+1)th-best player at that
 * position is never needed. Trimming to that keeps the search tiny.
 */
function exhaustive(players, slots, eligibilityFor) {
  const capacity = new Map();
  for (const slotId of slots) {
    for (const pos of eligibilityFor(slotId)) {
      capacity.set(pos, (capacity.get(pos) ?? 0) + 1);
    }
  }

  const byPosition = new Map();
  for (const p of players) {
    if (!byPosition.has(p.position)) byPosition.set(p.position, []);
    byPosition.get(p.position).push(p);
  }
  const pool = [];
  for (const [pos, list] of byPosition) {
    list.sort((a, b) => b.points - a.points);
    pool.push(...list.slice(0, capacity.get(pos) ?? 0));
  }

  const order = [...slots].sort((a, b) => eligibilityFor(a).length - eligibilityFor(b).length);
  let best = { points: -1, lineup: [] };
  const used = new Set();
  const current = [];

  const remainingUpperBound = (slotIdx) => {
    // Optimistic bound: every unfilled slot takes the best unused player.
    const unused = pool.filter((p) => !used.has(p.playerId)).sort((a, b) => b.points - a.points);
    let bound = 0;
    for (let i = slotIdx; i < order.length && i - slotIdx < unused.length; i += 1) {
      bound += unused[i - slotIdx].points;
    }
    return bound;
  };

  const recurse = (slotIdx, points) => {
    if (slotIdx === order.length) {
      if (points > best.points) best = { points, lineup: [...current] };
      return;
    }
    if (points + remainingUpperBound(slotIdx) <= best.points) return; // prune

    const slotId = order[slotIdx];
    const eligible = eligibilityFor(slotId);
    let placedAny = false;

    for (const p of pool) {
      if (used.has(p.playerId) || !eligible.includes(p.position)) continue;
      placedAny = true;
      used.add(p.playerId);
      current.push({ ...p, slotId });
      recurse(slotIdx + 1, points + p.points);
      current.pop();
      used.delete(p.playerId);
    }
    if (!placedAny) recurse(slotIdx + 1, points); // no legal filler; skip slot
  };

  recurse(0, 0);
  return best.points < 0 ? { points: 0, lineup: [] } : best;
}

/**
 * How well a manager set their lineup, as a percentage of what was achievable.
 * 100% means a perfect lineup that week.
 */
export function lineupEfficiency(actualPoints, optimalPoints) {
  if (!optimalPoints) return null;
  return Number(((actualPoints / optimalPoints) * 100).toFixed(1));
}
```

### `scripts/lib/analytics.mjs`

*602 lines*

```javascript
/**
 * Season analytics: standings, power rankings, luck, manager skill, and the
 * side-prize catalog.
 *
 * Every function here tolerates an empty or partial season — the league does
 * not draft until Sept 5 2026, so "no data yet" is the normal case for a while
 * and must produce empty results rather than NaN or a crash.
 */

import { optimalLineup, lineupEfficiency } from './lineup.mjs';

const round2 = (n) => Number((n ?? 0).toFixed(2));
const round1 = (n) => Number((n ?? 0).toFixed(1));

function mean(values) {
  if (!values.length) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function stdDev(values) {
  if (values.length < 2) return 0;
  const m = mean(values);
  return Math.sqrt(mean(values.map((v) => (v - m) ** 2)));
}

/**
 * The spine of everything else: one record per team per played week, with the
 * actual score, the best score that roster could have produced, and the result.
 */
export function buildTeamWeeks(season) {
  const startingSlots = season.league.startingSlots;
  const rows = [];

  for (const week of season.weeks) {
    if (!week.played) continue;

    for (const matchup of week.matchups) {
      const pairs = [
        [matchup.home, matchup.away],
        [matchup.away, matchup.home],
      ];

      for (const [side, opponent] of pairs) {
        if (!side) continue;

        const optimal = optimalLineup(side.roster, startingSlots);
        const starters = side.roster.filter((p) => p.started);
        const bench = side.roster.filter((p) => !p.started);

        let result = 'TIE';
        if (opponent) {
          if (side.score > opponent.score) result = 'WIN';
          else if (side.score < opponent.score) result = 'LOSS';
        } else {
          result = 'BYE';
        }

        rows.push({
          week: week.week,
          teamId: side.teamId,
          opponentId: opponent?.teamId ?? null,
          score: round2(side.score),
          opponentScore: round2(opponent?.score ?? 0),
          margin: round2(side.score - (opponent?.score ?? 0)),
          result,
          isPlayoff: matchup.playoffTierType && matchup.playoffTierType !== 'NONE',
          optimalScore: optimal.points,
          efficiency: lineupEfficiency(side.score, optimal.points),
          benchPoints: round2(Math.max(0, optimal.points - side.score)),
          isPerfectLineup: optimal.points > 0 && Math.abs(optimal.points - side.score) < 0.01,
          starters,
          benchPlayers: bench,
          topStarter: starters.length
            ? starters.reduce((a, b) => (a.points >= b.points ? a : b))
            : null,
          worstStarter: starters.length
            ? starters.reduce((a, b) => (a.points <= b.points ? a : b))
            : null,
        });
      }
    }
  }

  return rows;
}

/**
 * All-play: what each team's record would be if it played every other team
 * every week. Removes schedule luck, which is the single biggest distortion in
 * a 12-team head-to-head league.
 */
export function computeAllPlay(teamWeeks, teams) {
  const byWeek = new Map();
  for (const row of teamWeeks) {
    if (!byWeek.has(row.week)) byWeek.set(row.week, []);
    byWeek.get(row.week).push(row);
  }

  const tally = new Map(teams.map((t) => [t.id, { wins: 0, losses: 0, ties: 0 }]));

  for (const rows of byWeek.values()) {
    for (const row of rows) {
      const rec = tally.get(row.teamId);
      if (!rec) continue;
      for (const other of rows) {
        if (other.teamId === row.teamId) continue;
        if (row.score > other.score) rec.wins += 1;
        else if (row.score < other.score) rec.losses += 1;
        else rec.ties += 1;
      }
    }
  }

  const out = new Map();
  for (const [teamId, rec] of tally) {
    const games = rec.wins + rec.losses + rec.ties;
    out.set(teamId, {
      ...rec,
      winPct: games ? rec.wins / games : 0,
    });
  }
  return out;
}

/** Per-team season aggregates. */
export function computeTeamStats(season, teamWeeks) {
  const allPlay = computeAllPlay(teamWeeks, season.teams);
  const byTeam = new Map(season.teams.map((t) => [t.id, []]));
  for (const row of teamWeeks) {
    if (byTeam.has(row.teamId)) byTeam.get(row.teamId).push(row);
  }

  const stats = season.teams.map((team) => {
    const rows = (byTeam.get(team.id) ?? []).sort((a, b) => a.week - b.week);
    const scores = rows.map((r) => r.score);
    const played = rows.length;

    const wins = rows.filter((r) => r.result === 'WIN').length;
    const losses = rows.filter((r) => r.result === 'LOSS').length;
    const ties = rows.filter((r) => r.result === 'TIE').length;

    const ap = allPlay.get(team.id) ?? { wins: 0, losses: 0, ties: 0, winPct: 0 };
    const expectedWins = played ? ap.winPct * played : 0;

    // Current streak, walking back from the most recent week.
    let streakType = null;
    let streakLength = 0;
    for (let i = rows.length - 1; i >= 0; i -= 1) {
      if (streakType === null) {
        streakType = rows[i].result;
        streakLength = 1;
      } else if (rows[i].result === streakType) {
        streakLength += 1;
      } else break;
    }

    const optimalTotal = rows.reduce((a, r) => a + r.optimalScore, 0);
    const pointsFor = rows.reduce((a, r) => a + r.score, 0);

    return {
      teamId: team.id,
      teamName: team.name,
      abbrev: team.abbrev,
      managerName: team.managerName,
      logo: team.logo,
      isPlaceholder: team.isPlaceholder,

      gamesPlayed: played,
      wins,
      losses,
      ties,
      winPct: played ? (wins + ties * 0.5) / played : 0,

      pointsFor: round2(pointsFor),
      pointsAgainst: round2(rows.reduce((a, r) => a + r.opponentScore, 0)),
      pointDiff: round2(rows.reduce((a, r) => a + r.margin, 0)),
      avgScore: round2(mean(scores)),
      highScore: scores.length ? round2(Math.max(...scores)) : 0,
      lowScore: scores.length ? round2(Math.min(...scores)) : 0,
      stdDev: round2(stdDev(scores)),
      // Lower spread = more predictable week to week.
      consistency: scores.length > 1 ? round1(100 - (stdDev(scores) / mean(scores)) * 100) : null,

      allPlayWins: ap.wins,
      allPlayLosses: ap.losses,
      allPlayTies: ap.ties,
      allPlayWinPct: round1(ap.winPct * 100),
      expectedWins: round2(expectedWins),
      // Positive = winning more than the scores deserved.
      luck: round2(wins - expectedWins),

      optimalPointsFor: round2(optimalTotal),
      benchPoints: round2(Math.max(0, optimalTotal - pointsFor)),
      efficiency: optimalTotal ? round1((pointsFor / optimalTotal) * 100) : null,
      perfectLineups: rows.filter((r) => r.isPerfectLineup).length,

      streakType,
      streakLength,

      transactions: team.transactionCounter,
      weeks: rows,
    };
  });

  return stats;
}

/**
 * Power ranking blends result-independent signals so a team that keeps losing
 * by two points is not ranked below one that keeps winning by two.
 *
 *   50% all-play win rate  (how good the scores actually were)
 *   30% average score      (raw output, normalized across the league)
 *   20% recent form        (last three weeks, same all-play basis)
 */
export function computePowerRankings(teamStats, teamWeeks) {
  const active = teamStats.filter((t) => t.gamesPlayed > 0);
  if (!active.length) return [];

  const maxAvg = Math.max(...active.map((t) => t.avgScore), 1);
  const weeksPlayed = Math.max(...active.map((t) => t.gamesPlayed));
  const recentFrom = Math.max(1, weeksPlayed - 2);
  const recentRows = teamWeeks.filter((r) => r.week >= recentFrom);
  const recentAllPlay = computeAllPlay(recentRows, teamStats);

  const scored = active.map((team) => {
    const recent = recentAllPlay.get(team.teamId) ?? { winPct: 0 };
    const score =
      (team.allPlayWinPct / 100) * 50 + (team.avgScore / maxAvg) * 30 + recent.winPct * 20;

    return {
      teamId: team.teamId,
      teamName: team.teamName,
      abbrev: team.abbrev,
      managerName: team.managerName,
      powerScore: round1(score),
      allPlayWinPct: team.allPlayWinPct,
      avgScore: team.avgScore,
      recentWinPct: round1(recent.winPct * 100),
      record: `${team.wins}-${team.losses}${team.ties ? `-${team.ties}` : ''}`,
    };
  });

  scored.sort((a, b) => b.powerScore - a.powerScore);
  return scored.map((t, i) => ({ ...t, rank: i + 1 }));
}

/** League standings, ordered the way ESPN orders them. */
export function computeStandings(teamStats, season) {
  const rule = season.league.playoffSeedingRule;
  const ranked = [...teamStats]
    .filter((t) => !t.isPlaceholder || t.gamesPlayed > 0)
    .sort((a, b) => {
      if (b.winPct !== a.winPct) return b.winPct - a.winPct;
      // ESPN's default tiebreak is total points scored.
      if (rule === 'TOTAL_POINTS_SCORED' || !rule) return b.pointsFor - a.pointsFor;
      return b.pointsFor - a.pointsFor;
    });

  const playoffCut = season.league.playoffTeams;
  return ranked.map((t, i) => ({
    ...t,
    rank: i + 1,
    inPlayoffs: i < playoffCut,
    isBubble: i >= playoffCut - 1 && i <= playoffCut,
  }));
}

// ---------------------------------------------------------------------------
// Side prizes
// ---------------------------------------------------------------------------

const prize = (id, label, description, winner, extras = {}) => ({
  id,
  label,
  description,
  winner,
  ...extras,
});

/** Best/worst single performances and the season-long skill awards. */
export function computePrizes(season, teamStats, teamWeeks) {
  const prizes = [];
  const nameOf = (teamId) =>
    teamStats.find((t) => t.teamId === teamId)?.teamName ?? `Team ${teamId}`;
  const managerOf = (teamId) =>
    teamStats.find((t) => t.teamId === teamId)?.managerName ?? null;
  const logoOf = (teamId) => teamStats.find((t) => t.teamId === teamId)?.logo ?? null;

  if (teamWeeks.length === 0) return prizes;

  const best = (rows, pick) => (rows.length ? rows.reduce(pick) : null);
  const asWinner = (row, value, detail) =>
    row
      ? {
          teamId: row.teamId,
          teamName: nameOf(row.teamId),
          managerName: managerOf(row.teamId),
          logo: logoOf(row.teamId),
          week: row.week,
          value,
          detail,
        }
      : null;

  // ---- Single-week extremes ---------------------------------------------
  const highWeek = best(teamWeeks, (a, b) => (a.score >= b.score ? a : b));
  prizes.push(
    prize(
      'highestWeek',
      'Highest Single Week',
      'Most points scored by anyone in one week',
      asWinner(highWeek, highWeek?.score, `${highWeek?.score} pts in Week ${highWeek?.week}`)
    )
  );

  const lowWeek = best(teamWeeks, (a, b) => (a.score <= b.score ? a : b));
  prizes.push(
    prize(
      'lowestWeek',
      'Lowest Single Week',
      'Fewest points scored by anyone in one week',
      asWinner(lowWeek, lowWeek?.score, `${lowWeek?.score} pts in Week ${lowWeek?.week}`)
    )
  );

  // ---- Pain and suffering -----------------------------------------------
  const losses = teamWeeks.filter((r) => r.result === 'LOSS');
  const toughLuck = best(losses, (a, b) => (a.score >= b.score ? a : b));
  prizes.push(
    prize(
      'highestScoringLoss',
      'Tough Luck Award',
      'Highest score that still lost',
      asWinner(
        toughLuck,
        toughLuck?.score,
        `Scored ${toughLuck?.score} and still lost in Week ${toughLuck?.week}`
      )
    )
  );

  const wins = teamWeeks.filter((r) => r.result === 'WIN');
  const stolen = best(wins, (a, b) => (a.score <= b.score ? a : b));
  prizes.push(
    prize(
      'lowestScoringWin',
      'Stole One',
      'Lowest score that still won',
      asWinner(
        stolen,
        stolen?.score,
        `Won with only ${stolen?.score} in Week ${stolen?.week}`
      )
    )
  );

  const blowout = best(teamWeeks, (a, b) => (a.margin >= b.margin ? a : b));
  prizes.push(
    prize(
      'biggestBlowout',
      'Biggest Blowout',
      'Largest margin of victory',
      asWinner(
        blowout,
        blowout?.margin,
        `Won by ${blowout?.margin} in Week ${blowout?.week}`
      )
    )
  );

  const nailBiters = teamWeeks.filter((r) => r.result === 'WIN');
  const closest = best(nailBiters, (a, b) => (a.margin <= b.margin ? a : b));
  prizes.push(
    prize(
      'closestMargin',
      'Photo Finish',
      'Narrowest margin of victory',
      asWinner(
        closest,
        closest?.margin,
        `Won by ${closest?.margin} in Week ${closest?.week}`
      )
    )
  );

  const worstBench = best(teamWeeks, (a, b) => (a.benchPoints >= b.benchPoints ? a : b));
  prizes.push(
    prize(
      'mostPointsBenched',
      'Bench Warmer',
      'Most points left sitting on the bench in one week',
      asWinner(
        worstBench,
        worstBench?.benchPoints,
        `Left ${worstBench?.benchPoints} on the bench in Week ${worstBench?.week}`
      )
    )
  );

  // ---- Best and worst individual player games ---------------------------
  let bestPlayer = null;
  let worstStart = null;
  for (const row of teamWeeks) {
    if (row.topStarter && (!bestPlayer || row.topStarter.points > bestPlayer.points)) {
      bestPlayer = { ...row.topStarter, week: row.week, teamId: row.teamId };
    }
    if (row.worstStarter && (!worstStart || row.worstStarter.points < worstStart.points)) {
      worstStart = { ...row.worstStarter, week: row.week, teamId: row.teamId };
    }
  }
  prizes.push(
    prize('bestPlayerGame', 'Player of the Year', 'Best single game by a started player', {
      teamId: bestPlayer?.teamId,
      teamName: bestPlayer ? nameOf(bestPlayer.teamId) : null,
      managerName: bestPlayer ? managerOf(bestPlayer.teamId) : null,
      logo: bestPlayer ? logoOf(bestPlayer.teamId) : null,
      week: bestPlayer?.week,
      value: bestPlayer?.points,
      detail: bestPlayer
        ? `${bestPlayer.name} (${bestPlayer.position}) — ${bestPlayer.points} pts, Week ${bestPlayer.week}`
        : null,
    })
  );
  prizes.push(
    prize('worstStart', 'Why Did You Start Him', 'Worst single game by a started player', {
      teamId: worstStart?.teamId,
      teamName: worstStart ? nameOf(worstStart.teamId) : null,
      managerName: worstStart ? managerOf(worstStart.teamId) : null,
      logo: worstStart ? logoOf(worstStart.teamId) : null,
      week: worstStart?.week,
      value: worstStart?.points,
      detail: worstStart
        ? `${worstStart.name} (${worstStart.position}) — ${worstStart.points} pts, Week ${worstStart.week}`
        : null,
    })
  );

  // ---- Season-long manager skill ----------------------------------------
  const played = teamStats.filter((t) => t.gamesPlayed > 0);
  const seasonAward = (id, label, description, list, pick, format) => {
    if (!list.length) return;
    const w = list.reduce(pick);
    prizes.push(
      prize(id, label, description, {
        teamId: w.teamId,
        teamName: w.teamName,
        managerName: w.managerName,
        logo: w.logo ?? null,
        week: null,
        value: format(w).value,
        detail: format(w).detail,
      })
    );
  };

  seasonAward(
    'bestManager',
    'Best Manager',
    'Highest lineup efficiency — got the most out of the roster',
    played.filter((t) => t.efficiency !== null),
    (a, b) => (a.efficiency >= b.efficiency ? a : b),
    (t) => ({ value: t.efficiency, detail: `${t.efficiency}% of optimal lineup` })
  );

  seasonAward(
    'worstManager',
    'Room For Improvement',
    'Lowest lineup efficiency',
    played.filter((t) => t.efficiency !== null),
    (a, b) => (a.efficiency <= b.efficiency ? a : b),
    (t) => ({ value: t.efficiency, detail: `${t.efficiency}% of optimal lineup` })
  );

  seasonAward(
    'luckiest',
    'Horseshoe Award',
    'Won the most games above what the scores deserved',
    played,
    (a, b) => (a.luck >= b.luck ? a : b),
    (t) => ({ value: t.luck, detail: `${t.wins} wins vs ${t.expectedWins} expected` })
  );

  seasonAward(
    'unluckiest',
    'Snakebit',
    'Won the fewest games relative to how well they scored',
    played,
    (a, b) => (a.luck <= b.luck ? a : b),
    (t) => ({ value: t.luck, detail: `${t.wins} wins vs ${t.expectedWins} expected` })
  );

  seasonAward(
    'mostConsistent',
    'Old Reliable',
    'Smallest week-to-week swing in scoring',
    played.filter((t) => t.consistency !== null),
    (a, b) => (a.stdDev <= b.stdDev ? a : b),
    (t) => ({ value: t.stdDev, detail: `±${t.stdDev} pts per week` })
  );

  seasonAward(
    'mostVolatile',
    'Boom or Bust',
    'Largest week-to-week swing in scoring',
    played.filter((t) => t.consistency !== null),
    (a, b) => (a.stdDev >= b.stdDev ? a : b),
    (t) => ({ value: t.stdDev, detail: `±${t.stdDev} pts per week` })
  );

  seasonAward(
    'allPlayChamp',
    'True Champion',
    'Best record if everyone played everyone every week',
    played,
    (a, b) => (a.allPlayWinPct >= b.allPlayWinPct ? a : b),
    (t) => ({
      value: t.allPlayWinPct,
      detail: `${t.allPlayWins}-${t.allPlayLosses} all-play (${t.allPlayWinPct}%)`,
    })
  );

  seasonAward(
    'mostBenchedSeason',
    'Season-Long Bench Warmer',
    'Most total points left on the bench across the season',
    played,
    (a, b) => (a.benchPoints >= b.benchPoints ? a : b),
    (t) => ({ value: t.benchPoints, detail: `${t.benchPoints} pts benched all season` })
  );

  seasonAward(
    'perfectLineups',
    'Lineup Savant',
    'Most weeks with a perfect (optimal) lineup',
    played.filter((t) => t.perfectLineups > 0),
    (a, b) => (a.perfectLineups >= b.perfectLineups ? a : b),
    (t) => ({ value: t.perfectLineups, detail: `${t.perfectLineups} perfect week(s)` })
  );

  return prizes.filter((p) => p.winner && p.winner.teamId !== undefined);
}

/** Weekly high-score winners — usually its own small pot. */
export function computeWeeklyHighScores(teamWeeks, teamStats) {
  const byWeek = new Map();
  for (const row of teamWeeks) {
    if (!byWeek.has(row.week)) byWeek.set(row.week, []);
    byWeek.get(row.week).push(row);
  }

  return [...byWeek.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([week, rows]) => {
      const top = rows.reduce((a, b) => (a.score >= b.score ? a : b));
      const team = teamStats.find((t) => t.teamId === top.teamId);
      return {
        week,
        teamId: top.teamId,
        teamName: team?.teamName ?? `Team ${top.teamId}`,
        managerName: team?.managerName ?? null,
        logo: team?.logo ?? null,
        score: top.score,
      };
    });
}

/** Points by position, to answer "who has the best RB corps". */
export function computePositionalStats(teamWeeks, teamStats) {
  const positions = ['QB', 'RB', 'WR', 'TE', 'K', 'D/ST'];
  const byTeam = new Map();

  for (const row of teamWeeks) {
    if (!byTeam.has(row.teamId)) {
      byTeam.set(row.teamId, Object.fromEntries(positions.map((p) => [p, 0])));
    }
    const bucket = byTeam.get(row.teamId);
    for (const starter of row.starters) {
      if (bucket[starter.position] !== undefined) bucket[starter.position] += starter.points;
    }
  }

  const rows = [...byTeam.entries()].map(([teamId, totals]) => {
    const team = teamStats.find((t) => t.teamId === teamId);
    return {
      teamId,
      teamName: team?.teamName ?? `Team ${teamId}`,
      managerName: team?.managerName ?? null,
      ...Object.fromEntries(Object.entries(totals).map(([k, v]) => [k, round2(v)])),
    };
  });

  const leaders = {};
  for (const pos of positions) {
    if (!rows.length) continue;
    const top = rows.reduce((a, b) => (a[pos] >= b[pos] ? a : b));
    leaders[pos] = { teamId: top.teamId, teamName: top.teamName, points: top[pos] };
  }

  return { rows, leaders };
}
```

### `scripts/lib/challenges.mjs`

*523 lines*

```javascript
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

/** FNV-1a. Turns the seed string into the 32 bits the generator needs. */
function hashSeed(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32 — small, fast, and identical on every machine and Node version. */
function mulberry32(seed) {
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
}) {
  const seed = challengeSeed({ leagueId, season, salt });
  const rand = mulberry32(hashSeed(seed));
  const step = cadence === 'biweekly' ? 2 : 1;

  const playWeeks = [];
  for (let week = startWeek; week <= weeks; week += step) playWeeks.push(week);

  const dealt = [];
  let pack = [];
  for (const week of playWeeks) {
    if (!pack.length) pack = shuffle(deck, rand);
    const card = pack.shift();
    dealt.push({
      week,
      challengeId: card.id,
      label: card.label,
      rule: card.rule,
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
```

### `scripts/lib/draft.mjs`

*182 lines*

```javascript
/**
 * Draft analysis.
 *
 * The hard part of grading a draft is deciding what a pick "should" have been
 * worth. With a single league and no external ADP feed there is no outside
 * baseline, so value is measured *within the draft itself*:
 *
 *   Rank every drafted player by the fantasy points they actually scored.
 *   Compare that rank to where they were taken.
 *
 * A player taken 40th who finished as the 12th-best drafted player returned
 * +28 slots of value. This is self-normalizing — it needs no ADP, no
 * projections, and no prior seasons — and it answers the question people
 * actually argue about: who got the steals and who reached.
 */

const round2 = (n) => Number((n ?? 0).toFixed(2));
const round1 = (n) => Number((n ?? 0).toFixed(1));

/** Total fantasy points each player scored this season, from all box scores. */
export function buildPlayerSeasonPoints(season) {
  const totals = new Map();

  for (const week of season.weeks) {
    if (!week.played) continue;
    for (const matchup of week.matchups) {
      for (const side of [matchup.home, matchup.away]) {
        if (!side) continue;
        for (const p of side.roster) {
          // Count every rostered player's output, started or benched — a draft
          // pick's value is what the player produced, not whether the manager
          // correctly guessed which weeks to start him.
          const prev = totals.get(p.playerId) ?? { points: 0, games: 0, name: p.name, position: p.position };
          prev.points += p.points;
          if (p.points !== 0) prev.games += 1;
          totals.set(p.playerId, prev);
        }
      }
    }
  }

  for (const v of totals.values()) v.points = round2(v.points);
  return totals;
}

export function analyzeDraft(season) {
  const { draft, teams } = season;

  if (!draft.held || draft.picks.length === 0) {
    return {
      held: false,
      rounds: draft.rounds,
      totalSlots: draft.totalSlots,
      picks: [],
      board: [],
      teamGrades: [],
      steals: [],
      reaches: [],
      positionRuns: [],
      hasResults: false,
    };
  }

  const seasonPoints = buildPlayerSeasonPoints(season);
  const hasResults = seasonPoints.size > 0;

  // Rank drafted players by what they actually produced.
  const withPoints = draft.picks.map((pick) => {
    const stat = seasonPoints.get(pick.playerId);
    return { ...pick, seasonPoints: stat?.points ?? 0, gamesPlayed: stat?.games ?? 0 };
  });

  const ranked = [...withPoints].sort((a, b) => b.seasonPoints - a.seasonPoints);
  const actualRank = new Map(ranked.map((p, i) => [p.playerId, i + 1]));

  const picks = withPoints.map((pick) => {
    const rank = actualRank.get(pick.playerId) ?? withPoints.length;
    // Positive = outperformed the slot they cost.
    const valueDelta = hasResults ? pick.overall - rank : null;
    return {
      ...pick,
      actualRank: hasResults ? rank : null,
      valueDelta,
      pointsPerGame: pick.gamesPlayed ? round2(pick.seasonPoints / pick.gamesPlayed) : 0,
    };
  });

  // ---- Draft board: rounds x teams, in snake order ------------------------
  const board = [];
  for (let round = 1; round <= draft.rounds; round += 1) {
    const roundPicks = picks
      .filter((p) => p.round === round)
      .sort((a, b) => a.pickInRound - b.pickInRound);
    if (roundPicks.length) board.push({ round, picks: roundPicks });
  }

  // ---- Per-manager grades ------------------------------------------------
  const teamGrades = teams
    .filter((t) => picks.some((p) => p.teamId === t.id))
    .map((team) => {
      const own = picks.filter((p) => p.teamId === team.id);
      const totalPoints = round2(own.reduce((a, p) => a + p.seasonPoints, 0));
      const totalValue = hasResults ? own.reduce((a, p) => a + (p.valueDelta ?? 0), 0) : null;

      const byPosition = {};
      for (const p of own) {
        byPosition[p.position] = (byPosition[p.position] ?? 0) + 1;
      }

      const bestPick = hasResults && own.length
        ? own.reduce((a, b) => ((a.valueDelta ?? 0) >= (b.valueDelta ?? 0) ? a : b))
        : null;
      const worstPick = hasResults && own.length
        ? own.reduce((a, b) => ((a.valueDelta ?? 0) <= (b.valueDelta ?? 0) ? a : b))
        : null;

      return {
        teamId: team.id,
        teamName: team.name,
        managerName: team.managerName,
        pickCount: own.length,
        totalPoints,
        avgPointsPerPick: own.length ? round2(totalPoints / own.length) : 0,
        totalValue,
        avgValue: hasResults && own.length ? round1(totalValue / own.length) : null,
        byPosition,
        firstPickOverall: own.length ? Math.min(...own.map((p) => p.overall)) : null,
        bestPick,
        worstPick,
        autoDraftedCount: own.filter((p) => p.autoDrafted).length,
      };
    });

  if (hasResults) {
    teamGrades.sort((a, b) => b.totalValue - a.totalValue);
    // Letter grades on a curve — the point is ranking within this league.
    const scale = ['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'F'];
    teamGrades.forEach((t, i) => {
      const idx = Math.min(scale.length - 1, Math.floor((i / teamGrades.length) * scale.length));
      t.grade = scale[idx];
      t.rank = i + 1;
    });
  } else {
    teamGrades.sort((a, b) => (a.firstPickOverall ?? 0) - (b.firstPickOverall ?? 0));
  }

  // ---- Steals and reaches -------------------------------------------------
  const sortedByValue = hasResults ? [...picks].sort((a, b) => b.valueDelta - a.valueDelta) : [];
  const steals = sortedByValue.slice(0, 10);
  const reaches = sortedByValue.slice(-10).reverse();

  // ---- Positional runs ----------------------------------------------------
  // Where each position came off the board, which is how you spot a run.
  const positionRuns = ['QB', 'RB', 'WR', 'TE', 'K', 'D/ST'].map((pos) => {
    const taken = picks.filter((p) => p.position === pos).sort((a, b) => a.overall - b.overall);
    return {
      position: pos,
      count: taken.length,
      firstOverall: taken[0]?.overall ?? null,
      firstPlayer: taken[0]?.playerName ?? null,
      lastOverall: taken[taken.length - 1]?.overall ?? null,
      medianOverall: taken.length
        ? taken[Math.floor(taken.length / 2)].overall
        : null,
    };
  });

  return {
    held: true,
    rounds: draft.rounds,
    totalSlots: draft.totalSlots,
    picksMade: draft.picksMade,
    hasResults,
    picks,
    board,
    teamGrades,
    steals,
    reaches,
    positionRuns,
  };
}
```

### `scripts/lib/advisor.mjs`

*217 lines*

```javascript
/**
 * The roster advisor — per-team, forward-looking guidance.
 *
 * Three distinct questions, with very different confidence levels:
 *
 *   1. "What should I start this week?"  Uses ESPN's own projections. Advice,
 *      not prophecy — projections are wrong all the time. It is still strictly
 *      better than the default, which is whatever you set last week and forgot.
 *
 *   2. "What did I get wrong?"  Retrospective, from actual results. This one is
 *      not a guess: the points were scored or they weren't.
 *
 *   3. "Who should I pick up?"  Compares free agents' projections against the
 *      weakest starter at each position.
 *
 * Everything degrades to an empty result when the data isn't there, because
 * until the Sept 5 draft there are no rosters at all.
 */

import { optimalLineup, SLOT_ELIGIBILITY } from './lineup.mjs';

const round2 = (n) => Number((n ?? 0).toFixed(2));

/** Slots a player does not score from. */
const BENCH_SLOTS = new Set([20, 21, 24]);

/**
 * Start/sit recommendation for the upcoming week.
 *
 * Runs the optimal-lineup solver over PROJECTED points rather than actual, then
 * diffs the result against who is currently slotted in.
 */
export function recommendLineup(roster, startingSlots) {
  const players = (roster ?? []).filter((p) => p && Number.isFinite(p.projected));
  if (players.length === 0 || !startingSlots?.length) {
    return {
      available: false, alreadyOptimal: true,
      toStart: [], toSit: [], recommended: [],
      projectedGain: 0, projectedTotal: 0, currentProjected: 0,
    };
  }

  // The solver optimises `points`, so project into that field.
  const byProjection = players.map((p) => ({ ...p, points: p.projected }));
  const best = optimalLineup(byProjection, startingSlots);

  const recommendedIds = new Set(best.lineup.map((p) => p.playerId));
  const currentStarters = players.filter((p) => !BENCH_SLOTS.has(p.slotId));
  const currentIds = new Set(currentStarters.map((p) => p.playerId));
  const currentProjected = currentStarters.reduce((a, p) => a + p.projected, 0);

  const describe = (p) => ({
    playerId: p.playerId, name: p.name, position: p.position,
    slot: p.slot ?? null, projected: round2(p.projected),
  });

  // Two independent lists, NOT zipped into pretend 1:1 swaps.
  //
  // It is tempting to pair "start X" with "sit Y" so each row reads as one
  // decision, but that quietly lies whenever the two occupy different slots:
  // pairing a bench QB against a starting TE produces "start the QB instead of
  // the TE", which is not a legal move in a lineup with a fixed QB slot and a
  // fixed TE slot. The honest framing is who belongs in, who belongs out, and
  // what the whole change is worth.
  const toStart = best.lineup
    .filter((p) => !currentIds.has(p.playerId))
    .sort((a, b) => b.projected - a.projected)
    .map(describe);
  const toSit = currentStarters
    .filter((p) => !recommendedIds.has(p.playerId))
    .sort((a, b) => a.projected - b.projected)
    .map(describe);

  const projectedGain = round2(Math.max(0, best.points - currentProjected));

  // Projections are nowhere near precise enough for a sub-point "improvement"
  // to mean anything, and surfacing one teaches people to ignore the feature.
  const worthDoing = projectedGain >= 1 && toStart.length > 0;

  return {
    available: true,
    alreadyOptimal: !worthDoing,
    toStart: worthDoing ? toStart : [],
    toSit: worthDoing ? toSit : [],
    projectedGain,
    projectedTotal: round2(best.points),
    currentProjected: round2(currentProjected),
    recommended: best.lineup.map((p) => ({
      playerId: p.playerId, name: p.name, position: p.position,
      slotId: p.slotId, projected: round2(p.projected),
    })),
  };
}

/**
 * What this manager actually got wrong, week by week. Not a projection — these
 * points were left on the bench in reality.
 */
export function coachingReport(teamWeeks, startingSlots) {
  const rows = (teamWeeks ?? []).filter((r) => r.starters?.length);
  if (!rows.length) return { available: false, weeks: [], worstCalls: [], totalBenched: 0 };

  const worstCalls = [];

  for (const row of rows) {
    const optimal = optimalLineup([...row.starters, ...row.benchPlayers], startingSlots ?? []);
    const startedIds = new Set(row.starters.map((p) => p.playerId));
    const optimalIds = new Set(optimal.lineup.map((p) => p.playerId));

    const shouldHaveStarted = optimal.lineup
      .filter((p) => !startedIds.has(p.playerId))
      .sort((a, b) => b.points - a.points);
    const shouldHaveSat = row.starters
      .filter((p) => !optimalIds.has(p.playerId))
      .sort((a, b) => a.points - b.points);

    for (let i = 0; i < Math.min(shouldHaveStarted.length, shouldHaveSat.length); i += 1) {
      const gain = shouldHaveStarted[i].points - shouldHaveSat[i].points;
      if (gain <= 0) continue;
      worstCalls.push({
        week: row.week,
        benched: {
          name: shouldHaveStarted[i].name, position: shouldHaveStarted[i].position,
          points: round2(shouldHaveStarted[i].points),
        },
        started: {
          name: shouldHaveSat[i].name, position: shouldHaveSat[i].position,
          points: round2(shouldHaveSat[i].points),
        },
        cost: round2(gain),
        // Did this actually lose the matchup, or was it harmless?
        changedResult: row.result === 'LOSS' && gain > Math.abs(row.margin),
      });
    }
  }

  worstCalls.sort((a, b) => b.cost - a.cost);

  return {
    available: true,
    totalBenched: round2(rows.reduce((a, r) => a + (r.benchPoints ?? 0), 0)),
    gamesCostByBadLineups: worstCalls.filter((c) => c.changedResult).length,
    worstCalls: worstCalls.slice(0, 10),
    weeks: rows.map((r) => ({
      week: r.week, score: r.score, optimalScore: r.optimalScore,
      efficiency: r.efficiency, benchPoints: r.benchPoints, result: r.result,
    })),
  };
}

/**
 * Free agents worth adding, judged against the weakest starter at each position.
 *
 * Deliberately conservative: a free agent has to clearly beat what you already
 * start before it justifies a roster move and a waiver claim.
 */
export function waiverTargets(freeAgents, roster, startingSlots, { minGain = 2, limit = 8 } = {}) {
  const fas = (freeAgents ?? []).filter((p) => Number.isFinite(p.projected) && p.projected > 0);
  const players = (roster ?? []).filter((p) => Number.isFinite(p.projected));
  if (!fas.length || !players.length) return { available: false, targets: [], injuryGaps: [] };

  // The bar is derived from the lineup you would actually field, not from a
  // per-position slot count.
  //
  // Counting slots per position double-counts every flex: with 2 RB + 2 WR +
  // 1 TE + 1 FLEX, each of RB, WR and TE separately believes it needs three
  // starters. A roster whose flex is filled then looks "short" at every
  // position, the bar collapses to zero, and any warm body clears it. Solving
  // the lineup once and reading the weakest starter off it avoids that.
  const best = optimalLineup(players.map((p) => ({ ...p, points: p.projected })), startingSlots);

  const bar = new Map();
  for (const pos of new Set(fas.map((f) => f.position))) {
    const usableSlots = new Set(
      (startingSlots ?? [])
        .filter((s) => (SLOT_ELIGIBILITY[s.slotId] ?? []).includes(pos))
        .map((s) => s.slotId)
    );
    // A position that never starts in this format is not a target at all.
    if (usableSlots.size === 0) continue;

    const occupying = best.lineup.filter((p) => usableSlots.has(p.slotId));
    // An eligible slot nobody is filling is a genuine hole.
    bar.set(pos, occupying.length ? Math.min(...occupying.map((p) => p.points)) : 0);
  }

  const targets = fas
    .map((fa) => {
      const threshold = bar.get(fa.position);
      if (threshold === undefined) return null;
      const gain = fa.projected - threshold;
      if (gain < minGain) return null;
      return {
        playerId: fa.playerId, name: fa.name, position: fa.position,
        proTeam: fa.proTeam, projected: round2(fa.projected),
        percentOwned: fa.percentOwned ?? null,
        injuryStatus: fa.injuryStatus ?? null,
        beats: round2(threshold), gain: round2(gain),
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.gain - a.gain)
    .slice(0, limit);

  // A hurt starter matters more than any marginal upgrade.
  const injuryGaps = players
    .filter((p) => !BENCH_SLOTS.has(p.slotId))
    .filter((p) => ['OUT', 'DOUBTFUL', 'INJURY_RESERVE', 'SUSPENSION'].includes(p.injuryStatus))
    .map((p) => ({
      playerId: p.playerId, name: p.name, position: p.position,
      injuryStatus: p.injuryStatus,
      replacement: targets.find((t) => t.position === p.position) ?? null,
    }));

  return { available: true, targets, injuryGaps };
}
```

### `scripts/lib/bigboard.mjs`

*446 lines*

```javascript
/**
 * The big board — every draftable player, graded.
 *
 * A grade is only meaningful against a baseline, and the honest baseline is
 * REPLACEMENT LEVEL: the worst player at a position you would still start.
 * 300 projected points is elite for a tight end and unremarkable for a
 * quarterback, so raw projections cannot be compared across positions.
 *
 * Replacement level is not hardcoded. It is derived by greedily filling all
 * twelve starting lineups from the projection-ranked pool, then reading off the
 * worst starter at each position. That matters enormously here: this league
 * starts an OP slot, so quarterbacks absorb most of the flex and QB replacement
 * level sits far deeper than it would in a standard league. Hardcoding "QB12"
 * would misprice every quarterback on the board.
 */

const SLOT_ELIGIBILITY = {
  0: ['QB'], 2: ['RB'], 4: ['WR'], 6: ['TE'], 16: ['D/ST'], 17: ['K'],
  23: ['RB', 'WR', 'TE'], 7: ['QB', 'RB', 'WR', 'TE'],
  3: ['RB', 'WR'], 5: ['WR', 'TE'],
};

const round1 = (n) => Number((n ?? 0).toFixed(1));

/**
 * Simulates every team filling its starting lineup with the best players
 * available, then reports the worst starter at each position.
 *
 * Self-adjusting: change the league to superflex, or to two flex slots, and the
 * baselines move on their own.
 */
export function computeReplacementLevels(players, startingSlots, teamCount) {
  const pool = players
    .filter((p) => Number.isFinite(p.projected))
    .sort((a, b) => b.projected - a.projected);

  // One entry per starting slot across the whole league, most restrictive
  // first so flex slots take genuine leftovers rather than premium players.
  const slots = [];
  for (const { slotId, count } of startingSlots ?? []) {
    for (let t = 0; t < teamCount; t += 1) {
      for (let i = 0; i < count; i += 1) slots.push(slotId);
    }
  }
  slots.sort((a, b) => (SLOT_ELIGIBILITY[a] ?? []).length - (SLOT_ELIGIBILITY[b] ?? []).length);

  const taken = new Set();
  const startersByPosition = new Map();

  for (const slotId of slots) {
    const eligible = SLOT_ELIGIBILITY[slotId] ?? [];
    const pick = pool.find((p) => !taken.has(p.playerId) && eligible.includes(p.position));
    if (!pick) continue;
    taken.add(pick.playerId);
    if (!startersByPosition.has(pick.position)) startersByPosition.set(pick.position, []);
    startersByPosition.get(pick.position).push(pick);
  }

  const levels = {};
  const counts = {};
  for (const [position, list] of startersByPosition) {
    counts[position] = list.length;
    // The worst player still starting at this position.
    levels[position] = round1(Math.min(...list.map((p) => p.projected)));
  }

  return { levels, startersNeeded: counts };
}

/**
 * Tiers are computed WITHIN each position, at the biggest cliffs.
 *
 * Two false starts got here. Tiering the whole board by absolute VORP gap puts
 * every break in the top ten — gaps between elite players are enormous and
 * gaps in the middle are fractions of a point — so 240 of 250 players land in
 * one meaningless bucket. And a global tier answers the wrong question anyway:
 * `valueRank` already says who is best overall, whereas what a drafter needs at
 * the table is "how far does it fall if I miss this group of tight ends?"
 *
 * So: tier per position, breaking at that position's largest drops.
 */
function assignPositionalTiers(sorted, { tiersPerPosition = 6 } = {}) {
  const byPosition = new Map();
  for (const p of sorted) {
    if (!byPosition.has(p.position)) byPosition.set(p.position, []);
    byPosition.get(p.position).push(p);
  }

  for (const list of byPosition.values()) {
    if (list.length < 2) {
      list.forEach((p) => { p.tier = 1; });
      continue;
    }

    const gaps = [];
    for (let i = 1; i < list.length; i += 1) {
      gaps.push({ index: i, gap: Math.max(0, list[i - 1].vorp - list[i].vorp) });
    }
    const breaks = new Set(
      [...gaps]
        .sort((a, b) => b.gap - a.gap)
        .slice(0, Math.max(0, tiersPerPosition - 1))
        .map((g) => g.index)
    );

    let tier = 1;
    list[0].tier = 1;
    for (let i = 1; i < list.length; i += 1) {
      if (breaks.has(i)) tier += 1;
      list[i].tier = tier;
    }
  }
}

/**
 * A→F, banded in standard deviations of the actual delta spread.
 *
 * Fixed thresholds do not survive a change of scale: ±40 places was calibrated
 * for a short board and, applied across 250 players where deltas routinely
 * exceed 100, put 54% of the league at A+ or F. Grading in units of the
 * observed spread keeps the distribution sane at any board size while
 * preserving the absolute anchor that matters — a delta of zero means a player
 * is priced exactly where his value says he belongs, and lands at B-.
 */
function gradeFromZ(z) {
  if (z >= 1.5) return 'A+';
  if (z >= 1.0) return 'A';
  if (z >= 0.6) return 'A-';
  if (z >= 0.3) return 'B+';
  if (z >= 0.1) return 'B';
  if (z >= -0.1) return 'B-';
  if (z >= -0.3) return 'C+';
  if (z >= -0.6) return 'C';
  if (z >= -1.0) return 'C-';
  if (z >= -1.5) return 'D';
  return 'F';
}

function standardDeviation(values) {
  if (values.length < 2) return 1;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, v) => a + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance) || 1;
}

/**
 * How many of each position a team can sensibly roster.
 *
 * Derived from the format rather than hardcoded: count the slots each position
 * can legally fill, then allow bench depth on top. Running backs and receivers
 * get more because they get hurt and have bye weeks; kickers and defences get
 * exactly one, because rostering two is throwing a pick away.
 */
function rosterCapacity(startingSlots) {
  const startable = {};
  for (const { slotId, count } of startingSlots ?? []) {
    for (const pos of SLOT_ELIGIBILITY[slotId] ?? []) {
      startable[pos] = (startable[pos] ?? 0) + count;
    }
  }

  const capacity = {};
  for (const [pos, slots] of Object.entries(startable)) {
    if (pos === 'K' || pos === 'D/ST') capacity[pos] = 1;
    else if (pos === 'QB' || pos === 'TE') capacity[pos] = slots + 1;
    else capacity[pos] = slots + 3;
  }
  return { startable, capacity };
}

/**
 * Where each player *should* go, from a deterministic draft in which all teams
 * draft well.
 *
 * Simply converting value rank into a pick number would be wrong: VORP likes
 * kickers more than it should (see `streamable`), so the sixth-best kicker
 * would be "recommended" in round four, which nobody sane would do. Simulating
 * a real draft applies the constraints that actually govern draft order —
 * rosters fill up, nobody carries three tight ends, and kickers go last —
 * so the recommendation is one a person could follow.
 *
 * Deterministic by design: no randomness, so the same board always yields the
 * same recommendations and two people reading the hub see the same advice.
 */
export function simulateConsensusDraft(rankedByValue, { startingSlots, teams, rounds }) {
  const { capacity } = rosterCapacity(startingSlots);
  const totalPicks = teams * rounds;

  const rosters = Array.from({ length: teams }, () => ({}));
  const taken = new Set();
  const result = new Map();

  for (let pickNumber = 1; pickNumber <= totalPicks; pickNumber += 1) {
    const round = Math.ceil(pickNumber / teams);
    const indexInRound = (pickNumber - 1) % teams;
    // Snake order.
    const teamIndex = round % 2 === 1 ? indexInRound : teams - 1 - indexInRound;
    const roster = rosters[teamIndex];

    // Kickers and defences are worth exactly one late pick each. Gating them
    // is what stops VORP from recommending a kicker in the middle rounds.
    const lateOnly = round >= rounds - 1;

    const pick = rankedByValue.find((p) => {
      if (taken.has(p.playerId)) return false;
      const max = capacity[p.position];
      if (max === undefined) return false;
      if ((roster[p.position] ?? 0) >= max) return false;
      if ((p.position === 'K' || p.position === 'D/ST') && !lateOnly) return false;
      return true;
    });

    if (!pick) continue;
    taken.add(pick.playerId);
    roster[pick.position] = (roster[pick.position] ?? 0) + 1;
    result.set(pick.playerId, { pick: pickNumber, round });
  }

  return result;
}

/** The overall pick numbers belonging to one draft slot in a snake draft. */
export function picksForSlot(slot, teams, rounds) {
  const picks = [];
  for (let round = 1; round <= rounds; round += 1) {
    const indexInRound = round % 2 === 1 ? slot - 1 : teams - slot;
    picks.push({ round, overall: (round - 1) * teams + indexInRound + 1 });
  }
  return picks;
}

/**
 * @param {object} pool  docs/data/draftpool payload (players, startingSlots, teams)
 * @param {object} [draft] analyzed draft, so picks can be attached once held
 * @param {number} [limit] how many players to publish
 */
export function buildBigBoard(pool, draft = null, limit = 250) {
  const all = (pool?.players ?? []).filter((p) => Number.isFinite(p.projected));
  if (!all.length) {
    return { available: false, players: [], replacement: {}, scarcity: [], rankType: pool?.rankType ?? null };
  }

  const teamCount = pool.teams ?? 12;
  const { levels, startersNeeded } = computeReplacementLevels(all, pool.startingSlots, teamCount);

  // Where each player was actually taken, once a draft exists.
  const pickByPlayer = new Map();
  for (const pick of draft?.picks ?? []) {
    pickByPlayer.set(pick.playerId, pick);
  }

  const withVorp = all.map((p) => {
    const replacement = levels[p.position];
    // A position nobody starts (P, HC) has no replacement level and no VORP.
    const vorp = replacement === undefined ? null : round1(p.projected - replacement);
    return { ...p, replacement: replacement ?? null, vorp };
  });

  // Rank by value, which is the whole point — this is the order the board
  // *should* be in, as opposed to the order ESPN publishes.
  const rankable = withVorp.filter((p) => p.vorp !== null).sort((a, b) => b.vorp - a.vorp);
  rankable.forEach((p, i) => { p.valueRank = i + 1; });
  assignPositionalTiers(rankable);

  // Positional rank, so "the 4th-best TE" is answerable at a glance.
  const posCounter = new Map();
  for (const p of rankable) {
    const n = (posCounter.get(p.position) ?? 0) + 1;
    posCounter.set(p.position, n);
    p.positionRank = n;
  }

  // Where each player should actually go, under real roster constraints.
  const rounds = pool.rounds ?? 16;
  const consensus = simulateConsensusDraft(rankable, {
    startingSlots: pool.startingSlots,
    teams: teamCount,
    rounds,
  });

  const published = rankable.slice(0, limit);

  /**
   * Grades are computed WITHIN each position, not across the board.
   *
   * Comparing a player's ADP to his overall value rank sounds right and is
   * badly misleading in this format. ADP is collected from mostly-standard
   * leagues, so in superflex every quarterback grades A+ and every receiver
   * grades F — the grade stops saying "is this player good value" and starts
   * saying "is this a quarterback", which the reader already knows from the
   * position column.
   *
   * Ranking cost and value separately inside each position cancels that bias
   * out by construction, so the grade answers the question actually being
   * asked at the table: among the quarterbacks, is THIS one going later than
   * he should? The cross-position story is still told, once, in the positional
   * value card — which is where a league-wide effect belongs, rather than
   * repeated across 250 rows.
   */
  const byPosition = new Map();
  for (const p of published) {
    if (!byPosition.has(p.position)) byPosition.set(p.position, []);
    byPosition.get(p.position).push(p);
  }

  for (const group of byPosition.values()) {
    // Rank within the position by what he costs...
    const costOrder = [...group]
      .filter((p) => (p.adp ?? p.rank) !== null)
      .sort((a, b) => (a.adp ?? a.rank) - (b.adp ?? b.rank));
    const costRankInPos = new Map(costOrder.map((p, i) => [p.playerId, i + 1]));

    // ...and by what he is worth. `group` is already in value order.
    group.forEach((p, i) => {
      const cost = costRankInPos.get(p.playerId);
      p.valueDelta = cost === undefined ? null : cost - (i + 1);
    });

    const spread = standardDeviation(
      group.map((p) => p.valueDelta).filter((d) => d !== null)
    );
    for (const p of group) {
      p.grade = p.valueDelta === null ? null : gradeFromZ(p.valueDelta / spread);
    }
  }

  const players = published
    .map((p) => {
      const pick = pickByPlayer.get(p.playerId) ?? null;
      const delta = p.valueDelta;
      const rec = consensus.get(p.playerId) ?? null;
      // Positive = the market lets him fall past where he should go.
      const adpVsRecommended =
        rec && p.adp !== null ? Math.round(p.adp - rec.pick) : null;

      return {
        recommendedPick: rec?.pick ?? null,
        recommendedRound: rec?.round ?? null,
        // Players outside the simulated draft are genuinely undraftable in a
        // league this size — worth saying so rather than showing a blank.
        draftable: Boolean(rec),
        adpVsRecommended,
        playerId: p.playerId,
        name: p.name,
        position: p.position,
        proTeam: p.proTeam,
        injuryStatus: p.injuryStatus,

        boardRank: p.rank,
        pprRank: p.pprRank,
        adp: p.adp,
        auctionValue: p.auctionValue,

        projected: p.projected,
        lastSeason: p.lastSeason,
        replacement: p.replacement,
        vorp: p.vorp,

        valueRank: p.valueRank,
        positionRank: p.positionRank,
        tier: p.tier,
        streamable: p.position === 'K' || p.position === 'D/ST',
        // Both measured against others at the same position.
        valueDelta: delta,
        grade: p.grade,

        drafted: Boolean(pick),
        pick: pick
          ? {
              overall: pick.overall, round: pick.round,
              teamId: pick.teamId, teamName: pick.teamName,
              managerName: pick.managerName ?? null,
            }
          : null,
      };
    });

  // How thin each position gets, which is what drives draft urgency.
  const scarcity = Object.entries(startersNeeded)
    .map(([position, needed]) => {
      const atPos = rankable.filter((p) => p.position === position);
      const startable = atPos.slice(0, needed);
      return {
        position,
        startersNeeded: needed,
        totalRanked: atPos.length,
        replacement: levels[position],
        bestProjection: atPos[0]?.projected ?? null,
        // The drop from the best to the last startable player: a big number
        // means the position is top-heavy and worth paying up for.
        eliteAdvantage: startable.length
          ? round1(startable[0].projected - startable[startable.length - 1].projected)
          : null,
      };
    })
    .sort((a, b) => (b.eliteAdvantage ?? 0) - (a.eliteAdvantage ?? 0));

  /**
   * Average value gap by position — the superflex effect, quantified.
   *
   * ADP is collected across mostly-standard leagues, so in a superflex format
   * it systematically underprices quarterbacks. This is not noise to correct
   * for; it is the single biggest edge available in this draft, and it deserves
   * to be stated as a number rather than left for someone to infer from 250
   * individual grades.
   */
  const positionValue = [...new Set(players.map((p) => p.position))]
    .map((position) => {
      const group = players.filter((p) => p.position === position && p.valueDelta !== null);
      if (!group.length) return null;
      const avg = group.reduce((a, p) => a + p.valueDelta, 0) / group.length;
      return {
        position,
        count: group.length,
        avgValueDelta: Math.round(avg),
        // Positive = the market drafts this position later than its value warrants.
        underpriced: avg > 0,
        // VORP overstates draft-day value for kickers and defences. It treats
        // 26 points above replacement as 26 points regardless of position, but
        // K and D/ST are near-freely replaceable off waivers every week, so
        // that edge is not something you need a draft pick to capture. The
        // model cannot see this — week-to-week volatility is not in ESPN's
        // payload — so it is flagged rather than silently corrected.
        streamable: position === 'K' || position === 'D/ST',
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.avgValueDelta - a.avgValueDelta);

  return {
    available: true,
    rankType: pool.rankType ?? null,
    teamCount,
    limit,
    replacement: levels,
    startersNeeded,
    scarcity,
    positionValue,
    rounds,
    picksBySlot: Object.fromEntries(
      Array.from({ length: teamCount }, (_, i) => [i + 1, picksForSlot(i + 1, teamCount, rounds).map((p) => p.overall)])
    ),
    players,
  };
}
```

### `scripts/lib/images.mjs`

*84 lines*

```javascript
/**
 * Where pictures come from.
 *
 * Three kinds of image appear on the site, and only one of them is ours:
 *
 *   NFL player headshots   ESPN's CDN, addressed by the player id we already
 *                          have on every row. Nothing to fetch or store.
 *   NFL team logos         ESPN's CDN, addressed by team abbreviation. Used for
 *                          D/ST, which has no headshot because it is not a
 *                          person.
 *   Fantasy team logos     Whatever each manager set on ESPN. Comes to us as a
 *                          URL inside the league payload — see the warning
 *                          below, this one is not ours and is not trusted.
 *
 * Images are hotlinked rather than downloaded and committed. That keeps the
 * repo small and means a traded player's picture is right the moment ESPN
 * updates it, at the cost of the site no longer being fully self-contained:
 * `docs/_headers` has to name these hosts in `img-src` or the browser blocks
 * every one of them. The CSP and ESPN_IMAGE_HOSTS below must stay in sync.
 */

/**
 * The only hosts the site will point an <img> at.
 *
 * This matters more than it looks. A fantasy team logo is a URL ESPN hands
 * back from the league payload, and ESPN's classic UI lets a manager paste in
 * *any* URL — so `team.logo` is attacker-controlled in the sense that anyone in
 * the league can choose it. Rendering it unchecked would let one manager point
 * every visitor's browser at a server of their choosing, handing them the IP
 * and user-agent of everyone who opens the site.
 *
 * So logos are filtered against this list at build time, and the same list is
 * the CSP allowlist. A logo hosted anywhere else is dropped and the team falls
 * back to its initials, which is a cosmetic loss and not a broken page.
 */
export const ESPN_IMAGE_HOSTS = [
  'a.espncdn.com',
  'g.espncdn.com',
  'i.espncdn.com',
  's.espncdn.com',
  'secure.espncdn.com',
];

/** Headshot for a real person. ESPN 404s for players it has no photo of. */
export function headshotUrl(playerId) {
  if (!playerId || Number(playerId) <= 0) return null;
  return `https://a.espncdn.com/i/headshots/nfl/players/full/${Number(playerId)}.png`;
}

/** Logo for an NFL franchise — what a D/ST gets instead of a headshot. */
export function proTeamLogoUrl(abbrev) {
  if (!abbrev || abbrev === 'FA' || abbrev === 'UNKNOWN') return null;
  return `https://a.espncdn.com/i/teamlogos/nfl/500/${String(abbrev).toLowerCase()}.png`;
}

/**
 * The right picture for a roster row: a face for people, a shield for defences.
 *
 * D/ST is the case worth being careful about — `playerId` is a real number for
 * a defence, so the headshot URL builds fine and then 404s forever.
 */
export function playerImageUrl({ playerId, position, proTeam } = {}) {
  if (position === 'D/ST') return proTeamLogoUrl(proTeam);
  return headshotUrl(playerId);
}

/**
 * Passes a fantasy team logo through only if it is on a host we allow.
 *
 * Returns null for anything else, including a malformed URL, so callers can
 * treat "no logo" and "logo we will not load" identically.
 */
export function sanitizeTeamLogo(url) {
  if (!url || typeof url !== 'string') return null;
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:') return null;
  return ESPN_IMAGE_HOSTS.includes(parsed.hostname) ? parsed.href : null;
}
```

### `scripts/lib/playercard.mjs`

*218 lines*

```javascript
/**
 * Player cards: what shows up when you hover (or tap) a name anywhere on the
 * site.
 *
 * Three things go on a card, and they come from three different places:
 *
 *   Last season's real production   ESPN's payload, already fetched. The draft
 *                                   pool carries a full per-stat breakdown for
 *                                   every player and the build was throwing all
 *                                   but the fantasy-point total away.
 *   Injury status                   Already normalized; just needed surfacing.
 *   News                            A separate ESPN endpoint, fetched at build
 *                                   time because the browser cannot reach ESPN.
 *
 * The cards are emitted as one index keyed by player id rather than embedded in
 * each view. The same player appears on the big board, a roster, the draft board
 * and the mock draft; inlining the card four times would bloat every payload
 * that carries a player list, and the landing page would pay for data almost
 * nobody hovers.
 *
 * A NOTE ON NEWS AND TIME. The site rebuilds once a day. A stat line from last
 * season is as true tomorrow as it is today, but an injury note is the most
 * perishable thing in fantasy football — "limited in practice" is worth nothing
 * on Sunday afternoon. So every news item carries its own published timestamp
 * and the card shows it. Stale news that admits it is stale is useful; stale
 * news wearing a confident face is worse than none, because somebody starts a
 * player who was ruled out that morning.
 */

import { STAT_KEYS, INJURY_STATUS, STAT_SOURCE, STAT_SPLIT } from './constants.mjs';

const round1 = (n) => Number((n ?? 0).toFixed(1));

/**
 * Turns ESPN's numeric stat map into named fields.
 *
 * `stats` arrives as `{"3": 4306, "24": 421, ...}` — the keys are the ids
 * STAT_KEYS names. Anything not in STAT_KEYS is dropped rather than passed
 * through under a numeric key, so a card can never render "58: 141" at someone.
 *
 * Two ids (89 and 123) both mean points allowed. They do not co-occur in
 * practice; if they ever did, the later key wins, which is the same thing the
 * object literal in constants.mjs already does.
 */
export function nameStats(stats) {
  const out = {};
  for (const [id, value] of Object.entries(stats ?? {})) {
    const name = STAT_KEYS[Number(id)];
    if (!name) continue;
    if (typeof value !== 'number' || Number.isNaN(value)) continue;
    out[name] = round1(value);
  }
  return out;
}

/**
 * Which numbers actually belong on a card, per position.
 *
 * A quarterback's card showing "0 receptions" is noise; a kicker's showing
 * passing yards is worse. Each position gets the line a person would actually
 * read, and any field with no value is dropped at render time rather than
 * printed as a zero — "0 rushing TDs" and "we have no rushing data" look
 * identical on screen and are not the same claim.
 */
export const STAT_LINES = {
  QB: [
    ['passingYards', 'Pass yds'],
    ['passingTouchdowns', 'Pass TD'],
    ['passingInterceptions', 'INT'],
    ['rushingYards', 'Rush yds'],
    ['rushingTouchdowns', 'Rush TD'],
  ],
  RB: [
    ['rushingAttempts', 'Carries'],
    ['rushingYards', 'Rush yds'],
    ['rushingTouchdowns', 'Rush TD'],
    ['receptions', 'Rec'],
    ['receivingYards', 'Rec yds'],
    ['receivingTouchdowns', 'Rec TD'],
  ],
  WR: [
    ['receivingTargets', 'Targets'],
    ['receptions', 'Rec'],
    ['receivingYards', 'Rec yds'],
    ['receivingTouchdowns', 'Rec TD'],
    ['rushingYards', 'Rush yds'],
  ],
  TE: [
    ['receivingTargets', 'Targets'],
    ['receptions', 'Rec'],
    ['receivingYards', 'Rec yds'],
    ['receivingTouchdowns', 'Rec TD'],
  ],
  K: [
    ['madeFieldGoalsFromUnder40', 'FG <40'],
    ['madeFieldGoalsFrom40To49', 'FG 40-49'],
    ['madeFieldGoalsFrom50Plus', 'FG 50+'],
    ['missedFieldGoals', 'Missed'],
    ['madeExtraPoints', 'XP'],
  ],
  'D/ST': [
    ['defensiveSacks', 'Sacks'],
    ['defensiveInterceptions', 'INT'],
    ['defensiveFumbles', 'Fum rec'],
    ['defensivePointsAllowed', 'Pts allowed'],
    ['defensiveYardsAllowed', 'Yds allowed'],
  ],
};

/** The stat line for a position, with empty fields dropped. */
export function statLine(position, stats) {
  const spec = STAT_LINES[position];
  if (!spec || !stats) return [];
  return spec
    .filter(([key]) => stats[key] !== undefined && stats[key] !== null)
    .map(([key, label]) => ({ key, label, value: stats[key] }));
}

/**
 * Pulls a season's actual production out of a player's `stats[]`.
 *
 * The four-way key is the classic trap in this API — see HANDOFF.md. A season
 * total of what really happened is `statSourceId 0` + `statSplitTypeId 0`, and
 * getting any one of those wrong silently returns a projection or a single
 * week instead.
 */
export function seasonActuals(player, seasonId) {
  const entry = (player?.stats ?? []).find(
    (s) =>
      s.seasonId === seasonId &&
      s.statSourceId === STAT_SOURCE.ACTUAL &&
      s.statSplitTypeId === STAT_SPLIT.SEASON
  );
  if (!entry) return null;

  return {
    season: seasonId,
    fantasyPoints: entry.appliedTotal != null ? round1(entry.appliedTotal) : null,
    stats: nameStats(entry.stats),
  };
}

/**
 * One card per player.
 *
 * `players` is the merged pool the build already has (draft pool entries and
 * roster entries both carry a full player object). `news` is keyed by player id
 * and may be empty — the endpoint is optional and its absence must degrade to a
 * card with stats and injury on it, not to a broken card.
 */
export function buildPlayerCards({ players = [], seasonId, news = {} } = {}) {
  const cards = {};
  const lastSeason = seasonId - 1;

  for (const player of players) {
    const id = player?.id ?? player?.playerId;
    if (!id || id <= 0) continue;
    if (cards[id]) continue;

    const prior = seasonActuals(player, lastSeason);
    const items = news[id] ?? [];
    const injury = player.injuryStatus ?? null;

    // A card with nothing on it is not worth shipping — it would render an
    // empty popover and teach people the feature is broken.
    const hasSomething =
      (prior && Object.keys(prior.stats).length > 0) ||
      items.length > 0 ||
      (injury && injury !== 'ACTIVE' && injury !== 'NORMAL');
    if (!hasSomething) continue;

    cards[id] = {
      playerId: id,
      injury: injury ? (INJURY_STATUS[injury] ?? injury) : null,
      lastSeason: prior && Object.keys(prior.stats).length ? prior : null,
      news: items,
    };
  }

  return cards;
}

/**
 * Normalizes ESPN's news payload into what a card renders.
 *
 * Kept deliberately small: a headline, when it was published, and the source.
 * The full body is often several paragraphs of wire copy, which is not what a
 * hover card is for.
 */
export function normalizeNews(raw, { perPlayer = 3 } = {}) {
  const byPlayer = {};

  for (const feed of Array.isArray(raw) ? raw : []) {
    const id = feed?.playerId;
    if (!id) continue;

    const items = (feed.items ?? [])
      .map((item) => ({
        headline: item?.headline ?? item?.caption ?? null,
        published: item?.published ?? item?.lastModified ?? null,
        source: item?.source ?? null,
      }))
      .filter((item) => item.headline)
      // Newest first. An item with no timestamp sorts last rather than being
      // dropped — undated news is still news, it just cannot claim recency.
      .sort((a, b) => {
        if (!a.published) return 1;
        if (!b.published) return -1;
        return new Date(b.published) - new Date(a.published);
      })
      .slice(0, perPlayer);

    if (items.length) byPlayer[id] = items;
  }

  return byPlayer;
}
```

### `scripts/lib/money.mjs`

*235 lines*

```javascript
/**
 * The money ledger.
 *
 * ESPN has no idea this exists — it is entirely driven by config/money.json.
 * The goal is that at any moment you can answer, without arguing: how much is
 * in the pot, who still owes, what each place pays, and what has been paid out.
 */

const round2 = (n) => Number((n ?? 0).toFixed(2));

/**
 * Divides one pot across N weeks so the parts add back up to the whole.
 *
 * Done in whole cents with the leftover handed to the earliest weeks. The
 * obvious `pot / weeks` rounded per week drifts — $195 over 13 weeks is fine,
 * but $200 over 13 is $15.38 a week, which is $199.94, and a ledger that
 * cannot account for six cents is a ledger nobody trusts with the other $500.
 *
 * Exported because the public site needs these amounts and the private ledger
 * needs them too. Two implementations would eventually disagree, and the week
 * they disagreed would be the week somebody got paid the wrong number.
 */
export function splitPot(pot, weeks) {
  const amount = Number(pot) || 0;
  if (!Array.isArray(weeks) || !weeks.length || amount <= 0) return [];

  const cents = Math.round(amount * 100);
  const base = Math.floor(cents / weeks.length);
  let extra = cents - base * weeks.length;

  return weeks.map((week) => {
    const share = base + (extra > 0 ? 1 : 0);
    if (extra > 0) extra -= 1;
    return { week, amount: round2(share / 100) };
  });
}

/**
 * What each payout slot is worth, given the size of the pot.
 *
 * A slot can be defined three ways, so the config can say what the league
 * actually agreed rather than being forced into one shape:
 *
 *   amount: 350      a fixed sum, unchanged if the pot moves
 *   pct: 25          a share of the pot, rebalances automatically
 *   remainder: true  whatever is left after the others
 *
 * Fixed amounts are what people actually announce ("winner gets 350"), while a
 * remainder slot means the challenge pot absorbs any drift rather than the
 * numbers silently failing to add up.
 *
 * Computed off the full expected pot, never off what has been collected so far
 * — otherwise every prize would move each time somebody paid.
 *
 * Exported because the published site needs the payout amounts (the league has
 * to know what this week's challenge is worth) while the ledger around them
 * stays private. One function, so the public number and the private one can
 * never disagree.
 */
export function computePayouts(moneyConfig, expectedPot) {
  const structure = moneyConfig.payouts?.structure ?? [];

  const fixedTotal = structure.reduce((a, s) => a + (Number(s.amount) || 0), 0);
  const pctTotal = structure.reduce((a, s) => a + (Number(s.pct) || 0), 0);
  const pctAmount = round2((expectedPot * pctTotal) / 100);

  const remainderSlots = structure.filter((s) => s.remainder);
  const leftOver = round2(expectedPot - fixedTotal - pctAmount);
  const perRemainder = remainderSlots.length ? round2(leftOver / remainderSlots.length) : 0;

  const payouts = structure.map((slot) => {
    let amount;
    if (slot.remainder) amount = perRemainder;
    else if (slot.amount !== undefined) amount = round2(Number(slot.amount) || 0);
    else amount = round2((expectedPot * (Number(slot.pct) || 0)) / 100);

    return {
      id: slot.id,
      label: slot.label,
      note: slot.note ?? null,
      isRemainder: Boolean(slot.remainder),
      // Share of the pot, whichever way the slot was defined — so the UI can
      // always show a percentage even for fixed amounts.
      pct: expectedPot ? Number(((amount / expectedPot) * 100).toFixed(1)) : 0,
      amount,
    };
  });

  return { payouts, structure, fixedTotal, pctAmount, remainderSlots, leftOver };
}

/** Which payout slot funds the weekly challenges, by id. */
export const CHALLENGE_SLOT_ID = 'challenges';

/** The dollar value of the challenge slot, from an already-computed payout list. */
export const challengePayout = (payouts, moneyConfig = {}) =>
  payouts.find((p) => p.id === (moneyConfig.weeklyChallenge?.payoutId ?? CHALLENGE_SLOT_ID))?.amount ?? 0;

export function computeLedger(moneyConfig, season, standings, { challengeWeeks = [] } = {}) {
  const buyIn = Number(moneyConfig.buyIn) || 0;
  const currency = moneyConfig.currency ?? 'USD';

  const paymentByTeam = new Map(
    (moneyConfig.payments ?? []).map((p) => [p.teamId, p])
  );
  const teamById = new Map(season.teams.map((t) => [t.id, t]));

  /**
   * Who is in the pot.
   *
   * Deriving this from claimed ESPN teams alone breaks whenever real life runs
   * ahead of the league settings — people commit and pay before they click the
   * invite link, and until they do every team but the commissioner's looks like
   * an empty placeholder. So the roster of payers comes from `members` in
   * config when it is present, and falls back to claimed teams otherwise.
   * Names come from ESPN once a team is actually claimed.
   */
  const configured = moneyConfig.members ?? null;
  const roster = configured
    ? configured.map((m) => ({
        teamId: m.teamId ?? null,
        name: m.name,
        team: m.teamId ? teamById.get(m.teamId) : null,
      }))
    : season.teams
        .filter((t) => !t.isPlaceholder)
        .map((t) => ({ teamId: t.id, name: t.managerName, team: t }));

  const expectedTeams = roster.length || season.league.size;

  const members = roster.map((entry) => {
    const payment = entry.teamId !== null ? paymentByTeam.get(entry.teamId) : null;
    // A configured member can carry its own paid flag, for people who have
    // handed over money before claiming a team.
    const source = payment ?? configured?.find((m) => m.name === entry.name) ?? null;
    const amountPaid = Number(source?.amountPaid ?? (source?.paid ? buyIn : 0)) || 0;

    return {
      teamId: entry.teamId,
      teamName: entry.team?.name ?? '—',
      managerName: entry.team?.managerName ?? entry.name ?? '—',
      owes: buyIn,
      amountPaid: round2(amountPaid),
      balance: round2(buyIn - amountPaid),
      paid: amountPaid >= buyIn && buyIn > 0,
      partial: amountPaid > 0 && amountPaid < buyIn,
      paidDate: source?.paidDate ?? null,
      method: source?.method ?? null,
      note: source?.note ?? null,
      // Paid up but hasn't joined the ESPN league yet — worth chasing.
      awaitingTeam: entry.team == null,
    };
  });

  const collected = round2(members.reduce((a, m) => a + m.amountPaid, 0));
  const expectedPot = round2(buyIn * expectedTeams);
  const outstanding = round2(expectedPot - collected);

  // ---- Payout structure ---------------------------------------------------
  const { payouts, structure, fixedTotal, pctAmount, remainderSlots, leftOver } =
    computePayouts(moneyConfig, expectedPot);

  // ---- Who currently occupies each paying place --------------------------
  const placeOrder = ['first', 'second', 'third'];
  const projected = payouts.map((slot) => {
    const placeIndex = placeOrder.indexOf(slot.id);
    if (placeIndex === -1) return { ...slot, teamId: null, teamName: null, projected: false };
    const standing = standings?.[placeIndex];
    return {
      ...slot,
      teamId: standing?.teamId ?? null,
      teamName: standing?.teamName ?? null,
      managerName: standing?.managerName ?? null,
      projected: true,
    };
  });

  // ---- The weekly challenge pot ------------------------------------------
  // One payout slot funds every weekly challenge; `challengeWeeks` says which
  // weeks are drawing from it. The site computes the same split from the same
  // slot — see splitPot above for why that is one function and not two.
  const challengePot = challengePayout(payouts, moneyConfig);
  const perWeek = splitPot(challengePot, challengeWeeks);

  const paidOut = (moneyConfig.payoutsPaid ?? []).map((p) => ({
    ...p,
    amount: round2(Number(p.amount) || 0),
  }));
  const totalPaidOut = round2(paidOut.reduce((a, p) => a + p.amount, 0));

  const warnings = [];
  if (buyIn <= 0) {
    warnings.push('No buy-in amount set — edit config/money.json to enable the ledger.');
  }

  // A remainder slot absorbs any slack, so percentages only need to total 100
  // when nothing is picking up the difference.
  const allocated = round2(payouts.reduce((a, p) => a + p.amount, 0));
  if (structure.length && !remainderSlots.length && Math.abs(allocated - expectedPot) > 0.01) {
    warnings.push(
      `Payouts total ${allocated} but the pot is ${expectedPot}. ` +
        'Adjust the amounts, or mark one slot "remainder": true to absorb the difference.'
    );
  }
  if (leftOver < 0) {
    warnings.push(
      `Fixed payouts total ${round2(fixedTotal + pctAmount)}, which is more than the ` +
        `${expectedPot} pot. Something has to give.`
    );
  }
  if (collected > expectedPot) {
    warnings.push('More money collected than expected — check for a duplicate payment entry.');
  }

  return {
    currency,
    buyIn,
    buyInDueDate: moneyConfig.buyInDueDate ?? null,
    expectedTeams,
    expectedPot,
    collected,
    outstanding,
    collectionPct: expectedPot ? Number(((collected / expectedPot) * 100).toFixed(1)) : 0,
    members,
    unpaid: members.filter((m) => !m.paid),
    payouts: projected,
    challengePot: round2(challengePot),
    challengePerWeek: perWeek,
    paidOut,
    totalPaidOut,
    remainingToPay: round2(expectedPot - totalPaidOut),
    warnings,
  };
}
```

## Pipeline scripts

The commands you actually run. fetch -> build -> serve, plus the automation and diagnostics.

### `scripts/check.mjs`

*155 lines*

```javascript
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
```

### `scripts/fetch.mjs`

*312 lines*

```javascript
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
```

### `scripts/build.mjs`

*584 lines*

```javascript
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
```

### `scripts/serve.mjs`

*109 lines*

```javascript
/**
 * Minimal static server for local preview.
 *
 * Needed because the site fetches its JSON, and browsers block fetch() from
 * file:// URLs. Serves docs/ exactly as GitHub Pages will.
 *
 *   node scripts/serve.mjs
 *   node scripts/serve.mjs --port 8080
 */

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { projectRoot } from './lib/espn.mjs';

const ROOT = path.join(projectRoot(), 'docs');
const args = process.argv.slice(2);
const portFlag = args.indexOf('--port');
const PORT = portFlag >= 0 ? Number(args[portFlag + 1]) : 4173;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
};

/**
 * Applies docs/_headers so local preview matches what Cloudflare will send.
 *
 * Without this, a Content-Security-Policy mistake only shows up after deploy,
 * on a site your league is already looking at. Supports the subset of the
 * _headers format this project uses: a path pattern line, then indented
 * "Name: value" lines, with `*` as a trailing wildcard.
 */
async function loadHeaderRules() {
  const file = path.join(ROOT, '_headers');
  const text = await readFile(file, 'utf8').catch(() => null);
  if (!text) return [];

  const rules = [];
  let current = null;
  for (const rawLine of text.split(/\r?\n/)) {
    if (!rawLine.trim() || rawLine.trimStart().startsWith('#')) continue;
    if (!/^\s/.test(rawLine)) {
      current = { pattern: rawLine.trim(), headers: {} };
      rules.push(current);
      continue;
    }
    if (!current) continue;
    const idx = rawLine.indexOf(':');
    if (idx === -1) continue;
    current.headers[rawLine.slice(0, idx).trim()] = rawLine.slice(idx + 1).trim();
  }
  return rules;
}

const matches = (pattern, pathname) =>
  pattern.endsWith('*')
    ? pathname.startsWith(pattern.slice(0, -1))
    : pathname === pattern;

const headerRules = await loadHeaderRules();

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    let filePath = path.join(ROOT, decodeURIComponent(url.pathname));

    // Never serve outside docs/.
    if (!filePath.startsWith(ROOT)) {
      res.writeHead(403).end('Forbidden');
      return;
    }

    let info = await stat(filePath).catch(() => null);
    if (info?.isDirectory()) {
      filePath = path.join(filePath, 'index.html');
      info = await stat(filePath).catch(() => null);
    }
    if (!info) {
      res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
      return;
    }

    const body = await readFile(filePath);
    const headers = {
      'Content-Type': TYPES[path.extname(filePath)] ?? 'application/octet-stream',
      'Cache-Control': 'no-cache',
    };
    for (const rule of headerRules) {
      if (matches(rule.pattern, url.pathname)) Object.assign(headers, rule.headers);
    }
    res.writeHead(200, headers);
    res.end(body);
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'text/plain' }).end(`Server error: ${error.message}`);
  }
});

server.listen(PORT, () => {
  console.log(`\nFantasy Football Hub running at:\n  http://localhost:${PORT}\n`);
  console.log('Press Ctrl+C to stop.\n');
});
```

### `scripts/ship.mjs`

*99 lines*

```javascript
/**
 * The whole weekly routine, in one command: fetch, build, commit, push.
 *
 *   npm run ship
 *   npm run ship -- "custom commit message"
 *
 * Exists mainly so the update flow is one thing to remember rather than four,
 * and so it works identically in PowerShell, cmd, and bash — Windows
 * PowerShell 5.1 does not support `&&`, which makes the usual chained
 * one-liner a syntax error there.
 */

import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { projectRoot } from './lib/espn.mjs';

const ROOT = projectRoot();
const customMessage = process.argv.slice(2).join(' ').trim();

/** Runs a command, streaming output. Returns the exit code. */
function run(command, args, { allowFailure = false } = {}) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.status !== 0 && !allowFailure) {
    console.error(`\n${command} ${args.join(' ')} failed (exit ${result.status}).`);
    process.exit(result.status ?? 1);
  }
  return result.status ?? 1;
}

/** Captures stdout instead of streaming it. */
function capture(command, args) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });
  return (result.stdout ?? '').trim();
}

/** Names the commit after where the season actually is. */
async function describeState() {
  if (customMessage) return customMessage;

  const hubFile = path.join(ROOT, 'docs', 'data', 'hub.json');
  if (!existsSync(hubFile)) return 'Update league data';

  try {
    const hub = JSON.parse(await readFile(hubFile, 'utf8'));
    const weeks = hub.status?.weeksPlayed ?? 0;
    const claimed = (hub.teams ?? []).filter((t) => !t.isPlaceholder).length;
    const size = hub.league?.size ?? 0;

    if (weeks > 0) return `Week ${weeks}`;
    if (hub.status?.phase === 'DRAFTED') return 'Draft results';
    return `Preseason — ${claimed}/${size} managers joined`;
  } catch {
    return 'Update league data';
  }
}

console.log('\n=== 1/4  Fetching from ESPN ===\n');
run(process.execPath, ['scripts/fetch.mjs']);

console.log('\n=== 2/4  Building ===\n');
run(process.execPath, ['scripts/build.mjs']);

console.log('\n=== 3/4  Committing ===\n');
run('git', ['add', '-A']);

// `git diff --cached --quiet` exits 1 when there IS something staged.
const hasChanges = capture('git', ['diff', '--cached', '--name-only']).length > 0;

if (!hasChanges) {
  console.log('Nothing changed since the last run — no commit needed.');
} else {
  const message = await describeState();
  run('git', ['commit', '-m', message]);
  console.log(`\nCommitted: ${message}`);
}

console.log('\n=== 4/4  Pushing ===\n');
const pushStatus = run('git', ['push'], { allowFailure: true });

if (pushStatus !== 0) {
  console.error('\nPush failed. Common causes:');
  console.error('  - Not authenticated: run `git push` once on its own to sign in.');
  console.error('  - No upstream set: run `git push -u origin main` once.');
  console.error('  - Remote has newer commits: run `git pull --rebase` first.');
  process.exit(pushStatus);
}

console.log('\nDone. Cloudflare will redeploy in about a minute.\n');
```

### `scripts/myleagues.mjs`

*64 lines*

```javascript
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
```

### `scripts/fixtures.mjs`

*673 lines*

```javascript
/**
 * Generates a complete, realistic synthetic season in ESPN's exact raw shape.
 *
 * The real league does not draft until Sept 5 2026, so there is no live data to
 * develop or verify against. Rather than ship analytics that first execute for
 * real on draft night, this produces a full 12-team season — draft, weekly box
 * scores, lineup mistakes, trades, waiver moves — that the whole pipeline runs
 * against exactly as if it came from ESPN.
 *
 *   node scripts/fixtures.mjs        -> data/fixtures/2026/
 *   node scripts/build.mjs --fixtures
 *
 * Deterministic: the same seed always produces the same season, so test
 * assertions stay stable.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { projectRoot } from './lib/espn.mjs';

const ROOT = projectRoot();
const OUT = path.join(ROOT, 'data', 'fixtures', '2026');

const SEED = 20260905;
const TEAM_COUNT = 12;
const ROUNDS = 16;
const REGULAR_WEEKS = 14;

/** Deterministic PRNG (mulberry32) so fixtures are reproducible. */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(SEED);

/** Box-Muller, so weekly scores cluster realistically instead of being flat. */
function gaussian(mean, sd) {
  const u = Math.max(rand(), 1e-9);
  const v = Math.max(rand(), 1e-9);
  return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const round2 = (n) => Number(n.toFixed(2));

// ---------------------------------------------------------------------------
// League shell
// ---------------------------------------------------------------------------

const MANAGERS = [
  ['Geordon', 'Roe'], ['Marcus', 'Webb'], ['Tina', 'Alvarez'], ['Dev', 'Patel'],
  ['Sam', 'Okafor'], ['Jules', 'Bianchi'], ['Casey', 'Nakamura'], ['Ray', 'Donnelly'],
  ['Priya', 'Raman'], ['Alex', 'Kowalski'], ['Nia', 'Thompson'], ['Bo', 'Lindqvist'],
];

const TEAM_NAMES = [
  "Geordon's Great Team", 'Gridiron Gremlins', 'Purple Reign', 'Fourth & Long',
  'Hurts So Good', 'The Waiver Wire Warriors', 'Sunday Scaries', 'Pylon Pirates',
  'Check Down Charlie', 'Turf Toe Titans', 'Hail Mary Hooligans', 'Blitz Brigade',
];

const members = MANAGERS.map(([first, last], i) => ({
  id: `{FIXTURE-${String(i + 1).padStart(4, '0')}-0000-0000-000000000000}`,
  displayName: `${first.toLowerCase()}${last.toLowerCase()}`,
  firstName: first,
  lastName: last,
  notificationSettings: [],
}));

// ---------------------------------------------------------------------------
// Player pool
// ---------------------------------------------------------------------------

const FIRST = ['Jalen', 'Travis', 'Amon', 'Bijan', 'Puka', 'Garrett', 'Kyren', 'Rome',
  'Drake', 'Tank', 'Malik', 'Trey', 'Brock', 'Jaxon', 'Zay', 'Rashee', 'Jayden',
  'Chase', 'Deebo', 'Tyreek', 'Davante', 'Saquon', 'Derrick', 'Josh', 'Lamar',
  'Justin', 'Joe', 'Nico', 'Ladd', 'Xavier', 'Brian', 'Cooper', 'DeVon', 'Marvin'];
const LAST = ['Hurts', 'Kelce', 'Brown', 'Robinson', 'Nacua', 'Wilson', 'Williams',
  'Odunze', 'London', 'Dell', 'Nabers', 'McBride', 'Bowers', 'Smith', 'Flowers',
  'Rice', 'Daniels', 'Jones', 'Samuel', 'Hill', 'Adams', 'Barkley', 'Henry',
  'Allen', 'Jackson', 'Jefferson', 'Burrow', 'Collins', 'McConkey', 'Worthy',
  'Thomas', 'Kupp', 'Achane', 'Harrison'];

const PRO_TEAM_IDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18,
  19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 33, 34];

/** defaultPositionId -> how many to generate and how they score. */
const POSITION_PLAN = [
  { posId: 1, pos: 'QB', count: 24, top: 24, floor: 11, sd: 6.5 },
  { posId: 2, pos: 'RB', count: 60, top: 22, floor: 5, sd: 6.0 },
  { posId: 3, pos: 'WR', count: 70, top: 21, floor: 4, sd: 6.5 },
  { posId: 4, pos: 'TE', count: 28, top: 15, floor: 3, sd: 4.5 },
  { posId: 5, pos: 'K', count: 16, top: 10, floor: 6, sd: 3.0 },
  { posId: 16, pos: 'D/ST', count: 16, top: 11, floor: 4, sd: 4.0 },
];

const ELIGIBLE = {
  1: [0, 7, 20, 21],
  2: [2, 3, 23, 7, 20, 21],
  3: [4, 3, 5, 23, 7, 20, 21],
  4: [6, 5, 23, 7, 20, 21],
  5: [17, 20, 21],
  16: [16, 20, 21],
};

const players = [];
let nextPlayerId = 3000000;

for (const plan of POSITION_PLAN) {
  for (let i = 0; i < plan.count; i += 1) {
    // Talent decays down the position so early picks are genuinely better.
    const decay = i / plan.count;
    const talent = plan.top - (plan.top - plan.floor) * decay ** 0.75;
    players.push({
      id: nextPlayerId++,
      fullName:
        plan.pos === 'D/ST'
          ? `${pick(['Ravens', 'Niners', 'Cowboys', 'Jets', 'Bills', 'Browns', 'Steelers', 'Eagles'])} D/ST ${i + 1}`
          : `${pick(FIRST)} ${pick(LAST)}`,
      defaultPositionId: plan.posId,
      proTeamId: pick(PRO_TEAM_IDS),
      eligibleSlots: ELIGIBLE[plan.posId],
      injuryStatus: rand() < 0.08 ? 'QUESTIONABLE' : 'ACTIVE',
      _pos: plan.pos,
      _talent: talent,
      _sd: plan.sd,
      // A few players bust or break out relative to draft cost — this is what
      // makes draft value analysis have anything to find.
      _multiplier: rand() < 0.15 ? 0.55 + rand() * 0.3 : 0.9 + rand() * 0.45,
    });
  }
}

// ---------------------------------------------------------------------------
// Snake draft
// ---------------------------------------------------------------------------

// Managers draft roughly by talent with some reaching, which is what creates
// steals and busts for the draft analyzer to surface.
const draftPool = [...players].sort((a, b) => b._talent - a._talent);
const NEEDS = { QB: 2, RB: 5, WR: 6, TE: 2, K: 1, 'D/ST': 1 };

const rosters = new Map();
for (let t = 1; t <= TEAM_COUNT; t += 1) rosters.set(t, []);

const picks = [];
let overall = 0;

for (let round = 1; round <= ROUNDS; round += 1) {
  const order =
    round % 2 === 1
      ? [...Array(TEAM_COUNT).keys()].map((i) => i + 1)
      : [...Array(TEAM_COUNT).keys()].map((i) => TEAM_COUNT - i);

  for (let i = 0; i < order.length; i += 1) {
    const teamId = order[i];
    overall += 1;
    const roster = rosters.get(teamId);
    const counts = {};
    for (const p of roster) counts[p._pos] = (counts[p._pos] ?? 0) + 1;

    // Prefer positions of need; K and D/ST only late, like real drafts.
    const candidates = draftPool.filter((p) => {
      if (counts[p._pos] >= NEEDS[p._pos]) return false;
      if ((p._pos === 'K' || p._pos === 'D/ST') && round < ROUNDS - 2) return false;
      return true;
    });
    const usable = candidates.length ? candidates : draftPool;

    // Reach up to 6 spots down the board sometimes.
    const reach = Math.floor(rand() ** 2 * 6);
    const chosen = usable[Math.min(reach, usable.length - 1)];

    draftPool.splice(draftPool.indexOf(chosen), 1);
    roster.push(chosen);

    picks.push({
      autoDraftTypeId: rand() < 0.05 ? 1 : 0,
      bidAmount: 0,
      id: overall,
      keeper: false,
      lineupSlotId: 0,
      nominatingTeamId: 0,
      overallPickNumber: overall,
      playerId: chosen.id,
      reservedForKeeper: false,
      roundId: round,
      roundPickNumber: i + 1,
      teamId,
      tradeLocked: false,
    });
  }
}

// ---------------------------------------------------------------------------
// Weekly scoring
// ---------------------------------------------------------------------------

const weeklyPoints = new Map(); // `${playerId}:${week}` -> points

function pointsFor(player, week) {
  const key = `${player.id}:${week}`;
  if (weeklyPoints.has(key)) return weeklyPoints.get(key);

  let pts;
  if (rand() < 0.04) {
    pts = 0; // injured / inactive
  } else {
    pts = Math.max(0, gaussian(player._talent * player._multiplier, player._sd));
  }
  pts = round2(pts);
  weeklyPoints.set(key, pts);
  return pts;
}

const STARTING = [
  { slotId: 0, count: 1 }, { slotId: 2, count: 2 }, { slotId: 4, count: 2 },
  { slotId: 6, count: 1 }, { slotId: 23, count: 1 }, { slotId: 16, count: 1 },
  { slotId: 17, count: 1 },
];
const FLEX_OK = new Set(['RB', 'WR', 'TE']);

/**
 * Sets a lineup the way a person does: mostly right, sometimes wrong. Managers
 * cannot see the week's results, so they pick on a noisy expectation — which is
 * exactly what makes lineup efficiency land below 100% realistically.
 */
function setLineup(roster, week, skill) {
  const expected = new Map(
    roster.map((p) => [p.id, p._talent * p._multiplier + gaussian(0, (1 - skill) * 9)])
  );
  const byExpected = [...roster].sort((a, b) => expected.get(b.id) - expected.get(a.id));

  const used = new Set();
  const assigned = [];
  const take = (test) => {
    const found = byExpected.find((p) => !used.has(p.id) && test(p));
    if (found) used.add(found.id);
    return found;
  };

  for (const slot of STARTING) {
    for (let i = 0; i < slot.count; i += 1) {
      let player;
      if (slot.slotId === 23) player = take((p) => FLEX_OK.has(p._pos));
      else if (slot.slotId === 0) player = take((p) => p._pos === 'QB');
      else if (slot.slotId === 2) player = take((p) => p._pos === 'RB');
      else if (slot.slotId === 4) player = take((p) => p._pos === 'WR');
      else if (slot.slotId === 6) player = take((p) => p._pos === 'TE');
      else if (slot.slotId === 16) player = take((p) => p._pos === 'D/ST');
      else if (slot.slotId === 17) player = take((p) => p._pos === 'K');
      if (player) assigned.push({ player, slotId: slot.slotId });
    }
  }
  for (const p of roster) {
    if (!used.has(p.id)) assigned.push({ player: p, slotId: 20 });
  }
  return assigned;
}

// Each manager has a fixed skill level, so "best manager" is a real signal.
const managerSkill = new Map();
for (let t = 1; t <= TEAM_COUNT; t += 1) managerSkill.set(t, 0.55 + rand() * 0.4);

/** Round-robin schedule. */
function scheduleFor(week) {
  const ids = [...Array(TEAM_COUNT).keys()].map((i) => i + 1);
  const fixed = ids[0];
  const rot = ids.slice(1);
  const shift = (week - 1) % rot.length;
  const rotated = [...rot.slice(shift), ...rot.slice(0, shift)];
  const order = [fixed, ...rotated];

  const games = [];
  for (let i = 0; i < TEAM_COUNT / 2; i += 1) {
    games.push([order[i], order[TEAM_COUNT - 1 - i]]);
  }
  return games;
}

function rosterEntries(teamId, week) {
  const assigned = setLineup(rosters.get(teamId), week, managerSkill.get(teamId));
  return assigned.map(({ player, slotId }) => {
    const actual = pointsFor(player, week);
    return {
      playerId: player.id,
      lineupSlotId: slotId,
      playerPoolEntry: {
        appliedStatTotal: actual,
        player: {
          id: player.id,
          fullName: player.fullName,
          defaultPositionId: player.defaultPositionId,
          proTeamId: player.proTeamId,
          eligibleSlots: player.eligibleSlots,
          injuryStatus: player.injuryStatus,
          stats: [
            { scoringPeriodId: week, statSourceId: 0, statSplitTypeId: 1, appliedTotal: actual },
            {
              scoringPeriodId: week,
              statSourceId: 1,
              statSplitTypeId: 1,
              appliedTotal: round2(Math.max(0, player._talent + gaussian(0, 2))),
            },
          ],
        },
      },
    };
  });
}

// ---------------------------------------------------------------------------
// Emit
// ---------------------------------------------------------------------------

const records = new Map();
for (let t = 1; t <= TEAM_COUNT; t += 1) {
  records.set(t, { wins: 0, losses: 0, ties: 0, pointsFor: 0, pointsAgainst: 0 });
}

const weekFiles = [];
for (let week = 1; week <= REGULAR_WEEKS; week += 1) {
  const schedule = [];
  let matchupId = 0;

  for (const [homeId, awayId] of scheduleFor(week)) {
    matchupId += 1;
    const homeEntries = rosterEntries(homeId, week);
    const awayEntries = rosterEntries(awayId, week);

    const total = (entries) =>
      round2(
        entries
          .filter((e) => e.lineupSlotId !== 20 && e.lineupSlotId !== 21)
          .reduce((a, e) => a + e.playerPoolEntry.appliedStatTotal, 0)
      );

    const homeScore = total(homeEntries);
    const awayScore = total(awayEntries);

    const hr = records.get(homeId);
    const ar = records.get(awayId);
    hr.pointsFor += homeScore;
    hr.pointsAgainst += awayScore;
    ar.pointsFor += awayScore;
    ar.pointsAgainst += homeScore;
    if (homeScore > awayScore) { hr.wins += 1; ar.losses += 1; }
    else if (awayScore > homeScore) { ar.wins += 1; hr.losses += 1; }
    else { hr.ties += 1; ar.ties += 1; }

    schedule.push({
      id: matchupId,
      matchupPeriodId: week,
      playoffTierType: 'NONE',
      winner: homeScore > awayScore ? 'HOME' : awayScore > homeScore ? 'AWAY' : 'TIE',
      home: {
        teamId: homeId,
        totalPoints: homeScore,
        rosterForCurrentScoringPeriod: { entries: homeEntries },
      },
      away: {
        teamId: awayId,
        totalPoints: awayScore,
        rosterForCurrentScoringPeriod: { entries: awayEntries },
      },
    });
  }

  weekFiles.push({ week, data: { scoringPeriodId: week, seasonId: 2026, schedule } });
}

const teams = [];
for (let t = 1; t <= TEAM_COUNT; t += 1) {
  const r = records.get(t);
  teams.push({
    id: t,
    abbrev: TEAM_NAMES[t - 1].split(' ').map((w) => w[0]).join('').slice(0, 4).toUpperCase(),
    name: TEAM_NAMES[t - 1],
    logo: null,
    owners: [members[t - 1].id],
    primaryOwner: members[t - 1].id,
    divisionId: 0,
    playoffSeed: 0,
    record: {
      overall: {
        wins: r.wins,
        losses: r.losses,
        ties: r.ties,
        pointsFor: round2(r.pointsFor),
        pointsAgainst: round2(r.pointsAgainst),
        streakLength: 0,
        streakType: 'NONE',
      },
    },
    transactionCounter: {
      acquisitions: Math.floor(rand() * 25),
      drops: Math.floor(rand() * 25),
      trades: Math.floor(rand() * 4),
    },
    roster: { entries: [] },
  });
}

// A handful of trades, emitted in activity-feed shape.
const tradeTopics = [];
for (let i = 0; i < 6; i += 1) {
  const a = 1 + Math.floor(rand() * TEAM_COUNT);
  let b = 1 + Math.floor(rand() * TEAM_COUNT);
  if (b === a) b = (a % TEAM_COUNT) + 1;
  const aPlayer = pick(rosters.get(a));
  const bPlayer = pick(rosters.get(b));
  tradeTopics.push({
    id: `trade-${i + 1}`,
    date: Date.UTC(2026, 8, 20 + i * 7),
    messages: [
      { messageTypeId: 244, targetId: aPlayer.id, from: a, to: b },
      { messageTypeId: 244, targetId: bPlayer.id, from: b, to: a },
    ],
  });
}

// Waiver / free-agent moves.
const transactions = [];
for (let i = 0; i < 40; i += 1) {
  const teamId = 1 + Math.floor(rand() * TEAM_COUNT);
  const player = pick(players);
  transactions.push({
    id: `tx-${i + 1}`,
    type: rand() < 0.5 ? 'WAIVER' : 'FREEAGENT',
    status: 'EXECUTED',
    teamId,
    scoringPeriodId: 1 + Math.floor(rand() * REGULAR_WEEKS),
    bidAmount: Math.floor(rand() * 30),
    proposedDate: Date.UTC(2026, 8, 10 + i),
    executionDate: Date.UTC(2026, 8, 11 + i),
    items: [{ playerId: player.id, type: 'ADD', fromTeamId: 0, toTeamId: teamId }],
  });
}

const league = {
  id: 274568741,
  seasonId: 2026,
  gameId: 1,
  segmentId: 0,
  scoringPeriodId: REGULAR_WEEKS,
  members,
  teams,
  settings: {
    name: 'Roe Leauge',
    size: TEAM_COUNT,
    draftSettings: { type: 'SNAKE', timePerSelection: 90, auctionBudget: 200, keeperCount: 0,
      draftDate: Date.UTC(2026, 8, 5, 23, 0) },
    scheduleSettings: {
      matchupPeriodCount: REGULAR_WEEKS,
      playoffTeamCount: 6,
      playoffSeedingRule: 'TOTAL_POINTS_SCORED',
      divisions: [{ id: 0, name: 'League Standings', size: TEAM_COUNT }],
    },
    rosterSettings: {
      lineupSlotCounts: { 0: 1, 2: 2, 4: 2, 6: 1, 16: 1, 17: 1, 20: 7, 21: 1, 23: 1 },
    },
    scoringSettings: { scoringType: 'H2H_POINTS', playerRankType: 'PPR' },
  },
  status: {
    isActive: true,
    isFull: true,
    teamsJoined: TEAM_COUNT,
    currentMatchupPeriod: REGULAR_WEEKS,
    firstScoringPeriod: 1,
    finalScoringPeriod: 17,
    latestScoringPeriod: REGULAR_WEEKS,
    previousSeasons: [],
    activatedDate: Date.UTC(2026, 7, 11),
  },
};

async function writeJson(file, data) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(data), 'utf8');
}

await writeJson(path.join(OUT, 'league.json'), league);
await writeJson(path.join(OUT, 'draft.json'), {
  draftDetail: { drafted: true, inProgress: false, picks },
});
await writeJson(
  path.join(OUT, 'players.json'),
  players.map(({ _pos, _talent, _sd, _multiplier, ...p }) => p)
);
await writeJson(path.join(OUT, 'transactions.json'), { transactions });
await writeJson(path.join(OUT, 'activity.json'), { topics: tradeTopics });
for (const { week, data } of weekFiles) {
  await writeJson(path.join(OUT, 'weeks', `${week}.json`), data);
}
// ---------------------------------------------------------------------------
// Current rosters + free agents, for the roster advisor
// ---------------------------------------------------------------------------

// The week being advised on: the first one not yet played.
const ADVICE_WEEK = REGULAR_WEEKS + 1;

/**
 * Deliberately sets some lineups badly so the advisor has something to find.
 * A fixture where every manager is already optimal proves nothing.
 */
function currentRosterEntries(teamId) {
  const roster = rosters.get(teamId);
  const assigned = setLineup(roster, ADVICE_WEEK, managerSkill.get(teamId));

  return assigned.map(({ player, slotId }) => {
    const projected = round2(Math.max(0, player._talent * player._multiplier + gaussian(0, 2.5)));
    return {
      playerId: player.id,
      lineupSlotId: slotId,
      playerPoolEntry: {
        player: {
          id: player.id,
          fullName: player.fullName,
          defaultPositionId: player.defaultPositionId,
          proTeamId: player.proTeamId,
          eligibleSlots: player.eligibleSlots,
          injuryStatus: player.injuryStatus,
          stats: [
            { scoringPeriodId: ADVICE_WEEK, statSourceId: 1, statSplitTypeId: 1, appliedTotal: projected },
          ],
        },
      },
    };
  });
}

await writeJson(path.join(OUT, 'current.json'), {
  adviceWeek: ADVICE_WEEK,
  teams: teams.map((t) => ({ ...t, roster: { entries: currentRosterEntries(t.id) } })),
});

// Everyone who went undrafted is a free agent.
const draftedIds = new Set(picks.map((p) => p.playerId));
await writeJson(path.join(OUT, 'freeagents.json'), {
  adviceWeek: ADVICE_WEEK,
  players: players
    .filter((p) => !draftedIds.has(p.id))
    .map((p) => ({
      id: p.id,
      onTeamId: 0,
      status: 'FREEAGENT',
      player: {
        id: p.id,
        fullName: p.fullName,
        defaultPositionId: p.defaultPositionId,
        proTeamId: p.proTeamId,
        eligibleSlots: p.eligibleSlots,
        injuryStatus: p.injuryStatus,
        ownership: { percentOwned: round2(rand() * 40) },
        stats: [
          {
            scoringPeriodId: ADVICE_WEEK,
            statSourceId: 1,
            statSplitTypeId: 1,
            appliedTotal: round2(Math.max(0, p._talent * p._multiplier + gaussian(0, 2.5))),
          },
        ],
      },
    })),
});

// ---------------------------------------------------------------------------
// Draft pool, in kona_player_info shape, so the big board builds end to end
// ---------------------------------------------------------------------------

/**
 * A plausible prior-season stat breakdown, keyed by the real ESPN stat ids.
 *
 * The hover cards read this breakdown, not the fantasy-point total, so without
 * it a fixtures build exercises the card index but never the stat line. Scaled
 * off the same talent number that drives everything else here, so a good player
 * gets good peripherals and the whole thing stays deterministic under the seed.
 */
function priorSeasonStats(pos, points) {
  const n = (x) => Math.max(0, Math.round(x));
  switch (pos) {
    case 'QB':
      return { 3: n(points * 13), 4: n(points * 0.09), 20: n(points * 0.035),
               24: n(points * 1.2), 25: n(points * 0.012) };
    case 'RB':
      return { 23: n(points * 0.75), 24: n(points * 4.2), 25: n(points * 0.04),
               41: n(points * 0.17), 42: n(points * 1.5), 43: n(points * 0.012) };
    case 'WR':
      return { 58: n(points * 0.5), 41: n(points * 0.33), 42: n(points * 4.6),
               43: n(points * 0.035) };
    case 'TE':
      return { 58: n(points * 0.45), 41: n(points * 0.32), 42: n(points * 3.7),
               43: n(points * 0.03) };
    case 'K':
      return { 80: n(points * 0.12), 77: n(points * 0.07), 74: n(points * 0.03),
               85: n(points * 0.03), 86: n(points * 0.25) };
    case 'D/ST':
      return { 97: n(points * 0.35), 95: n(points * 0.12), 96: n(points * 0.08),
               89: n(340 - points * 0.4), 127: n(6000 - points * 3) };
    default:
      return {};
  }
}

// Ranked by talent, with ADP deliberately offset from true value so the value
// grades have something real to find — a board where cost already equals value
// would grade every player B- and prove nothing.
const poolRanked = [...players].sort((a, b) => b._talent * b._multiplier - a._talent * a._multiplier);

await writeJson(path.join(OUT, 'draftpool.json'), {
  rankType: 'SUPERFLEX',
  players: poolRanked.slice(0, 400).map((p, i) => {
    const seasonProjection = round2(p._talent * p._multiplier * REGULAR_WEEKS);
    const priorPoints = round2(seasonProjection * (0.8 + rand() * 0.4));
    // Push QBs later in ADP than their value warrants, mirroring how real ADP
    // is collected from mostly-standard leagues.
    const adpBias = p._pos === 'QB' ? 45 : p._pos === 'K' || p._pos === 'D/ST' ? 60 : -8;
    return {
      id: p.id,
      onTeamId: 0,
      player: {
        id: p.id,
        fullName: p.fullName,
        defaultPositionId: p.defaultPositionId,
        proTeamId: p.proTeamId,
        eligibleSlots: p.eligibleSlots,
        injuryStatus: p.injuryStatus,
        draftRanksByRankType: {
          SUPERFLEX: { rank: i + 1, auctionValue: Math.max(1, Math.round(60 - i * 0.3)) },
          PPR: { rank: i + 1, auctionValue: Math.max(1, Math.round(60 - i * 0.3)) },
        },
        ownership: {
          averageDraftPosition: Math.max(1, round2(i + 1 + adpBias + gaussian(0, 6))),
          percentOwned: round2(Math.max(0, 100 - i * 0.4)),
        },
        stats: [
          { seasonId: 2026, scoringPeriodId: 0, statSourceId: 1, statSplitTypeId: 0, appliedTotal: seasonProjection },
          {
            seasonId: 2025,
            scoringPeriodId: 0,
            statSourceId: 0,
            statSplitTypeId: 0,
            appliedTotal: priorPoints,
            stats: priorSeasonStats(p._pos, priorPoints),
          },
        ],
      },
    };
  }),
});

await writeJson(path.join(OUT, 'meta.json'), {
  season: 2026,
  fetchedAt: new Date().toISOString(),
  synthetic: true,
  seed: SEED,
  finalScoringPeriod: 17,
  lastPlayedWeek: REGULAR_WEEKS,
  isComplete: false,
  teamCount: TEAM_COUNT,
});

console.log(`Fixtures written to ${path.relative(ROOT, OUT)}`);
console.log(`  ${TEAM_COUNT} teams, ${picks.length} draft picks, ${REGULAR_WEEKS} weeks`);
console.log(`  ${players.length} players, ${tradeTopics.length} trades, ${transactions.length} transactions`);
console.log(`  seed ${SEED} (deterministic)`);
console.log('\nNext: node scripts/build.mjs --fixtures');
```

## Site

Dependency-free front end. Reads pre-computed JSON from docs/data/ and renders it.

### `docs/index.html`

*168 lines*

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Roe Leauge — Fantasy Football Hub</title>
  <meta name="description" content="League stats, draft analysis, trades, side prizes, and the money ledger for Roe Leauge.">
  <meta name="color-scheme" content="dark light">
  <link rel="stylesheet" href="assets/style.css">
  <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🏈</text></svg>">
</head>
<body>
  <a class="skip-link" href="#main">Skip to main content</a>

  <header class="site-header">
    <div class="wrap">
      <div class="site-header__top">
        <h1 class="site-title">
          <span class="site-title__mark" aria-hidden="true">🏈</span>
          <span class="site-title__text">
            <span id="league-name">Fantasy Football Hub</span>
            <small id="league-sub">Loading league…</small>
          </span>
        </h1>
        <button type="button" class="theme-toggle" id="theme-toggle" aria-pressed="false">
          Switch to light theme
        </button>
      </div>

      <nav class="site-nav" aria-label="Sections">
        <ul>
          <li><a href="#overview" data-view="overview">Overview</a></li>
          <li><a href="#standings" data-view="standings">Standings</a></li>
          <li><a href="#teams" data-view="teams">Teams</a></li>
          <li data-nav="myteam" hidden><a href="#team" data-view="team">My Team</a></li>
          <li><a href="#draft" data-view="draft">Draft</a></li>
          <li data-nav="board" hidden><a href="#board" data-view="board">Big Board</a></li>
          <li data-nav="mock" hidden><a href="#mock" data-view="mock">Mock Draft</a></li>
          <li><a href="#trades" data-view="trades">Trades</a></li>
          <li><a href="#challenges" data-view="challenges">Challenges</a></li>
          <li><a href="#prizes" data-view="prizes">Prizes</a></li>
          <li data-nav="money" hidden><a href="#money" data-view="money">Money</a></li>
        </ul>
      </nav>
    </div>
  </header>

  <!-- Route changes are announced here for screen reader users. -->
  <p class="visually-hidden" role="status" aria-live="polite" id="route-status"></p>

  <main id="main" tabindex="-1">
    <div class="wrap">
      <div id="boot" class="loading">Loading league data…</div>

      <section class="view" id="view-overview" hidden aria-labelledby="h-overview">
        <h2 id="h-overview">Overview</h2>
        <div id="overview-body"></div>
      </section>

      <section class="view" id="view-standings" hidden aria-labelledby="h-standings">
        <h2 id="h-standings">Standings</h2>
        <p class="view__intro">
          Ordered by record, then total points scored — the same tiebreak ESPN uses for this league.
          <strong>Luck</strong> is wins above or below what the scores alone deserved.
          <strong>Efficiency</strong> is how much of each roster's possible points actually got started.
        </p>
        <div id="standings-body"></div>
      </section>

      <section class="view" id="view-teams" hidden aria-labelledby="h-teams">
        <h2 id="h-teams">Teams</h2>
        <p class="view__intro">Every manager, with the numbers that separate good teams from lucky ones.</p>
        <div id="teams-body"></div>
      </section>

      <section class="view" id="view-team" hidden aria-labelledby="h-team">
        <h2 id="h-team">My Team</h2>
        <div id="team-body"></div>
      </section>

      <section class="view" id="view-draft" hidden aria-labelledby="h-draft">
        <h2 id="h-draft">Draft</h2>
        <p class="view__intro">
          Pick value is measured inside the draft itself: every drafted player is ranked by the points
          they actually scored, then compared to where they were taken. Positive value means the player
          outperformed the cost of the pick.
        </p>
        <div id="draft-body"></div>
      </section>

      <section class="view" id="view-board" hidden aria-labelledby="h-board">
        <h2 id="h-board">Big Board</h2>
        <p class="view__intro">
          The top 250 players, ranked by value over <strong>replacement level</strong> — the
          worst player at each position you'd still start in this league. Raw projections can't
          be compared across positions; 300 points is elite for a tight end and ordinary for a
          quarterback.
          <strong>Grades compare a player only to others at his own position</strong>, so an A
          means "good value for a quarterback", not "quarterbacks are good value". The
          league-wide positional story is told once, below.
        </p>
        <div id="board-body"></div>
      </section>

      <section class="view" id="view-mock" hidden aria-labelledby="h-mock">
        <h2 id="h-mock">Mock Draft</h2>
        <p class="view__intro">
          Practise this league's exact format — 12 teams, 16 rounds, snake, and
          <strong>superflex</strong>. The board uses ESPN's superflex rankings, where
          quarterbacks are worth far more than in a standard league. Nothing here is saved.
        </p>
        <div id="mock-body"></div>
      </section>

      <section class="view" id="view-trades" hidden aria-labelledby="h-trades">
        <h2 id="h-trades">Trades &amp; Transactions</h2>
        <p class="view__intro">Every completed trade, plus waiver and free-agent activity.</p>
        <div id="trades-body"></div>
      </section>

      <section class="view" id="view-challenges" hidden aria-labelledby="h-challenges">
        <h2 id="h-challenges">Weekly Challenges</h2>
        <p class="view__intro">
          One challenge is drawn at random for each week of the regular season, and it pays
          cash. The draw is <strong>seeded and dealt once</strong> — no challenge repeats, and
          none of them can change after the games are played. Future weeks stay sealed until
          the week they are played, so there is something to find out every Sunday even if
          your season is over.
        </p>
        <div id="challenges-body"></div>
      </section>

      <section class="view" id="view-prizes" hidden aria-labelledby="h-prizes">
        <h2 id="h-prizes">Side Prizes</h2>
        <p class="view__intro">
          Season awards computed from the box scores. These update every time the data is refreshed.
        </p>
        <div id="prizes-body"></div>
      </section>

      <section class="view" id="view-money" hidden aria-labelledby="h-money">
        <h2 id="h-money">Money</h2>
        <p class="view__intro">
          Buy-ins, who has paid, and what each place pays out. Edit
          <code>config/money.json</code> to change any of it.
        </p>
        <div id="money-body"></div>
      </section>
    </div>
  </main>

  <footer class="site-footer">
    <div class="wrap">
      <p>
        Data from ESPN, refreshed manually. Last built:
        <time id="generated-at">—</time>.
      </p>
      <p id="fixture-warning" hidden>
        <strong class="pill pill--warn">Sample data</strong>
        This is synthetic test data, not your real league.
      </p>
    </div>
  </footer>

  <script src="assets/app.js" type="module"></script>
</body>
</html>
```

### `docs/assets/style.css`

*577 lines*

```css
/* ==========================================================================
   Fantasy Football Hub

   Accessibility is a hard requirement, not a polish pass:
   - every colour pair clears WCAG 2.2 AA (4.5:1 body, 3:1 large/UI)
   - nothing is communicated by colour alone; status always carries text
   - focus is always visible and never removed
   - honours prefers-reduced-motion and prefers-contrast
   - survives 200% zoom and 320px viewports with no horizontal scroll

   Chart marks follow the data-viz spec: single sequential hue for magnitude
   (never one colour per team — 12 teams exceeds any CVD-safe categorical set,
   and identity isn't the job), bars capped at 24px with a 4px rounded data-end
   squared at the baseline, and text in ink tokens rather than the data colour.
   ========================================================================== */

/* --- Tokens -------------------------------------------------------------- */
:root {
  color-scheme: light dark;

  --bg: #0d1014;
  --bg-raised: #171c22;
  --bg-sunken: #0a0d10;
  --bg-hover: #1e242c;
  --border: #2b333d;
  --border-strong: #3d4753;

  --text: #e8edf2;
  --text-muted: #a8b3bf;
  --text-dim: #7d8894;

  /* Validated ≥3:1 against --bg-raised. */
  --accent: #3987e5;
  --accent-bright: #5b9dee;
  --accent-text: #ffffff;
  --accent-wash: rgba(57, 135, 229, 0.14);
  --accent-track: rgba(57, 135, 229, 0.16);

  --good: #4ade80;
  --good-dim: #12301f;
  --bad: #f87171;
  --bad-dim: #351a1a;
  --warn: #fbbf24;
  --warn-dim: #33280f;

  --radius: 12px;
  --radius-sm: 7px;
  --gap: 1rem;
  --maxw: 1180px;

  --font: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  --mono: ui-monospace, SFMono-Regular, "SF Mono", Consolas, monospace;

  --shadow: 0 1px 2px rgba(0, 0, 0, 0.3), 0 4px 16px rgba(0, 0, 0, 0.18);
}

@media (prefers-color-scheme: light) {
  :root:not([data-theme="dark"]) {
    --bg: #f4f6f8;
    --bg-raised: #ffffff;
    --bg-sunken: #eaeef2;
    --bg-hover: #f0f4f8;
    --border: #d8dee5;
    --border-strong: #b6c0ca;

    --text: #10171e;
    --text-muted: #4a555f;
    --text-dim: #667079;

    --accent: #2a78d6;
    --accent-bright: #1c5cab;
    --accent-text: #ffffff;
    --accent-wash: rgba(42, 120, 214, 0.1);
    --accent-track: rgba(42, 120, 214, 0.14);

    --good: #106b33;
    --good-dim: #ddf5e5;
    --bad: #b32020;
    --bad-dim: #fce4e4;
    --warn: #8a5a00;
    --warn-dim: #fdf1d6;

    --shadow: 0 1px 2px rgba(16, 23, 30, 0.06), 0 4px 16px rgba(16, 23, 30, 0.06);
  }
}

:root[data-theme="light"] {
  --bg: #f4f6f8;
  --bg-raised: #ffffff;
  --bg-sunken: #eaeef2;
  --bg-hover: #f0f4f8;
  --border: #d8dee5;
  --border-strong: #b6c0ca;
  --text: #10171e;
  --text-muted: #4a555f;
  --text-dim: #667079;
  --accent: #2a78d6;
  --accent-bright: #1c5cab;
  --accent-text: #ffffff;
  --accent-wash: rgba(42, 120, 214, 0.1);
  --accent-track: rgba(42, 120, 214, 0.14);
  --good: #106b33;
  --good-dim: #ddf5e5;
  --bad: #b32020;
  --bad-dim: #fce4e4;
  --warn: #8a5a00;
  --warn-dim: #fdf1d6;
  --shadow: 0 1px 2px rgba(16, 23, 30, 0.06), 0 4px 16px rgba(16, 23, 30, 0.06);
}

@media (prefers-contrast: more) {
  :root { --border: #6b7784; --text-muted: #d4dbe2; }
}

/* --- Reset --------------------------------------------------------------- */
*, *::before, *::after { box-sizing: border-box; }

body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font-family: var(--font);
  font-size: 16px;
  line-height: 1.55;
  -webkit-text-size-adjust: 100%;
  -webkit-font-smoothing: antialiased;
}

h1, h2, h3, h4 { line-height: 1.2; margin: 0 0 0.5em; font-weight: 680; letter-spacing: -0.011em; }
h1 { font-size: clamp(1.4rem, 3.5vw, 1.85rem); }
h2 { font-size: clamp(1.25rem, 3vw, 1.6rem); }
h3 { font-size: 1.05rem; }
p { margin: 0 0 0.75em; }

a { color: var(--accent); text-underline-offset: 2px; }
a:hover { text-decoration-thickness: 2px; }

:focus-visible { outline: 3px solid var(--accent); outline-offset: 2px; border-radius: 4px; }

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}

/* --- Utilities ----------------------------------------------------------- */
.visually-hidden {
  position: absolute; width: 1px; height: 1px;
  padding: 0; margin: -1px; overflow: hidden;
  clip: rect(0 0 0 0); white-space: nowrap; border: 0;
}

.skip-link {
  position: absolute; left: 0.5rem; top: -100%; z-index: 100;
  background: var(--accent); color: var(--accent-text);
  padding: 0.6rem 1rem; border-radius: 0 0 var(--radius-sm) var(--radius-sm);
  font-weight: 600; text-decoration: none;
}
.skip-link:focus { top: 0; }

.wrap { max-width: var(--maxw); margin: 0 auto; padding: 0 1rem; }

/* --- Header -------------------------------------------------------------- */
.site-header {
  border-bottom: 1px solid var(--border);
  background: linear-gradient(180deg, var(--bg-raised), var(--bg));
  padding: 1.1rem 0 0;
}
.site-header__top {
  display: flex; flex-wrap: wrap; align-items: center;
  gap: 0.75rem 1rem; justify-content: space-between;
}
.site-title { margin: 0; display: flex; align-items: center; gap: 0.6rem; }
.site-title__mark {
  display: grid; place-items: center;
  width: 2.1rem; height: 2.1rem; flex: none;
  background: var(--accent); color: var(--accent-text);
  border-radius: 9px; font-size: 1.1rem;
}
.site-title__text { display: block; }
.site-title small {
  display: block; font-size: 0.8rem; font-weight: 450;
  color: var(--text-muted); letter-spacing: 0;
}

.theme-toggle {
  background: var(--bg-sunken); color: var(--text);
  border: 1px solid var(--border); border-radius: var(--radius-sm);
  padding: 0.45rem 0.8rem; font: inherit; font-size: 0.85rem; cursor: pointer;
  transition: border-color 0.15s ease, background 0.15s ease;
}
.theme-toggle:hover { border-color: var(--border-strong); background: var(--bg-hover); }

/* --- Nav ----------------------------------------------------------------- */
.site-nav { margin-top: 0.9rem; }
.site-nav ul {
  display: flex; flex-wrap: wrap; gap: 0.15rem;
  list-style: none; margin: 0; padding: 0;
}
.site-nav a {
  display: block; padding: 0.6rem 0.9rem;
  color: var(--text-muted); text-decoration: none;
  border-bottom: 3px solid transparent;
  font-weight: 560; font-size: 0.95rem; white-space: nowrap;
  transition: color 0.15s ease, background 0.15s ease;
}
.site-nav a:hover { color: var(--text); background: var(--bg-sunken); }
/* aria-current carries the meaning; the underline only reinforces it. */
.site-nav a[aria-current="page"] { color: var(--text); border-bottom-color: var(--accent); }

main { padding: 1.75rem 0 4rem; }
main:focus { outline: none; }
.view[hidden] { display: none; }
.view > h2 { margin-bottom: 0.25rem; }
.view__intro { color: var(--text-muted); margin-bottom: 1.4rem; max-width: 68ch; }

/* --- Hero / countdown ---------------------------------------------------- */
.hero {
  position: relative; overflow: hidden;
  background: linear-gradient(135deg, var(--accent-wash), transparent 60%), var(--bg-raised);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 1.6rem 1.5rem;
  margin-bottom: 1.5rem;
  box-shadow: var(--shadow);
}
.hero__eyebrow {
  font-size: 0.76rem; font-weight: 700; letter-spacing: 0.09em;
  text-transform: uppercase; color: var(--accent); margin: 0 0 0.4rem;
}
.hero h2 { margin: 0 0 0.3rem; font-size: clamp(1.35rem, 3.4vw, 1.8rem); }
.hero__sub { color: var(--text-muted); margin: 0; max-width: 60ch; }

/* Hero figure: >=48px, proportional figures (tabular-nums makes big numbers
   look loose), same sans as everything else. */
.countdown {
  display: flex; flex-wrap: wrap; gap: 0.5rem;
  margin: 1.15rem 0 0; padding: 0; list-style: none;
}
.countdown li {
  min-width: 4.6rem; flex: 0 1 auto;
  background: var(--bg-sunken);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 0.55rem 0.7rem; text-align: center;
}
.countdown__value {
  display: block;
  /* Reaches the 48px hero-figure size on desktop, where this is the lead
     element; scales down on mobile so four units still fit across 375px. */
  font-size: clamp(1.7rem, 5.5vw, 3rem);
  font-weight: 700; line-height: 1.05; color: var(--text);
}
.countdown__unit {
  display: block; font-size: 0.7rem; text-transform: uppercase;
  letter-spacing: 0.07em; color: var(--text-dim); margin-top: 0.15rem;
}

/* --- Stat tiles ---------------------------------------------------------- */
.stats {
  display: grid; gap: 0.75rem;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 158px), 1fr));
  margin: 0 0 1.5rem; padding: 0; list-style: none;
}
.stat {
  background: var(--bg-raised); border: 1px solid var(--border);
  border-radius: var(--radius); padding: 0.85rem 1rem;
}
.stat__label {
  display: block; font-size: 0.74rem; text-transform: uppercase;
  letter-spacing: 0.05em; color: var(--text-dim); margin-bottom: 0.2rem;
}
.stat__value { display: block; font-size: 1.55rem; font-weight: 700; line-height: 1.15; }
.stat__note { display: block; font-size: 0.8rem; color: var(--text-muted); margin-top: 0.1rem; }

/* --- Cards --------------------------------------------------------------- */
.card {
  background: var(--bg-raised); border: 1px solid var(--border);
  border-radius: var(--radius); padding: 1.05rem 1.15rem;
}
.card h3 { margin-top: 0; }
.grid {
  display: grid; gap: var(--gap);
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 265px), 1fr));
}

/* --- Tables -------------------------------------------------------------- */
.table-scroll {
  overflow-x: auto;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--bg-raised);
}
table { border-collapse: collapse; width: 100%; font-size: 0.92rem; }
caption {
  text-align: left; padding: 0.9rem 1rem; font-weight: 600;
  color: var(--text-muted); font-size: 0.88rem;
  border-bottom: 1px solid var(--border);
}
th, td {
  padding: 0.6rem 0.75rem; text-align: left;
  border-bottom: 1px solid var(--border); white-space: nowrap;
}
thead th {
  background: var(--bg-sunken); font-size: 0.72rem;
  text-transform: uppercase; letter-spacing: 0.05em;
  color: var(--text-muted); position: sticky; top: 0;
}
tbody tr:last-child td { border-bottom: none; }
tbody tr:hover { background: var(--bg-hover); }
/* Columns of numbers align vertically; standalone figures do not. */
td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
.row-team { font-weight: 620; white-space: normal; min-width: 11rem; }
.row-team small { display: block; font-weight: 400; color: var(--text-dim); font-size: 0.79rem; }
.rank { color: var(--text-dim); font-variant-numeric: tabular-nums; }

/* Playoff cut: a rule AND a text column, never colour alone. */
tr.playoff-cut td, tr.playoff-cut th { border-bottom: 2px solid var(--accent); }

/* --- Magnitude bars ------------------------------------------------------ */
/* Single sequential hue. Square at the baseline, 4px rounded data-end. */
.bar-cell { min-width: 7rem; }
.bar-wrap { display: flex; align-items: center; gap: 0.5rem; }
.bar-track {
  flex: 1; height: 8px; min-width: 3rem;
  background: var(--accent-track);
  border-radius: 2px; overflow: hidden;
}
.bar-fill {
  height: 100%; background: var(--accent);
  border-radius: 0 4px 4px 0;
}
.bar-value {
  font-variant-numeric: tabular-nums; font-size: 0.86rem;
  color: var(--text-muted); min-width: 3.2rem; text-align: right;
}

/* --- Pills --------------------------------------------------------------- */
.pill {
  display: inline-block; padding: 0.1rem 0.5rem; border-radius: 999px;
  font-size: 0.77rem; font-weight: 660; border: 1px solid transparent; white-space: nowrap;
}
.pill--good { background: var(--good-dim); color: var(--good); border-color: var(--good); }
.pill--bad { background: var(--bad-dim); color: var(--bad); border-color: var(--bad); }
.pill--warn { background: var(--warn-dim); color: var(--warn); border-color: var(--warn); }
.pill--neutral { background: var(--bg-sunken); color: var(--text-muted); border-color: var(--border); }
.pill--accent { background: var(--accent-wash); color: var(--accent); border-color: var(--accent); }

/* --- Prize cards --------------------------------------------------------- */
.prize {
  background: var(--bg-raised); border: 1px solid var(--border);
  border-radius: var(--radius); padding: 1rem 1.1rem;
  display: flex; flex-direction: column; gap: 0.3rem;
  transition: border-color 0.15s ease, transform 0.15s ease;
}
.prize:hover { border-color: var(--border-strong); transform: translateY(-2px); }
.prize--pending { opacity: 0.72; }
.prize__label { font-weight: 700; font-size: 1rem; margin: 0; }
.prize__desc { font-size: 0.84rem; color: var(--text-dim); margin: 0; }
.prize__winner {
  font-size: 1.08rem; font-weight: 680; margin: 0.35rem 0 0;
  display: flex; align-items: baseline; gap: 0.4rem; flex-wrap: wrap;
}
.prize__value {
  font-variant-numeric: tabular-nums; color: var(--accent); font-weight: 700;
}
.prize__detail { font-size: 0.86rem; color: var(--text-muted); margin: 0; }

/* --- Avatars -------------------------------------------------------------
   Every picture on this site is hotlinked from ESPN and every one of them can
   fail — no headshot exists for a fringe rookie, a manager never set a logo.
   So a monogram sits underneath, always rendered, and the image is layered on
   top of it. A load covers the monogram; a 404 hides the <img> (app.js) and
   the monogram was already there. Same box either way, so nothing reflows.

   The monogram is decorative, not information: the name is always in the text
   beside it, and every <img> here carries alt="" for exactly that reason. */
.avatar {
  --avatar-size: 30px;
  position: relative; flex: 0 0 auto;
  display: inline-grid; place-items: center;
  inline-size: var(--avatar-size); block-size: var(--avatar-size);
  background: var(--bg-hover); border: 1px solid var(--border);
  overflow: hidden; user-select: none;
}
.avatar--player { border-radius: 50%; }
.avatar--team { border-radius: var(--radius-sm); }
.avatar__initials {
  font-size: calc(var(--avatar-size) * 0.38); font-weight: 700;
  color: var(--text-dim); letter-spacing: 0.02em; line-height: 1;
}
.avatar__img {
  position: absolute; inset: 0;
  inline-size: 100%; block-size: 100%;
  object-fit: cover;
  /* Headshots are cut off at the chin at this size unless biased upward. */
  object-position: top center;
  background: var(--bg-hover);
}
.avatar--team .avatar__img { object-fit: contain; object-position: center; padding: 2px; }

/* Name-with-picture, the shape used in every table cell and card heading. */
.named { display: flex; align-items: center; gap: 0.55rem; min-inline-size: 0; }
.named__text { min-inline-size: 0; }
.named__text small {
  display: block; font-weight: 400; color: var(--text-dim); font-size: 0.79rem;
}
.hero--team { display: flex; flex-direction: column; align-items: flex-start; gap: 0.15rem; }
.hero--team .avatar { margin-bottom: 0.5rem; }
.pick .avatar { margin: 0.3rem 0; }

/* --- Player cards ---------------------------------------------------------
   Opens on hover, on tap, and on keyboard focus — see app.js for why all
   three. Positioned in JS because it has to flip above the trigger near the
   bottom of a phone screen, which CSS alone cannot decide. */
.pcard-trigger {
  font: inherit; color: inherit; background: none; border: 0; padding: 0;
  text-align: left; cursor: pointer;
  text-decoration: underline dotted; text-decoration-color: var(--border-strong);
  text-underline-offset: 3px;
}
.pcard-trigger:hover, .pcard-trigger[aria-expanded="true"] { text-decoration-color: var(--accent); }

.pcard {
  position: absolute; z-index: 50;
  inline-size: min(22rem, calc(100vw - 1.5rem));
  background: var(--bg-raised); border: 1px solid var(--border-strong);
  border-radius: var(--radius); box-shadow: var(--shadow);
  padding: 0.8rem 0.9rem; font-size: 0.85rem;
}
.pcard__name { margin: 0 0 0.15rem; font-weight: 700; font-size: 0.98rem; }
.pcard__meta { font-weight: 400; color: var(--text-dim); font-size: 0.8rem; }
.pcard__injury { margin: 0.35rem 0 0; }
.pcard__heading {
  margin: 0.7rem 0 0.35rem; font-size: 0.72rem; letter-spacing: 0.07em;
  text-transform: uppercase; color: var(--text-dim);
}
.pcard__empty { margin: 0.5rem 0 0; color: var(--text-dim); }

/* Auto-fit rather than a fixed column count: a kicker has five stats and a
   tight end four, and neither should leave a hole in the grid. */
.pcard__stats {
  margin: 0; display: grid; gap: 0.4rem 0.75rem;
  grid-template-columns: repeat(auto-fit, minmax(4.5rem, 1fr));
}
.pcard__stats div { min-inline-size: 0; }
.pcard__stats dt { color: var(--text-dim); font-size: 0.72rem; }
.pcard__stats dd {
  margin: 0; font-weight: 700; font-variant-numeric: tabular-nums; font-size: 0.95rem;
}

.pcard__news { margin: 0; padding: 0; list-style: none; display: grid; gap: 0.45rem; }
.pcard__news li { color: var(--text-muted); line-height: 1.35; }
.pcard__news small { display: block; color: var(--text-dim); font-size: 0.74rem; margin-top: 0.1rem; }

/* --- Weekly challenges ---------------------------------------------------- */
.challenge {
  background: var(--bg-raised); border: 1px solid var(--border);
  border-radius: var(--radius); padding: 1rem 1.1rem;
  display: flex; flex-direction: column; gap: 0.3rem;
}
.challenge__week {
  font-size: 0.72rem; letter-spacing: 0.08em; text-transform: uppercase;
  color: var(--text-dim); margin: 0; font-variant-numeric: tabular-nums;
}
.challenge__label { font-weight: 700; font-size: 1.02rem; margin: 0; }
.challenge__rule { font-size: 0.84rem; color: var(--text-dim); margin: 0; }
.challenge__winner { margin: 0.45rem 0 0; font-weight: 660; }
.challenge__detail { font-size: 0.86rem; color: var(--text-muted); margin: 0; }
.challenge__payout { margin: 0.2rem 0 0; font-weight: 700; color: var(--accent); }

/* State is carried by the label text ("Sealed", "Not played yet") as well as
   by these treatments — the border alone is never the only signal. */
.challenge--live { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent-wash); }
.challenge--sealed { opacity: 0.6; border-style: dashed; }
.challenge--void { opacity: 0.78; }

/* --- Draft board --------------------------------------------------------- */
.draft-round { margin-bottom: 1.35rem; }
.draft-round h3 {
  margin-bottom: 0.55rem; font-size: 0.82rem; color: var(--text-dim);
  text-transform: uppercase; letter-spacing: 0.07em;
}
.draft-picks {
  display: grid; gap: 0.5rem;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 172px), 1fr));
  list-style: none; padding: 0; margin: 0;
}
.pick {
  background: var(--bg-raised); border: 1px solid var(--border);
  border-radius: var(--radius-sm); padding: 0.55rem 0.65rem; font-size: 0.85rem;
}
.pick__num { color: var(--text-dim); font-size: 0.73rem; font-variant-numeric: tabular-nums; }
.pick__player { font-weight: 660; display: block; }
.pick__meta { color: var(--text-muted); font-size: 0.79rem; }

/* --- Timeline ------------------------------------------------------------ */
.timeline { list-style: none; margin: 0; padding: 0; }
.timeline li {
  position: relative; padding: 0 0 1.05rem 1.6rem;
  border-left: 2px solid var(--border);
}
.timeline li:last-child { border-left-color: transparent; padding-bottom: 0; }
.timeline li::before {
  content: ""; position: absolute; left: -6px; top: 0.42rem;
  width: 10px; height: 10px; border-radius: 50%;
  background: var(--bg-raised); border: 2px solid var(--border-strong);
}
.timeline li.is-done::before { background: var(--accent); border-color: var(--accent); }
.timeline li.is-next::before { background: var(--bg-raised); border-color: var(--accent); }
.timeline__title { font-weight: 620; display: block; }
.timeline__meta { font-size: 0.84rem; color: var(--text-muted); }

/* --- Empty states -------------------------------------------------------- */
.empty {
  border: 1px dashed var(--border-strong); border-radius: var(--radius);
  padding: 2.25rem 1.25rem; text-align: center;
  color: var(--text-muted); background: var(--bg-raised);
}
.empty__icon { font-size: 1.9rem; display: block; margin-bottom: 0.5rem; }
.empty h3 { color: var(--text); margin-bottom: 0.35rem; }
.empty p { margin: 0 auto; max-width: 50ch; }

/* --- Progress / meter ---------------------------------------------------- */
/* Track is a lighter step of the fill's own ramp, so state reads across it. */
.progress {
  background: var(--accent-track); border-radius: 999px;
  height: 0.6rem; overflow: hidden; margin: 0.5rem 0;
}
.progress__fill { background: var(--accent); height: 100%; border-radius: 0 4px 4px 0; }

/* --- Footer -------------------------------------------------------------- */
.site-footer {
  border-top: 1px solid var(--border); padding: 1.35rem 0 2.5rem;
  color: var(--text-dim); font-size: 0.85rem;
}

/* --- Loading / error ----------------------------------------------------- */
.loading { padding: 3rem 1rem; text-align: center; color: var(--text-muted); }
.error {
  border: 1px solid var(--bad); background: var(--bad-dim); color: var(--text);
  border-radius: var(--radius); text-align: left; padding: 1rem 1.15rem;
}
.error code {
  font-family: var(--mono); background: var(--bg-sunken);
  padding: 0.1rem 0.35rem; border-radius: 3px; font-size: 0.9em;
}

@media (max-width: 480px) {
  th, td { padding: 0.5rem 0.55rem; }
  .site-nav a { padding: 0.55rem 0.65rem; font-size: 0.9rem; }
  .hero { padding: 1.25rem 1.1rem; }
  .countdown li { min-width: 3.9rem; padding: 0.45rem 0.5rem; }
}

/* --- Sortable column headers --------------------------------------------- */
/* Bare buttons inside a th collapse to the text box, which on a phone lands
   under the 24x24 CSS px WCAG 2.2 target minimum. Padding restores a real
   touch target without changing how the header looks. */
.sort-btn {
  background: none;
  border: 0;
  color: inherit;
  font: inherit;
  text-transform: inherit;
  letter-spacing: inherit;
  cursor: pointer;
  padding: 0.35rem 0.15rem;
  min-height: 24px;
  min-width: 24px;
  white-space: nowrap;
}
.sort-btn:hover { color: var(--text); text-decoration: underline; }
```

### `docs/assets/app.js`

*2439 lines*

```javascript
import { createMockDraft, advanceToUser, makePick, gradeDraft, rosterNeeds } from './mock.js';

/**
 * Fantasy Football Hub — client.
 *
 * Renders pre-computed JSON from docs/data/. No framework, no build step, no
 * network calls to ESPN (the browser cannot reach it — no CORS headers).
 *
 * Design notes:
 *   - Magnitude is drawn with a single sequential hue, never one colour per
 *     team: 12 teams exceeds any CVD-safe categorical set, and the question
 *     these tables answer is "how much", not "which one".
 *   - Every view has a real empty state. The draft is Sept 5 2026, so "nothing
 *     has happened yet" is the normal case for now and should read as
 *     deliberate rather than broken.
 *   - The Money view only exists when its data actually loaded. On the public
 *     site the ledger is never uploaded, so the tab is absent entirely rather
 *     than advertising that something is being withheld.
 */

const ALL_VIEWS = ['overview', 'standings', 'teams', 'team', 'draft', 'board', 'mock', 'trades', 'challenges', 'prizes', 'money'];
let VIEWS = ALL_VIEWS.filter((v) => v !== 'money' && v !== 'mock' && v !== 'board');

const state = { hub: null, season: null, draft: null, money: null, teamDetail: null, draftPool: null, bigBoard: null, playerCards: null };
let countdownTimer = null;

/** Which team the visitor has claimed as theirs, remembered across visits. */
const MY_TEAM_KEY = 'ffh-my-team';
const getMyTeamId = () => {
  const raw = localStorage.getItem(MY_TEAM_KEY);
  return raw === null ? null : Number(raw);
};
const setMyTeamId = (id) => {
  if (id === null) localStorage.removeItem(MY_TEAM_KEY);
  else localStorage.setItem(MY_TEAM_KEY, String(id));
};

// --- Helpers ---------------------------------------------------------------

const $ = (sel) => document.querySelector(sel);

function esc(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const num = (n, digits = 2) =>
  n === null || n === undefined || Number.isNaN(n) ? '—' : Number(n).toFixed(digits);

const money = (amount, currency = 'USD') => {
  if (amount === null || amount === undefined) return '—';
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount);
  } catch {
    return `$${Number(amount).toFixed(2)}`;
  }
};

const signed = (n, digits = 2) => {
  if (n === null || n === undefined) return '—';
  const v = Number(n);
  return `${v > 0 ? '+' : ''}${v.toFixed(digits)}`;
};

/** Sign lives in the text, so colour is never the only channel. */
function deltaPill(value, digits = 2) {
  if (value === null || value === undefined) return '<span class="pill pill--neutral">—</span>';
  const v = Number(value);
  const cls = v > 0.001 ? 'pill--good' : v < -0.001 ? 'pill--bad' : 'pill--neutral';
  return `<span class="pill ${cls}">${esc(signed(v, digits))}</span>`;
}

/**
 * A magnitude bar with its value beside it. The value is always shown as text,
 * so the bar is reinforcement rather than the only way to read the number.
 */
function bar(value, max, { digits = 1, suffix = '' } = {}) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return `
    <div class="bar-wrap">
      <span class="bar-track"><span class="bar-fill" style="width:${pct.toFixed(1)}%"></span></span>
      <span class="bar-value">${esc(num(value, digits))}${esc(suffix)}</span>
    </div>`;
}

/**
 * How many players actually start each week. `startingSlots` lists slot TYPES
 * with a count each, so its length is the number of distinct slots (7), not the
 * number of players you field (9).
 */
const starterCount = (league) =>
  (league.startingSlots ?? []).reduce((total, slot) => total + slot.count, 0);

/** Slot 7 is ESPN's OP slot — QB-eligible, i.e. a superflex league. */
const isSuperflex = (league) =>
  (league.startingSlots ?? []).some((slot) => slot.slotId === 7);

// --- Pictures --------------------------------------------------------------
//
// Headshots and logos are hotlinked from ESPN rather than committed, so every
// one of them can fail: ESPN has no photo for a fringe rookie, a URL shape
// changes, a manager is offline. None of that may leave a broken-image icon
// on the page.
//
// The fallback is a monogram drawn underneath the <img>. If the image loads it
// covers the monogram; if it 404s the handler below hides the <img> and the
// monogram is simply what was already there. No layout shift either way.
//
// The handler is attached once, in the capture phase, because `error` does not
// bubble from <img> — and an inline onerror= attribute would need
// script-src 'unsafe-inline', which is exactly the CSP relaxation this app
// refuses to make.

const ESPN_HEADSHOT = 'https://a.espncdn.com/i/headshots/nfl/players/full';
const ESPN_TEAM_LOGO = 'https://a.espncdn.com/i/teamlogos/nfl/500';

function initImageFallbacks() {
  document.addEventListener(
    'error',
    (event) => {
      const el = event.target;
      if (el instanceof HTMLImageElement && el.classList.contains('avatar__img')) el.hidden = true;
    },
    true
  );
}

/** Up to two letters, so a monogram stays legible at 30px. */
function initials(name) {
  const words = String(name ?? '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

/**
 * The right picture for a roster row.
 *
 * D/ST is the case worth care: a defence has a real playerId, so the headshot
 * URL builds fine and then 404s every time. Defences get their NFL team's
 * shield instead.
 */
function playerImage(player) {
  if (!player) return null;
  if (player.position === 'D/ST') {
    const team = player.proTeam;
    return team && team !== 'FA' ? `${ESPN_TEAM_LOGO}/${String(team).toLowerCase()}.png` : null;
  }
  const id = Number(player.playerId);
  return id > 0 ? `${ESPN_HEADSHOT}/${id}.png` : null;
}

/**
 * An image with a monogram behind it.
 *
 * `variant` only changes the shape: round for faces, square for team logos,
 * which reads better for a badge that is usually not circular to begin with.
 */
function avatar(src, name, { variant = 'player', size = null } = {}) {
  const style = size ? ` style="--avatar-size:${Number(size)}px"` : '';
  return `<span class="avatar avatar--${esc(variant)}"${style}>
    <span class="avatar__initials" aria-hidden="true">${esc(initials(name))}</span>
    ${src ? `<img class="avatar__img" src="${esc(src)}" alt="" loading="lazy" decoding="async">` : ''}
  </span>`;
}

/**
 * A player's picture next to their name — the shape used in every table.
 *
 * When a card exists for this player the name becomes a <button>, which is what
 * makes the card reachable by keyboard and tappable on a phone rather than
 * hover-only. Players with no card stay plain text: a control that opens
 * nothing is worse than no control.
 */
const playerCell = (player, sub = null) => {
  const label = esc(player?.name ?? '—');
  const tail = sub === null ? '' : `<small>${esc(sub)}</small>`;
  const name = hasCard(player?.playerId)
    ? `<button type="button" class="pcard-trigger"
         data-player-id="${esc(player.playerId)}"
         data-player-name="${esc(player.name ?? '')}"
         data-player-pos="${esc(player.position ?? '')}"
         data-player-team="${esc(player.proTeam ?? '')}"
         aria-describedby="player-card" aria-expanded="false">${label}</button>`
    : label;
  return `
  <span class="named">
    ${avatar(playerImage(player), player?.name, { variant: 'player' })}
    <span class="named__text">${name}${tail}</span>
  </span>`;
};

/** A fantasy team's logo next to its name. */
const teamCell = (team, sub = null, href = null) => {
  const label = team?.teamName ?? team?.name ?? '—';
  const inner = `
    ${avatar(team?.logo ?? null, label, { variant: 'team' })}
    <span class="named__text">${
      href ? `<a href="${esc(href)}">${esc(label)}</a>` : esc(label)
    }${sub === null ? '' : `<small>${esc(sub)}</small>`}</span>`;
  return `<span class="named">${inner}</span>`;
};

// --- Player cards ----------------------------------------------------------
//
// Hover a player to see last season's production, their injury status and any
// news. Three interaction notes, none of them optional:
//
//   Hover is not enough. This site is meant to be opened on a phone — the
//   README says so — and a phone has no hover. So the same card opens on tap,
//   and closes on the next tap outside it.
//
//   Keyboard users get it too. The trigger is a <button>, so it is focusable
//   and the card opens on focus and closes on Escape. A div with a mouseover
//   handler would have shipped this feature to two-thirds of the ways people
//   read a web page.
//
//   One card element, moved and refilled. Rendering 250 popovers into the Big
//   Board and hiding them would put a quarter of a megabyte of hidden DOM on
//   the page for the one card anybody looks at.

const STAT_LINES = {
  QB: [['passingYards', 'Pass yds'], ['passingTouchdowns', 'Pass TD'], ['passingInterceptions', 'INT'],
       ['rushingYards', 'Rush yds'], ['rushingTouchdowns', 'Rush TD']],
  RB: [['rushingAttempts', 'Carries'], ['rushingYards', 'Rush yds'], ['rushingTouchdowns', 'Rush TD'],
       ['receptions', 'Rec'], ['receivingYards', 'Rec yds'], ['receivingTouchdowns', 'Rec TD']],
  WR: [['receivingTargets', 'Targets'], ['receptions', 'Rec'], ['receivingYards', 'Rec yds'],
       ['receivingTouchdowns', 'Rec TD'], ['rushingYards', 'Rush yds']],
  TE: [['receivingTargets', 'Targets'], ['receptions', 'Rec'], ['receivingYards', 'Rec yds'],
       ['receivingTouchdowns', 'Rec TD']],
  K: [['madeFieldGoalsFromUnder40', 'FG <40'], ['madeFieldGoalsFrom40To49', 'FG 40-49'],
      ['madeFieldGoalsFrom50Plus', 'FG 50+'], ['missedFieldGoals', 'Missed'], ['madeExtraPoints', 'XP']],
  'D/ST': [['defensiveSacks', 'Sacks'], ['defensiveInterceptions', 'INT'], ['defensiveFumbles', 'Fum rec'],
           ['defensivePointsAllowed', 'Pts allowed'], ['defensiveYardsAllowed', 'Yds allowed']],
};

let cardEl = null;
let cardOwner = null;

/** "3 days ago" — news that cannot say when it is from is news you cannot use. */
function timeAgo(iso) {
  if (!iso) return null;
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return null;
  const mins = Math.round((Date.now() - then.getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'yesterday' : `${days}d ago`;
}

function cardHtml(player, card) {
  const parts = [];

  parts.push(`<p class="pcard__name">${esc(player.name)}
    <span class="pcard__meta">${esc(player.position ?? '')}${
      player.proTeam ? ` · ${esc(player.proTeam)}` : ''
    }</span></p>`);

  if (card.injury && card.injury !== 'Active') {
    parts.push(`<p class="pcard__injury"><span class="pill pill--warn">${esc(card.injury)}</span></p>`);
  }

  const prior = card.lastSeason;
  const line = prior ? (STAT_LINES[player.position] ?? []).filter(([k]) => prior.stats[k] != null) : [];

  if (line.length) {
    parts.push(`<p class="pcard__heading">${esc(prior.season)} season${
      prior.fantasyPoints != null ? ` · ${esc(num(prior.fantasyPoints, 1))} fantasy pts` : ''
    }</p>`);
    parts.push(`<dl class="pcard__stats">${line
      .map(([key, label]) => `<div><dt>${esc(label)}</dt><dd>${esc(num(prior.stats[key], 0))}</dd></div>`)
      .join('')}</dl>`);
  } else {
    parts.push(`<p class="pcard__empty">No ${esc(state.playerCards?.priorSeason ?? 'prior')} stats — rookie, or did not play.</p>`);
  }

  if (card.news?.length) {
    parts.push('<p class="pcard__heading">Latest news</p>');
    parts.push(`<ul class="pcard__news">${card.news
      .map((item) => {
        const when = timeAgo(item.published);
        return `<li>${esc(item.headline)}${
          when ? `<small>${esc(when)}${item.source ? ` · ${esc(item.source)}` : ''}</small>` : ''
        }</li>`;
      })
      .join('')}</ul>`);
  }

  return parts.join('');
}

function positionCard(trigger) {
  const rect = trigger.getBoundingClientRect();
  const width = cardEl.offsetWidth;
  const height = cardEl.offsetHeight;
  const margin = 8;

  // Below the name by default, above it when there is no room — a card that
  // opens off the bottom of a phone screen is a card nobody reads.
  let top = rect.bottom + window.scrollY + 6;
  if (rect.bottom + height + margin > window.innerHeight && rect.top - height - margin > 0) {
    top = rect.top + window.scrollY - height - 6;
  }

  let left = rect.left + window.scrollX;
  const maxLeft = window.scrollX + document.documentElement.clientWidth - width - margin;
  left = Math.max(window.scrollX + margin, Math.min(left, maxLeft));

  cardEl.style.top = `${Math.round(top)}px`;
  cardEl.style.left = `${Math.round(left)}px`;
}

function showCard(trigger) {
  if (cardOwner === trigger && !cardEl.hidden) return;
  const id = Number(trigger.dataset.playerId);
  const card = state.playerCards?.cards?.[id];
  if (!card) return;

  const player = {
    name: trigger.dataset.playerName ?? '',
    position: trigger.dataset.playerPos ?? '',
    proTeam: trigger.dataset.playerTeam ?? '',
  };

  cardEl.innerHTML = cardHtml(player, card);
  cardEl.hidden = false;
  positionCard(trigger);
  trigger.setAttribute('aria-expanded', 'true');
  cardOwner = trigger;
}

function hideCard() {
  if (!cardEl || cardEl.hidden) return;
  cardEl.hidden = true;
  cardOwner?.setAttribute('aria-expanded', 'false');
  cardOwner = null;
}

/**
 * One set of listeners on the document, delegated, so cards keep working on
 * content rendered after boot — every view replaces its own innerHTML, and
 * per-element listeners would die with it.
 */
function initPlayerCards() {
  cardEl = document.createElement('div');
  cardEl.className = 'pcard';
  cardEl.id = 'player-card';
  cardEl.setAttribute('role', 'tooltip');
  cardEl.hidden = true;
  document.body.appendChild(cardEl);

  const triggerFor = (target) => target?.closest?.('[data-player-id]');
  const insideCard = (target) => Boolean(target?.closest?.('.pcard'));

  // Was the last thing the user did a pointer action? Focus follows a tap or a
  // click as well as a Tab key, and without knowing which, the focus handler
  // fights the click handler: the tap focuses the button (card opens), then the
  // click toggles it (card closes), and a phone user sees nothing at all.
  let pointerIntent = false;
  document.addEventListener('pointerdown', () => { pointerIntent = true; }, true);
  document.addEventListener('keydown', (e) => { if (e.key === 'Tab') pointerIntent = false; }, true);

  // Enter and leave are both decided here rather than with a matching
  // pointerout handler. pointerout fires while the pointer is still logically
  // over the trigger — crossing between the button and the card counts as
  // leaving — which closed the card the instant it opened. Since every element
  // fires pointerover, "the pointer is now over something that is neither a
  // trigger nor the card" is a complete and much less fragile leave condition.
  document.addEventListener('pointerover', (e) => {
    if (e.pointerType === 'touch') return;
    const trigger = triggerFor(e.target);
    if (trigger) showCard(trigger);
    else if (!insideCard(e.target)) hideCard();
  });

  document.addEventListener('click', (e) => {
    const trigger = triggerFor(e.target);
    if (!trigger) {
      if (!insideCard(e.target)) hideCard();
      return;
    }
    e.preventDefault();
    // On touch this is the only way in, so it toggles. The focus that arrived
    // with the same tap has already been ignored, so `cardOwner` here really
    // does mean "this card was open before you tapped".
    if (cardOwner === trigger) hideCard();
    else showCard(trigger);
  });

  document.addEventListener('focusin', (e) => {
    if (pointerIntent) return;
    const trigger = triggerFor(e.target);
    if (trigger) showCard(trigger);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const owner = cardOwner;
      hideCard();
      owner?.focus();
    }
  });

  // No scroll handler on purpose. The card is positioned in *document*
  // coordinates (the scroll offset is baked into top/left at open time), so it
  // scrolls with its trigger and stays glued to the right name for free.
  // Closing on scroll instead looks reasonable and is not: anything that
  // scrolls the page while opening — a browser bringing a focused element into
  // view, a tap near the bottom of a phone screen — dismisses the card the
  // instant it appears.
  //
  // Resize is different: it reflows the page, so the coordinates the card was
  // given no longer point at anything.
  window.addEventListener('resize', hideCard);
}

/** Whether this player has a card worth opening. */
const hasCard = (playerId) => Boolean(state.playerCards?.cards?.[Number(playerId)]);

function emptyState(icon, title, message) {
  return `<div class="empty">
    <span class="empty__icon" aria-hidden="true">${esc(icon)}</span>
    <h3>${esc(title)}</h3><p>${esc(message)}</p>
  </div>`;
}

const fmtDate = (ms, opts = { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) =>
  ms ? new Date(ms).toLocaleDateString(undefined, opts) : null;

const fmtTime = (ms) =>
  ms ? new Date(ms).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }) : null;

async function loadJson(path) {
  const res = await fetch(path, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${path} → ${res.status} ${res.statusText}`);
  // Cloudflare Pages serves index.html for missing paths, so a 200 does not
  // guarantee JSON. Parsing is what actually proves the file is there.
  return res.json();
}

// --- Countdown -------------------------------------------------------------

function countdownParts(targetMs) {
  const diff = targetMs - Date.now();
  if (diff <= 0) return null;
  const s = Math.floor(diff / 1000);
  return {
    days: Math.floor(s / 86400),
    hours: Math.floor((s % 86400) / 3600),
    minutes: Math.floor((s % 3600) / 60),
    seconds: s % 60,
  };
}

function renderCountdown() {
  const el = document.getElementById('countdown');
  if (!el) return;
  const target = Number(el.dataset.target);
  const parts = countdownParts(target);

  if (!parts) {
    el.outerHTML = '<p class="pill pill--accent">Draft is underway</p>';
    if (countdownTimer) clearInterval(countdownTimer);
    return;
  }

  const units = [
    ['days', parts.days === 1 ? 'Day' : 'Days'],
    ['hours', 'Hours'],
    ['minutes', 'Minutes'],
    ['seconds', 'Seconds'],
  ];
  el.innerHTML = units
    .map(
      ([key, label]) => `<li>
        <span class="countdown__value">${String(parts[key]).padStart(2, '0')}</span>
        <span class="countdown__unit">${label}</span>
      </li>`
    )
    .join('');
}

function startCountdown() {
  if (countdownTimer) clearInterval(countdownTimer);
  if (!document.getElementById('countdown')) return;
  renderCountdown();
  countdownTimer = setInterval(renderCountdown, 1000);
}

// --- Views -----------------------------------------------------------------

function renderOverview() {
  const { hub } = state;
  const { phase, status, league, power } = hub;
  const parts = [];

  const claimed = hub.teams.filter((t) => !t.isPlaceholder).length;
  const draftMs = league.draftDate;
  const upcoming = draftMs && draftMs > Date.now();

  // --- Hero -------------------------------------------------------------
  if (upcoming) {
    // The ticking counter is hidden from assistive tech — a value announced
    // every second is unusable. The static sentence above it carries the fact.
    parts.push(`
      <section class="hero" aria-labelledby="hero-h">
        <p class="hero__eyebrow">Draft day</p>
        <h2 id="hero-h">${esc(fmtDate(draftMs))}</h2>
        <p class="hero__sub">
          ${esc(fmtTime(draftMs))} · ${esc(league.draftType ?? 'Snake')} draft ·
          ${esc(league.timePerPick ?? 90)} seconds per pick${
            league.draftRoomOpens
              ? ` · room opens ${esc(fmtTime(league.draftRoomOpens))}`
              : ''
          }
        </p>
        <p class="visually-hidden">
          The draft begins on ${esc(fmtDate(draftMs))} at ${esc(fmtTime(draftMs))}.
        </p>
        <ul class="countdown" id="countdown" data-target="${esc(draftMs)}" aria-hidden="true"></ul>
      </section>`);
  } else {
    parts.push(`
      <section class="hero" aria-labelledby="hero-h">
        <p class="hero__eyebrow">${esc(phase.nextMilestone ?? 'Season')}</p>
        <h2 id="hero-h">${esc(phase.headline)}</h2>
        <p class="hero__sub">${esc(phase.detail)}</p>
      </section>`);
  }

  // --- Stat tiles -------------------------------------------------------
  parts.push(`
    <ul class="stats">
      <li class="stat">
        <span class="stat__label">Managers</span>
        <span class="stat__value">${claimed}<span style="color:var(--text-dim)">/${esc(league.size)}</span></span>
        <span class="stat__note">${claimed === league.size ? 'League is full' : `${league.size - claimed} spots open`}</span>
      </li>
      <li class="stat">
        <span class="stat__label">Scoring</span>
        <span class="stat__value">${league.isPPR ? 'PPR' : 'Standard'}</span>
        <span class="stat__note">${esc(starterCount(league))} starters${isSuperflex(league) ? ' · superflex' : ''}</span>
      </li>
      <li class="stat">
        <span class="stat__label">Weeks played</span>
        <span class="stat__value">${esc(status.weeksPlayed)}</span>
        <span class="stat__note">of ${esc(league.regularSeasonWeeks)} regular season</span>
      </li>
      <li class="stat">
        <span class="stat__label">Playoff spots</span>
        <span class="stat__value">${esc(league.playoffTeams)}</span>
        <span class="stat__note">of ${esc(league.size)} teams</span>
      </li>
    </ul>`);

  // --- Power rankings, or the season roadmap ----------------------------
  if (power.length) {
    const maxPower = Math.max(...power.map((t) => t.powerScore), 1);
    parts.push(`
      <div class="table-scroll">
        <table>
          <caption>Power rankings — 50% all-play win rate, 30% scoring, 20% last three weeks</caption>
          <thead>
            <tr>
              <th scope="col" class="num">#</th>
              <th scope="col">Team</th>
              <th scope="col" class="bar-cell">Power</th>
              <th scope="col" class="num">Record</th>
              <th scope="col" class="num">All-play</th>
              <th scope="col" class="num">Avg pts</th>
            </tr>
          </thead>
          <tbody>
            ${power
              .map(
                (t) => `<tr>
                  <td class="num rank">${esc(t.rank)}</td>
                  <th scope="row" class="row-team">${esc(t.teamName)}<small>${esc(t.managerName ?? '')}</small></th>
                  <td class="bar-cell">${bar(t.powerScore, maxPower)}</td>
                  <td class="num">${esc(t.record)}</td>
                  <td class="num">${num(t.allPlayWinPct, 1)}%</td>
                  <td class="num">${num(t.avgScore, 1)}</td>
                </tr>`
              )
              .join('')}
          </tbody>
        </table>
      </div>`);
  } else {
    parts.push(seasonRoadmap());
  }

  $('#overview-body').innerHTML = parts.join('');
  startCountdown();
}

/** What unlocks when — gives the preseason page something to say. */
function seasonRoadmap() {
  const { league, status } = state.hub;
  const now = Date.now();
  const claimed = state.hub.teams.filter((t) => !t.isPlaceholder).length;

  const milestones = [
    {
      title: 'League fills up',
      meta: `${claimed} of ${league.size} managers have joined`,
      done: claimed >= league.size,
    },
    {
      title: 'Draft',
      meta: league.draftDate ? `${fmtDate(league.draftDate)} · ${fmtTime(league.draftDate)}` : 'Not scheduled',
      done: state.draft?.held ?? false,
    },
    {
      title: 'Week 1 kicks off',
      meta: 'Standings, power rankings, luck and prizes all unlock',
      done: status.weeksPlayed > 0,
    },
    {
      title: 'Trade deadline',
      meta: league.tradeDeadline ? fmtDate(league.tradeDeadline) : 'Not set',
      done: league.tradeDeadline ? now > league.tradeDeadline : false,
    },
    {
      title: 'Playoffs',
      meta: `Top ${league.playoffTeams} teams after ${league.regularSeasonWeeks} weeks`,
      done: false,
    },
  ];

  const firstPending = milestones.findIndex((m) => !m.done);

  return `
    <div class="card">
      <h3>Season roadmap</h3>
      <ol class="timeline">
        ${milestones
          .map(
            (m, i) => `<li class="${m.done ? 'is-done' : i === firstPending ? 'is-next' : ''}">
              <span class="timeline__title">${esc(m.title)}${
                m.done ? ' <span class="pill pill--good">Done</span>' : i === firstPending ? ' <span class="pill pill--accent">Next</span>' : ''
              }</span>
              <span class="timeline__meta">${esc(m.meta)}</span>
            </li>`
          )
          .join('')}
      </ol>
    </div>`;
}

function renderStandings() {
  const { standings, league } = state.hub;
  if (!standings.length || standings.every((t) => t.gamesPlayed === 0)) {
    $('#standings-body').innerHTML = emptyState(
      '📊',
      'Standings start after Week 1',
      'Records, points, luck and lineup efficiency all fill in once games are played.'
    );
    return;
  }

  const maxPF = Math.max(...standings.map((t) => t.pointsFor), 1);

  const rows = standings
    .map(
      (t) => `
      <tr class="${t.rank === league.playoffTeams ? 'playoff-cut' : ''}">
        <td class="num rank">${esc(t.rank)}</td>
        <th scope="row" class="row-team">${teamCell(t, t.managerName ?? '')}</th>
        <td class="num">${esc(t.wins)}-${esc(t.losses)}${t.ties ? `-${esc(t.ties)}` : ''}</td>
        <td class="bar-cell">${bar(t.pointsFor, maxPF, { digits: 0 })}</td>
        <td class="num">${num(t.pointsAgainst, 1)}</td>
        <td class="num">${esc(t.allPlayWins)}-${esc(t.allPlayLosses)}</td>
        <td class="num">${deltaPill(t.luck)}</td>
        <td class="num">${t.efficiency === null ? '—' : `${num(t.efficiency, 1)}%`}</td>
        <td class="num">${t.streakType ? `${esc(t.streakType[0])}${esc(t.streakLength)}` : '—'}</td>
        <td>${t.inPlayoffs ? '<span class="pill pill--good">In</span>' : '<span class="pill pill--neutral">Out</span>'}</td>
      </tr>`
    )
    .join('');

  $('#standings-body').innerHTML = `
    <div class="table-scroll">
      <table>
        <caption>
          The rule below rank ${league.playoffTeams} marks the playoff cut; the
          Playoff column states it in text as well.
        </caption>
        <thead>
          <tr>
            <th scope="col" class="num">#</th>
            <th scope="col">Team</th>
            <th scope="col" class="num">Record</th>
            <th scope="col" class="bar-cell">Points for</th>
            <th scope="col" class="num"><abbr title="Points against">PA</abbr></th>
            <th scope="col" class="num"><abbr title="Record if everyone played everyone every week">All-play</abbr></th>
            <th scope="col" class="num"><abbr title="Wins above or below what the scores deserved">Luck</abbr></th>
            <th scope="col" class="num"><abbr title="Share of possible points actually started">Eff.</abbr></th>
            <th scope="col" class="num">Streak</th>
            <th scope="col">Playoff</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function renderTeams() {
  const { hub } = state;
  const stats = state.season?.teamStats ?? [];

  if (!stats.length || stats.every((t) => t.gamesPlayed === 0)) {
    const roster = hub.teams
      .map(
        (t) => `<a class="card" href="#team/${esc(t.id)}" style="text-decoration:none;color:inherit;display:block">
          <h3 class="named">
            ${avatar(t.logo ?? null, t.name, { variant: 'team', size: 40 })}
            <span class="named__text">${esc(t.name)}</span>
          </h3>
          <p>${
            t.isPlaceholder
              ? '<span class="pill pill--warn">Open spot</span>'
              : `<span class="pill pill--good">Claimed</span> ${esc(t.managerName ?? '')}`
          }</p>
        </a>`
      )
      .join('');
    $('#teams-body').innerHTML = `
      ${emptyState('🏟️', 'Team stats start after Week 1', 'Pick your team below to open its own page — it will be remembered on this device.')}
      <div class="grid" style="margin-top:1.5rem">${roster}</div>`;
    return;
  }

  const cards = [...stats]
    .sort((a, b) => b.pointsFor - a.pointsFor)
    .map(
      (t) => `<div class="card">
        <h3 class="named">
          ${avatar(t.logo ?? null, t.teamName, { variant: 'team', size: 40 })}
          <span class="named__text"><a href="#team/${esc(t.teamId)}">${esc(t.teamName)}</a></span>
        </h3>
        <p class="stat__note">${esc(t.managerName ?? '')}</p>
        <ul class="stats" style="margin:0.75rem 0 0">
          <li class="stat"><span class="stat__label">Record</span>
            <span class="stat__value">${esc(t.wins)}-${esc(t.losses)}</span></li>
          <li class="stat"><span class="stat__label">Points</span>
            <span class="stat__value">${num(t.pointsFor, 0)}</span>
            <span class="stat__note">${num(t.avgScore, 1)} per week</span></li>
          <li class="stat"><span class="stat__label">Efficiency</span>
            <span class="stat__value">${t.efficiency === null ? '—' : `${num(t.efficiency, 0)}%`}</span>
            <span class="stat__note">${num(t.benchPoints, 0)} left benched</span></li>
          <li class="stat"><span class="stat__label">Luck</span>
            <span class="stat__value">${esc(signed(t.luck, 1))}</span>
            <span class="stat__note">${num(t.expectedWins, 1)} expected wins</span></li>
        </ul>
      </div>`
    )
    .join('');

  $('#teams-body').innerHTML = `<div class="grid">${cards}</div>`;
}

/**
 * One manager's own page: their season, what they got wrong, what to do next.
 *
 * Reachable at #team/3, so everyone can bookmark their own. There is no login —
 * a static site has nothing to authenticate against — so these pages are
 * readable by anyone in the league. For a fantasy league that is arguably the
 * point; nothing here is more private than what ESPN already shows.
 */
function renderTeam(teamId) {
  const body = $('#team-body');
  const all = state.teamDetail?.teams ?? [];

  if (!all.length) {
    body.innerHTML = emptyState(
      '👤',
      'No teams yet',
      'Once managers claim their spots, each gets their own page here.'
    );
    return;
  }

  const id = teamId ?? getMyTeamId();
  const team = all.find((t) => t.teamId === id);

  if (!team) {
    body.innerHTML = `
      ${emptyState('👋', 'Pick your team', 'Choose which team is yours. It will be remembered on this device.')}
      <div class="grid" style="margin-top:1.5rem">
        ${all
          .map(
            (t) => `<a class="card" href="#team/${esc(t.teamId)}" style="text-decoration:none;color:inherit;display:block">
              <h3>${esc(t.teamName)}</h3>
              <p class="stat__note">${esc(t.managerName ?? 'Unclaimed')}</p>
            </a>`
          )
          .join('')}
      </div>`;
    return;
  }

  const isMine = getMyTeamId() === team.teamId;
  $('#h-team').textContent = team.teamName;

  const parts = [];

  // --- Header -----------------------------------------------------------
  parts.push(`
    <section class="hero hero--team" aria-labelledby="team-hero">
      ${avatar(team.logo ?? null, team.teamName, { variant: 'team', size: 72 })}
      <p class="hero__eyebrow">${esc(team.managerName ?? 'Unclaimed')}</p>
      <h2 id="team-hero">${esc(team.teamName)}</h2>
      <p class="hero__sub">
        ${team.rank ? `Rank ${esc(team.rank)} of ${esc(state.hub.league.size)}` : 'Season has not started'}
        ${team.stats?.gamesPlayed ? ` · ${esc(team.stats.wins)}-${esc(team.stats.losses)}` : ''}
        ${team.inPlayoffs ? ' · <span class="pill pill--good">In playoff position</span>' : ''}
      </p>
      <p style="margin:0.9rem 0 0">
        <button type="button" class="theme-toggle" id="claim-team"
          aria-pressed="${isMine}">
          ${isMine ? '★ This is my team' : '☆ Set as my team'}
        </button>
      </p>
    </section>`);

  // --- Lineup advice ----------------------------------------------------
  const advice = team.lineupAdvice;
  if (advice?.available) {
    if (advice.alreadyOptimal) {
      parts.push(`<div class="card" style="margin-bottom:1.5rem">
        <h3>Week ${esc(state.teamDetail.adviceWeek)} lineup</h3>
        <p><span class="pill pill--good">Optimal</span>
        Your lineup is already the best available on projections
        (${num(advice.projectedTotal, 1)} projected).</p>
      </div>`);
    } else {
      parts.push(`<div class="card" style="margin-bottom:1.5rem">
        <h3>Week ${esc(state.teamDetail.adviceWeek)} lineup — ${esc(signed(advice.projectedGain, 1))} available</h3>
        <p class="stat__note">
          Based on ESPN's projections, which are wrong often enough that this is a
          nudge rather than an instruction.
        </p>
        <div class="grid" style="margin-top:0.75rem">
          <div>
            <h4 style="margin:0 0 0.35rem">Start</h4>
            <ul style="margin:0;padding-left:1.1rem">
              ${advice.toStart
                .map((p) => `<li>${esc(p.name)} <small>(${esc(p.position)})</small> — <strong>${num(p.projected, 1)}</strong></li>`)
                .join('')}
            </ul>
          </div>
          <div>
            <h4 style="margin:0 0 0.35rem">Sit</h4>
            <ul style="margin:0;padding-left:1.1rem">
              ${advice.toSit
                .map((p) => `<li>${esc(p.name)} <small>(${esc(p.position)})</small> — ${num(p.projected, 1)}</li>`)
                .join('')}
            </ul>
          </div>
        </div>
        <p class="stat__note" style="margin:0.75rem 0 0">
          Current lineup projects ${num(advice.currentProjected, 1)};
          the recommended one projects ${num(advice.projectedTotal, 1)}.
        </p>
      </div>`);
    }
  }

  // --- Waivers ----------------------------------------------------------
  const waivers = team.waivers;
  if (waivers?.available && (waivers.targets.length || waivers.injuryGaps.length)) {
    parts.push(`<div class="card" style="margin-bottom:1.5rem">
      <h3>Waiver wire</h3>
      ${
        waivers.injuryGaps.length
          ? `<p><span class="pill pill--bad">Injured starters</span>
             ${waivers.injuryGaps.map((g) => `${esc(g.name)} (${esc(g.position)}, ${esc(g.injuryStatus)})`).join(', ')}</p>`
          : ''
      }
      ${
        waivers.targets.length
          ? `<div class="table-scroll" style="margin-top:0.6rem">
              <table>
                <caption>Available players projected above your weakest starter at that position</caption>
                <thead><tr>
                  <th scope="col">Player</th><th scope="col">Pos</th>
                  <th scope="col" class="num">Projected</th><th scope="col" class="num">Upgrade</th>
                  <th scope="col" class="num">Owned</th>
                </tr></thead>
                <tbody>
                  ${waivers.targets
                    .map(
                      (t) => `<tr>
                        <th scope="row" class="row-team">${esc(t.name)}<small>${esc(t.proTeam)}</small></th>
                        <td>${esc(t.position)}</td>
                        <td class="num">${num(t.projected, 1)}</td>
                        <td class="num">${deltaPill(t.gain, 1)}</td>
                        <td class="num">${t.percentOwned === null ? '—' : `${num(t.percentOwned, 0)}%`}</td>
                      </tr>`
                    )
                    .join('')}
                </tbody>
              </table>
            </div>`
          : '<p class="stat__note">Nothing on the wire clearly beats what you already start.</p>'
      }
    </div>`);
  }

  // --- Season stats -----------------------------------------------------
  const s = team.stats;
  if (s && s.gamesPlayed > 0) {
    parts.push(`
      <ul class="stats">
        <li class="stat"><span class="stat__label">Record</span>
          <span class="stat__value">${esc(s.wins)}-${esc(s.losses)}</span>
          <span class="stat__note">${num(s.allPlayWinPct, 0)}% all-play</span></li>
        <li class="stat"><span class="stat__label">Points for</span>
          <span class="stat__value">${num(s.pointsFor, 0)}</span>
          <span class="stat__note">${num(s.avgScore, 1)} per week</span></li>
        <li class="stat"><span class="stat__label">Efficiency</span>
          <span class="stat__value">${s.efficiency === null ? '—' : `${num(s.efficiency, 0)}%`}</span>
          <span class="stat__note">${num(s.benchPoints, 0)} left benched</span></li>
        <li class="stat"><span class="stat__label">Luck</span>
          <span class="stat__value">${esc(signed(s.luck, 1))}</span>
          <span class="stat__note">${num(s.expectedWins, 1)} expected wins</span></li>
      </ul>`);
  }

  // --- Coaching report --------------------------------------------------
  const coaching = team.coaching;
  if (coaching?.available && coaching.worstCalls.length) {
    parts.push(`<div class="card" style="margin-bottom:1.5rem">
      <h3>Where the points went</h3>
      <p class="stat__note">
        ${num(coaching.totalBenched, 0)} points left on your bench this season.
        ${coaching.gamesCostByBadLineups > 0
          ? coaching.gamesCostByBadLineups === 1
            ? '<strong>1</strong> loss would have been a win with the optimal lineup.'
            : `<strong>${esc(coaching.gamesCostByBadLineups)}</strong> losses would have been wins with the optimal lineup.`
          : 'None of it changed a result.'}
      </p>
      <div class="table-scroll" style="margin-top:0.6rem">
        <table>
          <caption>Biggest start/sit misses — these are actual results, not projections</caption>
          <thead><tr>
            <th scope="col" class="num">Wk</th><th scope="col">Should have started</th>
            <th scope="col">Started instead</th><th scope="col" class="num">Cost</th>
          </tr></thead>
          <tbody>
            ${coaching.worstCalls
              .map(
                (c) => `<tr>
                  <td class="num rank">${esc(c.week)}</td>
                  <td>${esc(c.benched.name)} <small>(${esc(c.benched.position)}, ${num(c.benched.points, 1)})</small></td>
                  <td>${esc(c.started.name)} <small>(${esc(c.started.position)}, ${num(c.started.points, 1)})</small></td>
                  <td class="num">${num(c.cost, 1)}${c.changedResult ? ' <span class="pill pill--bad">Cost the game</span>' : ''}</td>
                </tr>`
              )
              .join('')}
          </tbody>
        </table>
      </div>
    </div>`);
  }

  // --- Week log ---------------------------------------------------------
  if (team.weekLog.length) {
    const maxScore = Math.max(...team.weekLog.map((w) => w.score), 1);
    parts.push(`
      <div class="table-scroll" style="margin-bottom:1.5rem">
        <table>
          <caption>Week by week</caption>
          <thead><tr>
            <th scope="col" class="num">Wk</th><th scope="col">Result</th>
            <th scope="col" class="bar-cell">Score</th>
            <th scope="col" class="num">Opponent</th>
            <th scope="col" class="num">Best possible</th>
            <th scope="col" class="num">Efficiency</th>
          </tr></thead>
          <tbody>
            ${team.weekLog
              .map(
                (w) => `<tr>
                  <td class="num rank">${esc(w.week)}</td>
                  <td><span class="pill ${w.result === 'WIN' ? 'pill--good' : w.result === 'LOSS' ? 'pill--bad' : 'pill--neutral'}">${esc(w.result)}</span></td>
                  <td class="bar-cell">${bar(w.score, maxScore)}</td>
                  <td class="num">${num(w.opponentScore, 1)}</td>
                  <td class="num">${num(w.optimalScore, 1)}</td>
                  <td class="num">${w.efficiency === null ? '—' : `${num(w.efficiency, 0)}%`}</td>
                </tr>`
              )
              .join('')}
          </tbody>
        </table>
      </div>`);
  }

  // --- Roster -----------------------------------------------------------
  if (team.roster.length) {
    const starters = team.roster.filter((p) => p.started);
    const benched = team.roster.filter((p) => !p.started);
    const rosterRows = (list) =>
      list
        .map(
          (p) => `<tr>
            <td>${esc(p.slot)}</td>
            <th scope="row" class="row-team">${playerCell(p, p.proTeam)}</th>
            <td>${esc(p.position)}</td>
            <td class="num">${num(p.projected, 1)}</td>
            <td>${p.injuryStatus && p.injuryStatus !== 'ACTIVE' && p.injuryStatus !== 'NORMAL'
              ? `<span class="pill pill--warn">${esc(p.injuryStatus)}</span>` : ''}</td>
          </tr>`
        )
        .join('');

    parts.push(`
      <div class="table-scroll">
        <table>
          <caption>Roster — projections for week ${esc(state.teamDetail.adviceWeek)}</caption>
          <thead><tr>
            <th scope="col">Slot</th><th scope="col">Player</th><th scope="col">Pos</th>
            <th scope="col" class="num">Projected</th><th scope="col">Status</th>
          </tr></thead>
          <tbody>${rosterRows(starters)}${rosterRows(benched)}</tbody>
        </table>
      </div>`);
  }

  // --- Head to head -----------------------------------------------------
  if (team.headToHead.length) {
    parts.push(`
      <div class="table-scroll" style="margin-top:1.5rem">
        <table>
          <caption>Head to head</caption>
          <thead><tr>
            <th scope="col">Opponent</th><th scope="col" class="num">Record</th>
            <th scope="col" class="num">Points for</th><th scope="col" class="num">Points against</th>
          </tr></thead>
          <tbody>
            ${team.headToHead
              .map(
                (h) => `<tr>
                  <th scope="row" class="row-team">${esc(h.opponentName)}</th>
                  <td class="num">${esc(h.wins)}-${esc(h.losses)}${h.ties ? `-${esc(h.ties)}` : ''}</td>
                  <td class="num">${num(h.pointsFor, 1)}</td>
                  <td class="num">${num(h.pointsAgainst, 1)}</td>
                </tr>`
              )
              .join('')}
          </tbody>
        </table>
      </div>`);
  }

  // Nothing above had anything to say yet.
  if (parts.length <= 1) {
    parts.push(
      emptyState(
        '📅',
        'Nothing to report yet',
        'Once the draft happens and Week 1 is played, this page fills with your roster, lineup advice, waiver targets and a breakdown of every start/sit call.'
      )
    );
  }

  body.innerHTML = parts.join('');

  $('#claim-team')?.addEventListener('click', () => {
    const nowMine = getMyTeamId() === team.teamId;
    setMyTeamId(nowMine ? null : team.teamId);
    syncMyTeamNav();
    renderTeam(team.teamId);
  });
}

/** Shows the "My Team" nav shortcut once a team has been claimed. */
function syncMyTeamNav() {
  const item = document.querySelector('[data-nav="myteam"]');
  if (!item) return;
  const id = getMyTeamId();
  item.hidden = id === null;
  const link = item.querySelector('a');
  if (link && id !== null) link.href = `#team/${id}`;
}

// --- Big board -------------------------------------------------------------

const boardState = { position: 'ALL', sort: 'valueRank', dir: 'asc', search: '', hideDrafted: false };

/** Draft slot the visitor expects to pick from, remembered across visits. */
const DRAFT_SLOT_KEY = 'ffh-draft-slot';
const getDraftSlot = () => {
  const raw = localStorage.getItem(DRAFT_SLOT_KEY);
  return raw === null ? null : Number(raw);
};

/**
 * Who should still be on the board at each of your picks.
 *
 * A player is "gone" if his recommended pick lands before your turn. This is a
 * projection of a well-run draft, not a promise — one manager reaching changes
 * everything downstream — but it answers the question you actually have while
 * waiting: is it worth hoping he falls to me?
 */
function targetsForSlot(board, slot) {
  const picks = board.picksBySlot?.[slot] ?? [];
  const draftable = board.players.filter((p) => p.draftable);

  return picks.map((overall) => {
    // Anyone recommended before your turn has already been taken. Comparing
    // against the previous pick instead of this one was wrong: it listed the
    // first overall pick as "should be there" at pick 7.
    //
    // Ordered by recommended pick, not by value rank. Sorting by value surfaces
    // whoever has the best VORP among everyone still on the board — which put
    // three defences at the top of a round-five pick, because their recommended
    // slot is round fifteen and nothing had taken them yet. What you want at
    // pick N is the players actually due to come off the board around then.
    const available = draftable
      .filter((p) => p.recommendedPick >= overall)
      .sort((a, b) => a.recommendedPick - b.recommendedPick);
    return {
      overall,
      round: Math.ceil(overall / board.teamCount),
      best: available.slice(0, 3),
      // The player the simulation says goes exactly here.
      onTheClock: draftable.find((p) => p.recommendedPick === overall) ?? null,
    };
  });
}

const GRADE_ORDER = ['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D', 'F'];

/** Colour reinforces the grade; the letter always carries it. */
function gradePill(grade) {
  if (!grade) return '<span class="pill pill--neutral">—</span>';
  const i = GRADE_ORDER.indexOf(grade);
  const cls = i <= 2 ? 'pill--good' : i <= 5 ? 'pill--accent' : i <= 7 ? 'pill--neutral' : 'pill--bad';
  return `<span class="pill ${cls}">${esc(grade)}</span>`;
}

function sortBoard(players) {
  const { sort, dir } = boardState;
  const mult = dir === 'asc' ? 1 : -1;
  return [...players].sort((a, b) => {
    let av;
    let bv;
    if (sort === 'grade') {
      av = GRADE_ORDER.indexOf(a.grade);
      bv = GRADE_ORDER.indexOf(b.grade);
    } else if (sort === 'name') {
      return mult * a.name.localeCompare(b.name);
    } else {
      av = a[sort];
      bv = b[sort];
    }
    // Missing values sort last regardless of direction.
    if (av === null || av === undefined) return 1;
    if (bv === null || bv === undefined) return -1;
    return mult * (av - bv);
  });
}

function renderBoard() {
  const body = $('#board-body');
  const board = state.bigBoard;

  if (!board?.available) {
    body.innerHTML = emptyState(
      '📖',
      'Board not available',
      'Run npm run fetch to pull the ranked player pool from ESPN, then npm run build.'
    );
    return;
  }

  const parts = [];

  // --- The headline insight ---------------------------------------------
  const qb = board.positionValue.find((p) => p.position === 'QB');
  if (qb && qb.avgValueDelta > 15) {
    parts.push(`
      <section class="hero" style="margin-bottom:1.25rem">
        <p class="hero__eyebrow">The superflex edge</p>
        <h2>Quarterbacks are worth ${esc(qb.avgValueDelta)} draft places more than the market thinks</h2>
        <p class="hero__sub">
          Average draft position is collected across mostly-standard leagues, where only one
          QB starts. This league starts two, so all ${esc(board.startersNeeded.QB ?? 24)} startable
          quarterbacks have real value — and ADP hasn't caught up. That gap is the biggest
          single edge available to you on draft day.
        </p>
      </section>`);
  }

  // --- Positional value + scarcity --------------------------------------
  parts.push(`
    <div class="grid" style="margin-bottom:1.25rem">
      <div class="card">
        <h3>Where the value is</h3>
        <p class="stat__note">
          Average places of value by position. Positive means the market drafts them later
          than they're worth.
        </p>
        <div class="table-scroll" style="margin-top:0.6rem">
          <table>
            <caption>Positional value bias</caption>
            <thead><tr>
              <th scope="col">Pos</th><th scope="col" class="num">Value gap</th>
              <th scope="col" class="num">Starters</th><th scope="col"></th>
            </tr></thead>
            <tbody>
              ${board.positionValue
                .map(
                  (p) => `<tr>
                    <th scope="row">${esc(p.position)}</th>
                    <td class="num">${deltaPill(p.avgValueDelta, 0)}</td>
                    <td class="num">${esc(board.startersNeeded[p.position] ?? '—')}</td>
                    <td>${p.streamable ? '<span class="pill pill--warn">Streamable</span>' : ''}</td>
                  </tr>`
                )
                .join('')}
            </tbody>
          </table>
        </div>
        <p class="stat__note" style="margin-top:0.6rem">
          <strong>Streamable</strong> positions overstate their case here. VORP counts 26 points
          above replacement the same wherever it comes from, but kickers and defences are
          replaceable off waivers most weeks — so that edge doesn't need a draft pick. The model
          can't measure week-to-week volatility, so this is flagged rather than silently corrected.
        </p>
      </div>

      <div class="card">
        <h3>Positional scarcity</h3>
        <p class="stat__note">
          How far the best player at each position sits above the last one you'd start.
          A big gap means paying up is worth it.
        </p>
        <div class="table-scroll" style="margin-top:0.6rem">
          <table>
            <caption>Elite advantage over the last startable player</caption>
            <thead><tr>
              <th scope="col">Pos</th><th scope="col" class="bar-cell">Elite advantage</th>
              <th scope="col" class="num">Replacement</th>
            </tr></thead>
            <tbody>
              ${board.scarcity
                .map(
                  (s) => `<tr>
                    <th scope="row">${esc(s.position)}</th>
                    <td class="bar-cell">${bar(s.eliteAdvantage ?? 0, board.scarcity[0].eliteAdvantage || 1, { digits: 0, suffix: ' pts' })}</td>
                    <td class="num">${num(s.replacement, 0)}</td>
                  </tr>`
                )
                .join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>`);

  // --- Your draft slot ---------------------------------------------------
  const slot = getDraftSlot();
  if (slot && board.picksBySlot?.[slot]) {
    const targets = targetsForSlot(board, slot);
    parts.push(`
      <div class="card" style="margin-bottom:1.25rem">
        <h3>Drafting from slot ${esc(slot)}</h3>
        <p class="stat__note">
          Your picks, and who the board says should still be there. A projection of a
          well-run draft — one manager reaching changes everything after it.
          <button type="button" class="theme-toggle" id="board-clear-slot"
            style="margin-left:0.4rem">Change slot</button>
        </p>
        <div class="table-scroll" style="margin-top:0.6rem;max-height:22rem;overflow-y:auto">
          <table>
            <caption>Best available at each of your picks</caption>
            <thead><tr>
              <th scope="col" class="num">Rd</th><th scope="col" class="num">Pick</th>
              <th scope="col">Should be there</th>
            </tr></thead>
            <tbody>
              ${targets
                .map(
                  (t) => `<tr>
                    <td class="num rank">${esc(t.round)}</td>
                    <td class="num rank">${esc(t.overall)}</td>
                    <td>${
                      t.best.length
                        ? t.best
                            .map(
                              (p) => `${esc(p.name)} <small>(${esc(p.position)}${esc(p.positionRank)})</small>`
                            )
                            .join(' · ')
                        : '<span class="stat__note">board exhausted</span>'
                    }</td>
                  </tr>`
                )
                .join('')}
            </tbody>
          </table>
        </div>
      </div>`);
  } else {
    parts.push(`
      <div class="card" style="margin-bottom:1.25rem">
        <h3>Which slot are you drafting from?</h3>
        <p class="stat__note">
          Pick your slot and the board will show who should still be available at each of
          your ${esc(board.rounds ?? 16)} picks. Remembered on this device.
        </p>
        <div class="draft-picks" style="margin-top:0.75rem">
          ${Array.from({ length: board.teamCount }, (_, i) => i + 1)
            .map(
              (n) => `<button type="button" class="theme-toggle board-slot" data-slot="${n}"
                style="width:100%">Slot ${n}</button>`
            )
            .join('')}
        </div>
      </div>`);
  }

  // --- Controls ----------------------------------------------------------
  const positions = ['ALL', ...POSITIONS_ORDER];
  parts.push(`
    <div style="display:flex;flex-wrap:wrap;gap:0.5rem;align-items:flex-end;margin-bottom:0.85rem">
      <div>
        <label for="board-search" class="stat__label">Search</label>
        <input type="search" id="board-search" value="${esc(boardState.search)}"
          placeholder="Player name…"
          style="font:inherit;padding:0.45rem 0.7rem;border-radius:var(--radius-sm);
                 border:1px solid var(--border);background:var(--bg-sunken);color:var(--text);min-width:12rem">
      </div>
      <div role="group" aria-label="Filter by position" style="display:flex;flex-wrap:wrap;gap:0.25rem">
        ${positions
          .map(
            (pos) => `<button type="button" class="theme-toggle board-pos" data-pos="${esc(pos)}"
              aria-pressed="${boardState.position === pos}">${esc(pos)}</button>`
          )
          .join('')}
      </div>
      ${
        board.draftHeld
          ? `<button type="button" class="theme-toggle" id="board-hide-drafted"
              aria-pressed="${boardState.hideDrafted}">
              ${boardState.hideDrafted ? 'Showing available only' : 'Show available only'}
            </button>`
          : ''
      }
    </div>`);

  // --- The board ---------------------------------------------------------
  let rows = board.players;
  if (boardState.position !== 'ALL') rows = rows.filter((p) => p.position === boardState.position);
  if (boardState.search) {
    const q = boardState.search.toLowerCase();
    rows = rows.filter((p) => p.name.toLowerCase().includes(q) || p.proTeam.toLowerCase().includes(q));
  }
  if (boardState.hideDrafted) rows = rows.filter((p) => !p.drafted);
  rows = sortBoard(rows);

  const maxVorp = Math.max(...board.players.map((p) => p.vorp ?? 0), 1);

  const sortable = (key, label, hint) => {
    const active = boardState.sort === key;
    const arrow = active ? (boardState.dir === 'asc' ? ' ▲' : ' ▼') : '';
    return `<th scope="col" class="num" aria-sort="${active ? (boardState.dir === 'asc' ? 'ascending' : 'descending') : 'none'}">
      <button type="button" class="board-sort sort-btn" data-key="${esc(key)}"
        ${hint ? `title="${esc(hint)}"` : ''}>${esc(label)}${arrow}</button></th>`;
  };

  parts.push(`
    <div class="table-scroll">
      <table>
        <caption>
          ${esc(rows.length)} of ${esc(board.players.length)} players ·
          ranked by value over replacement, not by ESPN's published order
          ${board.draftHeld ? '· draft results attached' : ''}
        </caption>
        <thead>
          <tr>
            ${sortable('valueRank', '#', 'Rank by value over replacement')}
            <th scope="col">Player</th>
            <th scope="col">Pos</th>
            <th scope="col" class="num">Tier</th>
            ${sortable('recommendedPick', 'Take at', 'Where this player should go in a well-run draft')}
            ${sortable('adp', 'ADP', 'Average draft position across ESPN leagues')}
            ${sortable('projected', 'Proj', 'ESPN season projection')}
            ${sortable('vorp', 'VORP', 'Points above the worst starter at this position')}
            ${sortable('grade', 'Grade', 'Value compared to others at the same position')}
            <th scope="col">${board.draftHeld ? 'Drafted by' : 'Status'}</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .slice(0, 250)
            .map(
              (p) => `<tr>
                <td class="num rank">${esc(p.valueRank)}</td>
                <th scope="row" class="row-team">
                  ${playerCell(
                    p,
                    `${p.proTeam}${
                      p.injuryStatus && !['ACTIVE', 'NORMAL'].includes(p.injuryStatus)
                        ? ` · ${p.injuryStatus}`
                        : ''
                    }`
                  )}
                </th>
                <td>${esc(p.position)}${esc(p.positionRank)}</td>
                <td class="num">${esc(p.tier)}</td>
                <td class="num">${
                  p.recommendedPick === null
                    ? '<span class="pill pill--neutral">Undraftable</span>'
                    : `${esc(p.recommendedPick)}<small style="color:var(--text-dim)"> R${esc(p.recommendedRound)}</small>`
                }</td>
                <td class="num">${p.adp === null ? '—' : num(p.adp, 1)}</td>
                <td class="num">${num(p.projected, 0)}</td>
                <td class="bar-cell">${bar(p.vorp ?? 0, maxVorp, { digits: 0 })}</td>
                <td>${gradePill(p.grade)}${p.streamable ? ' <span class="pill pill--warn">Str</span>' : ''}</td>
                <td>${
                  p.drafted
                    ? `<small>${esc(p.pick.teamName)}<br>pick ${esc(p.pick.overall)} (R${esc(p.pick.round)})</small>`
                    : board.draftHeld
                      ? '<span class="pill pill--good">Available</span>'
                      : '<span class="pill pill--neutral">Undrafted</span>'
                }</td>
              </tr>`
            )
            .join('')}
        </tbody>
      </table>
    </div>`);

  if (!rows.length) {
    parts.push(emptyState('🔍', 'No players match', 'Try clearing the search or position filter.'));
  }

  body.innerHTML = parts.join('');

  // --- Wiring ------------------------------------------------------------
  for (const btn of body.querySelectorAll('.board-pos')) {
    btn.addEventListener('click', () => {
      boardState.position = btn.dataset.pos;
      renderBoard();
    });
  }
  for (const btn of body.querySelectorAll('.board-sort')) {
    btn.addEventListener('click', () => {
      const key = btn.dataset.key;
      if (boardState.sort === key) {
        boardState.dir = boardState.dir === 'asc' ? 'desc' : 'asc';
      } else {
        boardState.sort = key;
        // Rank-like columns read best ascending (pick 1 first); magnitudes and
        // deltas descending (biggest first).
        const ascending = ['valueRank', 'adp', 'grade', 'recommendedPick'];
        boardState.dir = ascending.includes(key) ? 'asc' : 'desc';
      }
      renderBoard();
    });
  }
  $('#board-hide-drafted')?.addEventListener('click', () => {
    boardState.hideDrafted = !boardState.hideDrafted;
    renderBoard();
  });
  for (const btn of body.querySelectorAll('.board-slot')) {
    btn.addEventListener('click', () => {
      localStorage.setItem(DRAFT_SLOT_KEY, btn.dataset.slot);
      renderBoard();
    });
  }
  $('#board-clear-slot')?.addEventListener('click', () => {
    localStorage.removeItem(DRAFT_SLOT_KEY);
    renderBoard();
  });

  const search = $('#board-search');
  if (search) {
    search.addEventListener('input', () => {
      boardState.search = search.value;
      renderBoard();
      // Re-rendering blows away focus; put it back where the user was typing.
      const next = $('#board-search');
      next.focus();
      next.setSelectionRange(next.value.length, next.value.length);
    });
  }
}

// --- Mock draft ------------------------------------------------------------

let mock = null;
let mockFilter = 'ALL';

function renderMock() {
  const body = $('#mock-body');
  const pool = state.draftPool;

  if (!pool?.players?.length) {
    body.innerHTML = emptyState(
      '🎲',
      'Draft board not available',
      'Run npm run fetch to pull the ranked player pool from ESPN.'
    );
    return;
  }

  // --- Setup ------------------------------------------------------------
  if (!mock) {
    body.innerHTML = `
      <div class="card">
        <h3>Pick your draft slot</h3>
        <p class="stat__note">
          ${esc(pool.teams)} teams · ${esc(pool.rounds)} rounds · snake ·
          ${esc(pool.players.length)} players ranked for ${esc(pool.rankType)}
        </p>
        <div class="draft-picks" style="margin-top:0.9rem">
          ${Array.from({ length: pool.teams }, (_, i) => i + 1)
            .map(
              (slot) => `<button type="button" class="theme-toggle mock-slot" data-slot="${slot}"
                style="width:100%">Slot ${slot}</button>`
            )
            .join('')}
        </div>
        <p style="margin-top:0.9rem">
          <button type="button" class="theme-toggle" id="mock-random">Random slot</button>
        </p>
      </div>

      <div class="card" style="margin-top:1.25rem">
        <h3>Why superflex changes everything</h3>
        <p class="stat__note">
          Your league starts an OP slot, so a second quarterback can be started every week.
          ESPN ranks the board accordingly — these are the same players, ranked two ways:
        </p>
        <div class="table-scroll" style="margin-top:0.6rem">
          <table>
            <caption>Superflex rank vs standard PPR rank</caption>
            <thead><tr>
              <th scope="col">Player</th><th scope="col">Pos</th>
              <th scope="col" class="num">Superflex</th><th scope="col" class="num">PPR</th>
              <th scope="col" class="num">Moves</th>
            </tr></thead>
            <tbody>
              ${pool.players
                .filter((p) => p.pprRank !== null)
                .slice(0, 10)
                .map(
                  (p) => `<tr>
                    <th scope="row" class="row-team">${esc(p.name)}<small>${esc(p.proTeam)}</small></th>
                    <td>${esc(p.position)}</td>
                    <td class="num">${esc(p.rank)}</td>
                    <td class="num">${esc(p.pprRank)}</td>
                    <td class="num">${deltaPill(p.pprRank - p.rank, 0)}</td>
                  </tr>`
                )
                .join('')}
            </tbody>
          </table>
        </div>
      </div>`;

    for (const btn of body.querySelectorAll('.mock-slot')) {
      btn.addEventListener('click', () => startMock(Number(btn.dataset.slot)));
    }
    $('#mock-random')?.addEventListener('click', () =>
      startMock(1 + Math.floor(Math.random() * pool.teams))
    );
    return;
  }

  // --- Results ----------------------------------------------------------
  if (mock.isComplete) {
    const grades = gradeDraft(mock, pool.startingSlots);
    const you = grades.find((g) => g.isUser);

    body.innerHTML = `
      <section class="hero">
        <p class="hero__eyebrow">Draft complete</p>
        <h2>You finished ${esc(you.rank)} of ${esc(grades.length)} — grade ${esc(you.grade)}</h2>
        <p class="hero__sub">
          Your starting lineup projects <strong>${num(you.startingPoints, 1)}</strong> points,
          with ${num(you.benchPoints, 1)} on the bench.
          ${you.incompleteLineup ? '<span class="pill pill--bad">Cannot field a legal lineup</span>' : ''}
        </p>
        <p style="margin:0.9rem 0 0">
          <button type="button" class="theme-toggle" id="mock-restart">Draft again</button>
        </p>
      </section>

      <div class="table-scroll" style="margin-bottom:1.5rem">
        <table>
          <caption>Every roster, scored on the lineup it can actually start</caption>
          <thead><tr>
            <th scope="col" class="num">#</th><th scope="col">Manager</th>
            <th scope="col">Grade</th><th scope="col" class="bar-cell">Starting projection</th>
            <th scope="col" class="num">Bench</th><th scope="col">Roster</th>
          </tr></thead>
          <tbody>
            ${grades
              .map(
                (g) => `<tr>
                  <td class="num rank">${esc(g.rank)}</td>
                  <th scope="row" class="row-team">${esc(g.name)}${g.isUser ? ' <span class="pill pill--accent">You</span>' : ''}</th>
                  <td><span class="pill pill--neutral">${esc(g.grade)}</span></td>
                  <td class="bar-cell">${bar(g.startingPoints, grades[0].startingPoints, { digits: 0 })}</td>
                  <td class="num">${num(g.benchPoints, 0)}</td>
                  <td><small>${POSITIONS_ORDER.filter((p) => g.byPosition[p])
                    .map((p) => `${g.byPosition[p]}${p}`)
                    .join(' · ')}</small></td>
                </tr>`
              )
              .join('')}
          </tbody>
        </table>
      </div>

      <div class="table-scroll">
        <table>
          <caption>Your picks</caption>
          <thead><tr>
            <th scope="col" class="num">Rd</th><th scope="col" class="num">Pick</th>
            <th scope="col">Player</th><th scope="col">Pos</th>
            <th scope="col" class="num">Board rank</th><th scope="col" class="num">Value</th>
          </tr></thead>
          <tbody>
            ${mock.picks
              .filter((p) => p.isUser)
              .map(
                (p) => `<tr>
                  <td class="num rank">${esc(p.round)}</td>
                  <td class="num rank">${esc(p.overall)}</td>
                  <th scope="row" class="row-team">${esc(p.player.name)}<small>${esc(p.player.proTeam)}</small></th>
                  <td>${esc(p.player.position)}</td>
                  <td class="num">${esc(p.player.rank)}</td>
                  <td class="num">${deltaPill(p.overall - p.player.rank, 0)}</td>
                </tr>`
              )
              .join('')}
          </tbody>
        </table>
      </div>`;

    $('#mock-restart')?.addEventListener('click', () => {
      mock = null;
      renderMock();
    });
    return;
  }

  // --- Draft in progress -------------------------------------------------
  const you = mock.teams.find((t) => t.isUser);
  const onClock = mock.onTheClock;
  const recent = [...mock.picks].slice(-6).reverse();

  const filtered =
    mockFilter === 'ALL'
      ? mock.available
      : mock.available.filter((p) => p.position === mockFilter);

  body.innerHTML = `
    <section class="hero" style="margin-bottom:1.25rem">
      <p class="hero__eyebrow">Round ${esc(mock.current.round)} · Pick ${esc(mock.pickIndex + 1)} of ${esc(mock.order.length)}</p>
      <h2>${onClock.isUser ? 'You are on the clock' : `${esc(onClock.name)} is picking…`}</h2>
      <p class="hero__sub">You are drafting from slot ${esc(you.slot)} · ${esc(you.roster.length)} players so far</p>
    </section>

    <div class="grid" style="grid-template-columns:minmax(0,2fr) minmax(0,1fr)">
      <div>
        <div style="display:flex;flex-wrap:wrap;gap:0.3rem;margin-bottom:0.75rem">
          ${['ALL', ...POSITIONS_ORDER]
            .map(
              (pos) => `<button type="button" class="theme-toggle mock-filter"
                data-pos="${esc(pos)}" aria-pressed="${mockFilter === pos}">${esc(pos)}</button>`
            )
            .join('')}
        </div>
        <div class="table-scroll" style="max-height:26rem;overflow-y:auto">
          <table>
            <caption>Best available — ${esc(filtered.length)} players</caption>
            <thead><tr>
              <th scope="col" class="num">#</th><th scope="col">Player</th>
              <th scope="col">Pos</th><th scope="col" class="num">Proj</th>
              <th scope="col" class="num">ADP</th><th scope="col"></th>
            </tr></thead>
            <tbody>
              ${filtered
                .slice(0, 60)
                .map(
                  (p) => `<tr>
                    <td class="num rank">${esc(p.rank)}</td>
                    <th scope="row" class="row-team">${playerCell(p, p.proTeam)}</th>
                    <td>${esc(p.position)}</td>
                    <td class="num">${p.projected === null ? '—' : num(p.projected, 0)}</td>
                    <td class="num">${p.adp === null ? '—' : num(p.adp, 1)}</td>
                    <td>${
                      onClock.isUser
                        ? `<button type="button" class="theme-toggle mock-pick" data-id="${esc(p.playerId)}">Draft</button>`
                        : ''
                    }</td>
                  </tr>`
                )
                .join('')}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <div class="card" style="margin-bottom:1rem">
          <h3>Your roster</h3>
          ${(() => {
            const needs = rosterNeeds(you.roster, state.draftPool.startingSlots);
            const picksLeft = Math.ceil((mock.order.length - mock.pickIndex) / mock.teamCount);
            if (!needs.length) {
              return '<p><span class="pill pill--good">Legal lineup</span> Every starting slot is covered.</p>';
            }
            const urgent = needs.length >= picksLeft;
            return `<p><span class="pill ${urgent ? 'pill--bad' : 'pill--warn'}">
              Still need ${esc(needs.join(', '))}</span>
              ${urgent ? ` — only ${esc(picksLeft)} pick${picksLeft === 1 ? '' : 's'} left` : ''}</p>`;
          })()}
          ${
            you.roster.length
              ? `<ul style="margin:0;padding-left:1.1rem">
                  ${you.roster
                    .map((p) => `<li>${esc(p.position)} — ${esc(p.name)} <small>${esc(p.proTeam)}</small></li>`)
                    .join('')}
                </ul>`
              : '<p class="stat__note">Nothing yet.</p>'
          }
        </div>
        <div class="card">
          <h3>Recent picks</h3>
          ${
            recent.length
              ? `<ul style="margin:0;padding-left:1.1rem">
                  ${recent
                    .map(
                      (p) => `<li>${esc(p.overall)}. ${esc(p.teamName)} — ${esc(p.player.name)}
                        <small>(${esc(p.player.position)})</small></li>`
                    )
                    .join('')}
                </ul>`
              : '<p class="stat__note">Draft has not started.</p>'
          }
        </div>
      </div>
    </div>`;

  for (const btn of body.querySelectorAll('.mock-filter')) {
    btn.addEventListener('click', () => {
      mockFilter = btn.dataset.pos;
      renderMock();
    });
  }
  for (const btn of body.querySelectorAll('.mock-pick')) {
    btn.addEventListener('click', () => {
      const player = mock.available.find((p) => p.playerId === Number(btn.dataset.id));
      makePick(mock, player);
      advanceToUser(mock);
      $('#route-status').textContent = `Drafted ${player.name}. ${
        mock.isComplete ? 'Draft complete.' : `Round ${mock.current.round}, your pick.`
      }`;
      renderMock();
    });
  }
}

const POSITIONS_ORDER = ['QB', 'RB', 'WR', 'TE', 'D/ST', 'K'];

function startMock(slot) {
  mock = createMockDraft(state.draftPool, { userSlot: slot });
  advanceToUser(mock);
  renderMock();
}

function renderDraft() {
  const draft = state.draft;
  const league = state.hub.league;

  if (!draft || !draft.held) {
    const when = league.draftDate
      ? `${fmtDate(league.draftDate)} at ${fmtTime(league.draftDate)}`
      : 'a date not yet set in ESPN';
    $('#draft-body').innerHTML = `
      ${emptyState(
        '📋',
        'The board is set, the picks are not',
        `${draft?.totalSlots ?? 0} slots across ${draft?.rounds ?? 0} rounds, ${when}. ` +
          'The full board, per-manager grades, steals and reaches all appear here the moment picks are made.'
      )}
      <div class="card" style="margin-top:1.5rem">
        <h3>Draft settings</h3>
        <ul class="stats" style="margin:0.5rem 0 0">
          <li class="stat"><span class="stat__label">Format</span>
            <span class="stat__value">${esc(league.draftType ?? '—')}</span></li>
          <li class="stat"><span class="stat__label">Rounds</span>
            <span class="stat__value">${esc(draft?.rounds ?? '—')}</span></li>
          <li class="stat"><span class="stat__label">Per pick</span>
            <span class="stat__value">${esc(league.timePerPick ?? '—')}s</span></li>
          <li class="stat"><span class="stat__label">Total picks</span>
            <span class="stat__value">${esc(draft?.totalSlots ?? '—')}</span></li>
        </ul>
      </div>`;
    return;
  }

  const parts = [];

  if (draft.hasResults) {
    parts.push(`
      <div class="table-scroll" style="margin-bottom:1.5rem">
        <table>
          <caption>Draft grades — value gained or lost against where each pick was spent</caption>
          <thead>
            <tr>
              <th scope="col" class="num">#</th><th scope="col">Manager</th>
              <th scope="col">Grade</th><th scope="col" class="num">Value</th>
              <th scope="col" class="num">Points</th>
              <th scope="col">Best pick</th><th scope="col">Worst pick</th>
            </tr>
          </thead>
          <tbody>
            ${draft.teamGrades
              .map(
                (t) => `<tr>
                  <td class="num rank">${esc(t.rank)}</td>
                  <th scope="row" class="row-team">${esc(t.teamName)}<small>${esc(t.managerName ?? '')}</small></th>
                  <td><span class="pill pill--accent">${esc(t.grade)}</span></td>
                  <td class="num">${deltaPill(t.totalValue, 0)}</td>
                  <td class="num">${num(t.totalPoints, 0)}</td>
                  <td>${t.bestPick ? `${esc(t.bestPick.playerName)} <small>(R${esc(t.bestPick.round)})</small>` : '—'}</td>
                  <td>${t.worstPick ? `${esc(t.worstPick.playerName)} <small>(R${esc(t.worstPick.round)})</small>` : '—'}</td>
                </tr>`
              )
              .join('')}
          </tbody>
        </table>
      </div>`);

    const list = (title, picks) => `
      <div class="card">
        <h3>${esc(title)}</h3>
        <ol style="margin:0;padding-left:1.2rem">
          ${picks
            .slice(0, 5)
            .map(
              (p) => `<li>${esc(p.playerName)}
                <small>${esc(p.position)} · pick ${esc(p.overall)} · ${esc(p.teamName)}</small>
                ${deltaPill(p.valueDelta, 0)}</li>`
            )
            .join('')}
        </ol>
      </div>`;
    parts.push(`<div class="grid" style="margin-bottom:1.5rem">
      ${list('Biggest steals', draft.steals)}
      ${list('Biggest reaches', draft.reaches)}
    </div>`);
  }

  parts.push('<h3>Full draft board</h3>');
  for (const round of draft.board) {
    parts.push(`
      <div class="draft-round">
        <h3>Round ${esc(round.round)}</h3>
        <ol class="draft-picks">
          ${round.picks
            .map(
              (p) => `<li class="pick">
                <span class="pick__num">${esc(p.overall)}.</span>
                ${avatar(
                  playerImage({ playerId: p.playerId, position: p.position, proTeam: p.proTeam }),
                  p.playerName,
                  { variant: 'player', size: 44 }
                )}
                <span class="pick__player">${
                  hasCard(p.playerId)
                    ? `<button type="button" class="pcard-trigger"
                         data-player-id="${esc(p.playerId)}"
                         data-player-name="${esc(p.playerName)}"
                         data-player-pos="${esc(p.position)}"
                         data-player-team="${esc(p.proTeam)}"
                         aria-describedby="player-card" aria-expanded="false">${esc(p.playerName)}</button>`
                    : esc(p.playerName)
                }</span>
                <span class="pick__meta">${esc(p.position)} · ${esc(p.proTeam)}</span><br>
                <span class="pick__meta">${esc(p.teamName)}</span>
                ${draft.hasResults ? `<br>${deltaPill(p.valueDelta, 0)}` : ''}
              </li>`
            )
            .join('')}
        </ol>
      </div>`);
  }

  $('#draft-body').innerHTML = parts.join('');
}

function renderTrades() {
  const trades = state.season?.trades ?? [];
  const transactions = state.season?.transactions ?? [];
  const parts = [];

  if (!trades.length) {
    parts.push(
      emptyState(
        '🤝',
        'No trades yet',
        'Every completed trade shows up here with both sides laid out, once the season is underway.'
      )
    );
  } else {
    parts.push(`<div class="grid">${trades
      .map(
        (t) => `<div class="card">
          <h3>${t.date ? esc(new Date(t.date).toLocaleDateString()) : 'Trade'}</h3>
          ${t.sides
            .map(
              (s) => `<p><strong>${esc(s.teamName)}</strong> received:<br>
                ${s.received.length
                  ? s.received.map((p) => `${esc(p.name)} <small>(${esc(p.position)})</small>`).join('<br>')
                  : '<em>nothing recorded</em>'}</p>`
            )
            .join('')}
        </div>`
      )
      .join('')}</div>`);
  }

  if (transactions.length) {
    parts.push(`
      <h3 style="margin-top:2rem">Waiver &amp; free agent moves</h3>
      <div class="table-scroll">
        <table>
          <caption>${transactions.length} transaction(s)</caption>
          <thead><tr>
            <th scope="col" class="num">Week</th><th scope="col">Team</th>
            <th scope="col">Type</th><th scope="col">Players</th><th scope="col" class="num">Bid</th>
          </tr></thead>
          <tbody>
            ${transactions
              .slice(0, 100)
              .map(
                (tx) => `<tr>
                  <td class="num">${esc(tx.scoringPeriodId ?? '—')}</td>
                  <th scope="row" class="row-team">${esc(tx.teamName)}</th>
                  <td>${esc(tx.type)}</td>
                  <td>${tx.items.map((i) => `${esc(i.type)} ${esc(i.playerName)}`).join(', ')}</td>
                  <td class="num">${tx.bidAmount ? `$${esc(tx.bidAmount)}` : '—'}</td>
                </tr>`
              )
              .join('')}
          </tbody>
        </table>
      </div>`);
  }

  $('#trades-body').innerHTML = parts.join('');
}

/** Shown before any results exist, so the league can agree rules early. */
const PRIZE_CATALOGUE = [
  ['Highest Single Week', 'Most points scored by anyone in one week'],
  ['Lowest Single Week', 'Fewest points scored by anyone in one week'],
  ['Tough Luck Award', 'Highest score that still lost'],
  ['Stole One', 'Lowest score that still won'],
  ['Biggest Blowout', 'Largest margin of victory'],
  ['Photo Finish', 'Narrowest margin of victory'],
  ['Bench Warmer', 'Most points left on the bench in one week'],
  ['Player of the Year', 'Best single game by a started player'],
  ['Why Did You Start Him', 'Worst single game by a started player'],
  ['Best Manager', 'Highest lineup efficiency across the season'],
  ['Room For Improvement', 'Lowest lineup efficiency'],
  ['Horseshoe Award', 'Won the most games above what the scores deserved'],
  ['Snakebit', 'Won the fewest games relative to how well they scored'],
  ['Old Reliable', 'Smallest week-to-week swing'],
  ['Boom or Bust', 'Largest week-to-week swing'],
  ['True Champion', 'Best record if everyone played everyone every week'],
  ['Season-Long Bench Warmer', 'Most total points benched all season'],
  ['Lineup Savant', 'Most weeks with a perfect lineup'],
];

function renderPrizes() {
  const prizes = state.season?.prizes ?? [];
  const weeklyHigh = state.hub.weeklyHigh ?? [];

  if (!prizes.length) {
    $('#prizes-body').innerHTML = `
      ${emptyState(
        '🏆',
        `${PRIZE_CATALOGUE.length} prizes waiting to be won`,
        'These are computed automatically from the box scores once games are played. Worth agreeing which ones pay out before the draft.'
      )}
      <div class="grid" style="margin-top:1.5rem">
        ${PRIZE_CATALOGUE.map(
          ([label, desc]) => `<div class="prize prize--pending">
            <p class="prize__label">${esc(label)}</p>
            <p class="prize__desc">${esc(desc)}</p>
            <p class="prize__detail"><em>Awaiting results</em></p>
          </div>`
        ).join('')}
      </div>`;
    return;
  }

  const cards = prizes
    .map(
      (p) => `<div class="prize">
        <p class="prize__label">${esc(p.label)}</p>
        <p class="prize__desc">${esc(p.description)}</p>
        <p class="prize__winner">${teamCell(p.winner)}</p>
        <p class="prize__detail">${esc(p.winner.detail ?? '')}</p>
      </div>`
    )
    .join('');

  const weekly = weeklyHigh.length
    ? `<h3 style="margin-top:2rem">Weekly high scores</h3>
       <div class="table-scroll">
         <table>
           <caption>Top scorer each week — often its own small pot</caption>
           <thead><tr><th scope="col" class="num">Week</th><th scope="col">Team</th><th scope="col" class="num">Points</th></tr></thead>
           <tbody>${weeklyHigh
             .map(
               (w) => `<tr><td class="num rank">${esc(w.week)}</td>
                 <th scope="row" class="row-team">${teamCell(w)}</th>
                 <td class="num">${num(w.score, 2)}</td></tr>`
             )
             .join('')}</tbody>
         </table>
       </div>`
    : '';

  $('#prizes-body').innerHTML = `<div class="grid">${cards}</div>${weekly}`;
}

function renderMoney() {
  const m = state.money;
  if (!m) return; // View is not registered at all without data.

  const parts = [];

  if (m.warnings.length) {
    parts.push(`<div class="error" role="alert" style="margin-bottom:1.5rem">
      <strong>Check the ledger config</strong>
      <ul style="margin:0.5rem 0 0;padding-left:1.2rem">
        ${m.warnings.map((w) => `<li>${esc(w)}</li>`).join('')}
      </ul>
    </div>`);
  }

  parts.push(`
    <ul class="stats">
      <li class="stat"><span class="stat__label">Buy-in</span>
        <span class="stat__value">${esc(money(m.buyIn, m.currency))}</span>
        <span class="stat__note">per team</span></li>
      <li class="stat"><span class="stat__label">Total pot</span>
        <span class="stat__value">${esc(money(m.expectedPot, m.currency))}</span>
        <span class="stat__note">${esc(m.expectedTeams)} teams</span></li>
      <li class="stat"><span class="stat__label">Collected</span>
        <span class="stat__value">${esc(money(m.collected, m.currency))}</span>
        <span class="stat__note">${num(m.collectionPct, 0)}% in</span></li>
      <li class="stat"><span class="stat__label">Outstanding</span>
        <span class="stat__value">${esc(money(m.outstanding, m.currency))}</span>
        <span class="stat__note">${esc(m.unpaid.length)} still to pay</span></li>
    </ul>
    <div class="progress"><div class="progress__fill" style="width:${Math.min(100, m.collectionPct)}%"></div></div>
    <p class="stat__note" style="margin-bottom:1.5rem">
      ${esc(money(m.collected, m.currency))} of ${esc(money(m.expectedPot, m.currency))} collected.
    </p>`);

  parts.push(`
    <div class="table-scroll" style="margin-bottom:1.5rem">
      <table>
        <caption>
          Payout structure. "Currently" shows who occupies each paying place right now.
        </caption>
        <thead><tr><th scope="col">Place</th><th scope="col" class="num">Share</th>
          <th scope="col" class="num">Amount</th><th scope="col">Currently</th></tr></thead>
        <tbody>
          ${m.payouts
            .map(
              (p) => `<tr>
                <th scope="row">${esc(p.label)}${
                  p.isRemainder ? ' <span class="pill pill--neutral">Remainder</span>' : ''
                }</th>
                <td class="num">${esc(p.pct)}%</td>
                <td class="num">${esc(money(p.amount, m.currency))}</td>
                <td>${p.teamName ? esc(p.teamName) : '<span class="stat__note">—</span>'}</td>
              </tr>`
            )
            .join('')}
        </tbody>
      </table>
    </div>`);

  if (m.members.length) {
    parts.push(`
      <div class="table-scroll">
        <table>
          <caption>Who has paid</caption>
          <thead><tr><th scope="col">Manager</th><th scope="col">Team</th>
            <th scope="col" class="num">Paid</th><th scope="col" class="num">Balance</th>
            <th scope="col">Status</th></tr></thead>
          <tbody>
            ${m.members
              .map(
                (mem) => `<tr>
                  <th scope="row">${esc(mem.managerName ?? '—')}</th>
                  <td>${
                    mem.awaitingTeam
                      ? '<span class="pill pill--warn">No ESPN team yet</span>'
                      : esc(mem.teamName)
                  }</td>
                  <td class="num">${esc(money(mem.amountPaid, m.currency))}</td>
                  <td class="num">${esc(money(mem.balance, m.currency))}</td>
                  <td>${
                    mem.paid
                      ? '<span class="pill pill--good">Paid</span>'
                      : mem.partial
                        ? '<span class="pill pill--warn">Partial</span>'
                        : '<span class="pill pill--bad">Unpaid</span>'
                  }</td>
                </tr>`
              )
              .join('')}
          </tbody>
        </table>
      </div>`);
  }

  $('#money-body').innerHTML = parts.join('');
}

// --- Weekly challenge ------------------------------------------------------

/**
 * The weekly challenge board.
 *
 * Three states share this view and each needs to read as deliberate:
 *
 *   settled   played, scored, somebody got paid
 *   live      announced, not yet played — this is the one people came to see
 *   sealed    dealt but face-down, because revealing Week 9 in Week 2 turns a
 *             season of small surprises into a spoiler
 *
 * The seed is printed at the bottom on purpose. It is the only thing that makes
 * "the draw was random" checkable rather than merely claimed: anyone can take
 * that string, run the same shuffle, and confirm the deck was never restacked
 * after the games were played.
 */
function renderChallenges() {
  const c = state.hub?.challenges;
  const body = $('#challenges-body');

  if (!c || !c.enabled || !c.weeks.length) {
    body.innerHTML = emptyState(
      '🎲',
      'No weekly challenge configured',
      'Set weeklyChallenge.enabled in config/money.json to turn this on.'
    );
    return;
  }

  const currency = c.currency ?? 'USD';
  const settled = c.weeks.filter((w) => w.winner);
  const live = c.weeks.find((w) => !w.sealed && !w.played);
  const parts = [];

  // --- What is on right now ---------------------------------------------
  parts.push(`
    <section class="hero">
      <p class="hero__eyebrow">${esc(c.cadence === 'biweekly' ? 'Every other week' : 'Every week')} · ${esc(money(c.pot, currency))} in play</p>
      <h2>${live ? `Week ${esc(live.week)}: ${esc(live.label)}` : 'Weekly challenge'}</h2>
      <p class="hero__sub">${
        live
          ? `${esc(live.rule)} <strong>${esc(money(live.amount, currency))}</strong> to the winner.`
          : settled.length === c.weeks.length
            ? 'Every challenge has been settled for the season.'
            : 'The first challenge is revealed once the season is underway.'
      }</p>
    </section>`);

  // --- Money won so far ---------------------------------------------------
  if (c.leaderboard.length) {
    parts.push(`
      <div class="table-scroll">
        <table>
          <caption>Challenge winnings so far</caption>
          <thead><tr>
            <th scope="col" class="num">#</th><th scope="col">Team</th>
            <th scope="col" class="num">Won</th><th scope="col" class="num">Cash</th>
          </tr></thead>
          <tbody>
            ${c.leaderboard
              .map(
                (t, i) => `<tr>
                  <td class="num rank">${esc(i + 1)}</td>
                  <th scope="row" class="row-team">${teamCell(t, t.managerName ?? '', `#team/${t.teamId}`)}</th>
                  <td class="num">${esc(t.challengesWon)}</td>
                  <td class="num">${esc(money(t.amountWon, currency))}</td>
                </tr>`
              )
              .join('')}
          </tbody>
        </table>
      </div>`);
  }

  // --- Every week ---------------------------------------------------------
  const cards = c.weeks
    .map((w) => {
      if (w.sealed) {
        return `<div class="challenge challenge--sealed">
          <p class="challenge__week">Week ${esc(w.week)} · ${esc(money(w.amount, currency))}</p>
          <p class="challenge__label"><span aria-hidden="true">🔒</span> Sealed</p>
          <p class="challenge__rule">Revealed the week it is played.</p>
        </div>`;
      }

      const status = w.winner ? 'won' : w.noWinner ? 'void' : 'live';
      const outcome = w.winner
        ? `<p class="challenge__winner">${teamCell(w.winner, null, `#team/${w.winner.teamId}`)}</p>
           <p class="challenge__detail">${esc(w.winner.detail ?? '')}</p>
           <p class="challenge__payout">${esc(money(w.winner.amount, currency))}${
             (w.tiedWith ?? []).length
               ? ` each — tied with ${esc(w.tiedWith.map((t) => t.teamName).join(', '))}`
               : ''
           }</p>`
        : w.noWinner
          ? '<p class="challenge__detail"><em>Nobody qualified. The pot rolls into the season awards.</em></p>'
          : '<p class="challenge__detail"><em>Not played yet.</em></p>';

      return `<div class="challenge challenge--${esc(status)}">
        <p class="challenge__week">Week ${esc(w.week)} · ${esc(money(w.amount, currency))}</p>
        <p class="challenge__label">${esc(w.label)}</p>
        <p class="challenge__rule">${esc(w.rule)}</p>
        ${outcome}
      </div>`;
    })
    .join('');

  parts.push(`<h3 style="margin-top:2rem">Every week</h3><div class="grid">${cards}</div>`);

  parts.push(`
    <p class="view__intro" style="margin-top:2rem">
      The schedule is a seeded shuffle, dealt once and fixed for the season — no
      challenge repeats, and none of them can change after the games are played.
      Verify it yourself against the seed
      <code>${esc(c.seed)}</code>.
    </p>`);

  body.innerHTML = parts.join('');
}

const RENDERERS = {
  overview: renderOverview,
  standings: renderStandings,
  teams: renderTeams,
  team: renderTeam,
  draft: renderDraft,
  board: renderBoard,
  mock: renderMock,
  trades: renderTrades,
  prizes: renderPrizes,
  challenges: renderChallenges,
  money: renderMoney,
};

// --- Routing ---------------------------------------------------------------

// Keyed by view AND parameter, so navigating team/1 -> team/2 re-renders
// instead of being treated as "already on the team view".
let currentRoute = null;

function show(view, { focus = false, param = null } = {}) {
  if (!VIEWS.includes(view)) view = 'overview';

  for (const v of ALL_VIEWS) {
    const el = $(`#view-${v}`);
    if (el) el.hidden = v !== view;
  }
  for (const link of document.querySelectorAll('.site-nav a')) {
    if (link.dataset.view === view) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }

  const routeKey = `${view}/${param ?? ''}`;
  if (routeKey !== currentRoute) {
    try {
      RENDERERS[view](param === null ? undefined : Number(param));
    } catch (error) {
      const body = $(`#view-${view}`)?.querySelector('div[id$="-body"]');
      if (body) {
        body.innerHTML = `<div class="error" role="alert"><strong>Could not render this view.</strong><p>${esc(error.message)}</p></div>`;
      }
      console.error(error);
    }
    currentRoute = routeKey;
  }

  const heading = $(`#view-${view} h2`);
  $('#route-status').textContent = `${heading.textContent} section loaded`;
  if (focus) $('#main').focus({ preventScroll: false });
}

function onHashChange(isInitial = false) {
  // Routes are either "#standings" or "#team/3".
  const raw = (location.hash || '#overview').slice(1);
  const slash = raw.indexOf('/');
  const view = slash === -1 ? raw : raw.slice(0, slash);
  const param = slash === -1 ? null : raw.slice(slash + 1);
  show(view, { focus: !isInitial, param });
}

// --- Theme -----------------------------------------------------------------

function isLightNow() {
  return (
    document.documentElement.dataset.theme === 'light' ||
    (!document.documentElement.dataset.theme &&
      window.matchMedia('(prefers-color-scheme: light)').matches)
  );
}

function initTheme() {
  const button = $('#theme-toggle');
  const stored = localStorage.getItem('ffh-theme');
  if (stored === 'light' || stored === 'dark') document.documentElement.dataset.theme = stored;

  const sync = () => {
    const light = isLightNow();
    button.textContent = light ? 'Dark theme' : 'Light theme';
    button.setAttribute('aria-pressed', String(light));
  };

  button.addEventListener('click', () => {
    const next = isLightNow() ? 'dark' : 'light';
    document.documentElement.dataset.theme = next;
    localStorage.setItem('ffh-theme', next);
    sync();
  });
  sync();
}

// --- Boot ------------------------------------------------------------------

async function boot() {
  initTheme();
  initImageFallbacks();
  initPlayerCards();

  try {
    const hub = await loadJson('data/hub.json');
    state.hub = hub;

    const year = hub.league.season ?? hub.seasons?.[hub.seasons.length - 1];
    const [season, draft, teamDetail, draftPool, bigBoard, ledger, playerCards] = await Promise.all([
      loadJson(`data/season-${year}.json`).catch(() => null),
      loadJson(`data/draft-${year}.json`).catch(() => null),
      loadJson(`data/teams-${year}.json`).catch(() => null),
      loadJson(`data/draftpool-${year}.json`).catch(() => null),
      loadJson(`data/bigboard-${year}.json`).catch(() => null),
      // Absent on the published site by design — the ledger is never uploaded.
      loadJson('data/money.json').catch(() => null),
      // Hover cards. Optional: an older build has no such file, and every
      // player name simply stays plain text.
      loadJson(`data/players-${year}.json`).catch(() => null),
    ]);
    state.season = season;
    state.draft = draft;
    state.teamDetail = teamDetail;
    state.draftPool = draftPool;
    state.bigBoard = bigBoard;
    state.money = ledger;
    state.playerCards = playerCards;
    syncMyTeamNav();

    if (bigBoard?.available) {
      VIEWS = [...VIEWS, 'board'];
      const navItem = document.querySelector('[data-nav="board"]');
      if (navItem) navItem.hidden = false;
    }

    // The mock draft needs a ranked board; without one there is nothing to
    // draft from, so the tab stays hidden rather than opening onto an error.
    if (draftPool?.players?.length) {
      VIEWS = [...VIEWS, 'mock'];
      const navItem = document.querySelector('[data-nav="mock"]');
      if (navItem) navItem.hidden = false;
    }

    // Register the Money view only when its data is actually present, so the
    // public site has no Money tab at all rather than an empty one.
    if (ledger) {
      VIEWS = [...ALL_VIEWS];
      const navItem = document.querySelector('[data-nav="money"]');
      if (navItem) navItem.hidden = false;
    }

    $('#league-name').textContent = hub.league.displayName ?? hub.league.name;
    $('#league-sub').textContent =
      `${hub.league.season} · ${hub.league.size} teams · ${hub.league.isPPR ? 'PPR' : 'Standard'}`;
    document.title = `${hub.league.displayName ?? hub.league.name} — Fantasy Football Hub`;

    const timeEl = $('#generated-at');
    timeEl.textContent = new Date(hub.generatedAt).toLocaleString();
    timeEl.dateTime = hub.generatedAt;

    if (hub.synthetic) $('#fixture-warning').hidden = false;

    $('#boot').hidden = true;
    onHashChange(true);
    window.addEventListener('hashchange', () => onHashChange(false));
  } catch (error) {
    const boot = $('#boot');
    boot.className = 'error';
    boot.setAttribute('role', 'alert');
    boot.innerHTML = `
      <strong>Could not load league data.</strong>
      <p>${esc(error.message)}</p>
      <p>If you are opening this file directly, the browser blocks local
      <code>fetch</code>. Run <code>npm run serve</code> and open the address it prints.</p>
      <p>If the data files are missing, run <code>npm run fetch</code> then <code>npm run build</code>.</p>`;
    console.error(error);
  }
}

boot();
```

### `docs/assets/mock.js`

*260 lines*

```javascript
/**
 * Mock draft simulator.
 *
 * Practises THIS league's format specifically — 12 teams, 16 rounds, snake, and
 * critically superflex, which ESPN's public mock lobby will not replicate. The
 * board is ranked with ESPN's own SUPERFLEX ranks, where Josh Allen is #1
 * despite being PPR #36; anyone drafting off standard ADP in this league will
 * be badly wrong about quarterbacks, and that is the thing worth rehearsing.
 *
 * Entirely client-side. Nothing is saved, nothing is sent anywhere.
 */

const POSITIONS = ['QB', 'RB', 'WR', 'TE', 'D/ST', 'K'];

/**
 * Roster shapes the AI aims for. Maximums stop a bot hoarding six running
 * backs; minimums make sure everyone ends up with a legal starting lineup.
 */
const TARGETS = {
  QB: { min: 2, max: 3, earliest: 1 },
  RB: { min: 4, max: 6, earliest: 1 },
  WR: { min: 5, max: 7, earliest: 1 },
  TE: { min: 1, max: 2, earliest: 1 },
  'D/ST': { min: 1, max: 1, earliest: 13 },
  K: { min: 1, max: 1, earliest: 15 },
};

const AI_NAMES = [
  'Marcus', 'Tina', 'Dev', 'Sam', 'Jules', 'Casey',
  'Ray', 'Priya', 'Alex', 'Nia', 'Bo', 'Quinn',
];

export function createMockDraft(pool, { userSlot = 1 } = {}) {
  const teamCount = pool.teams ?? 12;
  const rounds = pool.rounds ?? 16;

  const teams = Array.from({ length: teamCount }, (_, i) => ({
    slot: i + 1,
    name: i + 1 === userSlot ? 'You' : `${AI_NAMES[i % AI_NAMES.length]}`,
    isUser: i + 1 === userSlot,
    roster: [],
  }));

  // Snake order: odd rounds ascend, even rounds descend.
  const order = [];
  for (let round = 1; round <= rounds; round += 1) {
    const slots = Array.from({ length: teamCount }, (_, i) => i + 1);
    if (round % 2 === 0) slots.reverse();
    for (const slot of slots) order.push({ round, slot });
  }

  return {
    pool,
    teams,
    order,
    rounds,
    teamCount,
    pickIndex: 0,
    available: pool.players.map((p) => ({ ...p })),
    picks: [],
    get current() {
      return this.order[this.pickIndex] ?? null;
    },
    get isComplete() {
      return this.pickIndex >= this.order.length;
    },
    get onTheClock() {
      const c = this.current;
      return c ? this.teams.find((t) => t.slot === c.slot) : null;
    },
  };
}

const countByPosition = (roster) => {
  const counts = Object.fromEntries(POSITIONS.map((p) => [p, 0]));
  for (const p of roster) if (counts[p.position] !== undefined) counts[p.position] += 1;
  return counts;
};

/**
 * How much this bot wants a given player right now.
 *
 * Board rank does most of the work — ESPN's superflex ranks already price the
 * QB premium in. Need only nudges it, so bots still take clear value rather
 * than reaching for a position because a slot is empty.
 */
function aiScore(player, roster, round, rounds) {
  const counts = countByPosition(roster);
  const target = TARGETS[player.position];
  if (!target) return -Infinity;

  // Hard gates: never over-fill, never take a kicker in round 2.
  if (counts[player.position] >= target.max) return -Infinity;
  if (round < target.earliest) return -Infinity;

  // Base value: earlier board rank is better.
  let score = 1000 - player.rank;

  // Still short of a startable player here — nudge up, harder as picks run out.
  if (counts[player.position] < target.min) {
    const urgency = (round / rounds) * 60;
    score += 25 + urgency;
  }

  // A little randomness so two runs of the same draft aren't identical.
  score += (Math.random() - 0.5) * 45;
  return score;
}

/** Makes the pick currently on the clock for an AI team. */
export function aiPick(draft) {
  const { round } = draft.current;
  const team = draft.onTheClock;

  let best = null;
  let bestScore = -Infinity;
  // Only the top of the board can realistically go next; scanning 60 keeps this
  // instant even on a phone.
  for (const player of draft.available.slice(0, 60)) {
    const score = aiScore(player, team.roster, round, draft.rounds);
    if (score > bestScore) {
      bestScore = score;
      best = player;
    }
  }
  // Every candidate gated out (late rounds, full roster) — take best available.
  return best ?? draft.available[0] ?? null;
}

/** Commits a pick and advances the clock. */
export function makePick(draft, player) {
  if (draft.isComplete || !player) return draft;
  const { round, slot } = draft.current;
  const team = draft.teams.find((t) => t.slot === slot);

  draft.available = draft.available.filter((p) => p.playerId !== player.playerId);
  team.roster.push(player);
  draft.picks.push({
    overall: draft.pickIndex + 1,
    round,
    slot,
    teamName: team.name,
    isUser: team.isUser,
    player,
  });
  draft.pickIndex += 1;
  return draft;
}

/** Runs AI picks until it is the user's turn again, or the draft ends. */
export function advanceToUser(draft, limit = 500) {
  let guard = 0;
  while (!draft.isComplete && !draft.onTheClock.isUser && guard < limit) {
    makePick(draft, aiPick(draft));
    guard += 1;
  }
  return draft;
}

/**
 * Grades every roster once the draft is done.
 *
 * Scored on the projected points of the lineup you could actually START, not
 * the sum of all 16 players — hoarding a fourth quarterback adds nothing on a
 * Sunday, and a grade that rewarded it would teach the wrong lesson.
 */
export function gradeDraft(draft, startingSlots) {
  const SLOT_ELIGIBILITY = {
    0: ['QB'], 2: ['RB'], 4: ['WR'], 6: ['TE'], 16: ['D/ST'], 17: ['K'],
    23: ['RB', 'WR', 'TE'], 7: ['QB', 'RB', 'WR', 'TE'],
    3: ['RB', 'WR'], 5: ['WR', 'TE'],
  };

  const slots = [];
  for (const { slotId, count } of startingSlots ?? []) {
    for (let i = 0; i < count; i += 1) slots.push(slotId);
  }
  // Most restrictive first, so the flex takes whatever is genuinely left over.
  slots.sort((a, b) => (SLOT_ELIGIBILITY[a] ?? []).length - (SLOT_ELIGIBILITY[b] ?? []).length);

  const results = draft.teams.map((team) => {
    const remaining = [...team.roster].sort((a, b) => (b.projected ?? 0) - (a.projected ?? 0));
    const starters = [];

    for (const slotId of slots) {
      const eligible = SLOT_ELIGIBILITY[slotId] ?? [];
      const idx = remaining.findIndex((p) => eligible.includes(p.position));
      if (idx === -1) continue;
      const [picked] = remaining.splice(idx, 1);
      starters.push({ ...picked, slotId });
    }

    const startingPoints = starters.reduce((a, p) => a + (p.projected ?? 0), 0);
    const benchPoints = remaining.reduce((a, p) => a + (p.projected ?? 0), 0);

    return {
      slot: team.slot,
      name: team.name,
      isUser: team.isUser,
      roster: team.roster,
      starters,
      bench: remaining,
      startingPoints: Number(startingPoints.toFixed(1)),
      benchPoints: Number(benchPoints.toFixed(1)),
      byPosition: countByPosition(team.roster),
      // A lineup that cannot be legally filled is worth flagging loudly.
      incompleteLineup: starters.length < slots.length,
    };
  });

  results.sort((a, b) => b.startingPoints - a.startingPoints);

  const scale = ['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'F'];
  results.forEach((r, i) => {
    r.rank = i + 1;
    r.grade = scale[Math.min(scale.length - 1, Math.floor((i / results.length) * scale.length))];
  });

  return results;
}

/**
 * Starting slots this roster still cannot fill.
 *
 * Shown live during the draft rather than only in the final grade — finding out
 * you have no kicker after the last pick teaches nothing you can act on.
 */
export function rosterNeeds(roster, startingSlots) {
  const SLOT_ELIGIBILITY = {
    0: ['QB'], 2: ['RB'], 4: ['WR'], 6: ['TE'], 16: ['D/ST'], 17: ['K'],
    23: ['RB', 'WR', 'TE'], 7: ['QB', 'RB', 'WR', 'TE'],
    3: ['RB', 'WR'], 5: ['WR', 'TE'],
  };
  const SLOT_LABEL = {
    0: 'QB', 2: 'RB', 4: 'WR', 6: 'TE', 16: 'D/ST', 17: 'K', 23: 'FLEX', 7: 'OP', 3: 'RB/WR', 5: 'WR/TE',
  };

  const slots = [];
  for (const { slotId, count } of startingSlots ?? []) {
    for (let i = 0; i < count; i += 1) slots.push(slotId);
  }
  slots.sort((a, b) => (SLOT_ELIGIBILITY[a] ?? []).length - (SLOT_ELIGIBILITY[b] ?? []).length);

  const remaining = [...roster];
  const unfilled = [];
  for (const slotId of slots) {
    const eligible = SLOT_ELIGIBILITY[slotId] ?? [];
    const idx = remaining.findIndex((p) => eligible.includes(p.position));
    if (idx === -1) unfilled.push(SLOT_LABEL[slotId] ?? String(slotId));
    else remaining.splice(idx, 1);
  }
  return unfilled;
}

/** Value relative to where the board said a player should go. */
export function pickValue(pick) {
  if (pick.player.rank === null) return null;
  return pick.overall - pick.player.rank;
}
```

### `docs/_headers`

*33 lines*

```
# Cloudflare Pages response headers.
#
# The site loads no scripts, styles, fonts or data from anywhere but itself.
# The one exception is images: player headshots, NFL team logos and each
# manager's fantasy team logo are hotlinked from ESPN's CDN rather than
# committed to the repo, so `img-src` names those hosts and nothing else.
#
# That list is not decoration. A fantasy team logo is a URL ESPN hands back
# from the league payload, and ESPN's classic UI lets a manager paste in any
# URL they like — so without an allowlist, one manager could point every
# visitor's browser at a server of their choosing and collect the IP and
# user-agent of everyone who opens the site. `sanitizeTeamLogo()` in
# scripts/lib/images.mjs drops off-list logos at build time and this header is
# the second line of the same defence. Keep the two in sync; widening one
# without the other either breaks images or removes the guard.
#
# style-src allows 'unsafe-inline' because the app sets a few styles inline
# (the money progress bar width, some spacing). That is the weakest line here
# and it is deliberate: script-src stays locked to 'self', which is what
# actually stops injected code running. Every rendered value is escaped before
# it reaches innerHTML, and the app takes no user input at all.

/*
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: no-referrer
  Permissions-Policy: geolocation=(), microphone=(), camera=(), interest-cohort=()
  Content-Security-Policy: default-src 'self'; img-src 'self' data: https://a.espncdn.com https://g.espncdn.com https://i.espncdn.com https://s.espncdn.com https://secure.espncdn.com; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'

# League data is regenerated on every push; never let a stale week be cached.
/data/*
  Cache-Control: no-cache, must-revalidate
```

## Tests

The only thing standing between "the maths is right" and "the maths runs" — the league has no real data until the Sept 5 2026 draft.

### `tests/analytics.test.mjs`

*968 lines*

```javascript
/**
 * Verification for the analytics engines.
 *
 * The real league has no data until Sept 5 2026, so these tests are the only
 * thing standing between "the math is right" and "the math runs". Expected
 * values are computed by hand in the comments so a failure tells you which is
 * wrong — the code or the expectation.
 *
 *   npm test
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { optimalLineup, lineupEfficiency, SLOT_ELIGIBILITY } from '../scripts/lib/lineup.mjs';
import {
  buildTeamWeeks,
  computeAllPlay,
  computeTeamStats,
  computeStandings,
  computePrizes,
} from '../scripts/lib/analytics.mjs';
import { computeLedger } from '../scripts/lib/money.mjs';
import { recommendLineup, coachingReport, waiverTargets } from '../scripts/lib/advisor.mjs';
import {
  buildBigBoard,
  computeReplacementLevels,
  simulateConsensusDraft,
  picksForSlot,
} from '../scripts/lib/bigboard.mjs';
import { normalizeSeason, PHASE } from '../scripts/lib/normalize.mjs';
import { resolvePosition } from '../scripts/lib/constants.mjs';

const p = (playerId, name, position, points, started = true) => ({
  playerId,
  name,
  position,
  points,
  started,
});

const STANDARD_SLOTS = [
  { slotId: 0, count: 1 }, // QB
  { slotId: 2, count: 2 }, // RB
  { slotId: 4, count: 2 }, // WR
  { slotId: 6, count: 1 }, // TE
  { slotId: 23, count: 1 }, // FLEX
  { slotId: 16, count: 1 }, // D/ST
  { slotId: 17, count: 1 }, // K
];

// ---------------------------------------------------------------------------
describe('optimalLineup', () => {
  test('fills every slot with the best eligible player', () => {
    const roster = [
      p(1, 'QB1', 'QB', 20),
      p(2, 'RB1', 'RB', 15),
      p(3, 'RB2', 'RB', 12),
      p(4, 'RB3', 'RB', 10),
      p(5, 'WR1', 'WR', 18),
      p(6, 'WR2', 'WR', 9),
      p(7, 'TE1', 'TE', 7),
      p(8, 'K1', 'K', 8),
      p(9, 'DST1', 'D/ST', 6),
    ];
    // QB 20 + RB 15,12 + WR 18,9 + TE 7 + FLEX(best leftover RB/WR/TE = RB3 10)
    //   + K 8 + D/ST 6 = 105
    const result = optimalLineup(roster, STANDARD_SLOTS);
    assert.equal(result.points, 105);
    assert.equal(result.lineup.length, 9);
  });

  test('puts a spare RB in FLEX rather than leaving points on the bench', () => {
    const roster = [
      p(1, 'QB1', 'QB', 10),
      p(2, 'RB1', 'RB', 30),
      p(3, 'RB2', 'RB', 25),
      p(4, 'RB3', 'RB', 22), // must land in FLEX
      p(5, 'WR1', 'WR', 5),
      p(6, 'WR2', 'WR', 4),
      p(7, 'TE1', 'TE', 3),
      p(8, 'K1', 'K', 2),
      p(9, 'DST1', 'D/ST', 1),
    ];
    // 10 + 30 + 25 + 5 + 4 + 3 + 22 + 2 + 1 = 102
    const result = optimalLineup(roster, STANDARD_SLOTS);
    assert.equal(result.points, 102);
    const flex = result.lineup.find((x) => x.slotId === 23);
    assert.equal(flex.playerId, 4);
  });

  test('never counts a player twice', () => {
    const roster = [p(1, 'RB1', 'RB', 20), p(2, 'RB2', 'RB', 10)];
    const result = optimalLineup(roster, [
      { slotId: 2, count: 2 },
      { slotId: 23, count: 1 },
    ]);
    const ids = result.lineup.map((x) => x.playerId);
    assert.equal(new Set(ids).size, ids.length);
    assert.equal(result.points, 30); // FLEX goes empty, not duplicated
  });

  test('leaves a slot empty when no eligible player exists', () => {
    const roster = [p(1, 'RB1', 'RB', 20)];
    const result = optimalLineup(roster, [
      { slotId: 0, count: 1 }, // QB — none rostered
      { slotId: 2, count: 1 },
    ]);
    assert.equal(result.points, 20);
    assert.equal(result.lineup.length, 1);
  });

  test('handles an empty roster without throwing', () => {
    assert.deepEqual(optimalLineup([], STANDARD_SLOTS), { points: 0, lineup: [], benched: [] });
    assert.deepEqual(optimalLineup(null, STANDARD_SLOTS), { points: 0, lineup: [], benched: [] });
  });

  test('reports benched players', () => {
    const roster = [p(1, 'QB1', 'QB', 20), p(2, 'QB2', 'QB', 30)];
    const result = optimalLineup(roster, [{ slotId: 0, count: 1 }]);
    assert.equal(result.points, 30);
    assert.equal(result.benched.length, 1);
    assert.equal(result.benched[0].playerId, 1);
  });

  test('superflex uses the exhaustive path and still beats greedy-by-points', () => {
    // Two overlapping slot types (FLEX and OP) trigger exhaustive search.
    const roster = [
      p(1, 'QB1', 'QB', 25),
      p(2, 'QB2', 'QB', 24),
      p(3, 'RB1', 'RB', 20),
      p(4, 'WR1', 'WR', 18),
      p(5, 'TE1', 'TE', 6),
    ];
    const slots = [
      { slotId: 0, count: 1 }, // QB
      { slotId: 7, count: 1 }, // OP (superflex): QB/RB/WR/TE
      { slotId: 23, count: 1 }, // FLEX: RB/WR/TE
    ];
    // QB 25 + OP(QB2 24) + FLEX(RB1 20) = 69
    const result = optimalLineup(roster, slots);
    assert.equal(result.points, 69);
  });

  test("Roe Leauge's actual superflex roster picks the second QB for the OP slot", () => {
    // The real league starts 1 QB / 2 RB / 2 WR / 1 TE / 1 OP / 1 D-ST / 1 K.
    // Slot 7 (OP) accepts a QB, so a second quarterback outscoring every flex
    // option must be started there. Only one overlapping slot type exists, so
    // this exercises the greedy path rather than the exhaustive one.
    const slots = [
      { slotId: 0, count: 1 }, { slotId: 2, count: 2 }, { slotId: 4, count: 2 },
      { slotId: 6, count: 1 }, { slotId: 7, count: 1 }, { slotId: 16, count: 1 },
      { slotId: 17, count: 1 },
    ];
    const roster = [
      p(1, 'QB1', 'QB', 32), p(2, 'QB2', 'QB', 27),
      p(3, 'RB1', 'RB', 18), p(4, 'RB2', 'RB', 14), p(5, 'RB3', 'RB', 11),
      p(6, 'WR1', 'WR', 16), p(7, 'WR2', 'WR', 12),
      p(8, 'TE1', 'TE', 9), p(9, 'K1', 'K', 8), p(10, 'DST1', 'D/ST', 7),
    ];
    // 32 + 18 + 14 + 16 + 12 + 9 + OP(QB2 27) + 7 + 8 = 143
    const result = optimalLineup(roster, slots);
    assert.equal(result.points, 143);
    const op = result.lineup.find((x) => x.slotId === 7);
    assert.equal(op.playerId, 2, 'OP slot should take the second QB, not a flex player');
  });

  test('lineupEfficiency is a percentage and guards divide-by-zero', () => {
    assert.equal(lineupEfficiency(90, 100), 90);
    assert.equal(lineupEfficiency(100, 100), 100);
    assert.equal(lineupEfficiency(50, 0), null);
  });

  test('FLEX eligibility does not include QB', () => {
    assert.deepEqual(SLOT_ELIGIBILITY[23], ['RB', 'WR', 'TE']);
    assert.ok(!SLOT_ELIGIBILITY[23].includes('QB'));
  });
});

// ---------------------------------------------------------------------------
describe('all-play and luck', () => {
  const teams = [{ id: 1 }, { id: 2 }, { id: 3 }];

  test('one week, three teams: 100 / 90 / 80', () => {
    const rows = [
      { week: 1, teamId: 1, score: 100 },
      { week: 1, teamId: 2, score: 90 },
      { week: 1, teamId: 3, score: 80 },
    ];
    const ap = computeAllPlay(rows, teams);
    assert.deepEqual(
      { w: ap.get(1).wins, l: ap.get(1).losses },
      { w: 2, l: 0 },
      'top scorer beats both'
    );
    assert.deepEqual({ w: ap.get(2).wins, l: ap.get(2).losses }, { w: 1, l: 1 });
    assert.deepEqual({ w: ap.get(3).wins, l: ap.get(3).losses }, { w: 0, l: 2 });
  });

  test('ties count as ties, not wins', () => {
    const rows = [
      { week: 1, teamId: 1, score: 100 },
      { week: 1, teamId: 2, score: 100 },
      { week: 1, teamId: 3, score: 50 },
    ];
    const ap = computeAllPlay(rows, teams);
    assert.equal(ap.get(1).wins, 1);
    assert.equal(ap.get(1).ties, 1);
    assert.equal(ap.get(1).losses, 0);
  });

  test('no games played produces zeros, not NaN', () => {
    const ap = computeAllPlay([], teams);
    assert.equal(ap.get(1).winPct, 0);
    assert.ok(Number.isFinite(ap.get(1).winPct));
  });
});

// ---------------------------------------------------------------------------
/** Minimal two-team, two-week season in normalized shape. */
function miniSeason() {
  const mkRoster = (base) => [
    p(base + 1, 'QB', 'QB', 20),
    p(base + 2, 'RB', 'RB', 15),
    p(base + 3, 'RB', 'RB', 10),
    p(base + 4, 'WR', 'WR', 12),
    p(base + 5, 'WR', 'WR', 8),
    p(base + 6, 'TE', 'TE', 5),
    p(base + 7, 'DST', 'D/ST', 6),
    p(base + 8, 'K', 'K', 4),
    p(base + 9, 'FLEXRB', 'RB', 9),
    p(base + 10, 'BENCH', 'WR', 30, false), // 30 points wasted on the bench
  ];

  return {
    league: {
      size: 2,
      startingSlots: STANDARD_SLOTS,
      regularSeasonWeeks: 2,
      playoffTeams: 1,
      playoffSeedingRule: 'TOTAL_POINTS_SCORED',
    },
    status: { weeksPlayed: 2 },
    teams: [
      { id: 1, name: 'Alpha', abbrev: 'ALP', managerName: 'A', isPlaceholder: false, transactionCounter: {} },
      { id: 2, name: 'Beta', abbrev: 'BET', managerName: 'B', isPlaceholder: false, transactionCounter: {} },
    ],
    weeks: [
      {
        week: 1,
        played: true,
        matchups: [
          {
            playoffTierType: 'NONE',
            home: { teamId: 1, score: 89, roster: mkRoster(100) },
            away: { teamId: 2, score: 70, roster: mkRoster(200) },
          },
        ],
      },
      {
        week: 2,
        played: true,
        matchups: [
          {
            playoffTierType: 'NONE',
            home: { teamId: 1, score: 60, roster: mkRoster(300) },
            away: { teamId: 2, score: 95, roster: mkRoster(400) },
          },
        ],
      },
    ],
  };
}

describe('team stats', () => {
  const season = miniSeason();
  const teamWeeks = buildTeamWeeks(season);
  const stats = computeTeamStats(season, teamWeeks);

  test('produces one row per team per played week', () => {
    assert.equal(teamWeeks.length, 4);
  });

  test('records are computed from actual scores', () => {
    const alpha = stats.find((t) => t.teamId === 1);
    assert.equal(alpha.wins, 1);
    assert.equal(alpha.losses, 1);
    assert.equal(alpha.pointsFor, 149); // 89 + 60
    assert.equal(alpha.pointsAgainst, 165); // 70 + 95
  });

  test('optimal lineup ignores the started flag and finds the bench points', () => {
    // Starters total 89. The 30-point bench WR does not displace the kicker —
    // K has its own slot — it takes a WR slot and pushes WR8 out of the lineup.
    // Optimal: QB20 + RB15,10 + WR30,12 + TE5 + FLEX(RB9, the best leftover)
    //          + DST6 + K4 = 111
    const row = teamWeeks.find((r) => r.teamId === 1 && r.week === 1);
    assert.equal(row.optimalScore, 111);
    assert.equal(row.benchPoints, 22); // 111 - 89
    assert.equal(row.isPerfectLineup, false);
  });

  test('luck is actual wins minus all-play expectation', () => {
    // Two teams, two weeks. Week 1 Alpha wins, week 2 Beta wins.
    // All-play in a two-team league equals the head-to-head record, so each
    // team expects exactly 1 win and luck is 0 for both.
    for (const t of stats) {
      assert.equal(t.expectedWins, 1);
      assert.equal(t.luck, 0);
    }
  });

  test('streak reflects the most recent result', () => {
    const alpha = stats.find((t) => t.teamId === 1);
    assert.equal(alpha.streakType, 'LOSS');
    assert.equal(alpha.streakLength, 1);
  });

  test('standings order by win pct then points', () => {
    const standings = computeStandings(stats, season);
    assert.equal(standings.length, 2);
    // Both 1-1, so total points breaks the tie. Beta 165 > Alpha 149.
    assert.equal(standings[0].teamId, 2);
    assert.equal(standings[0].rank, 1);
  });
});

// ---------------------------------------------------------------------------
describe('prizes', () => {
  const season = miniSeason();
  const teamWeeks = buildTeamWeeks(season);
  const stats = computeTeamStats(season, teamWeeks);
  const prizes = computePrizes(season, stats, teamWeeks);
  const byId = Object.fromEntries(prizes.map((x) => [x.id, x]));

  test('awards the highest and lowest weeks correctly', () => {
    assert.equal(byId.highestWeek.winner.value, 95);
    assert.equal(byId.highestWeek.winner.teamId, 2);
    assert.equal(byId.lowestWeek.winner.value, 60);
    assert.equal(byId.lowestWeek.winner.teamId, 1);
  });

  test('tough luck award goes to the highest-scoring loss', () => {
    // Losses were Beta 70 (wk1) and Alpha 60 (wk2). Highest is 70.
    assert.equal(byId.highestScoringLoss.winner.value, 70);
    assert.equal(byId.highestScoringLoss.winner.teamId, 2);
  });

  test('every prize names a real team', () => {
    for (const prize of prizes) {
      assert.ok(prize.winner, `${prize.id} has no winner`);
      assert.ok(
        season.teams.some((t) => t.id === prize.winner.teamId),
        `${prize.id} points at an unknown team`
      );
    }
  });

  test('an empty season produces no prizes rather than throwing', () => {
    const empty = { ...miniSeason(), weeks: [] };
    const rows = buildTeamWeeks(empty);
    const emptyStats = computeTeamStats(empty, rows);
    assert.deepEqual(computePrizes(empty, emptyStats, rows), []);
  });
});

// ---------------------------------------------------------------------------
describe('money ledger', () => {
  const season = {
    league: { size: 12 },
    teams: Array.from({ length: 12 }, (_, i) => ({
      id: i + 1,
      name: `Team ${i + 1}`,
      managerName: `M${i + 1}`,
      isPlaceholder: false,
    })),
  };
  const config = {
    currency: 'USD',
    buyIn: 50,
    payouts: {
      structure: [
        { id: 'first', label: '1st', pct: 58 },
        { id: 'second', label: '2nd', pct: 25 },
        { id: 'third', label: '3rd', pct: 8 },
        { id: 'sidePots', label: 'Side', pct: 9 },
      ],
    },
    payments: [
      { teamId: 1, paid: true },
      { teamId: 2, amountPaid: 25 },
    ],
  };

  test('pot and payouts are computed from the buy-in', () => {
    const ledger = computeLedger(config, season, []);
    assert.equal(ledger.expectedPot, 600); // 12 x 50
    assert.equal(ledger.collected, 75); // 50 + 25
    assert.equal(ledger.outstanding, 525);
    const amounts = Object.fromEntries(ledger.payouts.map((x) => [x.id, x.amount]));
    assert.equal(amounts.first, 348); // 58% of 600
    assert.equal(amounts.second, 150);
    assert.equal(amounts.third, 48);
    assert.equal(amounts.sidePots, 54);
    assert.equal(
      Object.values(amounts).reduce((a, b) => a + b, 0),
      600,
      'payouts must exhaust the pot'
    );
  });

  test('partial payments are tracked, not rounded to paid', () => {
    const ledger = computeLedger(config, season, []);
    const partial = ledger.members.find((m) => m.teamId === 2);
    assert.equal(partial.paid, false);
    assert.equal(partial.partial, true);
    assert.equal(partial.balance, 25);
    assert.equal(ledger.unpaid.length, 11);
  });

  test('warns when the payouts do not add up to the pot', () => {
    const bad = { ...config, payouts: { structure: [{ id: 'first', label: '1st', pct: 90 }] } };
    const ledger = computeLedger(bad, season, []);
    assert.ok(ledger.warnings.some((w) => w.includes('but the pot is')));
  });

  test('fixed amounts plus a remainder slot', () => {
    // What this league actually agreed: 275 / 125 / 50, rest to side prizes.
    const fixed = {
      currency: 'USD',
      buyIn: 50,
      members: Array.from({ length: 10 }, (_, i) => ({ name: `M${i + 1}`, paid: true })),
      payouts: {
        structure: [
          { id: 'first', label: '1st', amount: 275 },
          { id: 'second', label: '2nd', amount: 125 },
          { id: 'third', label: '3rd', amount: 50 },
          { id: 'sidePots', label: 'Side', remainder: true },
        ],
      },
    };
    const ledger = computeLedger(fixed, season, []);
    assert.equal(ledger.expectedPot, 500);
    const byId = Object.fromEntries(ledger.payouts.map((p) => [p.id, p]));
    assert.equal(byId.first.amount, 275);
    assert.equal(byId.second.amount, 125);
    assert.equal(byId.third.amount, 50);
    assert.equal(byId.sidePots.amount, 50, 'side prizes take what is left');
    assert.equal(byId.sidePots.isRemainder, true);
    assert.equal(
      ledger.payouts.reduce((a, p) => a + p.amount, 0),
      500,
      'the pot must be fully allocated'
    );
    assert.deepEqual(ledger.warnings, []);
    // A percentage is still reported for display even on fixed slots.
    assert.equal(byId.first.pct, 55);
  });

  test('the remainder absorbs a change in league size', () => {
    // An eleventh manager joins: the three places stay put, side prizes grow.
    // This is the reason for a remainder slot rather than four fixed amounts.
    const fixed = {
      currency: 'USD',
      buyIn: 50,
      members: Array.from({ length: 11 }, (_, i) => ({ name: `M${i + 1}`, paid: true })),
      payouts: {
        structure: [
          { id: 'first', label: '1st', amount: 275 },
          { id: 'second', label: '2nd', amount: 125 },
          { id: 'third', label: '3rd', amount: 50 },
          { id: 'sidePots', label: 'Side', remainder: true },
        ],
      },
    };
    const ledger = computeLedger(fixed, season, []);
    assert.equal(ledger.expectedPot, 550);
    const side = ledger.payouts.find((p) => p.id === 'sidePots');
    assert.equal(side.amount, 100, 'the extra buy-in lands in the side pot');
    assert.deepEqual(ledger.warnings, []);
  });

  test('warns when fixed payouts exceed the pot', () => {
    const greedy = {
      currency: 'USD',
      buyIn: 50,
      members: Array.from({ length: 4 }, (_, i) => ({ name: `M${i + 1}`, paid: true })),
      payouts: {
        structure: [
          { id: 'first', label: '1st', amount: 275 },
          { id: 'sidePots', label: 'Side', remainder: true },
        ],
      },
    };
    const ledger = computeLedger(greedy, season, []);
    assert.equal(ledger.expectedPot, 200); // 4 x 50
    assert.ok(ledger.warnings.some((w) => w.includes('more than the')));
  });

  test('a configured member list works before anyone claims an ESPN team', () => {
    // Real life runs ahead of the league settings: people pay before clicking
    // the invite link, so the ledger cannot depend on claimed teams alone.
    const barelyStarted = {
      league: { size: 12 },
      teams: [
        { id: 1, name: "Commissioner's Team", managerName: 'Geordon Roe', isPlaceholder: false },
        ...Array.from({ length: 11 }, (_, i) => ({
          id: i + 2, name: `Team ${i + 2}`, managerName: 'Unclaimed', isPlaceholder: true,
        })),
      ],
    };
    const tenPaid = {
      currency: 'USD',
      buyIn: 50,
      payouts: { structure: [{ id: 'first', label: '1st', pct: 100 }] },
      members: [
        { name: 'Geordon Roe', teamId: 1, paid: true },
        ...Array.from({ length: 9 }, (_, i) => ({ name: `Manager ${i + 2}`, paid: true })),
      ],
    };

    const ledger = computeLedger(tenPaid, barelyStarted, []);
    assert.equal(ledger.expectedTeams, 10, 'ten payers, not twelve ESPN slots');
    assert.equal(ledger.expectedPot, 500);
    assert.equal(ledger.collected, 500);
    assert.equal(ledger.outstanding, 0);
    assert.equal(ledger.unpaid.length, 0);
    // The one who claimed a team gets its real name; the rest are flagged.
    assert.equal(ledger.members[0].teamName, "Commissioner's Team");
    assert.equal(ledger.members[0].awaitingTeam, false);
    assert.equal(ledger.members.filter((m) => m.awaitingTeam).length, 9);
  });

  test('placeholder teams do not owe money', () => {
    const partialLeague = {
      league: { size: 12 },
      teams: [
        { id: 1, name: 'Real', managerName: 'A', isPlaceholder: false },
        { id: 2, name: 'Team 2', managerName: 'Unclaimed', isPlaceholder: true },
      ],
    };
    const ledger = computeLedger(config, partialLeague, []);
    assert.equal(ledger.expectedTeams, 1);
    assert.equal(ledger.expectedPot, 50);
  });
});

// ---------------------------------------------------------------------------
describe('roster advisor', () => {
  /** Roster where the best QB is wrongly benched behind a worse one. */
  const proj = (playerId, name, position, projected, slotId) => ({
    playerId, name, position, projected, slotId,
    slot: slotId === 20 ? 'BE' : position,
  });

  const SLOTS = [
    { slotId: 0, count: 1 }, { slotId: 2, count: 2 }, { slotId: 4, count: 2 },
    { slotId: 6, count: 1 }, { slotId: 23, count: 1 }, { slotId: 16, count: 1 },
    { slotId: 17, count: 1 },
  ];

  const badLineup = [
    proj(1, 'Bad QB', 'QB', 9, 0), // starting
    proj(2, 'Good QB', 'QB', 24, 20), // benched — should start
    proj(3, 'RB1', 'RB', 16, 2), proj(4, 'RB2', 'RB', 13, 2),
    proj(5, 'WR1', 'WR', 15, 4), proj(6, 'WR2', 'WR', 11, 4),
    proj(7, 'TE1', 'TE', 8, 6), proj(8, 'FLEX', 'RB', 10, 23),
    proj(9, 'DST', 'D/ST', 7, 16), proj(10, 'K', 'K', 6, 17),
  ];

  test('recommends the benched player who should be starting', () => {
    const advice = recommendLineup(badLineup, SLOTS);
    assert.equal(advice.available, true);
    assert.equal(advice.alreadyOptimal, false);
    assert.deepEqual(advice.toStart.map((p) => p.name), ['Good QB']);
    assert.deepEqual(advice.toSit.map((p) => p.name), ['Bad QB']);
    assert.equal(advice.projectedGain, 15); // 24 - 9
  });

  test('never pairs players across incompatible slots', () => {
    // The failure this guards against: zipping "start" and "sit" lists by index
    // produces advice like "start this QB instead of that TE", which is not a
    // legal move. The two lists must stay independent.
    const advice = recommendLineup(badLineup, SLOTS);
    assert.ok(!('swaps' in advice), 'must not emit invented 1:1 swaps');
    assert.equal(advice.toStart.length, advice.toSit.length);
  });

  test('says nothing when the lineup is already optimal', () => {
    const good = [
      proj(1, 'QB', 'QB', 24, 0),
      proj(3, 'RB1', 'RB', 16, 2), proj(4, 'RB2', 'RB', 13, 2),
      proj(5, 'WR1', 'WR', 15, 4), proj(6, 'WR2', 'WR', 11, 4),
      proj(7, 'TE1', 'TE', 8, 6), proj(8, 'FLEX', 'RB', 10, 23),
      proj(9, 'DST', 'D/ST', 7, 16), proj(10, 'K', 'K', 6, 17),
      proj(11, 'Scrub', 'WR', 2, 20),
    ];
    const advice = recommendLineup(good, SLOTS);
    assert.equal(advice.alreadyOptimal, true);
    assert.deepEqual(advice.toStart, []);
  });

  test('stays quiet about sub-point improvements', () => {
    const marginal = [
      proj(1, 'QB', 'QB', 20, 0),
      proj(3, 'RB1', 'RB', 16, 2), proj(4, 'RB2', 'RB', 13, 2),
      proj(5, 'WR1', 'WR', 15, 4), proj(6, 'WR2', 'WR', 11, 4),
      proj(7, 'TE1', 'TE', 8, 6), proj(8, 'FLEX', 'RB', 10, 23),
      proj(9, 'DST', 'D/ST', 7, 16), proj(10, 'K', 'K', 6, 17),
      proj(11, 'Barely better', 'RB', 10.4, 20), // +0.4 over the flex
    ];
    const advice = recommendLineup(marginal, SLOTS);
    assert.equal(advice.alreadyOptimal, true, 'a 0.4-point edge is noise, not advice');
  });

  test('handles an empty roster without throwing', () => {
    const advice = recommendLineup([], SLOTS);
    assert.equal(advice.available, false);
    assert.deepEqual(advice.toStart, []);
  });

  test('coaching report costs a loss only when the points would have flipped it', () => {
    const rows = [
      {
        week: 1, result: 'LOSS', margin: -5, benchPoints: 20, score: 100, optimalScore: 120,
        starters: [p(1, 'Started', 'QB', 5)],
        benchPlayers: [p(2, 'Benched', 'QB', 25)],
      },
      {
        week: 2, result: 'LOSS', margin: -40, benchPoints: 20, score: 100, optimalScore: 120,
        starters: [p(3, 'Started', 'QB', 5)],
        benchPlayers: [p(4, 'Benched', 'QB', 25)],
      },
    ];
    const report = coachingReport(rows, [{ slotId: 0, count: 1 }]);
    assert.equal(report.available, true);
    assert.equal(report.worstCalls.length, 2);
    // Week 1 lost by 5 with 20 points benched — the lineup call lost it.
    // Week 2 lost by 40; the same mistake would not have saved it.
    assert.equal(report.gamesCostByBadLineups, 1);
    assert.equal(report.worstCalls.find((c) => c.week === 1).changedResult, true);
    assert.equal(report.worstCalls.find((c) => c.week === 2).changedResult, false);
  });

  test('waiver targets must clearly beat the weakest starter', () => {
    const roster = [
      proj(1, 'QB', 'QB', 20, 0),
      proj(3, 'RB1', 'RB', 16, 2), proj(4, 'RB2', 'RB', 8, 2),
      proj(5, 'WR1', 'WR', 15, 4), proj(6, 'WR2', 'WR', 12, 4),
      proj(7, 'TE1', 'TE', 9, 6), proj(8, 'FLEX', 'RB', 7, 23),
      proj(9, 'DST', 'D/ST', 7, 16), proj(10, 'K', 'K', 6, 17),
    ];
    const fas = [
      { playerId: 90, name: 'Clear upgrade', position: 'RB', projected: 14 },
      { playerId: 91, name: 'Marginal', position: 'RB', projected: 8.5 },
      { playerId: 92, name: 'Worse', position: 'WR', projected: 3 },
    ];
    const result = waiverTargets(fas, roster, SLOTS);
    assert.equal(result.available, true);
    const names = result.targets.map((t) => t.name);
    assert.ok(names.includes('Clear upgrade'));
    assert.ok(!names.includes('Marginal'), 'a sub-2-point edge is not worth a roster move');
    assert.ok(!names.includes('Worse'));
  });

  test('waiver targets flag injured starters', () => {
    const roster = [{ ...proj(1, 'Hurt QB', 'QB', 18, 0), injuryStatus: 'OUT' }];
    const result = waiverTargets(
      [{ playerId: 90, name: 'Healthy QB', position: 'QB', projected: 15 }],
      roster,
      [{ slotId: 0, count: 1 }]
    );
    assert.equal(result.injuryGaps.length, 1);
    assert.equal(result.injuryGaps[0].name, 'Hurt QB');
  });
});

// ---------------------------------------------------------------------------
describe('big board', () => {
  /** Board with a clear talent gradient at every position. */
  const makePool = (startingSlots, teams = 12) => {
    const players = [];
    let id = 1;
    const add = (position, count, top, step) => {
      for (let i = 0; i < count; i += 1) {
        players.push({
          playerId: id, name: `${position}${i + 1}`, position,
          proTeam: 'FA', rank: id, pprRank: id, adp: id,
          projected: top - i * step, lastSeason: null, auctionValue: null,
          injuryStatus: null,
        });
        id += 1;
      }
    };
    add('QB', 40, 400, 5);
    add('RB', 60, 350, 4);
    add('WR', 70, 340, 3);
    add('TE', 30, 260, 5);
    add('D/ST', 20, 140, 2);
    add('K', 20, 150, 1);
    return { players, startingSlots, teams, rankType: 'SUPERFLEX' };
  };

  const SUPERFLEX_SLOTS = [
    { slotId: 0, count: 1 }, { slotId: 2, count: 2 }, { slotId: 4, count: 2 },
    { slotId: 6, count: 1 }, { slotId: 7, count: 1 }, { slotId: 16, count: 1 },
    { slotId: 17, count: 1 },
  ];
  const STANDARD_FLEX_SLOTS = [
    { slotId: 0, count: 1 }, { slotId: 2, count: 2 }, { slotId: 4, count: 2 },
    { slotId: 6, count: 1 }, { slotId: 23, count: 1 }, { slotId: 16, count: 1 },
    { slotId: 17, count: 1 },
  ];

  test('superflex pushes QB replacement level to QB24, not QB12', () => {
    // This is the whole reason replacement level is derived rather than
    // hardcoded. With an OP slot, quarterbacks absorb all 12 flex spots.
    const pool = makePool(SUPERFLEX_SLOTS);
    const { startersNeeded } = computeReplacementLevels(pool.players, SUPERFLEX_SLOTS, 12);
    assert.equal(startersNeeded.QB, 24, '12 QB slots + 12 OP slots all taken by QBs');
    assert.equal(startersNeeded.TE, 12);
  });

  test('a standard FLEX league keeps QB replacement at QB12', () => {
    const pool = makePool(STANDARD_FLEX_SLOTS);
    const { startersNeeded } = computeReplacementLevels(pool.players, STANDARD_FLEX_SLOTS, 12);
    assert.equal(startersNeeded.QB, 12, 'a RB/WR/TE flex must never take a QB');
    // The flex goes to whichever of RB/WR/TE is best; totals must still add up.
    assert.equal(startersNeeded.RB + startersNeeded.WR + startersNeeded.TE, 24 + 24 + 12 + 12);
  });

  test('VORP is measured against the same-position replacement', () => {
    const pool = makePool(SUPERFLEX_SLOTS);
    const board = buildBigBoard(pool, null, 250);
    const qb1 = board.players.find((p) => p.name === 'QB1');
    // QB24 is replacement: 400 - 23*5 = 285. QB1 projects 400. VORP = 115.
    assert.equal(qb1.replacement, 285);
    assert.equal(qb1.vorp, 115);
  });

  test('a 260-point TE outranks a 300-point QB when replacement says so', () => {
    // The point of VORP: raw projections are not comparable across positions.
    const pool = makePool(SUPERFLEX_SLOTS);
    const board = buildBigBoard(pool, null, 250);
    const te1 = board.players.find((p) => p.name === 'TE1'); // 260 proj
    const qb20 = board.players.find((p) => p.name === 'QB20'); // 305 proj
    assert.ok(te1.projected < qb20.projected, 'the TE really does project lower');
    assert.ok(te1.vorp > qb20.vorp, 'but is worth more above replacement');
    assert.ok(te1.valueRank < qb20.valueRank, 'so it must rank higher');
  });

  test('tiers are per position and produce usable groups, not tiers of one', () => {
    const pool = makePool(SUPERFLEX_SLOTS);
    const board = buildBigBoard(pool, null, 250);
    for (const position of ['QB', 'RB', 'WR']) {
      const group = board.players.filter((p) => p.position === position);
      const tiers = new Set(group.map((p) => p.tier));
      assert.ok(tiers.size >= 2, `${position} should have multiple tiers`);
      assert.ok(tiers.size <= 6, `${position} should not exceed the tier cap`);
      assert.equal(Math.min(...tiers), 1, `${position} tiers start at 1`);
    }
  });

  test('the grade curve stays sane rather than piling up at the extremes', () => {
    // The regression this guards: fixed ±40 thresholds applied to a 250-player
    // board put 54% of players at A+ or F.
    const pool = makePool(SUPERFLEX_SLOTS);
    const board = buildBigBoard(pool, null, 250);
    const extremes = board.players.filter((p) => p.grade === 'A+' || p.grade === 'F').length;
    assert.ok(
      extremes / board.players.length < 0.25,
      `expected under 25% at the extremes, got ${extremes}/${board.players.length}`
    );
    assert.ok(board.players.every((p) => p.grade !== null));
  });

  test('kickers and defences are flagged as streamable', () => {
    const pool = makePool(SUPERFLEX_SLOTS);
    const board = buildBigBoard(pool, null, 250);
    assert.equal(board.players.find((p) => p.position === 'K').streamable, true);
    assert.equal(board.players.find((p) => p.position === 'RB').streamable, false);
    assert.equal(board.positionValue.find((p) => p.position === 'K').streamable, true);
  });

  test('draft picks attach to players once the draft has happened', () => {
    const pool = makePool(SUPERFLEX_SLOTS);
    const target = pool.players[0];
    const draft = {
      held: true,
      picks: [{ playerId: target.playerId, overall: 3, round: 1, teamId: 7, teamName: 'Some Team', managerName: 'Sam' }],
    };
    const board = buildBigBoard(pool, draft, 250);
    const drafted = board.players.find((p) => p.playerId === target.playerId);
    assert.equal(drafted.drafted, true);
    assert.equal(drafted.pick.overall, 3);
    assert.equal(drafted.pick.teamName, 'Some Team');
    assert.equal(board.players.filter((p) => p.drafted).length, 1);
  });

  test('an empty pool returns unavailable rather than throwing', () => {
    const board = buildBigBoard({ players: [], startingSlots: SUPERFLEX_SLOTS, teams: 12 }, null, 250);
    assert.equal(board.available, false);
    assert.deepEqual(board.players, []);
  });

  test('recommended pick keeps kickers and defences out of the early rounds', () => {
    // The reason this is a simulation and not just "value rank as a pick
    // number": VORP rates kickers highly, so a naive mapping would recommend
    // one in round four. Nobody would follow that.
    const pool = makePool(SUPERFLEX_SLOTS);
    const board = buildBigBoard({ ...pool, rounds: 16 }, null, 250);
    const lateOnly = board.players.filter(
      (p) => (p.position === 'K' || p.position === 'D/ST') && p.recommendedPick !== null
    );
    assert.ok(lateOnly.length > 0, 'some kickers should be draftable');
    for (const p of lateOnly) {
      assert.ok(
        p.recommendedRound >= 15,
        `${p.name} recommended in round ${p.recommendedRound}, should be 15+`
      );
    }
  });

  test('recommended picks are unique and never exceed the draft', () => {
    const pool = makePool(SUPERFLEX_SLOTS);
    const board = buildBigBoard({ ...pool, rounds: 16 }, null, 250);
    const picks = board.players.map((p) => p.recommendedPick).filter((n) => n !== null);
    assert.equal(new Set(picks).size, picks.length, 'two players cannot share a pick');
    assert.ok(Math.max(...picks) <= 16 * 12);
  });

  test('the consensus draft respects roster capacity', () => {
    const pool = makePool(SUPERFLEX_SLOTS);
    const ranked = buildBigBoard({ ...pool, rounds: 16 }, null, 400).players;
    const result = simulateConsensusDraft(
      ranked.map((p) => ({ playerId: p.playerId, position: p.position })),
      { startingSlots: SUPERFLEX_SLOTS, teams: 12, rounds: 16 }
    );
    // Rebuild each roster from the pick order and check nobody hoarded.
    const positionOf = new Map(ranked.map((p) => [p.playerId, p.position]));
    const rosters = Array.from({ length: 12 }, () => ({}));
    for (const [playerId, { pick, round }] of result) {
      const idx = (pick - 1) % 12;
      const teamIndex = round % 2 === 1 ? idx : 11 - idx;
      const pos = positionOf.get(playerId);
      rosters[teamIndex][pos] = (rosters[teamIndex][pos] ?? 0) + 1;
    }
    for (const roster of rosters) {
      assert.ok((roster.K ?? 0) <= 1, 'never more than one kicker');
      assert.ok((roster['D/ST'] ?? 0) <= 1, 'never more than one defence');
      assert.ok((roster.QB ?? 0) <= 3, 'superflex allows 2 starters plus a backup');
      assert.ok((roster.TE ?? 0) <= 3);
    }
  });

  test('undraftable players are flagged rather than left blank', () => {
    const pool = makePool(SUPERFLEX_SLOTS);
    const board = buildBigBoard({ ...pool, rounds: 16 }, null, 250);
    const undraftable = board.players.filter((p) => !p.draftable);
    assert.ok(undraftable.length > 0, 'a 250-deep board exceeds 192 picks');
    for (const p of undraftable) assert.equal(p.recommendedPick, null);
  });

  test('snake pick numbers are right for the turn slots', () => {
    // Slot 1 picks first then waits the longest; slot 12 picks back to back.
    const first = picksForSlot(1, 12, 4).map((p) => p.overall);
    assert.deepEqual(first, [1, 24, 25, 48]);
    const last = picksForSlot(12, 12, 4).map((p) => p.overall);
    assert.deepEqual(last, [12, 13, 36, 37]);
    const middle = picksForSlot(6, 12, 3).map((p) => p.overall);
    assert.deepEqual(middle, [6, 19, 30]);
  });

  test('honours the publish limit', () => {
    const pool = makePool(SUPERFLEX_SLOTS);
    assert.equal(buildBigBoard(pool, null, 50).players.length, 50);
    assert.equal(buildBigBoard(pool, null, 250).players.length, 240); // pool has 240
  });
});

// ---------------------------------------------------------------------------
describe('position resolution', () => {
  test('uses defaultPositionId, not lineupSlotId', () => {
    // defaultPositionId 3 is WR. On the lineup-slot scale, 3 means RB/WR.
    assert.equal(resolvePosition({ defaultPositionId: 3 }), 'WR');
    assert.equal(resolvePosition({ defaultPositionId: 4 }), 'TE');
    assert.equal(resolvePosition({ defaultPositionId: 1 }), 'QB');
    assert.equal(resolvePosition({ defaultPositionId: 5 }), 'K');
    assert.equal(resolvePosition({ defaultPositionId: 16 }), 'D/ST');
  });

  test('falls back to eligibleSlots when the id is unknown', () => {
    assert.equal(resolvePosition({ defaultPositionId: 999, eligibleSlots: [4, 23, 20] }), 'WR');
    assert.equal(resolvePosition({ eligibleSlots: [0, 20] }), 'QB');
  });

  test('returns UNKNOWN rather than guessing', () => {
    assert.equal(resolvePosition({}), 'UNKNOWN');
    assert.equal(resolvePosition(null), 'UNKNOWN');
  });
});

// ---------------------------------------------------------------------------
describe('phase detection', () => {
  const shell = (overrides = {}) => ({
    league: {
      id: 1,
      seasonId: 2026,
      settings: {
        name: 'Test',
        size: 2,
        rosterSettings: { lineupSlotCounts: { 0: 1, 20: 5 } },
        scheduleSettings: { matchupPeriodCount: 14, playoffTeamCount: 1 },
      },
      status: { teamsJoined: 1, finalScoringPeriod: 17, latestScoringPeriod: 0 },
      teams: [
        { id: 1, name: 'Claimed', owners: ['x'] },
        { id: 2, name: 'Team 2' },
      ],
      members: [{ id: 'x', firstName: 'A', lastName: 'B' }],
      ...overrides.league,
    },
    draft: overrides.draft ?? { draftDetail: { picks: [] } },
    weeks: overrides.weeks ?? [],
    players: [],
  });

  test('an unfilled, undrafted league is EMPTY', () => {
    const s = normalizeSeason(shell());
    assert.equal(s.status.phase, PHASE.EMPTY);
  });

  test('a pre-built draft board with playerId -1 does not count as drafted', () => {
    // This is exactly the real league's current state: 192 slots, none used.
    const s = normalizeSeason(
      shell({
        draft: {
          draftDetail: {
            drafted: false,
            picks: Array.from({ length: 192 }, (_, i) => ({
              playerId: -1,
              overallPickNumber: i + 1,
              roundId: 1,
              roundPickNumber: i + 1,
              teamId: 1,
            })),
          },
        },
      })
    );
    assert.equal(s.draft.held, false);
    assert.equal(s.draft.picksMade, 0);
    assert.equal(s.status.phase, PHASE.EMPTY);
  });

  test('unclaimed teams are flagged as placeholders', () => {
    const s = normalizeSeason(shell());
    assert.equal(s.teams[0].isPlaceholder, false);
    assert.equal(s.teams[1].isPlaceholder, true);
    assert.equal(s.teams[1].managerName, 'Unclaimed');
  });

  test('owner display names come from members, not team names', () => {
    const s = normalizeSeason(shell());
    assert.equal(s.teams[0].managerName, 'A B');
  });
});
```

### `tests/challenges.test.mjs`

*405 lines*

```javascript
/**
 * Verification for the weekly challenge.
 *
 * The determinism tests are the important ones and are not a formality. This
 * feature pays real money off a random draw, and the draw runs on every build —
 * including the builds that happen *after* the games. If the shuffle were ever
 * to become non-reproducible, the site would silently re-pick Week 4's
 * challenge with Week 4's results already known, which is indistinguishable
 * from rigging it. A test that fails loudly is the only thing standing between
 * that and a league argument nobody can settle.
 *
 *   npm test
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  CHALLENGE_DECK,
  buildChallengeSchedule,
  challengeSeed,
  computeChallenges,
  challengeLeaderboard,
} from '../scripts/lib/challenges.mjs';
import { splitPot, computePayouts, challengePayout } from '../scripts/lib/money.mjs';

const LEAGUE = { leagueId: 274568741, season: 2026, weeks: 13 };

/** A started player. */
const s = (name, position, points, extra = {}) => ({
  playerId: name.length * 7,
  name,
  position,
  points,
  projected: points,
  started: true,
  slotId: 20,
  ...extra,
});

/**
 * One team's week. Mirrors what buildTeamWeeks() emits, which is what the
 * challenge scorers actually run against.
 */
function row(teamId, week, score, opts = {}) {
  const starters = opts.starters ?? [s(`P${teamId}`, 'QB', score)];
  const sorted = [...starters].sort((a, b) => b.points - a.points);
  return {
    week,
    teamId,
    opponentId: opts.opponentId ?? null,
    score,
    opponentScore: opts.opponentScore ?? 0,
    margin: Number((score - (opts.opponentScore ?? 0)).toFixed(2)),
    result: opts.result ?? 'WIN',
    optimalScore: opts.optimalScore ?? score,
    efficiency: opts.efficiency ?? 100,
    benchPoints: opts.benchPoints ?? 0,
    isPerfectLineup: true,
    starters,
    benchPlayers: opts.benchPlayers ?? [],
    topStarter: sorted[0] ?? null,
    worstStarter: sorted[sorted.length - 1] ?? null,
  };
}

// ---------------------------------------------------------------------------
describe('challenge schedule', () => {
  test('the same league and season always deal the same cards', () => {
    const a = buildChallengeSchedule(LEAGUE);
    const b = buildChallengeSchedule(LEAGUE);
    assert.deepEqual(
      a.weeks.map((w) => w.challengeId),
      b.weeks.map((w) => w.challengeId),
      'the draw must be reproducible — a build after the games must not re-pick'
    );
  });

  test('a different league gets a different deal', () => {
    const ours = buildChallengeSchedule(LEAGUE).weeks.map((w) => w.challengeId);
    const theirs = buildChallengeSchedule({ ...LEAGUE, leagueId: 999 }).weeks.map((w) => w.challengeId);
    assert.notDeepEqual(ours, theirs);
  });

  test('changing the salt reshuffles the season', () => {
    const before = buildChallengeSchedule(LEAGUE).weeks.map((w) => w.challengeId);
    const after = buildChallengeSchedule({ ...LEAGUE, salt: 'redo' }).weeks.map((w) => w.challengeId);
    assert.notDeepEqual(before, after);
  });

  test('nothing repeats within a season', () => {
    const ids = buildChallengeSchedule(LEAGUE).weeks.map((w) => w.challengeId);
    assert.equal(new Set(ids).size, ids.length);
  });

  test('one challenge per regular-season week', () => {
    const schedule = buildChallengeSchedule(LEAGUE);
    assert.equal(schedule.weeks.length, 13);
    assert.deepEqual(
      schedule.weeks.map((w) => w.week),
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]
    );
  });

  test('bi-weekly deals every other week', () => {
    const schedule = buildChallengeSchedule({ ...LEAGUE, cadence: 'biweekly' });
    assert.deepEqual(
      schedule.weeks.map((w) => w.week),
      [1, 3, 5, 7, 9, 11, 13]
    );
  });

  test('a season longer than the deck reshuffles instead of running dry', () => {
    const long = buildChallengeSchedule({ ...LEAGUE, weeks: CHALLENGE_DECK.length + 4 });
    assert.equal(long.weeks.length, CHALLENGE_DECK.length + 4);
    assert.ok(long.weeks.every((w) => w.challengeId));
  });

  test('every dealt card exists in the deck', () => {
    const ids = new Set(CHALLENGE_DECK.map((c) => c.id));
    for (const week of buildChallengeSchedule(LEAGUE).weeks) {
      assert.ok(ids.has(week.challengeId), `unknown challenge ${week.challengeId}`);
    }
  });

  test('the seed names the league and season, so it can be checked by hand', () => {
    assert.equal(challengeSeed({ leagueId: 1, season: 2026 }), 'roe-challenge:1:2026');
    assert.equal(challengeSeed({ leagueId: 1, season: 2026, salt: 'x' }), 'roe-challenge:1:2026:x');
  });

  test('deck ids are unique — a duplicate would silently drop a challenge', () => {
    const ids = CHALLENGE_DECK.map((c) => c.id);
    assert.equal(new Set(ids).size, ids.length);
  });
});

// ---------------------------------------------------------------------------
describe('challenge scoring', () => {
  const deck = CHALLENGE_DECK;
  const only = (id) => deck.filter((c) => c.id === id);
  const scheduleFor = (id, week = 1) => ({
    seed: 'test',
    cadence: 'weekly',
    startWeek: 1,
    weeks: [{ week, challengeId: id, label: id, rule: '' }],
  });

  const resolve = (id, teamWeeks, opts = {}) =>
    computeChallenges({
      schedule: scheduleFor(id),
      teamWeeks,
      weeksPlayed: 1,
      deck: only(id),
      payouts: new Map([[1, 15]]),
      ...opts,
    })[0];

  test('highest score wins Top Gun', () => {
    const out = resolve('highScore', [row(1, 1, 110), row(2, 1, 130), row(3, 1, 99)]);
    assert.equal(out.winner.teamId, 2);
    assert.equal(out.winner.amount, 15);
  });

  test('Price Is Right busts anyone over 100', () => {
    // Team 2 scores highest but goes over, so 99.5 beats it.
    const out = resolve('closestTo100', [row(1, 1, 99.5), row(2, 1, 140), row(3, 1, 80)]);
    assert.equal(out.winner.teamId, 1);
  });

  test('Price Is Right has no winner when everybody busts', () => {
    const out = resolve('closestTo100', [row(1, 1, 120), row(2, 1, 140)]);
    assert.equal(out.winner, null);
    assert.equal(out.noWinner, true);
  });

  test('Photo Finish wants the smallest winning margin, not the largest', () => {
    const out = resolve('narrowestWin', [
      row(1, 1, 100, { opponentScore: 99, result: 'WIN' }),
      row(2, 1, 150, { opponentScore: 100, result: 'WIN' }),
      row(3, 1, 90, { opponentScore: 120, result: 'LOSS' }),
    ]);
    assert.equal(out.winner.teamId, 1);
  });

  test('Stole One wants the lowest winning score', () => {
    const out = resolve('uglyWin', [
      row(1, 1, 80, { opponentScore: 79, result: 'WIN' }),
      row(2, 1, 150, { opponentScore: 100, result: 'WIN' }),
      row(3, 1, 60, { opponentScore: 200, result: 'LOSS' }),
    ]);
    assert.equal(out.winner.teamId, 1, 'the 60 lost, so it must not win a prize for winning');
  });

  test('Robbed only considers losses', () => {
    const out = resolve('toughLuck', [
      row(1, 1, 160, { opponentScore: 100, result: 'WIN' }),
      row(2, 1, 150, { opponentScore: 155, result: 'LOSS' }),
    ]);
    assert.equal(out.winner.teamId, 2);
  });

  test('a position challenge reads only that position', () => {
    const out = resolve('bestTE', [
      row(1, 1, 100, { starters: [s('Big QB', 'QB', 40), s('Small TE', 'TE', 8)] }),
      row(2, 1, 90, { starters: [s('Ok QB', 'QB', 20), s('Big TE', 'TE', 22)] }),
    ]);
    assert.equal(out.winner.teamId, 2);
    assert.match(out.winner.detail, /Big TE/);
  });

  test('a team with nobody at that position simply does not qualify', () => {
    const out = resolve('bestTE', [
      row(1, 1, 100, { starters: [s('QB only', 'QB', 40)] }),
      row(2, 1, 50, { starters: [s('A TE', 'TE', 5)] }),
    ]);
    assert.equal(out.winner.teamId, 2);
  });

  test('Best In Show counts how many teams you would have beaten', () => {
    const out = resolve('allPlayWeek', [row(1, 1, 100), row(2, 1, 120), row(3, 1, 90)]);
    assert.equal(out.winner.teamId, 2);
    assert.equal(out.winner.value, 2);
  });

  test('a tie splits the pot rather than inventing a tiebreak', () => {
    const out = resolve('highScore', [row(1, 1, 120), row(2, 1, 120), row(3, 1, 90)]);
    assert.equal(out.winner.amount, 7.5);
    assert.equal(out.tiedWith.length, 1);
    assert.equal(out.tiedWith[0].amount, 7.5);
    assert.equal(out.winner.amount + out.tiedWith[0].amount, 15);
  });

  test('every challenge in the deck scores a normal week without throwing', () => {
    const starters = [
      s('QB', 'QB', 24, { slotId: 0 }),
      s('RB1', 'RB', 14, { slotId: 2 }),
      s('RB2', 'RB', 9, { slotId: 2 }),
      s('WR1', 'WR', 18, { slotId: 4 }),
      s('WR2', 'WR', 11, { slotId: 4 }),
      s('TE', 'TE', 7, { slotId: 6 }),
      s('OP', 'QB', 21, { slotId: 7 }),
      s('DST', 'D/ST', 6, { slotId: 16 }),
      s('K', 'K', 8, { slotId: 17 }),
    ];
    const teamWeeks = [
      row(1, 1, 118, { starters, opponentScore: 100, result: 'WIN', benchPoints: 12, efficiency: 91 }),
      row(2, 1, 100, { starters, opponentScore: 118, result: 'LOSS', benchPoints: 3, efficiency: 97 }),
    ];

    for (const card of CHALLENGE_DECK) {
      const out = computeChallenges({
        schedule: scheduleFor(card.id),
        teamWeeks,
        weeksPlayed: 1,
        payouts: new Map([[1, 15]]),
      })[0];
      assert.ok(out.winner || out.noWinner, `${card.id} produced neither a winner nor a void`);
      if (out.winner) {
        assert.equal(typeof out.winner.value, 'number', `${card.id} scored a non-number`);
        assert.ok(!Number.isNaN(out.winner.value), `${card.id} scored NaN`);
      }
    }
  });
});

// ---------------------------------------------------------------------------
describe('sealing future weeks', () => {
  const schedule = buildChallengeSchedule(LEAGUE);

  test('an unplayed season reveals week 1 and seals the rest', () => {
    const out = computeChallenges({ schedule, teamWeeks: [], weeksPlayed: 0 });
    assert.equal(out[0].sealed, false, 'the week being played must be announced before kickoff');
    assert.equal(out[0].label !== null, true);
    assert.ok(out.slice(1).every((w) => w.sealed));
  });

  test('a sealed week gives away nothing — not even which challenge it is', () => {
    const out = computeChallenges({ schedule, teamWeeks: [], weeksPlayed: 0 });
    const sealed = out[5];
    assert.equal(sealed.label, null);
    assert.equal(sealed.rule, null);
    assert.equal(sealed.winner, null);
  });

  test('the reveal advances one week at a time', () => {
    const out = computeChallenges({ schedule, teamWeeks: [], weeksPlayed: 4 });
    assert.ok(out.slice(0, 5).every((w) => !w.sealed));
    assert.ok(out.slice(5).every((w) => w.sealed));
  });

  test('revealAll opens the whole schedule', () => {
    const out = computeChallenges({ schedule, teamWeeks: [], weeksPlayed: 0, revealAll: true });
    assert.ok(out.every((w) => !w.sealed));
  });

  test('a sealed week still shows what it is worth', () => {
    const out = computeChallenges({
      schedule,
      teamWeeks: [],
      weeksPlayed: 0,
      payouts: new Map(schedule.weeks.map((w) => [w.week, 15])),
    });
    assert.equal(out[8].sealed, true);
    assert.equal(out[8].amount, 15);
  });
});

// ---------------------------------------------------------------------------
describe('challenge leaderboard', () => {
  test('adds up wins and cash across the season', () => {
    const resolved = [
      { winner: { teamId: 1, amount: 15 }, tiedWith: [] },
      { winner: { teamId: 1, amount: 15 }, tiedWith: [] },
      { winner: { teamId: 2, amount: 15 }, tiedWith: [] },
      { winner: null, tiedWith: [] },
    ];
    const board = challengeLeaderboard(resolved, [
      { teamId: 1, teamName: 'A', managerName: 'Ann' },
      { teamId: 2, teamName: 'B', managerName: 'Bo' },
    ]);
    assert.equal(board[0].teamId, 1);
    assert.equal(board[0].challengesWon, 2);
    assert.equal(board[0].amountWon, 30);
    assert.equal(board[1].amountWon, 15);
  });

  test('a split counts for both teams', () => {
    const board = challengeLeaderboard(
      [{ winner: { teamId: 1, amount: 7.5 }, tiedWith: [{ teamId: 2, amount: 7.5 }] }],
      []
    );
    assert.equal(board.length, 2);
    assert.equal(board[0].amountWon, 7.5);
    assert.equal(board[1].amountWon, 7.5);
  });
});

// ---------------------------------------------------------------------------
describe('splitting the challenge pot', () => {
  test('$195 across 13 weeks is a clean $15', () => {
    const split = splitPot(195, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
    assert.ok(split.every((w) => w.amount === 15));
  });

  test('an uneven split still adds back up to the pot exactly', () => {
    // 200 / 13 = 15.3846…, which naive rounding turns into 199.94.
    const weeks = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];
    const split = splitPot(200, weeks);
    const total = Math.round(split.reduce((a, w) => a + w.amount, 0) * 100) / 100;
    assert.equal(total, 200);
  });

  test('the leftover cents go to the earliest weeks, never lost', () => {
    const split = splitPot(10, [1, 2, 3]);
    assert.deepEqual(split.map((w) => w.amount), [3.34, 3.33, 3.33]);
  });

  test('no weeks or no pot yields nothing rather than dividing by zero', () => {
    assert.deepEqual(splitPot(195, []), []);
    assert.deepEqual(splitPot(0, [1, 2]), []);
  });
});

// ---------------------------------------------------------------------------
describe('the league’s actual payout structure', () => {
  const config = {
    buyIn: 75,
    payouts: {
      structure: [
        { id: 'first', label: '1st Place', amount: 350 },
        { id: 'second', label: '2nd Place', amount: 130 },
        { id: 'third', label: '3rd Place', amount: 75 },
        { id: 'challenges', label: 'Weekly Challenges', remainder: true },
      ],
    },
  };

  test('10 x $75 pays 350 / 130 / 75 and leaves 195 for the challenges', () => {
    const { payouts } = computePayouts(config, 750);
    assert.deepEqual(payouts.map((p) => p.amount), [350, 130, 75, 195]);
    assert.equal(
      payouts.reduce((a, p) => a + p.amount, 0),
      750,
      'the four slots must account for the whole pot'
    );
  });

  test('third place is exactly the buy-in back', () => {
    const { payouts } = computePayouts(config, 750);
    assert.equal(payouts.find((p) => p.id === 'third').amount, config.buyIn);
  });

  test('an eleventh manager grows the challenge pot and leaves the places alone', () => {
    const { payouts } = computePayouts(config, 825);
    assert.deepEqual(payouts.slice(0, 3).map((p) => p.amount), [350, 130, 75]);
    assert.equal(challengePayout(payouts), 270);
  });

  test('13 weekly challenges out of a 10-team pot are $15 each', () => {
    const { payouts } = computePayouts(config, 750);
    const split = splitPot(challengePayout(payouts), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
    assert.ok(split.every((w) => w.amount === 15));
  });
});
```

### `tests/images.test.mjs`

*139 lines*

```javascript
/**
 * Verification for the image layer.
 *
 * `sanitizeTeamLogo` is the one function here that is doing security work
 * rather than presentation. A fantasy team logo is a URL ESPN hands back from
 * the league payload, and ESPN's classic UI lets a manager paste in any URL —
 * so without the filter, one manager could point every visitor's browser at a
 * server of their choosing and harvest the IP and user-agent of everyone in the
 * league who opens the site.
 *
 *   npm test
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import {
  ESPN_IMAGE_HOSTS,
  headshotUrl,
  proTeamLogoUrl,
  playerImageUrl,
  sanitizeTeamLogo,
} from '../scripts/lib/images.mjs';

describe('player pictures', () => {
  test('a headshot is addressed by ESPN player id', () => {
    assert.equal(
      headshotUrl(4429795),
      'https://a.espncdn.com/i/headshots/nfl/players/full/4429795.png'
    );
  });

  test('an unknown or placeholder player id yields no URL', () => {
    // ESPN pre-builds every draft slot with playerId -1; that is not a person.
    assert.equal(headshotUrl(-1), null);
    assert.equal(headshotUrl(0), null);
    assert.equal(headshotUrl(undefined), null);
  });

  test('a defence gets its team shield, not a headshot that will 404 forever', () => {
    const dst = { playerId: 16021, position: 'D/ST', proTeam: 'WSH' };
    assert.equal(playerImageUrl(dst), 'https://a.espncdn.com/i/teamlogos/nfl/500/wsh.png');
  });

  test('a real player gets a headshot even though a team is on the row', () => {
    const wr = { playerId: 4262921, position: 'WR', proTeam: 'MIA' };
    assert.match(playerImageUrl(wr), /headshots/);
  });

  test('a free agent defence has no shield to show', () => {
    assert.equal(proTeamLogoUrl('FA'), null);
    assert.equal(proTeamLogoUrl(null), null);
  });
});

describe('fantasy team logos', () => {
  test('an ESPN-hosted logo passes through unchanged', () => {
    const url = 'https://g.espncdn.com/lm-static/ffl/images/default_logos/6.svg';
    assert.equal(sanitizeTeamLogo(url), url);
  });

  test('every allowed host is actually allowed', () => {
    for (const host of ESPN_IMAGE_HOSTS) {
      assert.equal(sanitizeTeamLogo(`https://${host}/x.png`), `https://${host}/x.png`);
    }
  });

  test('a logo pointed at somebody else’s server is dropped', () => {
    assert.equal(sanitizeTeamLogo('https://evil.example.com/tracker.png'), null);
  });

  test('a lookalike host does not sneak past', () => {
    assert.equal(sanitizeTeamLogo('https://a.espncdn.com.evil.example/x.png'), null);
    assert.equal(sanitizeTeamLogo('https://notespncdn.com/x.png'), null);
  });

  test('http is refused even on an allowed host', () => {
    // Mixed content would be blocked anyway; refusing here keeps the rule in
    // one place rather than relying on the browser to enforce it.
    assert.equal(sanitizeTeamLogo('http://a.espncdn.com/x.png'), null);
  });

  test('a javascript: or data: URL is refused', () => {
    assert.equal(sanitizeTeamLogo('javascript:alert(1)'), null);
    assert.equal(sanitizeTeamLogo('data:image/svg+xml,<svg onload="alert(1)"/>'), null);
  });

  test('nonsense and absent values are treated the same as no logo', () => {
    assert.equal(sanitizeTeamLogo(''), null);
    assert.equal(sanitizeTeamLogo(null), null);
    assert.equal(sanitizeTeamLogo(undefined), null);
    assert.equal(sanitizeTeamLogo('not a url'), null);
    assert.equal(sanitizeTeamLogo(42), null);
  });
});

describe('the CSP and the code agree on which hosts are allowed', () => {
  // Two allowlists guard the same thing from opposite ends: the build drops
  // off-list logos, the browser refuses to load them. Widening one without the
  // other either silently breaks every image or silently removes the guard, and
  // neither failure announces itself. So they are pinned to each other here.
  const headers = readFileSync(
    path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'docs', '_headers'),
    'utf8'
  );
  const csp = headers.match(/Content-Security-Policy:.*/)?.[0] ?? '';
  const imgSrc = csp.match(/img-src ([^;]+);/)?.[1] ?? '';

  test('every host the build allows is loadable under the CSP', () => {
    for (const host of ESPN_IMAGE_HOSTS) {
      assert.ok(
        imgSrc.includes(`https://${host}`),
        `${host} passes sanitizeTeamLogo() but img-src would block it`
      );
    }
  });

  test('the CSP allows no image host the build does not sanitize against', () => {
    const cspHosts = imgSrc
      .split(/\s+/)
      .filter((token) => token.startsWith('https://'))
      .map((token) => token.replace('https://', ''));
    for (const host of cspHosts) {
      assert.ok(
        ESPN_IMAGE_HOSTS.includes(host),
        `img-src allows ${host} but sanitizeTeamLogo() would strip it`
      );
    }
  });

  test('img-src still permits the site’s own images and data URIs', () => {
    assert.match(imgSrc, /'self'/);
    assert.match(imgSrc, /data:/);
  });
});
```

### `tests/playercard.test.mjs`

*269 lines*

```javascript
/**
 * Verification for the player hover cards.
 *
 * The stat-key tests are the ones that matter. ESPN keys everything four ways
 * (season, source, split, period) and reversing any pair returns real data of
 * the wrong kind — a projection instead of an actual, or one week instead of a
 * season — so nothing throws and every number on every card is quietly wrong.
 * `STAT_SPLIT` in constants.mjs was in fact reversed until this file existed.
 *
 *   npm test
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  STAT_LINES,
  buildPlayerCards,
  nameStats,
  normalizeNews,
  seasonActuals,
  statLine,
} from '../scripts/lib/playercard.mjs';
import { STAT_SPLIT, STAT_SOURCE, STAT_KEYS } from '../scripts/lib/constants.mjs';

/** A stats entry as ESPN shapes it. */
const entry = (seasonId, sourceId, splitId, stats, appliedTotal = 0) => ({
  seasonId,
  statSourceId: sourceId,
  statSplitTypeId: splitId,
  stats,
  appliedTotal,
});

const RB_2025 = { 23: 250, 24: 1412, 25: 16, 41: 52, 42: 517, 43: 4 };

// ---------------------------------------------------------------------------
describe('ESPN stat key constants', () => {
  test('a season total is split type 0, not 1', () => {
    // Pinned against HANDOFF.md and buildDraftPool(), which both use 0 for a
    // season total. This constant was defined the other way round and unused;
    // the first consumer would have silently read single weeks as seasons.
    assert.equal(STAT_SPLIT.SEASON, 0);
    assert.equal(STAT_SPLIT.WEEK, 1);
  });

  test('actual is 0 and projected is 1', () => {
    assert.equal(STAT_SOURCE.ACTUAL, 0);
    assert.equal(STAT_SOURCE.PROJECTED, 1);
  });
});

// ---------------------------------------------------------------------------
describe('naming raw stats', () => {
  test('numeric ids become readable fields', () => {
    const named = nameStats({ 24: 1412, 25: 16, 41: 52 });
    assert.deepEqual(named, { rushingYards: 1412, rushingTouchdowns: 16, receptions: 52 });
  });

  test('unknown ids are dropped, never rendered as a number', () => {
    const named = nameStats({ 24: 1412, 9999: 7 });
    assert.deepEqual(Object.keys(named), ['rushingYards']);
  });

  test('non-numeric values are dropped rather than printed as junk', () => {
    assert.deepEqual(nameStats({ 24: 'lots', 25: null, 41: 52 }), { receptions: 52 });
  });

  test('nothing in, empty object out', () => {
    assert.deepEqual(nameStats(undefined), {});
    assert.deepEqual(nameStats({}), {});
  });

  test('every STAT_LINES field is a name STAT_KEYS can actually produce', () => {
    // A typo in a stat line is invisible at runtime: the field is simply never
    // found and silently omitted from the card.
    const producible = new Set(Object.values(STAT_KEYS));
    for (const [position, spec] of Object.entries(STAT_LINES)) {
      for (const [key] of spec) {
        assert.ok(producible.has(key), `${position} wants "${key}", which STAT_KEYS never emits`);
      }
    }
  });
});

// ---------------------------------------------------------------------------
describe('reading a season out of stats[]', () => {
  const player = {
    id: 1,
    stats: [
      entry(2025, STAT_SOURCE.ACTUAL, STAT_SPLIT.SEASON, RB_2025, 301.4),
      entry(2025, STAT_SOURCE.PROJECTED, STAT_SPLIT.SEASON, { 24: 1, 25: 1 }, 999),
      entry(2025, STAT_SOURCE.ACTUAL, STAT_SPLIT.WEEK, { 24: 88 }, 14.2),
      entry(2026, STAT_SOURCE.PROJECTED, STAT_SPLIT.SEASON, { 24: 2 }, 888),
    ],
  };

  test('finds what actually happened, not the projection', () => {
    const out = seasonActuals(player, 2025);
    assert.equal(out.fantasyPoints, 301.4);
    assert.equal(out.stats.rushingYards, 1412);
  });

  test('finds the season, not a single week', () => {
    assert.notEqual(seasonActuals(player, 2025).stats.rushingYards, 88);
  });

  test('does not reach into the wrong season', () => {
    assert.equal(seasonActuals(player, 2024), null);
  });

  test('a player with no stats returns null rather than throwing', () => {
    assert.equal(seasonActuals({ id: 2 }, 2025), null);
    assert.equal(seasonActuals(null, 2025), null);
  });
});

// ---------------------------------------------------------------------------
describe('per-position stat lines', () => {
  test('a running back gets carries and receptions', () => {
    const line = statLine('RB', nameStats(RB_2025));
    const labels = line.map((f) => f.label);
    assert.deepEqual(labels, ['Carries', 'Rush yds', 'Rush TD', 'Rec', 'Rec yds', 'Rec TD']);
  });

  test('a quarterback is never shown receptions', () => {
    const line = statLine('QB', { passingYards: 4306, receptions: 1 });
    assert.ok(!line.some((f) => f.key === 'receptions'));
  });

  test('missing fields are omitted, not shown as zero', () => {
    // "0 rushing TDs" and "we have no rushing data" look identical on screen
    // and are different claims.
    const line = statLine('RB', { rushingYards: 900 });
    assert.deepEqual(line.map((f) => f.key), ['rushingYards']);
  });

  test('a zero that really is zero survives', () => {
    const line = statLine('RB', { rushingYards: 900, rushingTouchdowns: 0 });
    assert.deepEqual(line.map((f) => f.value), [900, 0]);
  });

  test('an unknown position yields no line rather than throwing', () => {
    assert.deepEqual(statLine('LS', { rushingYards: 1 }), []);
    assert.deepEqual(statLine('RB', null), []);
  });
});

// ---------------------------------------------------------------------------
describe('building the card index', () => {
  const players = [
    { id: 10, injuryStatus: 'ACTIVE', stats: [entry(2025, 0, 0, RB_2025, 301.4)] },
    { id: 11, injuryStatus: 'QUESTIONABLE', stats: [] },
    { id: 12, injuryStatus: 'ACTIVE', stats: [] },
  ];

  test('a player with last season’s stats gets a card', () => {
    const cards = buildPlayerCards({ players, seasonId: 2026 });
    assert.ok(cards[10]);
    assert.equal(cards[10].lastSeason.season, 2025);
    assert.equal(cards[10].lastSeason.stats.rushingYards, 1412);
  });

  test('an injury alone is enough to earn a card', () => {
    const cards = buildPlayerCards({ players, seasonId: 2026 });
    assert.ok(cards[11]);
    assert.equal(cards[11].injury, 'Questionable');
  });

  test('a healthy rookie with nothing to say gets no card at all', () => {
    // An empty popover teaches people the feature is broken.
    const cards = buildPlayerCards({ players, seasonId: 2026 });
    assert.equal(cards[12], undefined);
  });

  test('news alone is enough to earn a card', () => {
    const cards = buildPlayerCards({
      players,
      seasonId: 2026,
      news: { 12: [{ headline: 'Signed to the active roster', published: null }] },
    });
    assert.ok(cards[12]);
    assert.equal(cards[12].news.length, 1);
  });

  test('injury codes are humanized, not shown as ESPN enums', () => {
    const cards = buildPlayerCards({
      players: [{ id: 20, injuryStatus: 'INJURY_RESERVE', stats: [] }],
      seasonId: 2026,
    });
    assert.equal(cards[20].injury, 'IR');
  });

  test('placeholder ids are skipped', () => {
    // ESPN pre-builds draft slots with playerId -1.
    const cards = buildPlayerCards({
      players: [{ id: -1, injuryStatus: 'OUT', stats: [] }, { id: 0, injuryStatus: 'OUT', stats: [] }],
      seasonId: 2026,
    });
    assert.deepEqual(Object.keys(cards), []);
  });

  test('the first (richest) source wins for a duplicated player', () => {
    const cards = buildPlayerCards({
      players: [
        { id: 30, injuryStatus: 'OUT', stats: [entry(2025, 0, 0, RB_2025, 300)] },
        { id: 30, injuryStatus: 'ACTIVE', stats: [] },
      ],
      seasonId: 2026,
    });
    assert.equal(cards[30].injury, 'Out');
    assert.ok(cards[30].lastSeason);
  });

  test('no players at all produces an empty index, not a crash', () => {
    assert.deepEqual(buildPlayerCards({ seasonId: 2026 }), {});
    assert.deepEqual(buildPlayerCards(), {});
  });
});

// ---------------------------------------------------------------------------
describe('news normalization', () => {
  const raw = [
    {
      playerId: 5,
      items: [
        { headline: 'Old news', published: '2026-08-01T00:00:00Z' },
        { headline: 'Fresh news', published: '2026-09-01T00:00:00Z' },
        { headline: 'Middle news', published: '2026-08-20T00:00:00Z' },
      ],
    },
  ];

  test('newest first', () => {
    const out = normalizeNews(raw);
    assert.deepEqual(out[5].map((i) => i.headline), ['Fresh news', 'Middle news', 'Old news']);
  });

  test('capped per player', () => {
    assert.equal(normalizeNews(raw, { perPlayer: 2 })[5].length, 2);
  });

  test('an item with no headline is dropped', () => {
    const out = normalizeNews([{ playerId: 6, items: [{ published: '2026-09-01T00:00:00Z' }] }]);
    assert.equal(out[6], undefined);
  });

  test('undated news is kept but sorted last — it just cannot claim recency', () => {
    const out = normalizeNews([
      {
        playerId: 7,
        items: [
          { headline: 'No date' },
          { headline: 'Dated', published: '2026-09-01T00:00:00Z' },
        ],
      },
    ]);
    assert.deepEqual(out[7].map((i) => i.headline), ['Dated', 'No date']);
  });

  test('a missing or malformed feed yields nothing rather than throwing', () => {
    // The news endpoint is optional; every failure has to look like "no news".
    assert.deepEqual(normalizeNews(undefined), {});
    assert.deepEqual(normalizeNews(null), {});
    assert.deepEqual(normalizeNews([{ noPlayerId: true }]), {});
    assert.deepEqual(normalizeNews([{ playerId: 9 }]), {});
  });
});
```

## Automation

Daily GitHub Actions run: fetch, build, test, commit only on change.

### `.github/workflows/update.yml`

*114 lines*

```yaml
name: Update league data

# Keeps the hub current without anyone running anything.
#
# Pulls from ESPN, rebuilds the site, and commits only when something actually
# changed. Cloudflare Pages redeploys off that push, so the whole chain is
# hands-off.
#
# Requires two repository secrets (Settings -> Secrets and variables ->
# Actions): ESPN_S2 and ESPN_SWID. See the README.

on:
  schedule:
    # Every 3 hours, around the clock, so scores and news land within a few
    # hours instead of waiting for the next calendar day.
    - cron: '0 */3 * * *'
  workflow_dispatch:
    inputs:
      force:
        description: 'Re-fetch every week instead of using the cache'
        type: boolean
        default: false

# Needed so the workflow can push its own commit back.
permissions:
  contents: write

concurrency:
  group: update-league-data
  cancel-in-progress: false

jobs:
  update:
    runs-on: ubuntu-latest
    timeout-minutes: 15

    steps:
      - name: Check out
        uses: actions/checkout@v4

      - name: Set up Node
        uses: actions/setup-node@v4
        with:
          node-version: '22'

      - name: Verify credentials are configured
        env:
          ESPN_S2: ${{ secrets.ESPN_S2 }}
          ESPN_SWID: ${{ secrets.ESPN_SWID }}
        run: |
          if [ -z "$ESPN_S2" ] || [ -z "$ESPN_SWID" ]; then
            echo "::error::Missing ESPN_S2 and/or ESPN_SWID repository secrets."
            echo "Add them under Settings -> Secrets and variables -> Actions."
            exit 1
          fi
          echo "Credentials present (espn_s2 is ${#ESPN_S2} chars)."

      - name: Fetch from ESPN
        env:
          ESPN_S2: ${{ secrets.ESPN_S2 }}
          ESPN_SWID: ${{ secrets.ESPN_SWID }}
        run: |
          if [ "${{ inputs.force }}" = "true" ]; then
            node scripts/fetch.mjs --force
          else
            node scripts/fetch.mjs
          fi

      - name: Build the site
        run: node scripts/build.mjs

      - name: Run tests
        run: node --test tests/*.test.mjs

      - name: Commit and push if anything changed
        id: commit
        run: |
          git config user.name  "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git add -A

          if git diff --cached --quiet; then
            echo "No changes — nothing to publish."
            echo "changed=false" >> "$GITHUB_OUTPUT"
            exit 0
          fi

          WEEKS=$(node -e "try{console.log(require('./docs/data/hub.json').status.weeksPlayed)}catch{console.log(0)}")
          PHASE=$(node -e "try{console.log(require('./docs/data/hub.json').phase.headline)}catch{console.log('Update')}")

          if [ "$WEEKS" -gt 0 ]; then
            MSG="Week $WEEKS"
          else
            MSG="$PHASE"
          fi

          git commit -m "$MSG [automated]"
          git push
          echo "changed=true" >> "$GITHUB_OUTPUT"
          echo "Published: $MSG"

      - name: Summary
        if: always()
        run: |
          {
            echo "### League data update"
            echo ""
            if [ "${{ steps.commit.outputs.changed }}" = "true" ]; then
              echo "Published new data. Cloudflare Pages will redeploy shortly."
            else
              echo "No changes since the last run."
            fi
          } >> "$GITHUB_STEP_SUMMARY"
```

### `package.json`

*23 lines*

```json
{
  "name": "fantasy-football-hub",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "description": "The ultimate hub for an ESPN Fantasy Football league: stats, trades, draft analysis, side prizes, and money tracking.",
  "engines": {
    "node": ">=20"
  },
  "scripts": {
    "fetch": "node scripts/fetch.mjs",
    "build": "node scripts/build.mjs",
    "update": "node scripts/fetch.mjs && node scripts/build.mjs",
    "serve": "node scripts/serve.mjs",
    "ship": "node scripts/ship.mjs",
    "deploy": "npx --yes wrangler pages deploy docs --project-name=roe-leauge --commit-dirty=true",
    "check": "node scripts/check.mjs",
    "test": "node --test tests/*.test.mjs",
    "fixtures": "node scripts/fixtures.mjs && node scripts/build.mjs --fixtures",
    "bundle": "node scripts/bundle.mjs"
  }
}
```

---

*33 files, 11,259 lines.*
