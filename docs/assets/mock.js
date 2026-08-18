/**
 * Mock draft simulator.
 *
 * Practises THIS league's format specifically — 12 teams, 16 rounds, snake, and
 * critically superflex, which ESPN's public mock lobby will not replicate. The
 * board is ranked with ESPN's own SUPERFLEX ranks, where Josh Allen is #1
 * despite being PPR #36; anyone drafting off standard ADP in this league will
 * be badly wrong about quarterbacks, and that is the thing worth rehearsing.
 *
 * Entirely client-side. Nothing is saved, nothing is sent anywhere.
 */

const POSITIONS = ['QB', 'RB', 'WR', 'TE', 'D/ST', 'K'];

/**
 * Roster shapes the AI aims for. Maximums stop a bot hoarding six running
 * backs; minimums make sure everyone ends up with a legal starting lineup.
 */
const TARGETS = {
  QB: { min: 2, max: 3, earliest: 1 },
  RB: { min: 4, max: 6, earliest: 1 },
  WR: { min: 5, max: 7, earliest: 1 },
  TE: { min: 1, max: 2, earliest: 1 },
  'D/ST': { min: 1, max: 1, earliest: 13 },
  K: { min: 1, max: 1, earliest: 15 },
};

const AI_NAMES = [
  'Marcus', 'Tina', 'Dev', 'Sam', 'Jules', 'Casey',
  'Ray', 'Priya', 'Alex', 'Nia', 'Bo', 'Quinn',
];

export function createMockDraft(pool, { userSlot = 1 } = {}) {
  const teamCount = pool.teams ?? 12;
  const rounds = pool.rounds ?? 16;

  const teams = Array.from({ length: teamCount }, (_, i) => ({
    slot: i + 1,
    name: i + 1 === userSlot ? 'You' : `${AI_NAMES[i % AI_NAMES.length]}`,
    isUser: i + 1 === userSlot,
    roster: [],
  }));

  // Snake order: odd rounds ascend, even rounds descend.
  const order = [];
  for (let round = 1; round <= rounds; round += 1) {
    const slots = Array.from({ length: teamCount }, (_, i) => i + 1);
    if (round % 2 === 0) slots.reverse();
    for (const slot of slots) order.push({ round, slot });
  }

  return {
    pool,
    teams,
    order,
    rounds,
    teamCount,
    pickIndex: 0,
    available: pool.players.map((p) => ({ ...p })),
    picks: [],
    get current() {
      return this.order[this.pickIndex] ?? null;
    },
    get isComplete() {
      return this.pickIndex >= this.order.length;
    },
    get onTheClock() {
      const c = this.current;
      return c ? this.teams.find((t) => t.slot === c.slot) : null;
    },
  };
}

const countByPosition = (roster) => {
  const counts = Object.fromEntries(POSITIONS.map((p) => [p, 0]));
  for (const p of roster) if (counts[p.position] !== undefined) counts[p.position] += 1;
  return counts;
};

/**
 * How much this bot wants a given player right now.
 *
 * Board rank does most of the work — ESPN's superflex ranks already price the
 * QB premium in. Need only nudges it, so bots still take clear value rather
 * than reaching for a position because a slot is empty.
 */
function aiScore(player, roster, round, rounds) {
  const counts = countByPosition(roster);
  const target = TARGETS[player.position];
  if (!target) return -Infinity;

  // Hard gates: never over-fill, never take a kicker in round 2.
  if (counts[player.position] >= target.max) return -Infinity;
  if (round < target.earliest) return -Infinity;

  // Base value: earlier board rank is better.
  let score = 1000 - player.rank;

  // Still short of a startable player here — nudge up, harder as picks run out.
  if (counts[player.position] < target.min) {
    const urgency = (round / rounds) * 60;
    score += 25 + urgency;
  }

  // A little randomness so two runs of the same draft aren't identical.
  score += (Math.random() - 0.5) * 45;
  return score;
}

/** Makes the pick currently on the clock for an AI team. */
export function aiPick(draft) {
  const { round } = draft.current;
  const team = draft.onTheClock;

  let best = null;
  let bestScore = -Infinity;
  // Only the top of the board can realistically go next; scanning 60 keeps this
  // instant even on a phone.
  for (const player of draft.available.slice(0, 60)) {
    const score = aiScore(player, team.roster, round, draft.rounds);
    if (score > bestScore) {
      bestScore = score;
      best = player;
    }
  }
  // Every candidate gated out (late rounds, full roster) — take best available.
  return best ?? draft.available[0] ?? null;
}

/** Commits a pick and advances the clock. */
export function makePick(draft, player) {
  if (draft.isComplete || !player) return draft;
  const { round, slot } = draft.current;
  const team = draft.teams.find((t) => t.slot === slot);

  draft.available = draft.available.filter((p) => p.playerId !== player.playerId);
  team.roster.push(player);
  draft.picks.push({
    overall: draft.pickIndex + 1,
    round,
    slot,
    teamName: team.name,
    isUser: team.isUser,
    player,
  });
  draft.pickIndex += 1;
  return draft;
}

