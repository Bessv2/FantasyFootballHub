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

export function normalizeTeams(rawTeams, members) {
  const memberById = new Map((members ?? []).map((m) => [m.id, m]));

  return (rawTeams ?? []).map((team) => {
    const overall = team?.record?.overall ?? {};
    const ownerIds = team.owners ?? [];
    const ownerNames = ownerIds
      .map((id) => {
        const m = memberById.get(id);
        if (!m) return null;
        // ESPN display name only. Real first/last names are on the member
        // profile too, but the site is public and the league never agreed to
        // publish them.
        return m.displayName?.trim() || null;
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

/**
 * The whole season's matchup grid, played or not — the only place the
 * *remaining* schedule exists. Box scores are fetched per played week, so
 * without this nothing downstream knows who plays whom in Week 12.
 *
 * `winner` is ESPN's own verdict: HOME / AWAY / TIE once a matchup period is
 * final, UNDECIDED before and during it.
 */
export function normalizeSchedule(rawSchedule) {
  return (Array.isArray(rawSchedule) ? rawSchedule : [])
    .filter((game) => game?.home || game?.away)
    .map((game) => ({
      week: game.matchupPeriodId,
      homeTeamId: game.home?.teamId ?? null,
      awayTeamId: game.away?.teamId ?? null,
      playoffTierType: game.playoffTierType ?? 'NONE',
      winner: game.winner ?? 'UNDECIDED',
    }))
    .filter((game) => Number.isInteger(game.week));
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
  // schedule.json is its own fetch; older caches only have whatever the
  // league payload happened to carry.
  const schedule = normalizeSchedule(raw.schedule?.schedule ?? league?.schedule);

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
      ...receptionScoring(settings.scoringSettings),
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
    schedule,
    transactions,
    trades,
    adviceWeek,
    currentRosters: Object.fromEntries(currentRosters),
    freeAgents,
    playerCount: playerIndex.size,
  };
}

/**
 * How many points a reception is worth, read from the league's actual scoring
 * rules. `playerRankType` is only the default ranking list ESPN shows in the
 * draft room — it does not reflect custom scoring, and for Roe League it comes
 * back as something other than 'PPR' even though receptions score a point.
 * Scoring item statId 53 is receptions.
 */
export function receptionScoring(scoringSettings) {
  const items = scoringSettings?.scoringItems;
  let ppr = null;
  if (Array.isArray(items)) {
    const rec = items.find((i) => i.statId === 53);
    ppr = rec ? Number(rec.points) || 0 : 0;
  } else if (scoringSettings?.playerRankType) {
    const t = scoringSettings.playerRankType;
    ppr = t === 'PPR' ? 1 : t === 'HALF_PPR' || t === 'HALFPPR' ? 0.5 : 0;
  }
  const scoringLabel =
    ppr == null ? null
    : ppr === 0 ? 'Standard'
    : ppr === 1 ? 'PPR'
    : ppr === 0.5 ? 'Half PPR'
    : `${ppr} PPR`;
  return { isPPR: (ppr ?? 0) > 0, pointsPerReception: ppr, scoringLabel };
}
