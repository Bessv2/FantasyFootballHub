/**
 * Fantasy Football Hub — client.
 *
 * Renders pre-computed JSON from docs/data/. No framework, no build step, no
 * network calls to ESPN (the browser cannot reach it — no CORS headers).
 *
 * Design notes:
 *   - Magnitude is drawn with a single sequential hue, never one colour per
 *     team: 12 teams exceeds any CVD-safe categorical set, and the question
 *     these tables answer is "how much", not "which one".
 *   - Every view has a real empty state. The draft is Sept 5 2026, so "nothing
 *     has happened yet" is the normal case for now and should read as
 *     deliberate rather than broken.
 *   - The Money view only exists when its data actually loaded. On the public
 *     site the ledger is never uploaded, so the tab is absent entirely rather
 *     than advertising that something is being withheld.
 */

const ALL_VIEWS = ['overview', 'standings', 'teams', 'team', 'draft', 'trades', 'prizes', 'money'];
let VIEWS = ALL_VIEWS.filter((v) => v !== 'money');

const state = { hub: null, season: null, draft: null, money: null, teamDetail: null };
let countdownTimer = null;

/** Which team the visitor has claimed as theirs, remembered across visits. */
const MY_TEAM_KEY = 'ffh-my-team';
const getMyTeamId = () => {
  const raw = localStorage.getItem(MY_TEAM_KEY);
  return raw === null ? null : Number(raw);
};
const setMyTeamId = (id) => {
  if (id === null) localStorage.removeItem(MY_TEAM_KEY);
  else localStorage.setItem(MY_TEAM_KEY, String(id));
};

// --- Helpers ---------------------------------------------------------------

const $ = (sel) => document.querySelector(sel);

function esc(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
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

/** Sign lives in the text, so colour is never the only channel. */
function deltaPill(value, digits = 2) {
  if (value === null || value === undefined) return '<span class="pill pill--neutral">—</span>';
  const v = Number(value);
  const cls = v > 0.001 ? 'pill--good' : v < -0.001 ? 'pill--bad' : 'pill--neutral';
  return `<span class="pill ${cls}">${esc(signed(v, digits))}</span>`;
}

/**
 * A magnitude bar with its value beside it. The value is always shown as text,
 * so the bar is reinforcement rather than the only way to read the number.
 */
function bar(value, max, { digits = 1, suffix = '' } = {}) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return `
    <div class="bar-wrap">
      <span class="bar-track"><span class="bar-fill" style="width:${pct.toFixed(1)}%"></span></span>
      <span class="bar-value">${esc(num(value, digits))}${esc(suffix)}</span>
    </div>`;
}

/**
 * How many players actually start each week. `startingSlots` lists slot TYPES
 * with a count each, so its length is the number of distinct slots (7), not the
 * number of players you field (9).
 */
const starterCount = (league) =>
  (league.startingSlots ?? []).reduce((total, slot) => total + slot.count, 0);

/** Slot 7 is ESPN's OP slot — QB-eligible, i.e. a superflex league. */
const isSuperflex = (league) =>
  (league.startingSlots ?? []).some((slot) => slot.slotId === 7);

function emptyState(icon, title, message) {
  return `<div class="empty">
    <span class="empty__icon" aria-hidden="true">${esc(icon)}</span>
    <h3>${esc(title)}</h3><p>${esc(message)}</p>
  </div>`;
}

const fmtDate = (ms, opts = { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) =>
  ms ? new Date(ms).toLocaleDateString(undefined, opts) : null;

const fmtTime = (ms) =>
  ms ? new Date(ms).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }) : null;

