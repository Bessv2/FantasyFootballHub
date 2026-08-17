# Roe Leauge — Fantasy Football Hub

League stats, draft analysis, trades, side prizes, and the money ledger for ESPN
league `274568741`, as a static site your whole league can open on a phone.

Nothing here talks to ESPN from the browser (their API sends no CORS headers, so
it can't). Instead a Node script pulls the data down, a build step computes every
statistic ahead of time, and the site just renders the results.

```
npm run check     # verify config + cookies + connectivity
npm run fetch     # pull the latest from ESPN  -> data/raw/
npm run build     # compute everything         -> docs/data/
npm run serve     # preview at http://localhost:4173
npm run update    # fetch + build in one go (what you'll run weekly)
npm test          # verify the analytics math
```

---

## Current state

The league was created 2026-08-11 and **has not drafted yet**. As of the last
build: 1 of 12 teams claimed, 0 draft picks made, 0 games played.

That is expected, and the site says so rather than showing empty tables. Each
section fills in on its own schedule:

| Section | Unlocks |
| --- | --- |
| Money | **Now** — set the buy-in and start tracking payments |
| Prizes (catalogue) | **Now** — see the 18 prizes so you can agree rules early |
| Teams | As managers claim their spots |
| Draft | Draft night, **Sept 5 2026** |
| Standings, Power, Prizes (winners) | After Week 1 |
| Trades | First completed trade |

---

## Draft-day runbook (Sept 5)

Once the draft finishes:

```bash
npm run update
```

That's it. Draft board, per-manager grades, steals, and reaches all appear.

Grades stay provisional until games are played — pick value is measured by
ranking every drafted player on the points they actually scored and comparing
that to where they were taken, so it needs real results before it means
anything. Before Week 1 you'll see the board and each manager's positional
strategy, but no letter grades.

## During the season

Run `npm run update` after Monday night, then push:

```bash
git add -A && git commit -m "Week N" && git push
```

Finished weeks are cached, so each update only pulls the new week.

---

## Setup

### Credentials

`config/secrets.json` holds your two ESPN cookies. It is gitignored and will
never be published. If you need to recreate it, copy
`config/secrets.example.json` to `config/secrets.json` — the instructions are
inside the file.

**Keep the key names on the left and paste values on the right:**

```json
{ "espn_s2": "AEB...", "swid": "{ABCD-...}" }
```

These cookies expire every few months. When `npm run fetch` starts returning
401, re-copy them. `npm run check` will tell you which one is wrong.

> Never put real cookie values in `secrets.example.json` — that file **is**
> committed. `npm run check` fails loudly if it detects real values there.

### League config — `config/league.json`

```jsonc
{
  "leagueId": 274568741,
  "seasons": [2026],        // add years as the league ages
  "leagueName": "Roe Leauge",
  "site": { "showMoney": true }
}
```

### Money — `config/money.json`

**The buy-in is currently a `$50` placeholder.** Change it to your real number:

```jsonc
{
  "buyIn": 50,
  "payouts": {
    "structure": [
      { "id": "first",    "label": "1st Place",   "pct": 58 },
      { "id": "second",   "label": "2nd Place",   "pct": 25 },
      { "id": "third",    "label": "3rd Place",   "pct": 8  },  // ~buy-in back
      { "id": "sidePots", "label": "Side Prizes", "pct": 9  }
    ]
  }
}
```

Payouts are percentages, so changing the buy-in re-balances everything
automatically. They must total 100 — the site shows a warning if they don't.

At `$50 × 12 = $600`, that's **$348 / $150 / $48**, with `$54` for side pots.
This matches what you described (1st takes most, 2nd less, 3rd roughly their
buy-in back), but the exact split is yours to set.

Record payments as they come in:

```jsonc
"payments": [
  { "teamId": 1, "paid": true, "paidDate": "2026-08-20", "method": "Venmo" },
  { "teamId": 4, "amountPaid": 25, "note": "half now, half at draft" }
]
```

---

## Publishing

The repo is **private**; the site is published from it by **Cloudflare Pages**,
which serves private repos for free. GitHub Pages cannot do this — Pages from a
private repo requires a paid GitHub plan.

`docs/` is the entire site, already built. There is no build step to configure.

### One-time setup

1. **Push** — `git push -u origin main`
2. **Make the repo private** (optional) — Settings → General → Danger Zone →
   Change visibility. Cloudflare keeps deploying either way.
3. **Cloudflare** → **Workers & Pages** → **Create** → **Pages** → **Connect to
   Git** → pick `Bessv2/FantasyFootballHub`.
4. Configure the build. **The defaults are wrong for a pre-built site** — this
   is the only step where anything can go sideways:

   | Setting | Value |
   | --- | --- |
   | Framework preset | **None** |
   | Build command | **leave empty** |
   | Build output directory | **`docs`** |

5. **Save and Deploy.** You get `roe-leauge.pages.dev` (or similar) — share it
   with the league.

### Every week after that

```bash
npm run update
git add -A && git commit -m "Week N" && git push
```

Cloudflare redeploys automatically on push. Nothing else to do.

Because `docs/data/money.json` is gitignored, the ledger is never pushed and so
never deployed — it stays on your machine while everything else publishes.

### Escape hatch

If the Git integration ever misbehaves, you can publish straight from your
machine without involving the repo at all:

```bash
npx --yes wrangler login   # one time
npm run deploy             # uploads docs/ directly
```

`docs/_headers` sets security headers and stops Cloudflare caching stale week
data. It only takes effect on Cloudflare, and is harmless elsewhere.

### If you ever switch back to GitHub Pages

Everything still works: `docs/.nojekyll` is already in place. Settings → Pages →
Source: `main` / `/docs`. Note the repo has to be public unless you're on
GitHub Pro.

### What is and isn't published

This repo is **public**, so the boundary is deliberate:

| | Published | Why |
| --- | --- | --- |
| Rosters, scores, draft, prizes | Yes | Already public on ESPN |
| Manager display names | Yes | It's a league hub — that's the point |
| **Money ledger** | **No** | `site.showMoney: false`; `docs/data/money.json` is gitignored |
| ESPN SWIDs (account IDs) | No | Stripped at the publish boundary by `build.mjs` |
| `espn_s2` / `SWID` cookies | No | `config/secrets.json` is gitignored |
| Raw API cache | No | `data/raw/` is gitignored |

The ledger still generates locally — `npm run serve` shows you the full money
view on your machine. It just never leaves it. On the public site the Money tab
says the ledger is kept private.

To publish the money data later: delete the `docs/data/money.json` line from
`.gitignore` and set `site.showMoney: true`.

**`build.mjs` fails the build** if an ESPN account ID or `espn_s2` ever appears
in `docs/` — so a future change can't quietly reintroduce one.

---

## What's in the box

```
config/          league.json, money.json, secrets.json (gitignored)
scripts/
  check.mjs      pre-flight: config, cookies, connectivity, season discovery
  fetch.mjs      ESPN -> data/raw/  (caches finished weeks)
  build.mjs      data/raw -> docs/data/  (all analytics precomputed)
  fixtures.mjs   generates a synthetic season for testing
  myleagues.mjs  lists every ESPN league on your account
  serve.mjs      local static server
  lib/
    espn.mjs       API client: auth, retry, endpoint quirks
    constants.mjs  ESPN's numeric enums
    normalize.mjs  raw ESPN -> clean domain model, phase detection
    lineup.mjs     optimal-lineup solver
    analytics.mjs  standings, all-play, luck, efficiency, prizes
    draft.mjs      draft value and grading
    money.mjs      the ledger
docs/            the published site (this is what GitHub Pages serves)
tests/           33 tests covering the analytics
```

## The stats, briefly

- **All-play** — your record if you played *every* team every week. Removes
  schedule luck, which is the biggest distortion in a 12-team league.
- **Luck** — actual wins minus all-play expected wins. `-3.8` means you deserved
  almost four more wins than you got.
- **Lineup efficiency** — points scored as a share of the best lineup that
  roster could have started. The one stat that's purely about managing.
- **Draft value** — where a player was picked minus where they finished among
  drafted players by points. Positive is a steal.
- **Power rank** — 50% all-play, 30% scoring, 20% last three weeks.

---

## Verification, honestly

The league has no real data yet, so the analytics were verified two ways:

1. **33 unit tests** (`npm test`) with hand-computed expected values — optimal
   lineups, all-play records, luck, ledger arithmetic, position mapping, and
   phase detection.
2. **A full synthetic season** (`npm run fixtures`) — 12 teams, 192 picks, 14
   weeks, trades and waivers — run through the entire real pipeline.

What that does **not** cover: the exact shape of ESPN's payloads once real picks
and box scores exist. The empty-league shapes are confirmed against the live
API; the populated ones are modelled on it. Expect to shake out a field name or
two on draft night — run `npm run update` right after the draft rather than
discovering it in Week 1.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `401 Unauthorized` | Cookies expired. Re-copy both into `config/secrets.json`. |
| `404` for a season | That season doesn't exist. Run `npm run check`. |
| Site shows "Could not load league data" | Opening `index.html` directly — use `npm run serve`. |
| Site shows stale numbers | `npm run build`, then hard-refresh (Ctrl+Shift+R). |
| `Sample data` warning in the footer | You built with `--fixtures`. Run `npm run build`. |
| Draft shows "not happened yet" after drafting | ESPN lags a few minutes. Re-run `npm run update`. |
