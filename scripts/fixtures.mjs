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
