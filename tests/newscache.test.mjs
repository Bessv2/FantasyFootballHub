import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { partitionByFreshness, pruneCache, oldestFetch } from '../scripts/lib/newscache.mjs';

const NOW = Date.parse('2026-09-25T12:00:00Z');
const hoursAgo = (h) => new Date(NOW - h * 3600e3).toISOString();

describe('news cache', () => {
  const cache = {
    1: { fetchedAt: hoursAgo(1), feed: { id: 1 } },   // fresh
    2: { fetchedAt: hoursAgo(5.9), feed: null },      // fresh, and "no news" is cached too
    3: { fetchedAt: hoursAgo(6), feed: { id: 3 } },   // exactly 6h: expired
    4: { fetchedAt: 'not a date', feed: null },       // unreadable: refetch
  };

  test('only entries younger than the 6-hour TTL are skipped', () => {
    // 5 is not in the cache at all.
    const { fresh, stale } = partitionByFreshness([1, 2, 3, 4, 5], cache, { now: NOW });
    assert.deepEqual(fresh, [1, 2]);
    assert.deepEqual(stale, [3, 4, 5]);
  });

  test('an entry from the future (clock skew) is refetched, not trusted', () => {
    const skewed = { 1: { fetchedAt: new Date(NOW + 3600e3).toISOString() } };
    assert.deepEqual(partitionByFreshness([1], skewed, { now: NOW }).stale, [1]);
  });

  test('prune keeps only requested ids younger than a week', () => {
    const old = { ...cache, 6: { fetchedAt: hoursAgo(24 * 8), feed: null } };
    assert.deepEqual(Object.keys(pruneCache(old, [1, 3, 6], { now: NOW })), ['1', '3']);
  });

  test('the reported fetch time is the oldest entry used', () => {
    assert.equal(oldestFetch(cache, [1, 2]), hoursAgo(5.9));
    assert.equal(oldestFetch(cache, [99]), null);
  });
});
