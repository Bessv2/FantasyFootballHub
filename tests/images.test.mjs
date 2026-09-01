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
