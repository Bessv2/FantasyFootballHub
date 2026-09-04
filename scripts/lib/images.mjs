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
