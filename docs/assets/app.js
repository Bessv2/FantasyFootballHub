import { createMockDraft, advanceToUser, makePick, gradeDraft, rosterNeeds } from './mock.js';

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

const ALL_VIEWS = ['overview', 'standings', 'teams', 'team', 'draft', 'board', 'mock', 'trades', 'challenges', 'prizes', 'money'];
let VIEWS = ALL_VIEWS.filter((v) => v !== 'money' && v !== 'mock' && v !== 'board');

const state = { hub: null, season: null, draft: null, money: null, teamDetail: null, draftPool: null, bigBoard: null, playerCards: null };
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

// --- Pictures --------------------------------------------------------------
//
// Headshots and logos are hotlinked from ESPN rather than committed, so every
// one of them can fail: ESPN has no photo for a fringe rookie, a URL shape
// changes, a manager is offline. None of that may leave a broken-image icon
// on the page.
//
// The fallback is a monogram drawn underneath the <img>. If the image loads it
// covers the monogram; if it 404s the handler below hides the <img> and the
// monogram is simply what was already there. No layout shift either way.
//
// The handler is attached once, in the capture phase, because `error` does not
// bubble from <img> — and an inline onerror= attribute would need
// script-src 'unsafe-inline', which is exactly the CSP relaxation this app
// refuses to make.

const ESPN_HEADSHOT = 'https://a.espncdn.com/i/headshots/nfl/players/full';
const ESPN_TEAM_LOGO = 'https://a.espncdn.com/i/teamlogos/nfl/500';

function initImageFallbacks() {
  document.addEventListener(
    'error',
    (event) => {
      const el = event.target;
      if (el instanceof HTMLImageElement && el.classList.contains('avatar__img')) el.hidden = true;
    },
    true
  );
}