async function loadJson(path) {
  const res = await fetch(path, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${path} → ${res.status} ${res.statusText}`);
  // Cloudflare Pages serves index.html for missing paths, so a 200 does not
  // guarantee JSON. Parsing is what actually proves the file is there.
  return res.json();
}

// --- Countdown -------------------------------------------------------------

function countdownParts(targetMs) {
  const diff = targetMs - Date.now();
  if (diff <= 0) return null;
  const s = Math.floor(diff / 1000);
  return {
    days: Math.floor(s / 86400),
    hours: Math.floor((s % 86400) / 3600),
    minutes: Math.floor((s % 3600) / 60),
    seconds: s % 60,
  };
}

function renderCountdown() {
  const el = document.getElementById('countdown');
  if (!el) return;
  const target = Number(el.dataset.target);
  const parts = countdownParts(target);

  if (!parts) {
    el.outerHTML = '<p class="pill pill--accent">Draft is underway</p>';
    if (countdownTimer) clearInterval(countdownTimer);
    return;
  }

  const units = [
    ['days', parts.days === 1 ? 'Day' : 'Days'],
    ['hours', 'Hours'],
    ['minutes', 'Minutes'],
    ['seconds', 'Seconds'],
  ];
  el.innerHTML = units
    .map(
      ([key, label]) => `<li>
        <span class="countdown__value">${String(parts[key]).padStart(2, '0')}</span>
        <span class="countdown__unit">${label}</span>
      </li>`
    )
    .join('');
}

function startCountdown() {
  if (countdownTimer) clearInterval(countdownTimer);
  if (!document.getElementById('countdown')) return;
  renderCountdown();
  countdownTimer = setInterval(renderCountdown, 1000);
}

// --- Views -----------------------------------------------------------------

function renderOverview() {
  const { hub } = state;
  const { phase, status, league, power } = hub;
  const parts = [];

  const claimed = hub.teams.filter((t) => !t.isPlaceholder).length;
  const draftMs = league.draftDate;
  const upcoming = draftMs && draftMs > Date.now();

  // --- Hero -------------------------------------------------------------
  if (upcoming) {
    // The ticking counter is hidden from assistive tech — a value announced
    // every second is unusable. The static sentence above it carries the fact.
    parts.push(`
      <section class="hero" aria-labelledby="hero-h">
        <p class="hero__eyebrow">Draft day</p>
        <h2 id="hero-h">${esc(fmtDate(draftMs))}</h2>
        <p class="hero__sub">
          ${esc(fmtTime(draftMs))} · ${esc(league.draftType ?? 'Snake')} draft ·
          ${esc(league.timePerPick ?? 90)} seconds per pick${
            league.draftRoomOpens
              ? ` · room opens ${esc(fmtTime(league.draftRoomOpens))}`
              : ''
          }
        </p>
        <p class="visually-hidden">
          The draft begins on ${esc(fmtDate(draftMs))} at ${esc(fmtTime(draftMs))}.
        </p>
        <ul class="countdown" id="countdown" data-target="${esc(draftMs)}" aria-hidden="true"></ul>
      </section>`);
  } else {
    parts.push(`
      <section class="hero" aria-labelledby="hero-h">
        <p class="hero__eyebrow">${esc(phase.nextMilestone ?? 'Season')}</p>
        <h2 id="hero-h">${esc(phase.headline)}</h2>
        <p class="hero__sub">${esc(phase.detail)}</p>
      </section>`);
  }

  // --- Stat tiles -------------------------------------------------------
  parts.push(`
    <ul class="stats">
      <li class="stat">
        <span class="stat__label">Managers</span>
        <span class="stat__value">${claimed}<span style="color:var(--text-dim)">/${esc(league.size)}</span></span>
        <span class="stat__note">${claimed === league.size ? 'League is full' : `${league.size - claimed} spots open`}</span>
      </li>
      <li class="stat">
        <span class="stat__label">Scoring</span>
        <span class="stat__value">${league.isPPR ? 'PPR' : 'Standard'}</span>
        <span class="stat__note">${esc(starterCount(league))} starters${isSuperflex(league) ? ' · superflex' : ''}</span>
      </li>
      <li class="stat">
        <span class="stat__label">Weeks played</span>
        <span class="stat__value">${esc(status.weeksPlayed)}</span>
        <span class="stat__note">of ${esc(league.regularSeasonWeeks)} regular season</span>
      </li>
      <li class="stat">
        <span class="stat__label">Playoff spots</span>
        <span class="stat__value">${esc(league.playoffTeams)}</span>
        <span class="stat__note">of ${esc(league.size)} teams</span>
      </li>
    </ul>`);

  // --- Power rankings, or the season roadmap ----------------------------
  if (power.length) {
    const maxPower = Math.max(...power.map((t) => t.powerScore), 1);
    parts.push(`
      <div class="table-scroll">
        <table>
          <caption>Power rankings — 50% all-play win rate, 30% scoring, 20% last three weeks</caption>
          <thead>
            <tr>
              <th scope="col" class="num">#</th>
              <th scope="col">Team</th>
              <th scope="col" class="bar-cell">Power</th>
              <th scope="col" class="num">Record</th>
              <th scope="col" class="num">All-play</th>
              <th scope="col" class="num">Avg pts</th>
            </tr>
          </thead>
          <tbody>
            ${power
              .map(
                (t) => `<tr>
                  <td class="num rank">${esc(t.rank)}</td>
                  <th scope="row" class="row-team">${esc(t.teamName)}<small>${esc(t.managerName ?? '')}</small></th>
                  <td class="bar-cell">${bar(t.powerScore, maxPower)}</td>
                  <td class="num">${esc(t.record)}</td>
                  <td class="num">${num(t.allPlayWinPct, 1)}%</td>
                  <td class="num">${num(t.avgScore, 1)}</td>
                </tr>`
              )
              .join('')}
          </tbody>
        </table>
      </div>`);
  } else {
    parts.push(seasonRoadmap());
  }

  $('#overview-body').innerHTML = parts.join('');
  startCountdown();
}

/** What unlocks when — gives the preseason page something to say. */
function seasonRoadmap() {
  const { league, status } = state.hub;
  const now = Date.now();
  const claimed = state.hub.teams.filter((t) => !t.isPlaceholder).length;

  const milestones = [
    {
      title: 'League fills up',
      meta: `${claimed} of ${league.size} managers have joined`,
      done: claimed >= league.size,
    },
    {
      title: 'Draft',
      meta: league.draftDate ? `${fmtDate(league.draftDate)} · ${fmtTime(league.draftDate)}` : 'Not scheduled',
      done: state.draft?.held ?? false,
    },
    {
      title: 'Week 1 kicks off',
      meta: 'Standings, power rankings, luck and prizes all unlock',
      done: status.weeksPlayed > 0,
    },
    {
      title: 'Trade deadline',
      meta: league.tradeDeadline ? fmtDate(league.tradeDeadline) : 'Not set',
      done: league.tradeDeadline ? now > league.tradeDeadline : false,
    },
    {
      title: 'Playoffs',
      meta: `Top ${league.playoffTeams} teams after ${league.regularSeasonWeeks} weeks`,
      done: false,
    },
  ];

  const firstPending = milestones.findIndex((m) => !m.done);

  return `
    <div class="card">
      <h3>Season roadmap</h3>
      <ol class="timeline">
        ${milestones
          .map(
            (m, i) => `<li class="${m.done ? 'is-done' : i === firstPending ? 'is-next' : ''}">
              <span class="timeline__title">${esc(m.title)}${
                m.done ? ' <span class="pill pill--good">Done</span>' : i === firstPending ? ' <span class="pill pill--accent">Next</span>' : ''
              }</span>
              <span class="timeline__meta">${esc(m.meta)}</span>
            </li>`
          )
          .join('')}
      </ol>
    </div>`;
}

function renderStandings() {
  const { standings, league } = state.hub;
  if (!standings.length || standings.every((t) => t.gamesPlayed === 0)) {
    $('#standings-body').innerHTML = emptyState(
      '📊',
      'Standings start after Week 1',
      'Records, points, luck and lineup efficiency all fill in once games are played.'
    );
    return;
  }

  const maxPF = Math.max(...standings.map((t) => t.pointsFor), 1);

  const rows = standings
    .map(
      (t) => `
      <tr class="${t.rank === league.playoffTeams ? 'playoff-cut' : ''}">
        <td class="num rank">${esc(t.rank)}</td>
        <th scope="row" class="row-team">${esc(t.teamName)}<small>${esc(t.managerName ?? '')}</small></th>
        <td class="num">${esc(t.wins)}-${esc(t.losses)}${t.ties ? `-${esc(t.ties)}` : ''}</td>
        <td class="bar-cell">${bar(t.pointsFor, maxPF, { digits: 0 })}</td>
        <td class="num">${num(t.pointsAgainst, 1)}</td>
        <td class="num">${esc(t.allPlayWins)}-${esc(t.allPlayLosses)}</td>
        <td class="num">${deltaPill(t.luck)}</td>
        <td class="num">${t.efficiency === null ? '—' : `${num(t.efficiency, 1)}%`}</td>
        <td class="num">${t.streakType ? `${esc(t.streakType[0])}${esc(t.streakLength)}` : '—'}</td>
        <td>${t.inPlayoffs ? '<span class="pill pill--good">In</span>' : '<span class="pill pill--neutral">Out</span>'}</td>
      </tr>`
    )
    .join('');

  $('#standings-body').innerHTML = `
    <div class="table-scroll">
      <table>
        <caption>
          The rule below rank ${league.playoffTeams} marks the playoff cut; the
          Playoff column states it in text as well.
        </caption>
        <thead>
          <tr>
            <th scope="col" class="num">#</th>
            <th scope="col">Team</th>
            <th scope="col" class="num">Record</th>
            <th scope="col" class="bar-cell">Points for</th>
            <th scope="col" class="num"><abbr title="Points against">PA</abbr></th>
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
        (t) => `<a class="card" href="#team/${esc(t.id)}" style="text-decoration:none;color:inherit;display:block">
          <h3>${esc(t.name)}</h3>
          <p>${
            t.isPlaceholder
              ? '<span class="pill pill--warn">Open spot</span>'
              : `<span class="pill pill--good">Claimed</span> ${esc(t.managerName ?? '')}`
          }</p>
        </a>`
      )
      .join('');
    $('#teams-body').innerHTML = `
      ${emptyState('🏟️', 'Team stats start after Week 1', 'Pick your team below to open its own page — it will be remembered on this device.')}
      <div class="grid" style="margin-top:1.5rem">${roster}</div>`;
    return;
  }

  const cards = [...stats]
    .sort((a, b) => b.pointsFor - a.pointsFor)
    .map(
      (t) => `<div class="card">
        <h3><a href="#team/${esc(t.teamId)}">${esc(t.teamName)}</a></h3>
        <p class="stat__note">${esc(t.managerName ?? '')}</p>
        <ul class="stats" style="margin:0.75rem 0 0">
          <li class="stat"><span class="stat__label">Record</span>
            <span class="stat__value">${esc(t.wins)}-${esc(t.losses)}</span></li>
          <li class="stat"><span class="stat__label">Points</span>
            <span class="stat__value">${num(t.pointsFor, 0)}</span>
            <span class="stat__note">${num(t.avgScore, 1)} per week</span></li>
          <li class="stat"><span class="stat__label">Efficiency</span>
            <span class="stat__value">${t.efficiency === null ? '—' : `${num(t.efficiency, 0)}%`}</span>
            <span class="stat__note">${num(t.benchPoints, 0)} left benched</span></li>
          <li class="stat"><span class="stat__label">Luck</span>
            <span class="stat__value">${esc(signed(t.luck, 1))}</span>
            <span class="stat__note">${num(t.expectedWins, 1)} expected wins</span></li>
        </ul>
      </div>`
    )
    .join('');

  $('#teams-body').innerHTML = `<div class="grid">${cards}</div>`;
}

