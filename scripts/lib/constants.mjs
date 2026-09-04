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