/** Up to two letters, so a monogram stays legible at 30px. */
function initials(name) {
  const words = String(name ?? '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

/**
 * The right picture for a roster row.
 *
 * D/ST is the case worth care: a defence has a real playerId, so the headshot
 * URL builds fine and then 404s every time. Defences get their NFL team's
 * shield instead.
 */
function playerImage(player) {
  if (!player) return null;
  if (player.position === 'D/ST') {
    const team = player.proTeam;
    return team && team !== 'FA' ? `${ESPN_TEAM_LOGO}/${String(team).toLowerCase()}.png` : null;
  }
  const id = Number(player.playerId);
  return id > 0 ? `${ESPN_HEADSHOT}/${id}.png` : null;
}

/**
 * An image with a monogram behind it.
 *
 * `variant` only changes the shape: round for faces, square for team logos,
 * which reads better for a badge that is usually not circular to begin with.
 */
function avatar(src, name, { variant = 'player', size = null } = {}) {
  const style = size ? ` style="--avatar-size:${Number(size)}px"` : '';
  return `<span class="avatar avatar--${esc(variant)}"${style}>
    <span class="avatar__initials" aria-hidden="true">${esc(initials(name))}</span>
    ${src ? `<img class="avatar__img" src="${esc(src)}" alt="" loading="lazy" decoding="async">` : ''}
  </span>`;
}

/**
 * A player's picture next to their name — the shape used in every table.
 *
 * When a card exists for this player the name becomes a <button>, which is what
 * makes the card reachable by keyboard and tappable on a phone rather than
 * hover-only. Players with no card stay plain text: a control that opens
 * nothing is worse than no control.
 */
const playerCell = (player, sub = null) => {
  const label = esc(player?.name ?? '—');
  const tail = sub === null ? '' : `<small>${esc(sub)}</small>`;
  const name = hasCard(player?.playerId)
    ? `<button type="button" class="pcard-trigger"
         data-player-id="${esc(player.playerId)}"
         data-player-name="${esc(player.name ?? '')}"
         data-player-pos="${esc(player.position ?? '')}"
         data-player-team="${esc(player.proTeam ?? '')}"
         aria-describedby="player-card" aria-expanded="false">${label}</button>`
    : label;
  return `
  <span class="named">
    ${avatar(playerImage(player), player?.name, { variant: 'player' })}
    <span class="named__text">${name}${tail}</span>
  </span>`;
};

/** A fantasy team's logo next to its name. */
const teamCell = (team, sub = null, href = null) => {
  const label = team?.teamName ?? team?.name ?? '—';
  const inner = `
    ${avatar(team?.logo ?? null, label, { variant: 'team' })}
    <span class="named__text">${
      href ? `<a href="${esc(href)}">${esc(label)}</a>` : esc(label)
    }${sub === null ? '' : `<small>${esc(sub)}</small>`}</span>`;
  return `<span class="named">${inner}</span>`;
};

// --- Player cards ----------------------------------------------------------
//
// Hover a player to see last season's production, their injury status and any
// news. Three interaction notes, none of them optional:
//
//   Hover is not enough. This site is meant to be opened on a phone — the
//   README says so — and a phone has no hover. So the same card opens on tap,
//   and closes on the next tap outside it.
//
//   Keyboard users get it too. The trigger is a <button>, so it is focusable
//   and the card opens on focus and closes on Escape. A div with a mouseover
//   handler would have shipped this feature to two-thirds of the ways people
//   read a web page.
//
//   One card element, moved and refilled. Rendering 250 popovers into the Big
//   Board and hiding them would put a quarter of a megabyte of hidden DOM on
//   the page for the one card anybody looks at.

const STAT_LINES = {
  QB: [['passingYards', 'Pass yds'], ['passingTouchdowns', 'Pass TD'], ['passingInterceptions', 'INT'],
       ['rushingYards', 'Rush yds'], ['rushingTouchdowns', 'Rush TD']],
  RB: [['rushingAttempts', 'Carries'], ['rushingYards', 'Rush yds'], ['rushingTouchdowns', 'Rush TD'],
       ['receptions', 'Rec'], ['receivingYards', 'Rec yds'], ['receivingTouchdowns', 'Rec TD']],
  WR: [['receivingTargets', 'Targets'], ['receptions', 'Rec'], ['receivingYards', 'Rec yds'],
       ['receivingTouchdowns', 'Rec TD'], ['rushingYards', 'Rush yds']],
  TE: [['receivingTargets', 'Targets'], ['receptions', 'Rec'], ['receivingYards', 'Rec yds'],
       ['receivingTouchdowns', 'Rec TD']],
  K: [['madeFieldGoalsFromUnder40', 'FG <40'], ['madeFieldGoalsFrom40To49', 'FG 40-49'],
      ['madeFieldGoalsFrom50Plus', 'FG 50+'], ['missedFieldGoals', 'Missed'], ['madeExtraPoints', 'XP']],
  'D/ST': [['defensiveSacks', 'Sacks'], ['defensiveInterceptions', 'INT'], ['defensiveFumbles', 'Fum rec'],
           ['defensivePointsAllowed', 'Pts allowed'], ['defensiveYardsAllowed', 'Yds allowed']],
};

let cardEl = null;
let cardOwner = null;

/** "3 days ago" — news that cannot say when it is from is news you cannot use. */
function timeAgo(iso) {
  if (!iso) return null;
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return null;
  const mins = Math.round((Date.now() - then.getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'yesterday' : `${days}d ago`;
}

function cardHtml(player, card) {
  const parts = [];

  parts.push(`<p class="pcard__name">${esc(player.name)}
    <span class="pcard__meta">${esc(player.position ?? '')}${
      player.proTeam ? ` · ${esc(player.proTeam)}` : ''
    }</span></p>`);

  if (card.injury && card.injury !== 'Active') {
    parts.push(`<p class="pcard__injury"><span class="pill pill--warn">${esc(card.injury)}</span></p>`);
  }

  const prior = card.lastSeason;
  const line = prior ? (STAT_LINES[player.position] ?? []).filter(([k]) => prior.stats[k] != null) : [];

  if (line.length) {
    parts.push(`<p class="pcard__heading">${esc(prior.season)} season${
      prior.fantasyPoints != null ? ` · ${esc(num(prior.fantasyPoints, 1))} fantasy pts` : ''
    }</p>`);
    parts.push(`<dl class="pcard__stats">${line
      .map(([key, label]) => `<div><dt>${esc(label)}</dt><dd>${esc(num(prior.stats[key], 0))}</dd></div>`)
      .join('')}</dl>`);
  } else {
    parts.push(`<p class="pcard__empty">No ${esc(state.playerCards?.priorSeason ?? 'prior')} stats — rookie, or did not play.</p>`);
  }

  if (card.news?.length) {
    parts.push('<p class="pcard__heading">Latest news</p>');
    parts.push(`<ul class="pcard__news">${card.news
      .map((item) => {
        const when = timeAgo(item.published);
        return `<li>${esc(item.headline)}${
          when ? `<small>${esc(when)}${item.source ? ` · ${esc(item.source)}` : ''}</small>` : ''
        }</li>`;
      })
      .join('')}</ul>`);
  }

  return parts.join('');
}

function positionCard(trigger) {
  const rect = trigger.getBoundingClientRect();
  const width = cardEl.offsetWidth;
  const height = cardEl.offsetHeight;
  const margin = 8;

  // Below the name by default, above it when there is no room — a card that
  // opens off the bottom of a phone screen is a card nobody reads.
  let top = rect.bottom + window.scrollY + 6;
  if (rect.bottom + height + margin > window.innerHeight && rect.top - height - margin > 0) {
    top = rect.top + window.scrollY - height - 6;
  }

  let left = rect.left + window.scrollX;
  const maxLeft = window.scrollX + document.documentElement.clientWidth - width - margin;
  left = Math.max(window.scrollX + margin, Math.min(left, maxLeft));

  cardEl.style.top = `${Math.round(top)}px`;
  cardEl.style.left = `${Math.round(left)}px`;
}

function showCard(trigger) {
  if (cardOwner === trigger && !cardEl.hidden) return;
  const id = Number(trigger.dataset.playerId);
  const card = state.playerCards?.cards?.[id];
  if (!card) return;

  const player = {
    name: trigger.dataset.playerName ?? '',
    position: trigger.dataset.playerPos ?? '',
    proTeam: trigger.dataset.playerTeam ?? '',
  };

  cardEl.innerHTML = cardHtml(player, card);
  cardEl.hidden = false;
  positionCard(trigger);
  trigger.setAttribute('aria-expanded', 'true');
  cardOwner = trigger;
}

function hideCard() {
  if (!cardEl || cardEl.hidden) return;
  cardEl.hidden = true;
  cardOwner?.setAttribute('aria-expanded', 'false');
  cardOwner = null;
}

/**
 * One set of listeners on the document, delegated, so cards keep working on
 * content rendered after boot — every view replaces its own innerHTML, and
 * per-element listeners would die with it.
 */
function initPlayerCards() {
  cardEl = document.createElement('div');
  cardEl.className = 'pcard';
  cardEl.id = 'player-card';
  cardEl.setAttribute('role', 'tooltip');
  cardEl.hidden = true;
  document.body.appendChild(cardEl);

  const triggerFor = (target) => target?.closest?.('[data-player-id]');
  const insideCard = (target) => Boolean(target?.closest?.('.pcard'));

  // Was the last thing the user did a pointer action? Focus follows a tap or a
  // click as well as a Tab key, and without knowing which, the focus handler
  // fights the click handler: the tap focuses the button (card opens), then the
  // click toggles it (card closes), and a phone user sees nothing at all.
  let pointerIntent = false;
  document.addEventListener('pointerdown', () => { pointerIntent = true; }, true);
  document.addEventListener('keydown', (e) => { if (e.key === 'Tab') pointerIntent = false; }, true);

  // Enter and leave are both decided here rather than with a matching
  // pointerout handler. pointerout fires while the pointer is still logically
  // over the trigger — crossing between the button and the card counts as
  // leaving — which closed the card the instant it opened. Since every element
  // fires pointerover, "the pointer is now over something that is neither a
  // trigger nor the card" is a complete and much less fragile leave condition.
  document.addEventListener('pointerover', (e) => {
    if (e.pointerType === 'touch') return;
    const trigger = triggerFor(e.target);
    if (trigger) showCard(trigger);
    else if (!insideCard(e.target)) hideCard();
  });

  document.addEventListener('click', (e) => {
    const trigger = triggerFor(e.target);
    if (!trigger) {
      if (!insideCard(e.target)) hideCard();
      return;
    }
    e.preventDefault();
    // On touch this is the only way in, so it toggles. The focus that arrived
    // with the same tap has already been ignored, so `cardOwner` here really
    // does mean "this card was open before you tapped".
    if (cardOwner === trigger) hideCard();
    else showCard(trigger);
  });

  document.addEventListener('focusin', (e) => {
    if (pointerIntent) return;
    const trigger = triggerFor(e.target);
    if (trigger) showCard(trigger);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const owner = cardOwner;
      hideCard();
      owner?.focus();
    }
  });

  // No scroll handler on purpose. The card is positioned in *document*
  // coordinates (the scroll offset is baked into top/left at open time), so it
  // scrolls with its trigger and stays glued to the right name for free.
  // Closing on scroll instead looks reasonable and is not: anything that
  // scrolls the page while opening — a browser bringing a focused element into
  // view, a tap near the bottom of a phone screen — dismisses the card the
  // instant it appears.
  //
  // Resize is different: it reflows the page, so the coordinates the card was
  // given no longer point at anything.
  window.addEventListener('resize', hideCard);
}

/** Whether this player has a card worth opening. */
const hasCard = (playerId) => Boolean(state.playerCards?.cards?.[Number(playerId)]);

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
        <th scope="row" class="row-team">${teamCell(t, t.managerName ?? '')}</th>
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
          <h3 class="named">
            ${avatar(t.logo ?? null, t.name, { variant: 'team', size: 40 })}
            <span class="named__text">${esc(t.name)}</span>
          </h3>
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
        <h3 class="named">
          ${avatar(t.logo ?? null, t.teamName, { variant: 'team', size: 40 })}
          <span class="named__text"><a href="#team/${esc(t.teamId)}">${esc(t.teamName)}</a></span>
        </h3>
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
    <section class="hero hero--team" aria-labelledby="team-hero">
      ${avatar(team.logo ?? null, team.teamName, { variant: 'team', size: 72 })}
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
            <th scope="row" class="row-team">${playerCell(p, p.proTeam)}</th>
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

// --- Big board -------------------------------------------------------------

const boardState = { position: 'ALL', sort: 'valueRank', dir: 'asc', search: '', hideDrafted: false };

/** Draft slot the visitor expects to pick from, remembered across visits. */
const DRAFT_SLOT_KEY = 'ffh-draft-slot';
const getDraftSlot = () => {
  const raw = localStorage.getItem(DRAFT_SLOT_KEY);
  return raw === null ? null : Number(raw);
};

/**
 * Who should still be on the board at each of your picks.
 *
 * A player is "gone" if his recommended pick lands before your turn. This is a
 * projection of a well-run draft, not a promise — one manager reaching changes
 * everything downstream — but it answers the question you actually have while
 * waiting: is it worth hoping he falls to me?
 */
function targetsForSlot(board, slot) {
  const picks = board.picksBySlot?.[slot] ?? [];
  const draftable = board.players.filter((p) => p.draftable);

  return picks.map((overall) => {
    // Anyone recommended before your turn has already been taken. Comparing
    // against the previous pick instead of this one was wrong: it listed the
    // first overall pick as "should be there" at pick 7.
    //
    // Ordered by recommended pick, not by value rank. Sorting by value surfaces
    // whoever has the best VORP among everyone still on the board — which put
    // three defences at the top of a round-five pick, because their recommended
    // slot is round fifteen and nothing had taken them yet. What you want at
    // pick N is the players actually due to come off the board around then.
    const available = draftable
      .filter((p) => p.recommendedPick >= overall)
      .sort((a, b) => a.recommendedPick - b.recommendedPick);
    return {
      overall,
      round: Math.ceil(overall / board.teamCount),
      best: available.slice(0, 3),
      // The player the simulation says goes exactly here.
      onTheClock: draftable.find((p) => p.recommendedPick === overall) ?? null,
    };
  });
}

const GRADE_ORDER = ['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D', 'F'];

/** Colour reinforces the grade; the letter always carries it. */
function gradePill(grade) {
  if (!grade) return '<span class="pill pill--neutral">—</span>';
  const i = GRADE_ORDER.indexOf(grade);
  const cls = i <= 2 ? 'pill--good' : i <= 5 ? 'pill--accent' : i <= 7 ? 'pill--neutral' : 'pill--bad';
  return `<span class="pill ${cls}">${esc(grade)}</span>`;
}

function sortBoard(players) {
  const { sort, dir } = boardState;
  const mult = dir === 'asc' ? 1 : -1;
  return [...players].sort((a, b) => {
    let av;
    let bv;
    if (sort === 'grade') {
      av = GRADE_ORDER.indexOf(a.grade);
      bv = GRADE_ORDER.indexOf(b.grade);
    } else if (sort === 'name') {
      return mult * a.name.localeCompare(b.name);
    } else {
      av = a[sort];
      bv = b[sort];
    }
    // Missing values sort last regardless of direction.
    if (av === null || av === undefined) return 1;
    if (bv === null || bv === undefined) return -1;
    return mult * (av - bv);
  });
}

function renderBoard() {
  const body = $('#board-body');
  const board = state.bigBoard;

  if (!board?.available) {
    body.innerHTML = emptyState(
      '📖',
      'Board not available',
      'Run npm run fetch to pull the ranked player pool from ESPN, then npm run build.'
    );
    return;
  }

  const parts = [];

  // --- The headline insight ---------------------------------------------
  const qb = board.positionValue.find((p) => p.position === 'QB');
  if (qb && qb.avgValueDelta > 15) {
    parts.push(`
      <section class="hero" style="margin-bottom:1.25rem">
        <p class="hero__eyebrow">The superflex edge</p>
        <h2>Quarterbacks are worth ${esc(qb.avgValueDelta)} draft places more than the market thinks</h2>
        <p class="hero__sub">
          Average draft position is collected across mostly-standard leagues, where only one
          QB starts. This league starts two, so all ${esc(board.startersNeeded.QB ?? 24)} startable
          quarterbacks have real value — and ADP hasn't caught up. That gap is the biggest
          single edge available to you on draft day.
        </p>
      </section>`);
  }

  // --- Positional value + scarcity --------------------------------------
  parts.push(`
    <div class="grid" style="margin-bottom:1.25rem">
      <div class="card">
        <h3>Where the value is</h3>
        <p class="stat__note">
          Average places of value by position. Positive means the market drafts them later
          than they're worth.
        </p>
        <div class="table-scroll" style="margin-top:0.6rem">
          <table>
            <caption>Positional value bias</caption>
            <thead><tr>
              <th scope="col">Pos</th><th scope="col" class="num">Value gap</th>
              <th scope="col" class="num">Starters</th><th scope="col"></th>
            </tr></thead>
            <tbody>
              ${board.positionValue
                .map(
                  (p) => `<tr>
                    <th scope="row">${esc(p.position)}</th>
                    <td class="num">${deltaPill(p.avgValueDelta, 0)}</td>
                    <td class="num">${esc(board.startersNeeded[p.position] ?? '—')}</td>
                    <td>${p.streamable ? '<span class="pill pill--warn">Streamable</span>' : ''}</td>
                  </tr>`
                )
                .join('')}
            </tbody>
          </table>
        </div>
        <p class="stat__note" style="margin-top:0.6rem">
          <strong>Streamable</strong> positions overstate their case here. VORP counts 26 points
          above replacement the same wherever it comes from, but kickers and defences are
          replaceable off waivers most weeks — so that edge doesn't need a draft pick. The model
          can't measure week-to-week volatility, so this is flagged rather than silently corrected.
        </p>
      </div>

      <div class="card">
        <h3>Positional scarcity</h3>
        <p class="stat__note">
          How far the best player at each position sits above the last one you'd start.
          A big gap means paying up is worth it.
        </p>
        <div class="table-scroll" style="margin-top:0.6rem">
          <table>
            <caption>Elite advantage over the last startable player</caption>
            <thead><tr>
              <th scope="col">Pos</th><th scope="col" class="bar-cell">Elite advantage</th>
              <th scope="col" class="num">Replacement</th>
            </tr></thead>
            <tbody>
              ${board.scarcity
                .map(
                  (s) => `<tr>
                    <th scope="row">${esc(s.position)}</th>
                    <td class="bar-cell">${bar(s.eliteAdvantage ?? 0, board.scarcity[0].eliteAdvantage || 1, { digits: 0, suffix: ' pts' })}</td>
                    <td class="num">${num(s.replacement, 0)}</td>
                  </tr>`
                )
                .join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>`);

  // --- Your draft slot ---------------------------------------------------
  const slot = getDraftSlot();
  if (slot && board.picksBySlot?.[slot]) {
    const targets = targetsForSlot(board, slot);
    parts.push(`
      <div class="card" style="margin-bottom:1.25rem">
        <h3>Drafting from slot ${esc(slot)}</h3>
        <p class="stat__note">
          Your picks, and who the board says should still be there. A projection of a
          well-run draft — one manager reaching changes everything after it.
          <button type="button" class="theme-toggle" id="board-clear-slot"
            style="margin-left:0.4rem">Change slot</button>
        </p>
        <div class="table-scroll" style="margin-top:0.6rem;max-height:22rem;overflow-y:auto">
          <table>
            <caption>Best available at each of your picks</caption>
            <thead><tr>
              <th scope="col" class="num">Rd</th><th scope="col" class="num">Pick</th>
              <th scope="col">Should be there</th>
            </tr></thead>
            <tbody>
              ${targets
                .map(
                  (t) => `<tr>
                    <td class="num rank">${esc(t.round)}</td>
                    <td class="num rank">${esc(t.overall)}</td>
                    <td>${
                      t.best.length
                        ? t.best
                            .map(
                              (p) => `${esc(p.name)} <small>(${esc(p.position)}${esc(p.positionRank)})</small>`
                            )
                            .join(' · ')
                        : '<span class="stat__note">board exhausted</span>'
                    }</td>
                  </tr>`
                )
                .join('')}
            </tbody>
          </table>
        </div>
      </div>`);
  } else {
    parts.push(`
      <div class="card" style="margin-bottom:1.25rem">
        <h3>Which slot are you drafting from?</h3>
        <p class="stat__note">
          Pick your slot and the board will show who should still be available at each of
          your ${esc(board.rounds ?? 16)} picks. Remembered on this device.
        </p>
        <div class="draft-picks" style="margin-top:0.75rem">
          ${Array.from({ length: board.teamCount }, (_, i) => i + 1)
            .map(
              (n) => `<button type="button" class="theme-toggle board-slot" data-slot="${n}"
                style="width:100%">Slot ${n}</button>`
            )
            .join('')}
        </div>
      </div>`);
  }

  // --- Controls ----------------------------------------------------------
  const positions = ['ALL', ...POSITIONS_ORDER];
  parts.push(`
    <div style="display:flex;flex-wrap:wrap;gap:0.5rem;align-items:flex-end;margin-bottom:0.85rem">
      <div>
        <label for="board-search" class="stat__label">Search</label>
        <input type="search" id="board-search" value="${esc(boardState.search)}"
          placeholder="Player name…"
          style="font:inherit;padding:0.45rem 0.7rem;border-radius:var(--radius-sm);
                 border:1px solid var(--border);background:var(--bg-sunken);color:var(--text);min-width:12rem">
      </div>
      <div role="group" aria-label="Filter by position" style="display:flex;flex-wrap:wrap;gap:0.25rem">
        ${positions
          .map(
            (pos) => `<button type="button" class="theme-toggle board-pos" data-pos="${esc(pos)}"
              aria-pressed="${boardState.position === pos}">${esc(pos)}</button>`
          )
          .join('')}
      </div>
      ${
        board.draftHeld
          ? `<button type="button" class="theme-toggle" id="board-hide-drafted"
              aria-pressed="${boardState.hideDrafted}">
              ${boardState.hideDrafted ? 'Showing available only' : 'Show available only'}
            </button>`
          : ''
      }
      <button type="button" class="theme-toggle" id="board-print" style="margin-left:auto">
        🍺 Beer sheet (print / save PDF)
      </button>
    </div>`);

  // --- The board ---------------------------------------------------------
  let rows = board.players;
  if (boardState.position !== 'ALL') rows = rows.filter((p) => p.position === boardState.position);
  if (boardState.search) {
    const q = boardState.search.toLowerCase();
    rows = rows.filter((p) => p.name.toLowerCase().includes(q) || p.proTeam.toLowerCase().includes(q));
  }
  if (boardState.hideDrafted) rows = rows.filter((p) => !p.drafted);
  rows = sortBoard(rows);

  const maxVorp = Math.max(...board.players.map((p) => p.vorp ?? 0), 1);

  const sortable = (key, label, hint) => {
    const active = boardState.sort === key;
    const arrow = active ? (boardState.dir === 'asc' ? ' ▲' : ' ▼') : '';
    return `<th scope="col" class="num" aria-sort="${active ? (boardState.dir === 'asc' ? 'ascending' : 'descending') : 'none'}">
      <button type="button" class="board-sort sort-btn" data-key="${esc(key)}"
        ${hint ? `title="${esc(hint)}"` : ''}>${esc(label)}${arrow}</button></th>`;
  };

  parts.push(`
    <div class="table-scroll">
      <table>
        <caption>
          ${esc(rows.length)} of ${esc(board.players.length)} players ·
          ranked by value over replacement, not by ESPN's published order
          ${board.draftHeld ? '· draft results attached' : ''}
        </caption>
        <thead>
          <tr>
            ${sortable('valueRank', '#', 'Rank by value over replacement')}
            <th scope="col">Player</th>
            <th scope="col">Pos</th>
            <th scope="col" class="num">Tier</th>
            ${sortable('recommendedPick', 'Take at', 'Where this player should go in a well-run draft')}
            ${sortable('adp', 'ADP', 'Average draft position across ESPN leagues')}
            ${sortable('projected', 'Proj', 'ESPN season projection')}
            ${sortable('vorp', 'VORP', 'Points above the worst starter at this position')}
            ${sortable('grade', 'Grade', 'Value compared to others at the same position')}
            <th scope="col">${board.draftHeld ? 'Drafted by' : 'Status'}</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .slice(0, 250)
            .map(
              (p) => `<tr>
                <td class="num rank">${esc(p.valueRank)}</td>
                <th scope="row" class="row-team">
                  ${playerCell(
                    p,
                    `${p.proTeam}${
                      p.injuryStatus && !['ACTIVE', 'NORMAL'].includes(p.injuryStatus)
                        ? ` · ${p.injuryStatus}`
                        : ''
                    }`
                  )}
                </th>
                <td>${esc(p.position)}${esc(p.positionRank)}</td>
                <td class="num">${esc(p.tier)}</td>
                <td class="num">${
                  p.recommendedPick === null
                    ? '<span class="pill pill--neutral">Undraftable</span>'
                    : `${esc(p.recommendedPick)}<small style="color:var(--text-dim)"> R${esc(p.recommendedRound)}</small>`
                }</td>
                <td class="num">${p.adp === null ? '—' : num(p.adp, 1)}</td>
                <td class="num">${num(p.projected, 0)}</td>
                <td class="bar-cell">${bar(p.vorp ?? 0, maxVorp, { digits: 0 })}</td>
                <td>${gradePill(p.grade)}${p.streamable ? ' <span class="pill pill--warn">Str</span>' : ''}</td>
                <td>${
                  p.drafted
                    ? `<small>${esc(p.pick.teamName)}<br>pick ${esc(p.pick.overall)} (R${esc(p.pick.round)})</small>`
                    : board.draftHeld
                      ? '<span class="pill pill--good">Available</span>'
                      : '<span class="pill pill--neutral">Undrafted</span>'
                }</td>
              </tr>`
            )
            .join('')}
        </tbody>
      </table>
    </div>`);

  if (!rows.length) {
    parts.push(emptyState('🔍', 'No players match', 'Try clearing the search or position filter.'));
  }

  body.innerHTML = parts.join('');

  // --- Wiring ------------------------------------------------------------
  for (const btn of body.querySelectorAll('.board-pos')) {
    btn.addEventListener('click', () => {
      boardState.position = btn.dataset.pos;
      renderBoard();
    });
  }
  for (const btn of body.querySelectorAll('.board-sort')) {
    btn.addEventListener('click', () => {
      const key = btn.dataset.key;
      if (boardState.sort === key) {
        boardState.dir = boardState.dir === 'asc' ? 'desc' : 'asc';
      } else {
        boardState.sort = key;
        // Rank-like columns read best ascending (pick 1 first); magnitudes and
        // deltas descending (biggest first).
        const ascending = ['valueRank', 'adp', 'grade', 'recommendedPick'];
        boardState.dir = ascending.includes(key) ? 'asc' : 'desc';
      }
      renderBoard();
    });
  }
  $('#board-hide-drafted')?.addEventListener('click', () => {
    boardState.hideDrafted = !boardState.hideDrafted;
    renderBoard();
  });
  $('#board-print')?.addEventListener('click', () => printBeerSheet(board));
  for (const btn of body.querySelectorAll('.board-slot')) {
    btn.addEventListener('click', () => {
      localStorage.setItem(DRAFT_SLOT_KEY, btn.dataset.slot);
      renderBoard();
    });
  }
  $('#board-clear-slot')?.addEventListener('click', () => {
    localStorage.removeItem(DRAFT_SLOT_KEY);
    renderBoard();
  });

  const search = $('#board-search');
  if (search) {
    search.addEventListener('input', () => {
      boardState.search = search.value;
      renderBoard();
      // Re-rendering blows away focus; put it back where the user was typing.
      const next = $('#board-search');
      next.focus();
      next.setSelectionRange(next.value.length, next.value.length);
    });
  }
}

// --- Beer sheet (printable draft cheat sheet) -------------------------------

const POSITION_TITLES = {
  QB: 'Quarterbacks (superflex-eligible)',
  RB: 'Running backs',
  WR: 'Wide receivers',
  TE: 'Tight ends',
  'D/ST': 'Defense / special teams',
  K: 'Kickers',
};

/** One row. `isNewTier` gets a heavy top rule — the cliff a beer sheet exists to mark. */
function beerSheetRow(p, isNewTier) {
  const note =
    p.injuryStatus && !['ACTIVE', 'NORMAL'].includes(p.injuryStatus) ? ` · ${p.injuryStatus}` : '';
  const takeAt = p.recommendedPick === null ? '—' : `${p.recommendedPick} (R${p.recommendedRound})`;
  const status = p.drafted
    ? `<span class="beer-sheet__drafted">${esc(p.pick.teamName)} · pk ${esc(p.pick.overall)}</span>`
    : '<span class="beer-sheet__box" aria-hidden="true"></span>';
  const classes = [isNewTier ? 'tier-start' : '', p.drafted ? 'is-drafted' : ''].filter(Boolean).join(' ');

  return `<tr${classes ? ` class="${classes}"` : ''}>
    <td class="num">${esc(p.valueRank)}</td>
    <td>${esc(p.name)}<span class="beer-sheet__team"> · ${esc(p.proTeam)}${esc(note)}</span></td>
    <td>${esc(p.position)}${esc(p.positionRank)}</td>
    <td class="num">${esc(p.tier)}</td>
    <td class="num">${p.adp === null ? '—' : num(p.adp, 1)}</td>
    <td class="num">${esc(takeAt)}</td>
    <td>${esc(p.grade ?? '—')}</td>
    <td>${status}</td>
  </tr>`;
}

/** A titled table. Tiers reset per position, so track the last-seen tier per group key. */
function beerSheetSection(title, players, { byPosition = false } = {}) {
  const lastTier = new Map();
  const rows = players
    .map((p) => {
      const key = byPosition ? p.position : '__overall__';
      const isNewTier = lastTier.get(key) !== p.tier;
      lastTier.set(key, p.tier);
      return beerSheetRow(p, isNewTier);
    })
    .join('');

  return `
    <section class="beer-sheet__page">
      <h2>${esc(title)}</h2>
      <table>
        <thead>
          <tr>
            <th class="num">#</th><th>Player</th><th>Pos</th><th class="num">Tier</th>
            <th class="num">ADP</th><th class="num">Take at</th><th>Grade</th><th>Drafted</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </section>`;
}

function buildBeerSheetHtml(board, hub) {
  const overall = [...board.players].sort((a, b) => a.valueRank - b.valueRank);
  const generated = hub?.generatedAt ? new Date(hub.generatedAt).toLocaleString() : new Date().toLocaleString();
  const leagueName = hub?.league?.displayName ?? hub?.league?.name ?? 'Fantasy Football';

  const sections = [beerSheetSection(`Overall — top ${overall.length}`, overall)];
  for (const pos of POSITIONS_ORDER) {
    const players = board.players
      .filter((p) => p.position === pos)
      .sort((a, b) => a.positionRank - b.positionRank);
    if (players.length) sections.push(beerSheetSection(POSITION_TITLES[pos] ?? pos, players, { byPosition: true }));
  }

  return `
    <header class="beer-sheet__head">
      <h1>${esc(leagueName)} — Superflex PPR beer sheet</h1>
      <p>
        ${esc(board.teamCount ?? '')} teams · PPR · Superflex (OP) · Generated ${esc(generated)}
        ${board.draftHeld ? ' · draft in progress — refresh and reprint for the latest picks' : ''}
      </p>
      <p class="beer-sheet__legend">
        Ranked by value over replacement, not raw projections — see the site for why. A heavy top
        rule marks a tier break: a bigger drop there means less reason to reach. "Take at" is where
        a well-run draft would take this player. Check a box as a player comes off the board;
        anyone already drafted (as of the last data refresh) shows who took them instead.
      </p>
    </header>
    ${sections.join('')}`;
}

function printBeerSheet(board) {
  if (!board?.available) return;
  const sheet = $('#beer-sheet');
  if (!sheet) return;
  sheet.innerHTML = buildBeerSheetHtml(board, state.hub);
  document.body.classList.add('beer-sheet-mode');
  window.print();
}

window.addEventListener('afterprint', () => {
  document.body.classList.remove('beer-sheet-mode');
});

// --- Mock draft ------------------------------------------------------------

let mock = null;
let mockFilter = 'ALL';

function renderMock() {
  const body = $('#mock-body');
  const pool = state.draftPool;

  if (!pool?.players?.length) {
    body.innerHTML = emptyState(
      '🎲',
      'Draft board not available',
      'Run npm run fetch to pull the ranked player pool from ESPN.'
    );
    return;
  }

  // --- Setup ------------------------------------------------------------
  if (!mock) {
    body.innerHTML = `
      <div class="card">
        <h3>Pick your draft slot</h3>
        <p class="stat__note">
          ${esc(pool.teams)} teams · ${esc(pool.rounds)} rounds · snake ·
          ${esc(pool.players.length)} players ranked for ${esc(pool.rankType)}
        </p>
        <div class="draft-picks" style="margin-top:0.9rem">
          ${Array.from({ length: pool.teams }, (_, i) => i + 1)
            .map(
              (slot) => `<button type="button" class="theme-toggle mock-slot" data-slot="${slot}"
                style="width:100%">Slot ${slot}</button>`
            )
            .join('')}
        </div>
        <p style="margin-top:0.9rem">
          <button type="button" class="theme-toggle" id="mock-random">Random slot</button>
        </p>
      </div>

      <div class="card" style="margin-top:1.25rem">
        <h3>Why superflex changes everything</h3>
        <p class="stat__note">
          Your league starts an OP slot, so a second quarterback can be started every week.
          ESPN ranks the board accordingly — these are the same players, ranked two ways:
        </p>
        <div class="table-scroll" style="margin-top:0.6rem">
          <table>
            <caption>Superflex rank vs standard PPR rank</caption>
            <thead><tr>
              <th scope="col">Player</th><th scope="col">Pos</th>
              <th scope="col" class="num">Superflex</th><th scope="col" class="num">PPR</th>
              <th scope="col" class="num">Moves</th>
            </tr></thead>
            <tbody>
              ${pool.players
                .filter((p) => p.pprRank !== null)
                .slice(0, 10)
                .map(
                  (p) => `<tr>
                    <th scope="row" class="row-team">${esc(p.name)}<small>${esc(p.proTeam)}</small></th>
                    <td>${esc(p.position)}</td>
                    <td class="num">${esc(p.rank)}</td>
                    <td class="num">${esc(p.pprRank)}</td>
                    <td class="num">${deltaPill(p.pprRank - p.rank, 0)}</td>
                  </tr>`
                )
                .join('')}
            </tbody>
          </table>
        </div>
      </div>`;

    for (const btn of body.querySelectorAll('.mock-slot')) {
      btn.addEventListener('click', () => startMock(Number(btn.dataset.slot)));
    }
    $('#mock-random')?.addEventListener('click', () =>
      startMock(1 + Math.floor(Math.random() * pool.teams))
    );
    return;
  }

  // --- Results ----------------------------------------------------------
  if (mock.isComplete) {
    const grades = gradeDraft(mock, pool.startingSlots);
    const you = grades.find((g) => g.isUser);

    body.innerHTML = `
      <section class="hero">
        <p class="hero__eyebrow">Draft complete</p>
        <h2>You finished ${esc(you.rank)} of ${esc(grades.length)} — grade ${esc(you.grade)}</h2>
        <p class="hero__sub">
          Your starting lineup projects <strong>${num(you.startingPoints, 1)}</strong> points,
          with ${num(you.benchPoints, 1)} on the bench.
          ${you.incompleteLineup ? '<span class="pill pill--bad">Cannot field a legal lineup</span>' : ''}
        </p>
        <p style="margin:0.9rem 0 0">
          <button type="button" class="theme-toggle" id="mock-restart">Draft again</button>
        </p>
      </section>

      <div class="table-scroll" style="margin-bottom:1.5rem">
        <table>
          <caption>Every roster, scored on the lineup it can actually start</caption>
          <thead><tr>
            <th scope="col" class="num">#</th><th scope="col">Manager</th>
            <th scope="col">Grade</th><th scope="col" class="bar-cell">Starting projection</th>
            <th scope="col" class="num">Bench</th><th scope="col">Roster</th>
          </tr></thead>
          <tbody>
            ${grades
              .map(
                (g) => `<tr>
                  <td class="num rank">${esc(g.rank)}</td>
                  <th scope="row" class="row-team">${esc(g.name)}${g.isUser ? ' <span class="pill pill--accent">You</span>' : ''}</th>
                  <td><span class="pill pill--neutral">${esc(g.grade)}</span></td>
                  <td class="bar-cell">${bar(g.startingPoints, grades[0].startingPoints, { digits: 0 })}</td>
                  <td class="num">${num(g.benchPoints, 0)}</td>
                  <td><small>${POSITIONS_ORDER.filter((p) => g.byPosition[p])
                    .map((p) => `${g.byPosition[p]}${p}`)
                    .join(' · ')}</small></td>
                </tr>`
              )
              .join('')}
          </tbody>
        </table>
      </div>

      <div class="table-scroll">
        <table>
          <caption>Your picks</caption>
          <thead><tr>
            <th scope="col" class="num">Rd</th><th scope="col" class="num">Pick</th>
            <th scope="col">Player</th><th scope="col">Pos</th>
            <th scope="col" class="num">Board rank</th><th scope="col" class="num">Value</th>
          </tr></thead>
          <tbody>
            ${mock.picks
              .filter((p) => p.isUser)
              .map(
                (p) => `<tr>
                  <td class="num rank">${esc(p.round)}</td>
                  <td class="num rank">${esc(p.overall)}</td>
                  <th scope="row" class="row-team">${esc(p.player.name)}<small>${esc(p.player.proTeam)}</small></th>
                  <td>${esc(p.player.position)}</td>
                  <td class="num">${esc(p.player.rank)}</td>
                  <td class="num">${deltaPill(p.overall - p.player.rank, 0)}</td>
                </tr>`
              )
              .join('')}
          </tbody>
        </table>
      </div>`;

    $('#mock-restart')?.addEventListener('click', () => {
      mock = null;
      renderMock();
    });
    return;
  }

  // --- Draft in progress -------------------------------------------------
  const you = mock.teams.find((t) => t.isUser);
  const onClock = mock.onTheClock;
  const recent = [...mock.picks].slice(-6).reverse();

  const filtered =
    mockFilter === 'ALL'
      ? mock.available
      : mock.available.filter((p) => p.position === mockFilter);

  body.innerHTML = `
    <section class="hero" style="margin-bottom:1.25rem">
      <p class="hero__eyebrow">Round ${esc(mock.current.round)} · Pick ${esc(mock.pickIndex + 1)} of ${esc(mock.order.length)}</p>
      <h2>${onClock.isUser ? 'You are on the clock' : `${esc(onClock.name)} is picking…`}</h2>
      <p class="hero__sub">You are drafting from slot ${esc(you.slot)} · ${esc(you.roster.length)} players so far</p>
    </section>

    <div class="grid" style="grid-template-columns:minmax(0,2fr) minmax(0,1fr)">
      <div>
        <div style="display:flex;flex-wrap:wrap;gap:0.3rem;margin-bottom:0.75rem">
          ${['ALL', ...POSITIONS_ORDER]
            .map(
              (pos) => `<button type="button" class="theme-toggle mock-filter"
                data-pos="${esc(pos)}" aria-pressed="${mockFilter === pos}">${esc(pos)}</button>`
            )
            .join('')}
        </div>
        <div class="table-scroll" style="max-height:26rem;overflow-y:auto">
          <table>
            <caption>Best available — ${esc(filtered.length)} players</caption>
            <thead><tr>
              <th scope="col" class="num">#</th><th scope="col">Player</th>
              <th scope="col">Pos</th><th scope="col" class="num">Proj</th>
              <th scope="col" class="num">ADP</th><th scope="col"></th>
            </tr></thead>
            <tbody>
              ${filtered
                .slice(0, 60)
                .map(
                  (p) => `<tr>
                    <td class="num rank">${esc(p.rank)}</td>
                    <th scope="row" class="row-team">${playerCell(p, p.proTeam)}</th>
                    <td>${esc(p.position)}</td>
                    <td class="num">${p.projected === null ? '—' : num(p.projected, 0)}</td>
                    <td class="num">${p.adp === null ? '—' : num(p.adp, 1)}</td>
                    <td>${
                      onClock.isUser
                        ? `<button type="button" class="theme-toggle mock-pick" data-id="${esc(p.playerId)}">Draft</button>`
                        : ''
                    }</td>
                  </tr>`
                )
                .join('')}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <div class="card" style="margin-bottom:1rem">
          <h3>Your roster</h3>
          ${(() => {
            const needs = rosterNeeds(you.roster, state.draftPool.startingSlots);
            const picksLeft = Math.ceil((mock.order.length - mock.pickIndex) / mock.teamCount);
            if (!needs.length) {
              return '<p><span class="pill pill--good">Legal lineup</span> Every starting slot is covered.</p>';
            }
            const urgent = needs.length >= picksLeft;
            return `<p><span class="pill ${urgent ? 'pill--bad' : 'pill--warn'}">
              Still need ${esc(needs.join(', '))}</span>
              ${urgent ? ` — only ${esc(picksLeft)} pick${picksLeft === 1 ? '' : 's'} left` : ''}</p>`;
          })()}
          ${
            you.roster.length
              ? `<ul style="margin:0;padding-left:1.1rem">
                  ${you.roster
                    .map((p) => `<li>${esc(p.position)} — ${esc(p.name)} <small>${esc(p.proTeam)}</small></li>`)
                    .join('')}
                </ul>`
              : '<p class="stat__note">Nothing yet.</p>'
          }
        </div>
        <div class="card">
          <h3>Recent picks</h3>
          ${
            recent.length
              ? `<ul style="margin:0;padding-left:1.1rem">
                  ${recent
                    .map(
                      (p) => `<li>${esc(p.overall)}. ${esc(p.teamName)} — ${esc(p.player.name)}
                        <small>(${esc(p.player.position)})</small></li>`
                    )
                    .join('')}
                </ul>`
              : '<p class="stat__note">Draft has not started.</p>'
          }
        </div>
      </div>
    </div>`;

  for (const btn of body.querySelectorAll('.mock-filter')) {
    btn.addEventListener('click', () => {
      mockFilter = btn.dataset.pos;
      renderMock();
    });
  }
  for (const btn of body.querySelectorAll('.mock-pick')) {
    btn.addEventListener('click', () => {
      const player = mock.available.find((p) => p.playerId === Number(btn.dataset.id));
      makePick(mock, player);
      advanceToUser(mock);
      $('#route-status').textContent = `Drafted ${player.name}. ${
        mock.isComplete ? 'Draft complete.' : `Round ${mock.current.round}, your pick.`
      }`;
      renderMock();
    });
  }
}

const POSITIONS_ORDER = ['QB', 'RB', 'WR', 'TE', 'D/ST', 'K'];

function startMock(slot) {
  mock = createMockDraft(state.draftPool, { userSlot: slot });
  advanceToUser(mock);
  renderMock();
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
                ${avatar(
                  playerImage({ playerId: p.playerId, position: p.position, proTeam: p.proTeam }),
                  p.playerName,
                  { variant: 'player', size: 44 }
                )}
                <span class="pick__player">${
                  hasCard(p.playerId)
                    ? `<button type="button" class="pcard-trigger"
                         data-player-id="${esc(p.playerId)}"
                         data-player-name="${esc(p.playerName)}"
                         data-player-pos="${esc(p.position)}"
                         data-player-team="${esc(p.proTeam)}"
                         aria-describedby="player-card" aria-expanded="false">${esc(p.playerName)}</button>`
                    : esc(p.playerName)
                }</span>
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
        <p class="prize__winner">${teamCell(p.winner)}</p>
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
                 <th scope="row" class="row-team">${teamCell(w)}</th>
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
        <caption>
          Payout structure. "Currently" shows who occupies each paying place right now.
        </caption>
        <thead><tr><th scope="col">Place</th><th scope="col" class="num">Share</th>
          <th scope="col" class="num">Amount</th><th scope="col">Currently</th></tr></thead>
        <tbody>
          ${m.payouts
            .map(
              (p) => `<tr>
                <th scope="row">${esc(p.label)}${
                  p.isRemainder ? ' <span class="pill pill--neutral">Remainder</span>' : ''
                }</th>
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
                  <td>${
                    mem.awaitingTeam
                      ? '<span class="pill pill--warn">No ESPN team yet</span>'
                      : esc(mem.teamName)
                  }</td>
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

// --- Weekly challenge ------------------------------------------------------

/**
 * The weekly challenge board.
 *
 * Three states share this view and each needs to read as deliberate:
 *
 *   settled   played, scored, somebody got paid
 *   live      announced, not yet played — this is the one people came to see
 *   sealed    dealt but face-down, because revealing Week 9 in Week 2 turns a
 *             season of small surprises into a spoiler
 *
 * The seed is printed at the bottom on purpose. It is the only thing that makes
 * "the draw was random" checkable rather than merely claimed: anyone can take
 * that string, run the same shuffle, and confirm the deck was never restacked
 * after the games were played.
 */
function renderChallenges() {
  const c = state.hub?.challenges;
  const body = $('#challenges-body');

  if (!c || !c.enabled || !c.weeks.length) {
    body.innerHTML = emptyState(
      '🎲',
      'No weekly challenge configured',
      'Set weeklyChallenge.enabled in config/money.json to turn this on.'
    );
    return;
  }

  const currency = c.currency ?? 'USD';
  const settled = c.weeks.filter((w) => w.winner);
  const live = c.weeks.find((w) => !w.sealed && !w.played);
  const parts = [];

  // --- What is on right now ---------------------------------------------
  parts.push(`
    <section class="hero">
      <p class="hero__eyebrow">${esc(c.cadence === 'biweekly' ? 'Every other week' : 'Every week')} · ${esc(money(c.pot, currency))} in play</p>
      <h2>${live ? `Week ${esc(live.week)}: ${esc(live.label)}` : 'Weekly challenge'}</h2>
      <p class="hero__sub">${
        live
          ? `${esc(live.rule)} <strong>${esc(money(live.amount, currency))}</strong> to the winner.`
          : settled.length === c.weeks.length
            ? 'Every challenge has been settled for the season.'
            : 'The first challenge is revealed once the season is underway.'
      }</p>
    </section>`);

  // --- Money won so far ---------------------------------------------------
  if (c.leaderboard.length) {
    parts.push(`
      <div class="table-scroll">
        <table>
          <caption>Challenge winnings so far</caption>
          <thead><tr>
            <th scope="col" class="num">#</th><th scope="col">Team</th>
            <th scope="col" class="num">Won</th><th scope="col" class="num">Cash</th>
          </tr></thead>
          <tbody>
            ${c.leaderboard
              .map(
                (t, i) => `<tr>
                  <td class="num rank">${esc(i + 1)}</td>
                  <th scope="row" class="row-team">${teamCell(t, t.managerName ?? '', `#team/${t.teamId}`)}</th>
                  <td class="num">${esc(t.challengesWon)}</td>
                  <td class="num">${esc(money(t.amountWon, currency))}</td>
                </tr>`
              )
              .join('')}
          </tbody>
        </table>
      </div>`);
  }

  // --- Every week ---------------------------------------------------------
  const cards = c.weeks
    .map((w) => {
      if (w.sealed) {
        return `<div class="challenge challenge--sealed">
          <p class="challenge__week">Week ${esc(w.week)} · ${esc(money(w.amount, currency))}</p>
          <p class="challenge__label"><span aria-hidden="true">🔒</span> Sealed</p>
          <p class="challenge__rule">Revealed the week it is played.</p>
        </div>`;
      }

      const status = w.winner ? 'won' : w.noWinner ? 'void' : 'live';
      const outcome = w.winner
        ? `<p class="challenge__winner">${teamCell(w.winner, null, `#team/${w.winner.teamId}`)}</p>
           <p class="challenge__detail">${esc(w.winner.detail ?? '')}</p>
           <p class="challenge__payout">${esc(money(w.winner.amount, currency))}${
             (w.tiedWith ?? []).length
               ? ` each — tied with ${esc(w.tiedWith.map((t) => t.teamName).join(', '))}`
               : ''
           }</p>`
        : w.noWinner
          ? '<p class="challenge__detail"><em>Nobody qualified. The pot rolls into the season awards.</em></p>'
          : '<p class="challenge__detail"><em>Not played yet.</em></p>';

      return `<div class="challenge challenge--${esc(status)}">
        <p class="challenge__week">Week ${esc(w.week)} · ${esc(money(w.amount, currency))}</p>
        <p class="challenge__label">${esc(w.label)}</p>
        <p class="challenge__rule">${esc(w.rule)}</p>
        ${outcome}
      </div>`;
    })
    .join('');

  parts.push(`<h3 style="margin-top:2rem">Every week</h3><div class="grid">${cards}</div>`);

  parts.push(`
    <p class="view__intro" style="margin-top:2rem">
      The schedule is a seeded shuffle, dealt once and fixed for the season — no
      challenge repeats, and none of them can change after the games are played.
      Verify it yourself against the seed
      <code>${esc(c.seed)}</code>.
    </p>`);

  body.innerHTML = parts.join('');
}

const RENDERERS = {
  overview: renderOverview,
  standings: renderStandings,
  teams: renderTeams,
  team: renderTeam,
  draft: renderDraft,
  board: renderBoard,
  mock: renderMock,
  trades: renderTrades,
  prizes: renderPrizes,
  challenges: renderChallenges,
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
  initImageFallbacks();
  initPlayerCards();

  try {
    const hub = await loadJson('data/hub.json');
    state.hub = hub;

    const year = hub.league.season ?? hub.seasons?.[hub.seasons.length - 1];
    const [season, draft, teamDetail, draftPool, bigBoard, ledger, playerCards] = await Promise.all([
      loadJson(`data/season-${year}.json`).catch(() => null),
      loadJson(`data/draft-${year}.json`).catch(() => null),
      loadJson(`data/teams-${year}.json`).catch(() => null),
      loadJson(`data/draftpool-${year}.json`).catch(() => null),
      loadJson(`data/bigboard-${year}.json`).catch(() => null),
      // Absent on the published site by design — the ledger is never uploaded.
      loadJson('data/money.json').catch(() => null),
      // Hover cards. Optional: an older build has no such file, and every
      // player name simply stays plain text.
      loadJson(`data/players-${year}.json`).catch(() => null),
    ]);
    state.season = season;
    state.draft = draft;
    state.teamDetail = teamDetail;
    state.draftPool = draftPool;
    state.bigBoard = bigBoard;
    state.money = ledger;
    state.playerCards = playerCards;
    syncMyTeamNav();

    if (bigBoard?.available) {
      VIEWS = [...VIEWS, 'board'];
      const navItem = document.querySelector('[data-nav="board"]');
      if (navItem) navItem.hidden = false;
    }

    // The mock draft needs a ranked board; without one there is nothing to
    // draft from, so the tab stays hidden rather than opening onto an error.
    if (draftPool?.players?.length) {
      VIEWS = [...VIEWS, 'mock'];
      const navItem = document.querySelector('[data-nav="mock"]');
      if (navItem) navItem.hidden = false;
    }

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
