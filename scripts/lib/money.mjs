/**
 * The money ledger.
 *
 * ESPN has no idea this exists — it is entirely driven by config/money.json.
 * The goal is that at any moment you can answer, without arguing: how much is
 * in the pot, who still owes, what each place pays, and what has been paid out.
 */

const round2 = (n) => Number((n ?? 0).toFixed(2));

/**
 * Divides one pot across N weeks so the parts add back up to the whole.
 *
 * Done in whole cents with the leftover handed to the earliest weeks. The
 * obvious `pot / weeks` rounded per week drifts — $195 over 13 weeks is fine,
 * but $200 over 13 is $15.38 a week, which is $199.94, and a ledger that
 * cannot account for six cents is a ledger nobody trusts with the other $500.
 *
 * Exported because the public site needs these amounts and the private ledger
 * needs them too. Two implementations would eventually disagree, and the week
 * they disagreed would be the week somebody got paid the wrong number.
 */
export function splitPot(pot, weeks) {
  const amount = Number(pot) || 0;
  if (!Array.isArray(weeks) || !weeks.length || amount <= 0) return [];

  const cents = Math.round(amount * 100);
  const base = Math.floor(cents / weeks.length);
  let extra = cents - base * weeks.length;

  return weeks.map((week) => {
    const share = base + (extra > 0 ? 1 : 0);
    if (extra > 0) extra -= 1;
    return { week, amount: round2(share / 100) };
  });
}

/**
 * What each payout slot is worth, given the size of the pot.
 *
 * A slot can be defined three ways, so the config can say what the league
 * actually agreed rather than being forced into one shape:
 *
 *   amount: 350      a fixed sum, unchanged if the pot moves
 *   pct: 25          a share of the pot, rebalances automatically
 *   remainder: true  whatever is left after the others
 *
 * Fixed amounts are what people actually announce ("winner gets 350"), while a
 * remainder slot means the challenge pot absorbs any drift rather than the
 * numbers silently failing to add up.
 *
 * Computed off the full expected pot, never off what has been collected so far
 * — otherwise every prize would move each time somebody paid.
 *
 * Exported because the published site needs the payout amounts (the league has
 * to know what this week's challenge is worth) while the ledger around them
 * stays private. One function, so the public number and the private one can
 * never disagree.
 */
export function computePayouts(moneyConfig, expectedPot) {
  const structure = moneyConfig.payouts?.structure ?? [];

  const fixedTotal = structure.reduce((a, s) => a + (Number(s.amount) || 0), 0);
  const pctTotal = structure.reduce((a, s) => a + (Number(s.pct) || 0), 0);
  const pctAmount = round2((expectedPot * pctTotal) / 100);

  const remainderSlots = structure.filter((s) => s.remainder);
  const leftOver = round2(expectedPot - fixedTotal - pctAmount);
  const perRemainder = remainderSlots.length ? round2(leftOver / remainderSlots.length) : 0;

  const payouts = structure.map((slot) => {
    let amount;
    if (slot.remainder) amount = perRemainder;
    else if (slot.amount !== undefined) amount = round2(Number(slot.amount) || 0);
    else amount = round2((expectedPot * (Number(slot.pct) || 0)) / 100);

    return {
      id: slot.id,
      label: slot.label,
      note: slot.note ?? null,
      isRemainder: Boolean(slot.remainder),
      // Share of the pot, whichever way the slot was defined — so the UI can
      // always show a percentage even for fixed amounts.
      pct: expectedPot ? Number(((amount / expectedPot) * 100).toFixed(1)) : 0,
      amount,
    };
  });

  return { payouts, structure, fixedTotal, pctAmount, remainderSlots, leftOver };
}

/** Which payout slot funds the weekly challenges, by id. */
export const CHALLENGE_SLOT_ID = 'challenges';

/** The dollar value of the challenge slot, from an already-computed payout list. */
export const challengePayout = (payouts, moneyConfig = {}) =>
  payouts.find((p) => p.id === (moneyConfig.weeklyChallenge?.payoutId ?? CHALLENGE_SLOT_ID))?.amount ?? 0;

