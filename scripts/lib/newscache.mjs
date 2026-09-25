/**
 * A per-player TTL cache for the news fetch.
 *
 * News is one request per player, up to 300 a run, and was the slowest step
 * of `npm run fetch` by a wide margin — every run, even when the last run was
 * an hour ago. Each entry remembers when that player was fetched and what came
 * back (including "nothing", so a player with no news is not re-asked every
 * run either). A player is refetched only once his entry is older than the TTL.
 *
 * The cache is `data/raw/news-cache.json`, gitignored with the rest of
 * data/raw. Pure functions here; the file I/O lives in fetch.mjs.
 */

export const NEWS_TTL_HOURS = 6;

/** Which ids can be served from the cache and which need a request. */
export function partitionByFreshness(ids, cache, { now = Date.now(), ttlMs = NEWS_TTL_HOURS * 3600e3 } = {}) {
  const fresh = [];
  const stale = [];
  for (const id of ids) {
    const entry = cache?.[id];
    const age = entry?.fetchedAt ? now - Date.parse(entry.fetchedAt) : Infinity;
    if (Number.isFinite(age) && age >= 0 && age < ttlMs) fresh.push(id);
    else stale.push(id);
  }
  return { fresh, stale };
}

/**
 * Drops entries nobody asked for this run and anything well past its TTL, so
 * the file cannot grow for ever as players fall out of the top 300.
 */
export function pruneCache(cache, keepIds, { now = Date.now(), maxAgeMs = 7 * 24 * 3600e3 } = {}) {
  const keep = new Set([...keepIds].map(String));
  const out = {};
  for (const [id, entry] of Object.entries(cache ?? {})) {
    const age = now - Date.parse(entry?.fetchedAt ?? '');
    if (keep.has(String(id)) && age < maxAgeMs) out[id] = entry;
  }
  return out;
}

/** The oldest fetch time among the entries used — how stale the news can be. */
export function oldestFetch(cache, ids) {
  const times = ids.map((id) => Date.parse(cache?.[id]?.fetchedAt ?? '')).filter(Number.isFinite);
  return times.length ? new Date(Math.min(...times)).toISOString() : null;
}