/**
 * One manager's own page: their season, what they got wrong, what to do next.
 *
 * Reachable at #team/3, so everyone can bookmark their own. There is no login —
 * a static site has nothing to authenticate against — so these pages are
 * readable by anyone in the league. For a fantasy league that is arguably the
 * point; nothing here is more private than what ESPN already shows.
 */
function renderTeam(teamId) {
  const body = $('#team-body');
  const all = state.teamDetail?.teams ?? [];

  if (!all.length) {
    body.innerHTML = emptyState(
      '👤',
      'No teams yet',
      'Once managers claim their spots, each gets their own page here.'
    );
    return;
  }

  const id = teamId ?? getMyTeamId();
  const team = all.find((t) => t.teamId === id);

  if (!team) {
    body.innerHTML = `
      ${emptyState('👋', 'Pick your team', 'Choose which team is yours. It will be remembered on this device.')}
      <div class="grid" style="margin-top:1.5rem">
        ${all
          .map(
            (t) => `<a class="card" href="#team/${esc(t.teamId)}" style="text-decoration:none;color:inherit;display:block">
              <h3>${esc(t.teamName)}</h3>
              <p class="stat__note">${esc(t.managerName ?? 'Unclaimed')}</p>
            </a>`
          )
          .join('')}
      </div>`;
    return;
  }

  const isMine = getMyTeamId() === team.teamId;
  $('#h-team').textContent = team.teamName;

  const parts = [];

  // --- Header -----------------------------------------------------------
  parts.push(`
    <section class="hero" aria-labelledby="team-hero">
      <p class="hero__eyebrow">${esc(team.managerName ?? 'Unclaimed')}</p>
      <h2 id="team-hero">${esc(team.teamName)}</h2>
      <p class="hero__sub">
        ${team.rank ? `Rank ${esc(team.rank)} of ${esc(state.hub.league.size)}` : 'Season has not started'}
        ${team.stats?.gamesPlayed ? ` · ${esc(team.stats.wins)}-${esc(team.stats.losses)}` : ''}
        ${team.inPlayoffs ? ' · <span class="pill pill--good">In playoff position</span>' : ''}
      </p>
      <p style="margin:0.9rem 0 0">
        <button type="button" class="theme-toggle" id="claim-team"
          aria-pressed="${isMine}">
          ${isMine ? '★ This is my team' : '☆ Set as my team'}
        </button>
      </p>
    </section>`);

  // --- Lineup advice ----------------------------------------------------
  const advice = team.lineupAdvice;
  if (advice?.available) {
    if (advice.alreadyOptimal) {
      parts.push(`<div class="card" style="margin-bottom:1.5rem">
        <h3>Week ${esc(state.teamDetail.adviceWeek)} lineup</h3>
        <p><span class="pill pill--good">Optimal</span>
        Your lineup is already the best available on projections
        (${num(advice.projectedTotal, 1)} projected).</p>
      </div>`);
    } else {
      parts.push(`<div class="card" style="margin-bottom:1.5rem">
        <h3>Week ${esc(state.teamDetail.adviceWeek)} lineup — ${esc(signed(advice.projectedGain, 1))} available</h3>
        <p class="stat__note">
          Based on ESPN's projections, which are wrong often enough that this is a
          nudge rather than an instruction.
        </p>
        <div class="grid" style="margin-top:0.75rem">
          <div>
            <h4 style="margin:0 0 0.35rem">Start</h4>
            <ul style="margin:0;padding-left:1.1rem">
              ${advice.toStart
                .map((p) => `<li>${esc(p.name)} <small>(${esc(p.position)})</small> — <strong>${num(p.projected, 1)}</strong></li>`)
                .join('')}
            </ul>
          </div>
          <div>
            <h4 style="margin:0 0 0.35rem">Sit</h4>
            <ul style="margin:0;padding-left:1.1rem">
              ${advice.toSit
                .map((p) => `<li>${esc(p.name)} <small>(${esc(p.position)})</small> — ${num(p.projected, 1)}</li>`)
                .join('')}
            </ul>
          </div>
        </div>
        <p class="stat__note" style="margin:0.75rem 0 0">
          Current lineup projects ${num(advice.currentProjected, 1)};
          the recommended one projects ${num(advice.projectedTotal, 1)}.
        </p>
      </div>`);
    }
  }

  // --- Waivers ----------------------------------------------------------
  const waivers = team.waivers;
  if (waivers?.available && (waivers.targets.length || waivers.injuryGaps.length)) {
    parts.push(`<div class="card" style="margin-bottom:1.5rem">
      <h3>Waiver wire</h3>
      ${
        waivers.injuryGaps.length
          ? `<p><span class="pill pill--bad">Injured starters</span>
             ${waivers.injuryGaps.map((g) => `${esc(g.name)} (${esc(g.position)}, ${esc(g.injuryStatus)})`).join(', ')}</p>`
          : ''
      }
      ${
        waivers.targets.length
          ? `<div class="table-scroll" style="margin-top:0.6rem">
              <table>
                <caption>Available players projected above your weakest starter at that position</caption>
                <thead><tr>
                  <th scope="col">Player</th><th scope="col">Pos</th>
                  <th scope="col" class="num">Projected</th><th scope="col" class="num">Upgrade</th>
                  <th scope="col" class="num">Owned</th>
                </tr></thead>
                <tbody>
                  ${waivers.targets
                    .map(
                      (t) => `<tr>
                        <th scope="row" class="row-team">${esc(t.name)}<small>${esc(t.proTeam)}</small></th>
                        <td>${esc(t.position)}</td>
                        <td class="num">${num(t.projected, 1)}</td>
                        <td class="num">${deltaPill(t.gain, 1)}</td>
                        <td class="num">${t.percentOwned === null ? '—' : `${num(t.percentOwned, 0)}%`}</td>
                      </tr>`
                    )
                    .join('')}
                </tbody>
              </table>
            </div>`
          : '<p class="stat__note">Nothing on the wire clearly beats what you already start.</p>'
      }
    </div>`);
  }

  // --- Season stats -----------------------------------------------------
  const s = team.stats;
  if (s && s.gamesPlayed > 0) {
    parts.push(`
      <ul class="stats">
        <li class="stat"><span class="stat__label">Record</span>
          <span class="stat__value">${esc(s.wins)}-${esc(s.losses)}</span>
          <span class="stat__note">${num(s.allPlayWinPct, 0)}% all-play</span></li>
        <li class="stat"><span class="stat__label">Points for</span>
          <span class="stat__value">${num(s.pointsFor, 0)}</span>
          <span class="stat__note">${num(s.avgScore, 1)} per week</span></li>
        <li class="stat"><span class="stat__label">Efficiency</span>
          <span class="stat__value">${s.efficiency === null ? '—' : `${num(s.efficiency, 0)}%`}</span>
          <span class="stat__note">${num(s.benchPoints, 0)} left benched</span></li>
        <li class="stat"><span class="stat__label">Luck</span>
          <span class="stat__value">${esc(signed(s.luck, 1))}</span>
          <span class="stat__note">${num(s.expectedWins, 1)} expected wins</span></li>
      </ul>`);
  }

  // --- Coaching report --------------------------------------------------
  const coaching = team.coaching;
  if (coaching?.available && coaching.worstCalls.length) {
    parts.push(`<div class="card" style="margin-bottom:1.5rem">
      <h3>Where the points went</h3>
      <p class="stat__note">
        ${num(coaching.totalBenched, 0)} points left on your bench this season.
        ${coaching.gamesCostByBadLineups > 0
          ? coaching.gamesCostByBadLineups === 1
            ? '<strong>1</strong> loss would have been a win with the optimal lineup.'
            : `<strong>${esc(coaching.gamesCostByBadLineups)}</strong> losses would have been wins with the optimal lineup.`
          : 'None of it changed a result.'}
      </p>
      <div class="table-scroll" style="margin-top:0.6rem">
        <table>
          <caption>Biggest start/sit misses — these are actual results, not projections</caption>
          <thead><tr>
            <th scope="col" class="num">Wk</th><th scope="col">Should have started</th>
            <th scope="col">Started instead</th><th scope="col" class="num">Cost</th>
          </tr></thead>
          <tbody>
            ${coaching.worstCalls
              .map(
                (c) => `<tr>
                  <td class="num rank">${esc(c.week)}</td>
                  <td>${esc(c.benched.name)} <small>(${esc(c.benched.position)}, ${num(c.benched.points, 1)})</small></td>
                  <td>${esc(c.started.name)} <small>(${esc(c.started.position)}, ${num(c.started.points, 1)})</small></td>
                  <td class="num">${num(c.cost, 1)}${c.changedResult ? ' <span class="pill pill--bad">Cost the game</span>' : ''}</td>
                </tr>`
              )
              .join('')}
          </tbody>
        </table>
      </div>
    </div>`);
  }

  // --- Week log ---------------------------------------------------------
  if (team.weekLog.length) {
    const maxScore = Math.max(...team.weekLog.map((w) => w.score), 1);
    parts.push(`
      <div class="table-scroll" style="margin-bottom:1.5rem">
        <table>
          <caption>Week by week</caption>
          <thead><tr>
            <th scope="col" class="num">Wk</th><th scope="col">Result</th>
            <th scope="col" class="bar-cell">Score</th>
            <th scope="col" class="num">Opponent</th>
            <th scope="col" class="num">Best possible</th>
            <th scope="col" class="num">Efficiency</th>
          </tr></thead>
          <tbody>
            ${team.weekLog
              .map(
                (w) => `<tr>
                  <td class="num rank">${esc(w.week)}</td>
                  <td><span class="pill ${w.result === 'WIN' ? 'pill--good' : w.result === 'LOSS' ? 'pill--bad' : 'pill--neutral'}">${esc(w.result)}</span></td>
                  <td class="bar-cell">${bar(w.score, maxScore)}</td>
                  <td class="num">${num(w.opponentScore, 1)}</td>
                  <td class="num">${num(w.optimalScore, 1)}</td>
                  <td class="num">${w.efficiency === null ? '—' : `${num(w.efficiency, 0)}%`}</td>
                </tr>`
              )
              .join('')}
          </tbody>
        </table>
      </div>`);
  }

  // --- Roster -----------------------------------------------------------
  if (team.roster.length) {
    const starters = team.roster.filter((p) => p.started);
    const benched = team.roster.filter((p) => !p.started);
    const rosterRows = (list) =>
      list
        .map(
          (p) => `<tr>
            <td>${esc(p.slot)}</td>
            <th scope="row" class="row-team">${esc(p.name)}<small>${esc(p.proTeam)}</small></th>
            <td>${esc(p.position)}</td>
            <td class="num">${num(p.projected, 1)}</td>
            <td>${p.injuryStatus && p.injuryStatus !== 'ACTIVE' && p.injuryStatus !== 'NORMAL'
              ? `<span class="pill pill--warn">${esc(p.injuryStatus)}</span>` : ''}</td>
          </tr>`
        )
        .join('');

    parts.push(`
      <div class="table-scroll">
        <table>
          <caption>Roster — projections for week ${esc(state.teamDetail.adviceWeek)}</caption>
          <thead><tr>
            <th scope="col">Slot</th><th scope="col">Player</th><th scope="col">Pos</th>
            <th scope="col" class="num">Projected</th><th scope="col">Status</th>
          </tr></thead>
          <tbody>${rosterRows(starters)}${rosterRows(benched)}</tbody>
        </table>
      </div>`);
  }

  // --- Head to head -----------------------------------------------------
  if (team.headToHead.length) {
    parts.push(`
      <div class="table-scroll" style="margin-top:1.5rem">
        <table>
          <caption>Head to head</caption>
          <thead><tr>
            <th scope="col">Opponent</th><th scope="col" class="num">Record</th>
            <th scope="col" class="num">Points for</th><th scope="col" class="num">Points against</th>
          </tr></thead>
          <tbody>
            ${team.headToHead
              .map(
                (h) => `<tr>
                  <th scope="row" class="row-team">${esc(h.opponentName)}</th>
                  <td class="num">${esc(h.wins)}-${esc(h.losses)}${h.ties ? `-${esc(h.ties)}` : ''}</td>
                  <td class="num">${num(h.pointsFor, 1)}</td>
                  <td class="num">${num(h.pointsAgainst, 1)}</td>
                </tr>`
              )
              .join('')}
          </tbody>
        </table>
      </div>`);
  }

  // Nothing above had anything to say yet.
  if (parts.length <= 1) {
    parts.push(
      emptyState(
        '📅',
        'Nothing to report yet',
        'Once the draft happens and Week 1 is played, this page fills with your roster, lineup advice, waiver targets and a breakdown of every start/sit call.'
      )
    );
  }

  body.innerHTML = parts.join('');

  $('#claim-team')?.addEventListener('click', () => {
    const nowMine = getMyTeamId() === team.teamId;
    setMyTeamId(nowMine ? null : team.teamId);
    syncMyTeamNav();
    renderTeam(team.teamId);
  });
}

