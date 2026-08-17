/**
 * Fantasy Football Hub — client.
 *
 * Renders pre-computed JSON from docs/data/. No framework, no build step, no
 * network calls to ESPN (the browser cannot reach it — no CORS headers).
 *
 * Two things this file is careful about:
 *   - Every view has a real empty state. The league does not draft until
 *     Sept 5 2026, so "nothing here yet" is the normal case for now and it
 *     should read as intentional, not broken.
 *   - Routing keeps keyboard and screen reader users oriented: focus moves to
 *     the heading, aria-current tracks the nav, and changes are announced.
 */

const VIEWS = ['overview', 'standings', 'teams', 'draft', 'trades', 'prizes', 'money'];

const state = { hub: null, season: null, draft: null, money: null, weeks: null };

// --- Helpers ---------------------------------------------------------------

const $ = (sel) => document.querySelector(sel);

/** Escapes text before it goes anywhere near innerHTML. */
function esc(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const num = (n, digits = 2) =>
  n === null || n === undefined || Number.isNaN(n) ? '—' : Number(n).toFixed(digits);

const money = (amount, currency = 'USD') => {
  if (amount === null || amount === undefined) return '—';
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount);
  } catch {
    return `$${Number(amount).toFixed(2)}`;
  }
};

const signed = (n, digits = 2) => {
  if (n === null || n === undefined) return '—';
  const v = Number(n);
  return `${v > 0 ? '+' : ''}${v.toFixed(digits)}`;
};

/** Sign as a pill, with the sign in the text so colour is never load-bearing. */
function deltaPill(value, digits = 2) {
  if (value === null || value === undefined) return '<span class="pill pill--neutral">—</span>';
  const v = Number(value);
  const cls = v > 0.001 ? 'pill--good' : v < -0.001 ? 'pill--bad' : 'pill--neutral';
  return `<span class="pill ${cls}">${esc(signed(v, digits))}</span>`;
}

function emptyState(title, message) {
  return `<div class="empty"><h3>${esc(title)}</h3><p>${esc(message)}</p></div>`;
}

