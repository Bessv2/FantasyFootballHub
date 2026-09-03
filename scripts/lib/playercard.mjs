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