/** Shows the "My Team" nav shortcut once a team has been claimed. */
function syncMyTeamNav() {
  const item = document.querySelector('[data-nav="myteam"]');
  if (!item) return;
  const id = getMyTeamId();
  item.hidden = id === null;
  const link = item.querySelector('a');
  if (link && id !== null) link.href = `#team/${id}`;
}

function renderDraft() {
  const draft = state.draft;
  const league = state.hub.league;

  if (!draft || !draft.held) {
    const when = league.draftDate
      ? `${fmtDate(league.draftDate)} at ${fmtTime(league.draftDate)}`
      : 'a date not yet set in ESPN';
    $('#draft-body').innerHTML = `
      ${emptyState(
        '📋',
        'The board is set, the picks are not',
        `${draft?.totalSlots ?? 0} slots across ${draft?.rounds ?? 0} rounds, ${when}. ` +
          'The full board, per-manager grades, steals and reaches all appear here the moment picks are made.'
      )}
      <div class="card" style="margin-top:1.5rem">
        <h3>Draft settings</h3>
        <ul class="stats" style="margin:0.5rem 0 0">
          <li class="stat"><span class="stat__label">Format</span>
            <span class="stat__value">${esc(league.draftType ?? '—')}</span></li>
          <li class="stat"><span class="stat__label">Rounds</span>
            <span class="stat__value">${esc(draft?.rounds ?? '—')}</span></li>
          <li class="stat"><span class="stat__label">Per pick</span>
            <span class="stat__value">${esc(league.timePerPick ?? '—')}s</span></li>
          <li class="stat"><span class="stat__label">Total picks</span>
            <span class="stat__value">${esc(draft?.totalSlots ?? '—')}</span></li>
        </ul>
      </div>`;
    return;
  }

  const parts = [];

  if (draft.hasResults) {
    parts.push(`
      <div class="table-scroll" style="margin-bottom:1.5rem">
        <table>
          <caption>Draft grades — value gained or lost against where each pick was spent</caption>
          <thead>
            <tr>
              <th scope="col" class="num">#</th><th scope="col">Manager</th>
              <th scope="col">Grade</th><th scope="col" class="num">Value</th>
              <th scope="col" class="num">Points</th>
              <th scope="col">Best pick</th><th scope="col">Worst pick</th>
            </tr>
          </thead>
          <tbody>
            ${draft.teamGrades
              .map(
                (t) => `<tr>
                  <td class="num rank">${esc(t.rank)}</td>
                  <th scope="row" class="row-team">${esc(t.teamName)}<small>${esc(t.managerName ?? '')}</small></th>
                  <td><span class="pill pill--accent">${esc(t.grade)}</span></td>
                  <td class="num">${deltaPill(t.totalValue, 0)}</td>
                  <td class="num">${num(t.totalPoints, 0)}</td>
                  <td>${t.bestPick ? `${esc(t.bestPick.playerName)} <small>(R${esc(t.bestPick.round)})</small>` : '—'}</td>
                  <td>${t.worstPick ? `${esc(t.worstPick.playerName)} <small>(R${esc(t.worstPick.round)})</small>` : '—'}</td>
                </tr>`
              )
              .join('')}
          </tbody>
        </table>
      </div>`);

    const list = (title, picks) => `
      <div class="card">
        <h3>${esc(title)}</h3>
        <ol style="margin:0;padding-left:1.2rem">
          ${picks
            .slice(0, 5)
            .map(
              (p) => `<li>${esc(p.playerName)}
                <small>${esc(p.position)} · pick ${esc(p.overall)} · ${esc(p.teamName)}</small>
                ${deltaPill(p.valueDelta, 0)}</li>`
            )
            .join('')}
        </ol>
      </div>`;
    parts.push(`<div class="grid" style="margin-bottom:1.5rem">
      ${list('Biggest steals', draft.steals)}
      ${list('Biggest reaches', draft.reaches)}
    </div>`);
  }

  parts.push('<h3>Full draft board</h3>');
  for (const round of draft.board) {
    parts.push(`
      <div class="draft-round">
        <h3>Round ${esc(round.round)}</h3>
        <ol class="draft-picks">
          ${round.picks
            .map(
              (p) => `<li class="pick">
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
        '🤝',
        'No trades yet',
        'Every completed trade shows up here with both sides laid out, once the season is underway.'
      )
    );
  } else {
    parts.push(`<div class="grid">${trades
      .map(
        (t) => `<div class="card">
          <h3>${t.date ? esc(new Date(t.date).toLocaleDateString()) : 'Trade'}</h3>
          ${t.sides
            .map(
              (s) => `<p><strong>${esc(s.teamName)}</strong> received:<br>
                ${s.received.length
                  ? s.received.map((p) => `${esc(p.name)} <small>(${esc(p.position)})</small>`).join('<br>')
                  : '<em>nothing recorded</em>'}</p>`
            )
            .join('')}
        </div>`
      )
      .join('')}</div>`);
  }

  if (transactions.length) {
    parts.push(`
      <h3 style="margin-top:2rem">Waiver &amp; free agent moves</h3>
      <div class="table-scroll">
        <table>
          <caption>${transactions.length} transaction(s)</caption>
          <thead><tr>
            <th scope="col" class="num">Week</th><th scope="col">Team</th>
            <th scope="col">Type</th><th scope="col">Players</th><th scope="col" class="num">Bid</th>
          </tr></thead>
          <tbody>
            ${transactions
              .slice(0, 100)
              .map(
                (tx) => `<tr>
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

/** Shown before any results exist, so the league can agree rules early. */
const PRIZE_CATALOGUE = [
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

function renderPrizes() {
  const prizes = state.season?.prizes ?? [];
  const weeklyHigh = state.hub.weeklyHigh ?? [];

  if (!prizes.length) {
    $('#prizes-body').innerHTML = `
      ${emptyState(
        '🏆',
        `${PRIZE_CATALOGUE.length} prizes waiting to be won`,
        'These are computed automatically from the box scores once games are played. Worth agreeing which ones pay out before the draft.'
      )}
      <div class="grid" style="margin-top:1.5rem">
        ${PRIZE_CATALOGUE.map(
          ([label, desc]) => `<div class="prize prize--pending">
            <p class="prize__label">${esc(label)}</p>
            <p class="prize__desc">${esc(desc)}</p>
            <p class="prize__detail"><em>Awaiting results</em></p>
          </div>`
        ).join('')}
      </div>`;
    return;
  }

  const cards = prizes
    .map(
      (p) => `<div class="prize">
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
           <tbody>${weeklyHigh
             .map(
               (w) => `<tr><td class="num rank">${esc(w.week)}</td>
                 <th scope="row" class="row-team">${esc(w.teamName)}</th>
                 <td class="num">${num(w.score, 2)}</td></tr>`
             )
             .join('')}</tbody>
         </table>
       </div>`
    : '';

  $('#prizes-body').innerHTML = `<div class="grid">${cards}</div>${weekly}`;
}

function renderMoney() {
  const m = state.money;
  if (!m) return; // View is not registered at all without data.

  const parts = [];

  if (m.warnings.length) {
    parts.push(`<div class="error" role="alert" style="margin-bottom:1.5rem">
      <strong>Check the ledger config</strong>
      <ul style="margin:0.5rem 0 0;padding-left:1.2rem">
        ${m.warnings.map((w) => `<li>${esc(w)}</li>`).join('')}
      </ul>
    </div>`);
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
        <span class="stat__note">${esc(m.unpaid.length)} still to pay</span></li>
    </ul>
    <div class="progress"><div class="progress__fill" style="width:${Math.min(100, m.collectionPct)}%"></div></div>
    <p class="stat__note" style="margin-bottom:1.5rem">
      ${esc(money(m.collected, m.currency))} of ${esc(money(m.expectedPot, m.currency))} collected.
    </p>`);

  parts.push(`
    <div class="table-scroll" style="margin-bottom:1.5rem">
      <table>
        <caption>Payout structure — percentages of the full pot</caption>
        <thead><tr><th scope="col">Place</th><th scope="col" class="num">Share</th>
          <th scope="col" class="num">Amount</th><th scope="col">Currently</th></tr></thead>
        <tbody>
          ${m.payouts
            .map(
              (p) => `<tr>
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
          <thead><tr><th scope="col">Manager</th><th scope="col">Team</th>
            <th scope="col" class="num">Paid</th><th scope="col" class="num">Balance</th>
            <th scope="col">Status</th></tr></thead>
          <tbody>
            ${m.members
              .map(
                (mem) => `<tr>
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
  }

  $('#money-body').innerHTML = parts.join('');
}

const RENDERERS = {
  overview: renderOverview,
  standings: renderStandings,
  teams: renderTeams,
  team: renderTeam,
  draft: renderDraft,
  trades: renderTrades,
  prizes: renderPrizes,
  money: renderMoney,
};

// --- Routing ---------------------------------------------------------------

// Keyed by view AND parameter, so navigating team/1 -> team/2 re-renders
// instead of being treated as "already on the team view".
let currentRoute = null;

function show(view, { focus = false, param = null } = {}) {
  if (!VIEWS.includes(view)) view = 'overview';

  for (const v of ALL_VIEWS) {
    const el = $(`#view-${v}`);
    if (el) el.hidden = v !== view;
  }
  for (const link of document.querySelectorAll('.site-nav a')) {
    if (link.dataset.view === view) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }

  const routeKey = `${view}/${param ?? ''}`;
  if (routeKey !== currentRoute) {
    try {
      RENDERERS[view](param === null ? undefined : Number(param));
    } catch (error) {
      const body = $(`#view-${view}`)?.querySelector('div[id$="-body"]');
      if (body) {
        body.innerHTML = `<div class="error" role="alert"><strong>Could not render this view.</strong><p>${esc(error.message)}</p></div>`;
      }
      console.error(error);
    }
    currentRoute = routeKey;
  }

  const heading = $(`#view-${view} h2`);
  $('#route-status').textContent = `${heading.textContent} section loaded`;
  if (focus) $('#main').focus({ preventScroll: false });
}

function onHashChange(isInitial = false) {
  // Routes are either "#standings" or "#team/3".
  const raw = (location.hash || '#overview').slice(1);
  const slash = raw.indexOf('/');
  const view = slash === -1 ? raw : raw.slice(0, slash);
  const param = slash === -1 ? null : raw.slice(slash + 1);
  show(view, { focus: !isInitial, param });
}

// --- Theme -----------------------------------------------------------------

function isLightNow() {
  return (
    document.documentElement.dataset.theme === 'light' ||
    (!document.documentElement.dataset.theme &&
      window.matchMedia('(prefers-color-scheme: light)').matches)
  );
}

function initTheme() {
  const button = $('#theme-toggle');
  const stored = localStorage.getItem('ffh-theme');
  if (stored === 'light' || stored === 'dark') document.documentElement.dataset.theme = stored;

  const sync = () => {
    const light = isLightNow();
    button.textContent = light ? 'Dark theme' : 'Light theme';
    button.setAttribute('aria-pressed', String(light));
  };

  button.addEventListener('click', () => {
    const next = isLightNow() ? 'dark' : 'light';
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
    const [season, draft, teamDetail, ledger] = await Promise.all([
      loadJson(`data/season-${year}.json`).catch(() => null),
      loadJson(`data/draft-${year}.json`).catch(() => null),
      loadJson(`data/teams-${year}.json`).catch(() => null),
      // Absent on the published site by design — the ledger is never uploaded.
      loadJson('data/money.json').catch(() => null),
    ]);
    state.season = season;
    state.draft = draft;
    state.teamDetail = teamDetail;
    state.money = ledger;
    syncMyTeamNav();

    // Register the Money view only when its data is actually present, so the
    // public site has no Money tab at all rather than an empty one.
    if (ledger) {
      VIEWS = [...ALL_VIEWS];
      const navItem = document.querySelector('[data-nav="money"]');
      if (navItem) navItem.hidden = false;
    }

    $('#league-name').textContent = hub.league.displayName ?? hub.league.name;
    $('#league-sub').textContent =
      `${hub.league.season} · ${hub.league.size} teams · ${hub.league.isPPR ? 'PPR' : 'Standard'}`;
    document.title = `${hub.league.displayName ?? hub.league.name} — Fantasy Football Hub`;

    const timeEl = $('#generated-at');
    timeEl.textContent = new Date(hub.generatedAt).toLocaleString();
    timeEl.dateTime = hub.generatedAt;

    if (hub.synthetic) $('#fixture-warning').hidden = false;

    $('#boot').hidden = true;
    onHashChange(true);
    window.addEventListener('hashchange', () => onHashChange(false));
  } catch (error) {
    const boot = $('#boot');
    boot.className = 'error';
    boot.setAttribute('role', 'alert');
    boot.innerHTML = `
      <strong>Could not load league data.</strong>
      <p>${esc(error.message)}</p>
      <p>If you are opening this file directly, the browser blocks local
      <code>fetch</code>. Run <code>npm run serve</code> and open the address it prints.</p>
      <p>If the data files are missing, run <code>npm run fetch</code> then <code>npm run build</code>.</p>`;
    console.error(error);
  }
}

boot();