export function computeLedger(moneyConfig, season, standings, { challengeWeeks = [] } = {}) {
  const buyIn = Number(moneyConfig.buyIn) || 0;
  const currency = moneyConfig.currency ?? 'USD';

  const paymentByTeam = new Map(
    (moneyConfig.payments ?? []).map((p) => [p.teamId, p])
  );
  const teamById = new Map(season.teams.map((t) => [t.id, t]));

  /**
   * Who is in the pot.
   *
   * Deriving this from claimed ESPN teams alone breaks whenever real life runs
   * ahead of the league settings — people commit and pay before they click the
   * invite link, and until they do every team but the commissioner's looks like
   * an empty placeholder. So the roster of payers comes from `members` in
   * config when it is present, and falls back to claimed teams otherwise.
   * Names come from ESPN once a team is actually claimed.
   */
  const configured = moneyConfig.members ?? null;
  const roster = configured
    ? configured.map((m) => ({
        teamId: m.teamId ?? null,
        name: m.name,
        team: m.teamId ? teamById.get(m.teamId) : null,
      }))
    : season.teams
        .filter((t) => !t.isPlaceholder)
        .map((t) => ({ teamId: t.id, name: t.managerName, team: t }));

  const expectedTeams = roster.length || season.league.size;

  const members = roster.map((entry) => {
    const payment = entry.teamId !== null ? paymentByTeam.get(entry.teamId) : null;
    // A configured member can carry its own paid flag, for people who have
    // handed over money before claiming a team.
    const source = payment ?? configured?.find((m) => m.name === entry.name) ?? null;
    const amountPaid = Number(source?.amountPaid ?? (source?.paid ? buyIn : 0)) || 0;

    return {
      teamId: entry.teamId,
      teamName: entry.team?.name ?? '—',
      managerName: entry.team?.managerName ?? entry.name ?? '—',
      owes: buyIn,
      amountPaid: round2(amountPaid),
      balance: round2(buyIn - amountPaid),
      paid: amountPaid >= buyIn && buyIn > 0,
      partial: amountPaid > 0 && amountPaid < buyIn,
      paidDate: source?.paidDate ?? null,
      method: source?.method ?? null,
      note: source?.note ?? null,
      // Paid up but hasn't joined the ESPN league yet — worth chasing.
      awaitingTeam: entry.team == null,
    };
  });

  const collected = round2(members.reduce((a, m) => a + m.amountPaid, 0));
  const expectedPot = round2(buyIn * expectedTeams);
  const outstanding = round2(expectedPot - collected);

  // ---- Payout structure ---------------------------------------------------
  const { payouts, structure, fixedTotal, pctAmount, remainderSlots, leftOver } =
    computePayouts(moneyConfig, expectedPot);

  // ---- Who currently occupies each paying place --------------------------
  const placeOrder = ['first', 'second', 'third'];
  const projected = payouts.map((slot) => {
    const placeIndex = placeOrder.indexOf(slot.id);
    if (placeIndex === -1) return { ...slot, teamId: null, teamName: null, projected: false };
    const standing = standings?.[placeIndex];
    return {
      ...slot,
      teamId: standing?.teamId ?? null,
      teamName: standing?.teamName ?? null,
      managerName: standing?.managerName ?? null,
      projected: true,
    };
  });

  // ---- The weekly challenge pot ------------------------------------------
  // One payout slot funds every weekly challenge; `challengeWeeks` says which
  // weeks are drawing from it. The site computes the same split from the same
  // slot — see splitPot above for why that is one function and not two.
  const challengePot = challengePayout(payouts, moneyConfig);
  const perWeek = splitPot(challengePot, challengeWeeks);

  const paidOut = (moneyConfig.payoutsPaid ?? []).map((p) => ({
    ...p,
    amount: round2(Number(p.amount) || 0),
  }));
  const totalPaidOut = round2(paidOut.reduce((a, p) => a + p.amount, 0));

  const warnings = [];
  if (buyIn <= 0) {
    warnings.push('No buy-in amount set — edit config/money.json to enable the ledger.');
  }

  // A remainder slot absorbs any slack, so percentages only need to total 100
  // when nothing is picking up the difference.
  const allocated = round2(payouts.reduce((a, p) => a + p.amount, 0));
  if (structure.length && !remainderSlots.length && Math.abs(allocated - expectedPot) > 0.01) {
    warnings.push(
      `Payouts total ${allocated} but the pot is ${expectedPot}. ` +
        'Adjust the amounts, or mark one slot "remainder": true to absorb the difference.'
    );
  }
  if (leftOver < 0) {
    warnings.push(
      `Fixed payouts total ${round2(fixedTotal + pctAmount)}, which is more than the ` +
        `${expectedPot} pot. Something has to give.`
    );
  }
  if (collected > expectedPot) {
    warnings.push('More money collected than expected — check for a duplicate payment entry.');
  }

  return {
    currency,
    buyIn,
    buyInDueDate: moneyConfig.buyInDueDate ?? null,
    expectedTeams,
    expectedPot,
    collected,
    outstanding,
    collectionPct: expectedPot ? Number(((collected / expectedPot) * 100).toFixed(1)) : 0,
    members,
    unpaid: members.filter((m) => !m.paid),
    payouts: projected,
    challengePot: round2(challengePot),
    challengePerWeek: perWeek,
    paidOut,
    totalPaidOut,
    remainingToPay: round2(expectedPot - totalPaidOut),
    warnings,
  };
}
