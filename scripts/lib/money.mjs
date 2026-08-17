/**
 * The money ledger.
 *
 * ESPN has no idea this exists — it is entirely driven by config/money.json.
 * The goal is that at any moment you can answer, without arguing: how much is
 * in the pot, who still owes, what each place pays, and what has been paid out.
 */

const round2 = (n) => Number((n ?? 0).toFixed(2));

export function computeLedger(moneyConfig, season, standings) {
  const buyIn = Number(moneyConfig.buyIn) || 0;
  const currency = moneyConfig.currency ?? 'USD';

  // Only real, claimed teams owe money.
  const payingTeams = season.teams.filter((t) => !t.isPlaceholder);
  const expectedTeams = payingTeams.length || season.league.size;

  const paymentByTeam = new Map(
    (moneyConfig.payments ?? []).map((p) => [p.teamId, p])
  );

  const members = payingTeams.map((team) => {
    const payment = paymentByTeam.get(team.id);
    const amountPaid = Number(payment?.amountPaid ?? (payment?.paid ? buyIn : 0)) || 0;
    return {
      teamId: team.id,
      teamName: team.name,
      managerName: team.managerName,
      owes: buyIn,
      amountPaid: round2(amountPaid),
      balance: round2(buyIn - amountPaid),
      paid: amountPaid >= buyIn && buyIn > 0,
      partial: amountPaid > 0 && amountPaid < buyIn,
      paidDate: payment?.paidDate ?? null,
      method: payment?.method ?? null,
      note: payment?.note ?? null,
    };
  });

  const collected = round2(members.reduce((a, m) => a + m.amountPaid, 0));
  const expectedPot = round2(buyIn * expectedTeams);
  const outstanding = round2(expectedPot - collected);

  // ---- Payout structure ---------------------------------------------------
  const structure = moneyConfig.payouts?.structure ?? [];
  const pctTotal = structure.reduce((a, s) => a + (Number(s.pct) || 0), 0);

  const payouts = structure.map((slot) => ({
    id: slot.id,
    label: slot.label,
    pct: Number(slot.pct) || 0,
    note: slot.note ?? null,
    // Payouts are computed off the full expected pot, not what has been
    // collected so far — otherwise the numbers move every time someone pays.
    amount: round2((expectedPot * (Number(slot.pct) || 0)) / 100),
  }));

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

  const paidOut = (moneyConfig.payoutsPaid ?? []).map((p) => ({
    ...p,
    amount: round2(Number(p.amount) || 0),
  }));
  const totalPaidOut = round2(paidOut.reduce((a, p) => a + p.amount, 0));

  const warnings = [];
  if (buyIn <= 0) {
    warnings.push('No buy-in amount set — edit config/money.json to enable the ledger.');
  }
  if (structure.length && Math.abs(pctTotal - 100) > 0.01) {
    warnings.push(`Payout percentages total ${pctTotal}%, not 100%. Amounts will be off.`);
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
    paidOut,
    totalPaidOut,
    remainingToPay: round2(expectedPot - totalPaidOut),
    warnings,
  };
}
