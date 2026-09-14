/**
 * Hand-rolled SVG charts. No library, no build step — same rule as the rest
 * of `docs/assets/`.
 *
 * Two chart types:
 *   - `pointsLineChart()`   — season-long points-for, every team overlaid.
 *   - `pointDiffChart()`    — points-for minus points-against, one bar a team.
 *
 * A line chart answers "which team", not "how much" — that is a different
 * question from the magnitude bars used in tables (see the data-viz spec at
 * the top of style.css), and it is the one place on this site that needs a
 * categorical, one-colour-per-team palette. Twelve teams exceeds any
 * CVD-safe categorical set, so colour here is reinforcement, never the only
 * channel: every line ends in a text label, every line has a legend entry
 * with the full team name, and every data point carries a native <title>
 * tooltip with the exact number. Delete the colour and the chart still reads.
 */

// Tableau-12, split into a dark-background and light-background variant so
// contrast holds in both themes. Order matters: it is also the CSS class
// suffix (cat-0 .. cat-11), applied by index — not by team id — so the
// mapping is stable regardless of which teams are actually in the league.
const CATEGORY_COUNT = 12;

function esc(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const num = (n, digits = 1) =>
  n === null || n === undefined || Number.isNaN(n) ? '—' : Number(n).toFixed(digits);

/** "Nice" round numbers for axis ticks, so labels read 0/25/50 not 0/23.7/47.4. */
function niceStep(roughStep) {
  const mag = 10 ** Math.floor(Math.log10(roughStep));
  const norm = roughStep / mag;
  const step = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
  return step * mag;
}

/**
 * Season-long points-for, all teams overlaid.
 *
 * @param {Array} teamWeeks  rows of {week, teamId, score} — see analytics.mjs
 * @param {Array} teams      [{id, teamName, abbrev}] for labels
 * @param {number} totalWeeks regular-season week count, for the x axis
 */
export function pointsLineChart(teamWeeks, teams, totalWeeks) {
  const byTeam = new Map();
  for (const row of teamWeeks) {
    if (!byTeam.has(row.teamId)) byTeam.set(row.teamId, []);
    byTeam.get(row.teamId).push(row);
  }
  for (const rows of byTeam.values()) rows.sort((a, b) => a.week - b.week);

  const teamMeta = new Map(teams.map((t) => [t.id, t]));
  const seriesIds = [...byTeam.keys()].filter((id) => byTeam.get(id).length);
  if (!seriesIds.length) return '';

  const maxWeek = Math.max(totalWeeks ?? 1, ...seriesIds.map((id) => Math.max(...byTeam.get(id).map((r) => r.week))));
  const allScores = seriesIds.flatMap((id) => byTeam.get(id).map((r) => r.score));
  const yMax = Math.max(...allScores, 10);

  const W = 760, H = 380;
  const pad = { top: 16, right: 72, bottom: 30, left: 38 };
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;

  // The domain top must be >= the real max, never just the nearest round
  // number below it — round(yMax) down to a "nice" step would clip the
  // highest-scoring team's line (and label) right off the chart.
  const step = niceStep(Math.max(yMax, 10) / 5);
  const yTop = Math.ceil(yMax / step) * step || step;
  const yTicks = [];
  for (let v = 0; v <= yTop + step * 0.001; v += step) yTicks.push(Math.round(v * 100) / 100);
  const x = (week) => pad.left + (plotW * (week - 1)) / Math.max(maxWeek - 1, 1);
  const y = (score) => pad.top + plotH - (plotH * score) / yTop;

  // Gridlines + y-axis labels.
  const gridlines = yTicks
    .map(
      (t) => `
      <line class="chart-gridline" x1="${pad.left}" x2="${W - pad.right}" y1="${y(t).toFixed(1)}" y2="${y(t).toFixed(1)}"></line>
      <text class="chart-axis-label" x="${pad.left - 8}" y="${y(t).toFixed(1)}" text-anchor="end" dominant-baseline="middle">${num(t, 0)}</text>`
    )
    .join('');

  // X-axis week labels — thin every other week once it gets crowded.
  const weekStride = maxWeek > 10 ? 2 : 1;
  const xLabels = [];
  for (let w = 1; w <= maxWeek; w += weekStride) {
    xLabels.push(`<text class="chart-axis-label" x="${x(w).toFixed(1)}" y="${H - pad.bottom + 16}" text-anchor="middle">${w}</text>`);
  }

  // One <path> per team, plus a small circle (with a native tooltip) at each
  // played week so an exact number is always one hover or one tap away.
  const lines = seriesIds.map((id, i) => {
    const rows = byTeam.get(id);
    const meta = teamMeta.get(id) ?? {};
    const cat = i % CATEGORY_COUNT;
    const d = rows.map((r, idx) => `${idx === 0 ? 'M' : 'L'}${x(r.week).toFixed(1)},${y(r.score).toFixed(1)}`).join(' ');
    const points = rows
      .map(
        (r) => `<circle class="chart-point cat-${cat}" data-team="${id}" cx="${x(r.week).toFixed(1)}" cy="${y(r.score).toFixed(1)}" r="2.5">
          <title>${esc(meta.teamName ?? meta.name ?? '')} — Week ${r.week}: ${num(r.score, 1)} pts</title>
        </circle>`
      )
      .join('');
    return { id, cat, meta, rows, path: `<path class="chart-line cat-${cat}" data-team="${id}" fill="none" d="${d}"></path>${points}` };
  });

  // Direct end-of-line labels, decluttered so a tight final week doesn't pile
  // ten labels on top of each other. Greedy pass: sort by y, then push
  // overlapping neighbours apart by the label's own height.
  const LABEL_GAP = 15;
  const labelPositions = lines
    .map((s) => {
      const last = s.rows[s.rows.length - 1];
      return { ...s, ly: y(last.score), lx: x(last.week), abbrev: s.meta.abbrev ?? s.meta.teamName ?? '' };
    })
    .sort((a, b) => a.ly - b.ly);
  for (let i = 1; i < labelPositions.length; i++) {
    const prev = labelPositions[i - 1];
    const cur = labelPositions[i];
    if (cur.ly - prev.ly < LABEL_GAP) cur.ly = prev.ly + LABEL_GAP;
  }
  const endLabels = labelPositions
    .map(
      (s) => `
      <g class="chart-endlabel cat-${s.cat}" data-team="${s.id}">
        <text x="${(s.lx + 6).toFixed(1)}" y="${s.ly.toFixed(1)}" dominant-baseline="middle">${esc(s.abbrev)}</text>
      </g>`
    )
    .join('');

  const paths = lines.map((s) => s.path).join('');

  const legend = labelPositions
    .slice()
    .sort((a, b) => (teams.findIndex((t) => t.id === a.id)) - (teams.findIndex((t) => t.id === b.id)))
    .map(
      (s) => `
      <button type="button" class="chart-legend__item cat-${s.cat}" data-team="${s.id}" aria-pressed="false">
        <span class="chart-legend__swatch" aria-hidden="true"></span>
        ${esc(s.meta.teamName ?? s.meta.name ?? '')}
      </button>`
    )
    .join('');

  return `
    <div class="chart chart--lines" data-chart="points-line">
      <svg class="chart-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Points scored per week, every team, ${maxWeek} weeks">
        ${gridlines}
        <line class="chart-axis" x1="${pad.left}" x2="${pad.left}" y1="${pad.top}" y2="${H - pad.bottom}"></line>
        <line class="chart-axis" x1="${pad.left}" x2="${W - pad.right}" y1="${H - pad.bottom}" y2="${H - pad.bottom}"></line>
        ${xLabels.join('')}
        ${paths}
        ${endLabels}
      </svg>
      <div class="chart-legend" role="group" aria-label="Highlight one team's line">
        ${legend}
        <button type="button" class="chart-legend__reset" hidden>Show all</button>
      </div>
    </div>`;
}

/**
 * Points-for minus points-against, one diverging bar per team, in standings
 * order. Two-directional magnitude (better/worse than average), not team
 * identity — so this stays on the site's usual good/bad pair rather than the
 * line chart's categorical palette.
 *
 * Built in HTML/CSS, not SVG, on purpose — same reason the table's magnitude
 * bars (`bar()` above) are HTML: team names vary a lot in length ("BB" vs
 * "The Waiver Wire Warriors"), and flexbox/grid reflow around that safely.
 * Fixed-position SVG text does not — it either overlaps or runs off the
 * canvas, which is exactly what a hand-measured pixel layout did here
 * before this was rewritten.
 */
export function pointDiffChart(standings) {
  const rows = standings.filter((t) => t.gamesPlayed > 0);
  if (!rows.length) return '';

  const maxAbs = Math.max(...rows.map((t) => Math.abs(t.pointDiff ?? t.pointsFor - t.pointsAgainst)), 1);

  const items = rows
    .map((t) => {
      const diff = t.pointDiff ?? t.pointsFor - t.pointsAgainst;
      const good = diff >= 0;
      // Each side of the track only owns half its width — zero sits at the
      // midpoint, so the longest bar may fill at most 50%, not 100%.
      const pct = (Math.abs(diff) / maxAbs) * 50;
      const label = t.teamName ?? t.name ?? '';
      return `
      <div class="diffrow">
        <span class="diffrow__name" title="${esc(label)}">${esc(label)}</span>
        <span class="diffrow__track">
          <span class="diffrow__fill ${good ? 'is-good fill-right' : 'is-bad fill-left'}" style="width:${pct.toFixed(1)}%"></span>
        </span>
        <span class="diffrow__value ${good ? 'is-good' : 'is-bad'}">${diff >= 0 ? '+' : ''}${num(diff, 0)}</span>
      </div>`;
    })
    .join('');

  return `<div class="chart chart--diffbars" data-chart="point-diff">${items}</div>`;
}

// --- Interaction -------------------------------------------------------
//
// Delegated once on `document`, so it survives every re-render (app.js
// replaces #overview-body / #standings-body wholesale on each view switch,
// which would silently drop any listener bound directly to a chart node).
//
// Hover or keyboard focus previews a highlight; a click/tap locks it, for
// touch users who have no hover at all — same "not hover-only" rule the
// player cards follow.

function setHighlight(chartEl, teamId) {
  chartEl.querySelectorAll('.chart-line, .chart-point, .chart-endlabel').forEach((el) => {
    el.classList.toggle('is-dim', teamId !== null && el.dataset.team !== String(teamId));
  });
  chartEl.querySelectorAll('.chart-legend__item').forEach((el) => {
    el.classList.toggle('is-active', el.dataset.team === String(teamId));
  });
}

function lockedTeam(chartEl) {
  return chartEl.dataset.locked ?? null;
}

document.addEventListener('mouseover', (e) => {
  const item = e.target.closest('.chart-legend__item, .chart-line, .chart-point');
  const chartEl = item?.closest('.chart--lines');
  if (!chartEl || lockedTeam(chartEl)) return;
  setHighlight(chartEl, item.dataset.team);
});

document.addEventListener('mouseout', (e) => {
  const chartEl = e.target.closest('.chart--lines');
  if (!chartEl || lockedTeam(chartEl)) return;
  if (chartEl.contains(e.relatedTarget)) return;
  setHighlight(chartEl, null);
});

document.addEventListener('focusin', (e) => {
  const item = e.target.closest('.chart-legend__item');
  const chartEl = item?.closest('.chart--lines');
  if (!chartEl || lockedTeam(chartEl)) return;
  setHighlight(chartEl, item.dataset.team);
});

document.addEventListener('click', (e) => {
  const reset = e.target.closest('.chart-legend__reset');
  if (reset) {
    const chartEl = reset.closest('.chart--lines');
    delete chartEl.dataset.locked;
    reset.hidden = true;
    setHighlight(chartEl, null);
    return;
  }

  const item = e.target.closest('.chart-legend__item');
  if (!item) return;
  const chartEl = item.closest('.chart--lines');
  const already = lockedTeam(chartEl) === item.dataset.team;
  if (already) {
    delete chartEl.dataset.locked;
    item.setAttribute('aria-pressed', 'false');
  } else {
    chartEl.dataset.locked = item.dataset.team;
    chartEl.querySelectorAll('.chart-legend__item').forEach((el) => el.setAttribute('aria-pressed', String(el === item)));
  }
  const reset2 = chartEl.querySelector('.chart-legend__reset');
  if (reset2) reset2.hidden = !lockedTeam(chartEl);
  setHighlight(chartEl, lockedTeam(chartEl));
});
