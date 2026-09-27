/**
 * Trade attribution: who has actually won each trade since it happened.
 *
 * For every side, the points its received players scored *for that side* from
 * the trade's week on, two ways:
 *
 *   pointsStarted  only weeks the player was in the receiving team's starting
 *                  lineup — the points that actually decided matchups, and the
 *                  headline number
 *   pointsTotal    started or benched, so a trade is not scored as a loss just
 *                  because the manager kept a good player on the bench
 *
 * Points a player scores after being flipped on again do not count for this
 * trade: they belong to whoever holds him.
 */

import { buildPlayerWeekPoints } from './draft.mjs';

const round2 = (n) => Number((n ?? 0).toFixed(2));

/**
 * The first week the trade shows up in the box scores.
 *
 * ESPN's activity feed dates a trade but does not say which scoring period it
 * landed in, and a date alone cannot be mapped to a fantasy week without a
 * calendar the payload does not carry. The box scores can: the first week any
 * received player appears on his new team's roster is the first week the trade
 * counted. A trade made this week has not reached a box score yet, so this is
 * null — and "too early" is exactly the right thing to say about it.
 *
 * A trade that does carry a scoringPeriodId uses it directly.
 */
export function tradeEffectiveWeek(trade, weekPoints) {
  if (Number.isInteger(trade.scoringPeriodId) && trade.scoringPeriodId > 0) return trade.scoringPeriodId;

  let first = null;
  for (const side of trade.sides) {
    for (const player of side.received) {
      for (const [week, line] of weekPoints.get(player.id) ?? []) {
        if (line.teamId === side.teamId && (first === null || week < first)) first = week;
      }
    }
  }
  return first;
}

export function attributeTrades(season) {
  const weekPoints = buildPlayerWeekPoints(season);
  const playedWeeks = season.weeks.filter((w) => w.played).map((w) => w.week);
  const latestWeek = playedWeeks.length ? Math.max(...playedWeeks) : 0;

  return (season.trades ?? []).map((trade) => {
    const effectiveWeek = tradeEffectiveWeek(trade, weekPoints);
    const tooEarly = effectiveWeek === null || effectiveWeek > latestWeek;
    const weeksSince = tooEarly ? 0 : latestWeek - effectiveWeek + 1;

    const sides = trade.sides.map((side) => {
      const players = side.received.map((player) => {
        let total = 0;
        let started = 0;
        for (const [week, line] of weekPoints.get(player.id) ?? []) {
          if (tooEarly || week < effectiveWeek || line.teamId !== side.teamId) continue;
          total += line.points;
          if (line.started) started += line.points;
        }
        return {
          playerId: player.id,
          name: player.name,
          position: player.position,
          pointsTotal: tooEarly ? null : round2(total),
          pointsStarted: tooEarly ? null : round2(started),
        };
      });
      const sum = (key) => (tooEarly ? null : round2(players.reduce((a, p) => a + p[key], 0)));
      return { ...side, players, pointsTotal: sum('pointsTotal'), pointsStarted: sum('pointsStarted'), weeksSince };
    });

    // A straight two-team swap has one obvious net figure. A three-way trade
    // does not, so it gets a leader but no net.
    const netStarted = !tooEarly && sides.length === 2
      ? round2(sides[0].pointsStarted - sides[1].pointsStarted)
      : null;

    let leaderTeamId = null;
    if (!tooEarly && sides.length) {
      const best = Math.max(...sides.map((s) => s.pointsStarted));
      const leaders = sides.filter((s) => s.pointsStarted === best);
      // Level (including 0-0 after a week of byes) is a tie, not a win.
      if (leaders.length === 1) leaderTeamId = leaders[0].teamId;
    }

    return { ...trade, effectiveWeek, tooEarly, weeksSince, sides, netStarted, leaderTeamId };
  });
}