/** Runs AI picks until it is the user's turn again, or the draft ends. */
export function advanceToUser(draft, limit = 500) {
  let guard = 0;
  while (!draft.isComplete && !draft.onTheClock.isUser && guard < limit) {
    makePick(draft, aiPick(draft));
    guard += 1;
  }
  return draft;
}

/**
 * Grades every roster once the draft is done.
 *
 * Scored on the projected points of the lineup you could actually START, not
 * the sum of all 16 players — hoarding a fourth quarterback adds nothing on a
 * Sunday, and a grade that rewarded it would teach the wrong lesson.
 */
export function gradeDraft(draft, startingSlots) {
  const SLOT_ELIGIBILITY = {
    0: ['QB'], 2: ['RB'], 4: ['WR'], 6: ['TE'], 16: ['D/ST'], 17: ['K'],
    23: ['RB', 'WR', 'TE'], 7: ['QB', 'RB', 'WR', 'TE'],
    3: ['RB', 'WR'], 5: ['WR', 'TE'],
  };

  const slots = [];
  for (const { slotId, count } of startingSlots ?? []) {
    for (let i = 0; i < count; i += 1) slots.push(slotId);
  }
  // Most restrictive first, so the flex takes whatever is genuinely left over.
  slots.sort((a, b) => (SLOT_ELIGIBILITY[a] ?? []).length - (SLOT_ELIGIBILITY[b] ?? []).length);

  const results = draft.teams.map((team) => {
    const remaining = [...team.roster].sort((a, b) => (b.projected ?? 0) - (a.projected ?? 0));
    const starters = [];

    for (const slotId of slots) {
      const eligible = SLOT_ELIGIBILITY[slotId] ?? [];
      const idx = remaining.findIndex((p) => eligible.includes(p.position));
      if (idx === -1) continue;
      const [picked] = remaining.splice(idx, 1);
      starters.push({ ...picked, slotId });
    }

    const startingPoints = starters.reduce((a, p) => a + (p.projected ?? 0), 0);
    const benchPoints = remaining.reduce((a, p) => a + (p.projected ?? 0), 0);

    return {
      slot: team.slot,
      name: team.name,
      isUser: team.isUser,
      roster: team.roster,
      starters,
      bench: remaining,
      startingPoints: Number(startingPoints.toFixed(1)),
      benchPoints: Number(benchPoints.toFixed(1)),
      byPosition: countByPosition(team.roster),
      // A lineup that cannot be legally filled is worth flagging loudly.
      incompleteLineup: starters.length < slots.length,
    };
  });

  results.sort((a, b) => b.startingPoints - a.startingPoints);

  const scale = ['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'F'];
  results.forEach((r, i) => {
    r.rank = i + 1;
    r.grade = scale[Math.min(scale.length - 1, Math.floor((i / results.length) * scale.length))];
  });

  return results;
}

/**
 * Starting slots this roster still cannot fill.
 *
 * Shown live during the draft rather than only in the final grade — finding out
 * you have no kicker after the last pick teaches nothing you can act on.
 */
export function rosterNeeds(roster, startingSlots) {
  const SLOT_ELIGIBILITY = {
    0: ['QB'], 2: ['RB'], 4: ['WR'], 6: ['TE'], 16: ['D/ST'], 17: ['K'],
    23: ['RB', 'WR', 'TE'], 7: ['QB', 'RB', 'WR', 'TE'],
    3: ['RB', 'WR'], 5: ['WR', 'TE'],
  };
  const SLOT_LABEL = {
    0: 'QB', 2: 'RB', 4: 'WR', 6: 'TE', 16: 'D/ST', 17: 'K', 23: 'FLEX', 7: 'OP', 3: 'RB/WR', 5: 'WR/TE',
  };

  const slots = [];
  for (const { slotId, count } of startingSlots ?? []) {
    for (let i = 0; i < count; i += 1) slots.push(slotId);
  }
  slots.sort((a, b) => (SLOT_ELIGIBILITY[a] ?? []).length - (SLOT_ELIGIBILITY[b] ?? []).length);

  const remaining = [...roster];
  const unfilled = [];
  for (const slotId of slots) {
    const eligible = SLOT_ELIGIBILITY[slotId] ?? [];
    const idx = remaining.findIndex((p) => eligible.includes(p.position));
    if (idx === -1) unfilled.push(SLOT_LABEL[slotId] ?? String(slotId));
    else remaining.splice(idx, 1);
  }
  return unfilled;
}

/** Value relative to where the board said a player should go. */
export function pickValue(pick) {
  if (pick.player.rank === null) return null;
  return pick.overall - pick.player.rank;
}