async function loadJson(path) {
  const res = await fetch(path, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${path} → ${res.status} ${res.statusText}`);
  return res.json();
}

// --- Views -----------------------------------------------------------------

function renderOverview() {
  const { hub } = state;
  const { phase, status, league, standings, power } = hub;

  const parts = [];

  parts.push(`
    <div class="banner">
      <h2>${esc(phase.headline)}</h2>
      <p>${esc(phase.detail)}</p>
      ${phase.nextMilestone ? `<span class="banner__next">${esc(phase.nextMilestone)}</span>` : ''}
    </div>
  `);

  const claimed = hub.teams.filter((t) => !t.isPlaceholder).length;
  const draftDate = league.draftDate ? new Date(league.draftDate) : null;

  parts.push(`
    <ul class="stats">
      <li class="stat">
        <span class="stat__label">Managers</span>
        <span class="stat__value">${claimed} / ${esc(league.size)}</span>
        <span class="stat__note">${claimed === league.size ? 'League is full' : 'Invites outstanding'}</span>
      </li>
      <li class="stat">
        <span class="stat__label">Scoring</span>
        <span class="stat__value">${league.isPPR ? 'PPR' : 'Standard'}</span>
        <span class="stat__note">${esc(league.startingSlots.length)} starting slots</span>
      </li>
      <li class="stat">
        <span class="stat__label">Weeks played</span>
        <span class="stat__value">${esc(status.weeksPlayed)}</span>
        <span class="stat__note">of ${esc(league.regularSeasonWeeks)} regular season</span>
      </li>
      <li class="stat">
        <span class="stat__label">Draft</span>
        <span class="stat__value">${draftDate ? draftDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : 'TBD'}</span>
        <span class="stat__note">${esc(league.draftType ?? 'Not set')}${league.timePerPick ? ` · ${league.timePerPick}s/pick` : ''}</span>
      </li>
    </ul>
  `);

  if (power.length) {
    parts.push(`
      <div class="table-scroll">
        <table>
          <caption>Power rankings — blends all-play win rate, scoring, and recent form</caption>
          <thead>
            <tr>
              <th scope="col" class="num">#</th>
              <th scope="col">Team</th>
              <th scope="col" class="num">Power</th>
              <th scope="col" class="num">Record</th>
              <th scope="col" class="num">All-play</th>
              <th scope="col" class="num">Avg pts</th>
            </tr>
          </thead>
          <tbody>
            ${power
              .map(
                (t) => `
              <tr>
                <td class="num">${esc(t.rank)}</td>
                <th scope="row" class="row-team">${esc(t.teamName)}<small>${esc(t.managerName ?? '')}</small></th>
                <td class="num">${num(t.powerScore, 1)}</td>
                <td class="num">${esc(t.record)}</td>
                <td class="num">${num(t.allPlayWinPct, 1)}%</td>
                <td class="num">${num(t.avgScore, 1)}</td>
              </tr>`
              )
              .join('')}
          </tbody>
        </table>
      </div>
    `);
  } else {
    parts.push(
      emptyState(
        'No games played yet',
        'Power rankings, standings, and prizes all unlock after Week 1 kicks off.'
      )
    );
  }

  if (!standings.length || status.weeksPlayed === 0) {
    parts.push(`
      <div class="card" style="margin-top:1.5rem">
        <h3>What works right now</h3>
        <p>Before the draft there is nothing to analyse, but two things are worth doing today:</p>
        <ul>
          <li><a href="#money">Money</a> — set the buy-in and start tracking who has paid.</li>
          <li><a href="#prizes">Prizes</a> — see exactly which side prizes will be computed, so you can agree the rules before anyone has a stake in them.</li>
        </ul>
      </div>
    `);
  }

  $('#overview-body').innerHTML = parts.join('');
}

function renderStandings() {
  const { standings, league } = state.hub;
  if (!standings.length || standings.every((t) => t.gamesPlayed === 0)) {
    $('#standings-body').innerHTML = emptyState(
      'Standings start after Week 1',
      'Once games are played this fills in with records, points, luck, and lineup efficiency.'
    );
    return;
  }

  const rows = standings
    .map((t) => {
      const cut = t.rank === league.playoffTeams;
      return `
      <tr class="${cut ? 'playoff-cut' : ''}">
        <td class="num">${esc(t.rank)}</td>
        <th scope="row" class="row-team">
          ${esc(t.teamName)}<small>${esc(t.managerName ?? '')}</small>
        </th>
        <td class="num">${esc(t.wins)}-${esc(t.losses)}${t.ties ? `-${esc(t.ties)}` : ''}</td>
        <td class="num">${num(t.pointsFor, 1)}</td>
        <td class="num">${num(t.pointsAgainst, 1)}</td>
        <td class="num">${num(t.avgScore, 1)}</td>
        <td class="num">${esc(t.allPlayWins)}-${esc(t.allPlayLosses)}</td>
        <td class="num">${deltaPill(t.luck)}</td>
        <td class="num">${t.efficiency === null ? '—' : `${num(t.efficiency, 1)}%`}</td>
        <td class="num">${t.streakType ? `${esc(t.streakType[0])}${esc(t.streakLength)}` : '—'}</td>
        <td>${t.inPlayoffs ? '<span class="pill pill--good">In</span>' : '<span class="pill pill--neutral">Out</span>'}</td>
      </tr>`;
    })
    .join('');

  $('#standings-body').innerHTML = `
    <div class="table-scroll">
      <table>
        <caption>
          League standings. The line below rank ${league.playoffTeams} marks the playoff cut —
          the "Playoff" column states it in text as well.
        </caption>
        <thead>
          <tr>
            <th scope="col" class="num">#</th>
            <th scope="col">Team</th>
            <th scope="col" class="num">Record</th>
            <th scope="col" class="num"><abbr title="Points for">PF</abbr></th>
            <th scope="col" class="num"><abbr title="Points against">PA</abbr></th>
            <th scope="col" class="num">Avg</th>
            <th scope="col" class="num"><abbr title="Record if everyone played everyone every week">All-play</abbr></th>
            <th scope="col" class="num"><abbr title="Wins above or below what the scores deserved">Luck</abbr></th>
            <th scope="col" class="num"><abbr title="Share of possible points actually started">Eff.</abbr></th>
            <th scope="col" class="num">Streak</th>
            <th scope="col">Playoff</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function renderTeams() {
  const { hub } = state;
  const stats = state.season?.teamStats ?? [];

  if (!stats.length || stats.every((t) => t.gamesPlayed === 0)) {
    const roster = hub.teams
      .map(
        (t) => `
      <div class="card">
        <h3>${esc(t.name)}</h3>
        <p>${
          t.isPlaceholder
            ? '<span class="pill pill--warn">Unclaimed</span>'
            : `<span class="pill pill--good">Claimed</span> ${esc(t.managerName ?? '')}`
        }</p>
      </div>`
      )
      .join('');
    $('#teams-body').innerHTML = `
      ${emptyState('Team stats start after Week 1', 'Until then, here is who has claimed a spot.')}
      <div class="grid" style="margin-top:1.5rem">${roster}</div>`;
    return;
  }

  const cards = [...stats]
    .sort((a, b) => b.pointsFor - a.pointsFor)
    .map(
      (t) => `
    <div class="card">
      <h3>${esc(t.teamName)}</h3>
      <p class="stat__note">${esc(t.managerName ?? '')}</p>
      <ul class="stats" style="margin:0.75rem 0 0">
        <li class="stat"><span class="stat__label">Record</span>
          <span class="stat__value">${esc(t.wins)}-${esc(t.losses)}</span></li>
        <li class="stat"><span class="stat__label">Points</span>
          <span class="stat__value">${num(t.pointsFor, 0)}</span>
          <span class="stat__note">${num(t.avgScore, 1)}/wk</span></li>
        <li class="stat"><span class="stat__label">Efficiency</span>
          <span class="stat__value">${t.efficiency === null ? '—' : `${num(t.efficiency, 0)}%`}</span>
          <span class="stat__note">${num(t.benchPoints, 0)} benched</span></li>
        <li class="stat"><span class="stat__label">Luck</span>
          <span class="stat__value">${esc(signed(t.luck, 1))}</span>
          <span class="stat__note">${num(t.expectedWins, 1)} expected wins</span></li>
        <li class="stat"><span class="stat__label">High / Low</span>
          <span class="stat__value">${num(t.highScore, 0)}</span>
          <span class="stat__note">low ${num(t.lowScore, 0)}</span></li>
        <li class="stat"><span class="stat__label">Consistency</span>
          <span class="stat__value">±${num(t.stdDev, 1)}</span>
          <span class="stat__note">per week</span></li>
      </ul>
    </div>`
    )
    .join('');

  $('#teams-body').innerHTML = `<div class="grid">${cards}</div>`;
}

function renderDraft() {
  const draft = state.draft;
  if (!draft || !draft.held) {
    const when = state.hub.league.draftDate
      ? new Date(state.hub.league.draftDate).toLocaleString()
      : 'a date not yet set in ESPN';
    $('#draft-body').innerHTML = emptyState(
      'Draft has not happened yet',
      `ESPN has ${draft?.totalSlots ?? 0} empty pick slots on the board, scheduled for ${when}. ` +
        'The full board, per-manager grades, steals, and reaches all appear here once picks are made.'
    );
    return;
  }

  const parts = [];

  if (draft.hasResults) {
    parts.push(`
      <div class="table-scroll" style="margin-bottom:1.5rem">
        <table>
          <caption>Draft grades — total value gained or lost versus where each pick was spent</caption>
          <thead>
            <tr>
              <th scope="col" class="num">#</th>
              <th scope="col">Manager</th>
              <th scope="col">Grade</th>
              <th scope="col" class="num">Value</th>
              <th scope="col" class="num">Points</th>
              <th scope="col">Best pick</th>
              <th scope="col">Worst pick</th>
            </tr>
          </thead>
          <tbody>
            ${draft.teamGrades
              .map(
                (t) => `
              <tr>
                <td class="num">${esc(t.rank)}</td>
                <th scope="row" class="row-team">${esc(t.teamName)}<small>${esc(t.managerName ?? '')}</small></th>
                <td><span class="pill pill--neutral">${esc(t.grade)}</span></td>
                <td class="num">${deltaPill(t.totalValue, 0)}</td>
                <td class="num">${num(t.totalPoints, 0)}</td>
                <td>${t.bestPick ? `${esc(t.bestPick.playerName)} <small>(R${esc(t.bestPick.round)})</small>` : '—'}</td>
                <td>${t.worstPick ? `${esc(t.worstPick.playerName)} <small>(R${esc(t.worstPick.round)})</small>` : '—'}</td>
              </tr>`
              )
              .join('')}
          </tbody>
        </table>
      </div>
    `);

    const list = (title, picks) => `
      <div class="card">
        <h3>${esc(title)}</h3>
        <ol style="margin:0;padding-left:1.2rem">
          ${picks
            .slice(0, 5)
            .map(
              (p) =>
                `<li>${esc(p.playerName)} <small>${esc(p.position)} · pick ${esc(p.overall)} · ${esc(p.teamName)}</small> ${deltaPill(p.valueDelta, 0)}</li>`
            )
            .join('')}
        </ol>
      </div>`;
    parts.push(
      `<div class="grid" style="margin-bottom:1.5rem">
        ${list('Biggest steals', draft.steals)}
        ${list('Biggest reaches', draft.reaches)}
      </div>`
    );
  }

  parts.push('<h3>Full draft board</h3>');
  for (const round of draft.board) {
    parts.push(`
      <div class="draft-round">
        <h3>Round ${esc(round.round)}</h3>
        <ol class="draft-picks">
          ${round.picks
            .map(
              (p) => `
            <li class="pick">
              <span class="pick__num">${esc(p.overall)}.</span>
              <span class="pick__player">${esc(p.playerName)}</span>
              <span class="pick__meta">${esc(p.position)} · ${esc(p.proTeam)}</span><br>
              <span class="pick__meta">${esc(p.teamName)}</span>
              ${draft.hasResults ? `<br>${deltaPill(p.valueDelta, 0)}` : ''}
            </li>`
            )
            .join('')}
        </ol>
      </div>`);
  }

  $('#draft-body').innerHTML = parts.join('');
}

function renderTrades() {
  const trades = state.season?.trades ?? [];
  const transactions = state.season?.transactions ?? [];

  const parts = [];

  if (!trades.length) {
    parts.push(
      emptyState(
        'No trades yet',
        'Every completed trade will appear here with both sides laid out, once the season is underway.'
      )
    );
  } else {
    parts.push(
      `<div class="grid">${trades
        .map(
          (t) => `
      <div class="card">
        <h3>${t.date ? esc(new Date(t.date).toLocaleDateString()) : 'Trade'}</h3>
        ${t.sides
          .map(
            (s) => `
          <p><strong>${esc(s.teamName)}</strong> received:<br>
          ${s.received.length ? s.received.map((p) => `${esc(p.name)} <small>(${esc(p.position)})</small>`).join('<br>') : '<em>nothing recorded</em>'}
          </p>`
          )
          .join('')}
      </div>`
        )
        .join('')}</div>`
    );
  }

  if (transactions.length) {
    parts.push(`
      <h3 style="margin-top:2rem">Waiver &amp; free agent moves</h3>
      <div class="table-scroll">
        <table>
          <caption>${transactions.length} transaction(s)</caption>
          <thead>
            <tr>
              <th scope="col" class="num">Week</th>
              <th scope="col">Team</th>
              <th scope="col">Type</th>
              <th scope="col">Players</th>
              <th scope="col" class="num">Bid</th>
            </tr>
          </thead>
          <tbody>
            ${transactions
              .slice(0, 100)
              .map(
                (tx) => `
              <tr>
                <td class="num">${esc(tx.scoringPeriodId ?? '—')}</td>
                <th scope="row" class="row-team">${esc(tx.teamName)}</th>
                <td>${esc(tx.type)}</td>
                <td>${tx.items.map((i) => `${esc(i.type)} ${esc(i.playerName)}`).join(', ')}</td>
                <td class="num">${tx.bidAmount ? `$${esc(tx.bidAmount)}` : '—'}</td>
              </tr>`
              )
              .join('')}
          </tbody>
        </table>
      </div>`);
  }

  $('#trades-body').innerHTML = parts.join('');
}

function renderPrizes() {
  const prizes = state.season?.prizes ?? [];
  const weeklyHigh = state.hub.weeklyHigh ?? [];

  if (!prizes.length) {
    // Even with no data, showing the catalogue is genuinely useful — it lets
    // the league agree the rules before anyone has a stake in the outcome.
    const catalogue = [
      ['Highest Single Week', 'Most points scored by anyone in one week'],
      ['Lowest Single Week', 'Fewest points scored by anyone in one week'],
      ['Tough Luck Award', 'Highest score that still lost'],
      ['Stole One', 'Lowest score that still won'],
      ['Biggest Blowout', 'Largest margin of victory'],
      ['Photo Finish', 'Narrowest margin of victory'],
      ['Bench Warmer', 'Most points left on the bench in one week'],
      ['Player of the Year', 'Best single game by a started player'],
      ['Why Did You Start Him', 'Worst single game by a started player'],
      ['Best Manager', 'Highest lineup efficiency across the season'],
      ['Room For Improvement', 'Lowest lineup efficiency'],
      ['Horseshoe Award', 'Won the most games above what the scores deserved'],
      ['Snakebit', 'Won the fewest games relative to how well they scored'],
      ['Old Reliable', 'Smallest week-to-week swing'],
      ['Boom or Bust', 'Largest week-to-week swing'],
      ['True Champion', 'Best record if everyone played everyone every week'],
      ['Season-Long Bench Warmer', 'Most total points benched all season'],
      ['Lineup Savant', 'Most weeks with a perfect lineup'],
    ];
    $('#prizes-body').innerHTML = `
      ${emptyState(
        'No prizes to award yet',
        'These are the 18 prizes that will be computed automatically once games are played. Worth agreeing which ones pay out before the draft.'
      )}
      <div class="grid" style="margin-top:1.5rem">
        ${catalogue
          .map(
            ([label, desc]) => `
          <div class="prize">
            <p class="prize__label">${esc(label)}</p>
            <p class="prize__desc">${esc(desc)}</p>
            <p class="prize__detail"><em>Awaiting results</em></p>
          </div>`
          )
          .join('')}
      </div>`;
    return;
  }

  const cards = prizes
    .map(
      (p) => `
    <div class="prize">
      <p class="prize__label">${esc(p.label)}</p>
      <p class="prize__desc">${esc(p.description)}</p>
      <p class="prize__winner">${esc(p.winner.teamName)}</p>
      <p class="prize__detail">${esc(p.winner.detail ?? '')}</p>
    </div>`
    )
    .join('');

  const weekly = weeklyHigh.length
    ? `<h3 style="margin-top:2rem">Weekly high scores</h3>
       <div class="table-scroll">
         <table>
           <caption>Top scorer each week — often its own small pot</caption>
           <thead><tr><th scope="col" class="num">Week</th><th scope="col">Team</th><th scope="col" class="num">Points</th></tr></thead>
           <tbody>
             ${weeklyHigh
               .map(
                 (w) =>
                   `<tr><td class="num">${esc(w.week)}</td><th scope="row" class="row-team">${esc(w.teamName)}</th><td class="num">${num(w.score, 2)}</td></tr>`
               )
               .join('')}
           </tbody>
         </table>
       </div>`
    : '';

  $('#prizes-body').innerHTML = `<div class="grid">${cards}</div>${weekly}`;
}

function renderMoney() {
  const m = state.money;
  if (!m) {
    // On the published site the ledger is deliberately absent — it is
    // gitignored and never uploaded. Locally it loads fine, so a missing file
    // here means "kept private", not "broken".
    $('#money-body').innerHTML =
      state.hub?.site?.showMoney === false
        ? emptyState(
            'Ledger is kept private',
            'Buy-ins and payments are tracked locally and are not published to this site. ' +
              'Ask the commissioner where the money stands.'
          )
        : emptyState('No ledger', 'config/money.json could not be loaded.');
    return;
  }

  const parts = [];

  if (m.warnings.length) {
    parts.push(
      `<div class="error" role="alert" style="margin-bottom:1.5rem">
        <strong>Check the ledger config</strong>
        <ul style="margin:0.5rem 0 0;padding-left:1.2rem">
          ${m.warnings.map((w) => `<li>${esc(w)}</li>`).join('')}
        </ul>
      </div>`
    );
  }

  parts.push(`
    <ul class="stats">
      <li class="stat"><span class="stat__label">Buy-in</span>
        <span class="stat__value">${esc(money(m.buyIn, m.currency))}</span>
        <span class="stat__note">per team</span></li>
      <li class="stat"><span class="stat__label">Total pot</span>
        <span class="stat__value">${esc(money(m.expectedPot, m.currency))}</span>
        <span class="stat__note">${esc(m.expectedTeams)} teams</span></li>
      <li class="stat"><span class="stat__label">Collected</span>
        <span class="stat__value">${esc(money(m.collected, m.currency))}</span>
        <span class="stat__note">${num(m.collectionPct, 0)}% in</span></li>
      <li class="stat"><span class="stat__label">Outstanding</span>
        <span class="stat__value">${esc(money(m.outstanding, m.currency))}</span>
        <span class="stat__note">${esc(m.unpaid.length)} unpaid</span></li>
    </ul>
    <div class="progress">
      <div class="progress__fill" style="width:${Math.min(100, m.collectionPct)}%"></div>
    </div>
    <p class="stat__note" style="margin-bottom:1.5rem">
      ${esc(money(m.collected, m.currency))} of ${esc(money(m.expectedPot, m.currency))} collected.
    </p>
  `);

  parts.push(`
    <div class="table-scroll" style="margin-bottom:1.5rem">
      <table>
        <caption>Payout structure — percentages of the full pot</caption>
        <thead>
          <tr><th scope="col">Place</th><th scope="col" class="num">Share</th><th scope="col" class="num">Amount</th><th scope="col">Currently</th></tr>
        </thead>
        <tbody>
          ${m.payouts
            .map(
              (p) => `
            <tr>
              <th scope="row">${esc(p.label)}</th>
              <td class="num">${esc(p.pct)}%</td>
              <td class="num">${esc(money(p.amount, m.currency))}</td>
              <td>${p.teamName ? esc(p.teamName) : '<span class="stat__note">—</span>'}</td>
            </tr>`
            )
            .join('')}
        </tbody>
      </table>
    </div>`);

  if (m.members.length) {
    parts.push(`
      <div class="table-scroll">
        <table>
          <caption>Who has paid</caption>
          <thead>
            <tr><th scope="col">Manager</th><th scope="col">Team</th><th scope="col" class="num">Paid</th><th scope="col" class="num">Balance</th><th scope="col">Status</th></tr>
          </thead>
          <tbody>
            ${m.members
              .map(
                (mem) => `
              <tr>
                <th scope="row">${esc(mem.managerName ?? '—')}</th>
                <td>${esc(mem.teamName)}</td>
                <td class="num">${esc(money(mem.amountPaid, m.currency))}</td>
                <td class="num">${esc(money(mem.balance, m.currency))}</td>
                <td>${
                  mem.paid
                    ? '<span class="pill pill--good">Paid</span>'
                    : mem.partial
                      ? '<span class="pill pill--warn">Partial</span>'
                      : '<span class="pill pill--bad">Unpaid</span>'
                }</td>
              </tr>`
              )
              .join('')}
          </tbody>
        </table>
      </div>`);
  } else {
    parts.push(
      emptyState('No managers to bill yet', 'Once managers claim their teams they appear here.')
    );
  }

  $('#money-body').innerHTML = parts.join('');
}

const RENDERERS = {
  overview: renderOverview,
  standings: renderStandings,
  teams: renderTeams,
  draft: renderDraft,
  trades: renderTrades,
  prizes: renderPrizes,
  money: renderMoney,
};

// --- Routing ---------------------------------------------------------------

let currentView = null;

function show(view, { focus = false } = {}) {
  if (!VIEWS.includes(view)) view = 'overview';

  for (const v of VIEWS) {
    $(`#view-${v}`).hidden = v !== view;
  }
  for (const link of document.querySelectorAll('.site-nav a')) {
    if (link.dataset.view === view) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }

  if (view !== currentView) {
    try {
      RENDERERS[view]();
    } catch (error) {
      $(`#view-${view}`).querySelector('div:last-child').innerHTML =
        `<div class="error" role="alert"><strong>Could not render this view.</strong><p>${esc(error.message)}</p></div>`;
      console.error(error);
    }
    currentView = view;
  }

  const heading = $(`#view-${view} h2`);
  $('#route-status').textContent = `${heading.textContent} section loaded`;
  if (focus) {
    const main = $('#main');
    main.focus({ preventScroll: false });
  }
}

function onHashChange(isInitial = false) {
  const view = (location.hash || '#overview').slice(1);
  show(view, { focus: !isInitial });
}

// --- Theme -----------------------------------------------------------------

function initTheme() {
  const button = $('#theme-toggle');
  const stored = localStorage.getItem('ffh-theme');
  if (stored === 'light' || stored === 'dark') {
    document.documentElement.dataset.theme = stored;
  }

  const sync = () => {
    const isLight =
      document.documentElement.dataset.theme === 'light' ||
      (!document.documentElement.dataset.theme &&
        window.matchMedia('(prefers-color-scheme: light)').matches);
    button.textContent = isLight ? 'Switch to dark theme' : 'Switch to light theme';
    button.setAttribute('aria-pressed', String(isLight));
  };

  button.addEventListener('click', () => {
    const isLight =
      document.documentElement.dataset.theme === 'light' ||
      (!document.documentElement.dataset.theme &&
        window.matchMedia('(prefers-color-scheme: light)').matches);
    const next = isLight ? 'dark' : 'light';
    document.documentElement.dataset.theme = next;
    localStorage.setItem('ffh-theme', next);
    sync();
  });

  sync();
}

// --- Boot ------------------------------------------------------------------

async function boot() {
  initTheme();

  try {
    const hub = await loadJson('data/hub.json');
    state.hub = hub;

    const year = hub.league.season ?? hub.seasons?.[hub.seasons.length - 1];
    const [season, draft, money] = await Promise.all([
      loadJson(`data/season-${year}.json`).catch(() => null),
      loadJson(`data/draft-${year}.json`).catch(() => null),
      loadJson('data/money.json').catch(() => null),
    ]);
    state.season = season;
    state.draft = draft;
    state.money = money;

    $('#league-name').textContent = hub.league.displayName ?? hub.league.name;
    $('#league-sub').textContent =
      `${hub.league.season} season · ${hub.league.size} teams · ${hub.league.isPPR ? 'PPR' : 'Standard'}`;
    document.title = `${hub.league.displayName ?? hub.league.name} — Fantasy Football Hub`;

    const generated = new Date(hub.generatedAt);
    const timeEl = $('#generated-at');
    timeEl.textContent = generated.toLocaleString();
    timeEl.dateTime = hub.generatedAt;

    // Flag fixture builds loudly so nobody mistakes test data for the real
    // league. The build sets this — team owner IDs are stripped before publish.
    if (hub.synthetic) {
      $('#fixture-warning').hidden = false;
    }

    $('#boot').hidden = true;
    onHashChange(true);
    window.addEventListener('hashchange', () => onHashChange(false));
  } catch (error) {
    $('#boot').className = 'error';
    $('#boot').setAttribute('role', 'alert');
    $('#boot').innerHTML = `
      <strong>Could not load league data.</strong>
      <p>${esc(error.message)}</p>
      <p>If you are opening this file directly, the browser blocks local
      <code>fetch</code>. Run <code>npm run serve</code> and open the address it prints.</p>
      <p>If the data files are missing, run <code>npm run fetch</code> then <code>npm run build</code>.</p>`;
    console.error(error);
  }
}

boot();
