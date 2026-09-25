/**
 * All-time head-to-head records, by manager rather than by team.
 *
 * Team names change every year and ESPN team ids can too; the person running
 * the team does not. So records are keyed on the team's primary ESPN owner id
 * and carried across every season in config/league.json — adding 2027 to the
 * seasons list is all it takes for next year's games to join the same ledger.
 *
 * Owner ids are ESPN SWIDs, which must never reach docs/ (build.mjs fails the
 * build if one does). This module works in real ids because that is what makes
 * the matching correct; `publicManagerKey()` is what build.mjs swaps them for
 * at the publish boundary.
 */

import { createHash } from 'node:crypto';
import { buildTeamWeeks } from './analytics.mjs';
import { completedWeeks } from './recap.mjs';

const round2 = (n) => Number((n ?? 0).toFixed(2));

/**
 * Who a team belongs to. The first listed owner is the primary one; a team
 * nobody has claimed gets a key of its own for that season, so its games still
 * count for the manager on the other side without inventing an owner.
 */
export function managerIdOf(team, year) {
  return team?.ownerIds?.[0] ?? `unclaimed:${year}:${team?.id}`;
}

/**
 * A stable, opaque stand-in for an owner id, safe to publish. Salted with the
 * league id so the same person's key cannot be matched across other sites.
 */
export function publicManagerKey(managerId, salt = '') {
  return `m-${createHash('sha256').update(`${salt}:${managerId}`).digest('hex').slice(0, 12)}`;
}

const emptyRecord = () => ({ games: 0, wins: 0, losses: 0, ties: 0, pointsFor: 0, pointsAgainst: 0 });

/**
 * @param {Array<{year:number, season:object, teamWeeks?:Array}>} seasons
 * @returns {{ managers: object, records: object }}
 *   managers[id] = { managerId, managerName, teamName, teamId, seasons: [years] }
 *     (names and team id from the most recent season they played)
 *   records[id][opponentId] = { regular, playoffs, lastMeeting }
 */
export function buildHeadToHead(seasons) {
  const managers = {};
  const records = {};

  const ordered = [...seasons].sort((a, b) => a.year - b.year);
  for (const { year, season, teamWeeks } of ordered) {
    const rows = teamWeeks ?? buildTeamWeeks(season);
    const done = new Set(completedWeeks(season));
    const idByTeam = new Map(season.teams.map((t) => [t.id, managerIdOf(t, year)]));

    for (const team of season.teams) {
      const id = idByTeam.get(team.id);
      const known = managers[id];
      managers[id] = {
        managerId: id,
        managerName: team.managerName ?? known?.managerName ?? null,
        teamName: team.name,
        teamId: team.id,
        seasons: [...new Set([...(known?.seasons ?? []), year])],
      };
    }

    for (const row of [...rows].sort((a, b) => a.week - b.week)) {
      if (row.opponentId === null || row.result === 'BYE' || !done.has(row.week)) continue;
      const me = idByTeam.get(row.teamId) ?? managerIdOf({ id: row.teamId }, year);
      const them = idByTeam.get(row.opponentId) ?? managerIdOf({ id: row.opponentId }, year);
      if (me === them) continue;

      records[me] ??= {};
      records[me][them] ??= { regular: emptyRecord(), playoffs: emptyRecord(), lastMeeting: null };
      const pair = records[me][them];
      const bucket = row.isPlayoff ? pair.playoffs : pair.regular;

      bucket.games += 1;
      if (row.result === 'WIN') bucket.wins += 1;
      else if (row.result === 'LOSS') bucket.losses += 1;
      else bucket.ties += 1;
      bucket.pointsFor = round2(bucket.pointsFor + row.score);
      bucket.pointsAgainst = round2(bucket.pointsAgainst + row.opponentScore);

      // Rows are walked oldest season and week first, so the last write wins.
      pair.lastMeeting = {
        season: year,
        week: row.week,
        isPlayoff: Boolean(row.isPlayoff),
        result: row.result,
        pointsFor: row.score,
        pointsAgainst: row.opponentScore,
      };
    }
  }

  return { managers, records };
}

/**
 * One manager's rows against every other manager they have faced, plus the
 * rivalry worth calling out: the most-played matchup, with the closest one
 * winning a tie on games. Needs at least two meetings — one game is a result,
 * not a rivalry.
 */
export function headToHeadFor(h2h, managerId) {
  const mine = h2h.records[managerId] ?? {};
  const rows = Object.entries(mine).map(([opponentId, pair]) => {
    const opp = h2h.managers[opponentId];
    const games = pair.regular.games + pair.playoffs.games;
    const wins = pair.regular.wins + pair.playoffs.wins;
    const losses = pair.regular.losses + pair.playoffs.losses;
    const margin = pair.regular.pointsFor + pair.playoffs.pointsFor
      - pair.regular.pointsAgainst - pair.playoffs.pointsAgainst;
    return {
      opponentId,
      opponentName: opp?.managerName ?? null,
      opponentTeamName: opp?.teamName ?? null,
      opponentTeamId: opp?.teamId ?? null,
      regular: pair.regular,
      playoffs: pair.playoffs,
      lastMeeting: pair.lastMeeting,
      games,
      winGap: Math.abs(wins - losses),
      avgMargin: games ? round2(margin / games) : 0,
    };
  }).sort((a, b) => b.games - a.games || (a.opponentTeamName ?? '').localeCompare(b.opponentTeamName ?? ''));

  const candidates = rows.filter((r) => r.games >= 2);
  const rivalry = candidates.length
    ? candidates.reduce((best, r) => {
        if (r.games !== best.games) return r.games > best.games ? r : best;
        if (r.winGap !== best.winGap) return r.winGap < best.winGap ? r : best;
        return Math.abs(r.avgMargin) < Math.abs(best.avgMargin) ? r : best;
      })
    : null;

  return {
    rows,
    rivalry: rivalry
      ? { opponentId: rivalry.opponentId, games: rivalry.games, avgMargin: rivalry.avgMargin }
      : null,
  };
}
