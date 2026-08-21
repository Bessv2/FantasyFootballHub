# Handoff

Everything a future session needs that **isn't** in the code. Read this before
changing anything; several things here look wrong until you know why they are
the way they are.

- **Full source in one file:** [`SOURCE-BUNDLE.md`](SOURCE-BUNDLE.md)
  (regenerate with `npm run bundle` — check its commit SHA before trusting it)
- **How to run it:** [`README.md`](README.md)
- **Live site:** https://fantasyfootballhub.pages.dev
- **Repo:** https://github.com/Bessv2/FantasyFootballHub

---

## Where things stand

| | |
| --- | --- |
| League | **Roe Leauge**, ESPN id `274568741` |
| Format | 12 teams, PPR, **superflex** (ESPN OP slot), 16-round snake |
| Lineup | 1 QB, 2 RB, 2 WR, 1 TE, **1 OP**, 1 D/ST, 1 K + 7 bench, 2 IR — **9 starters** |
| Season | 13 regular-season weeks, 8 playoff teams |
| Draft | **Sat 5 Sept 2026, 4:00 PM ET** (room opens 3:00 PM) |
| Trade deadline | 2 Dec 2026 |
| Managers joined | **1 of 12** as of 20 Aug 2026 |
| Tests | 42, all passing |
| Automation | GitHub Actions, daily 11:00 UTC — **verified working**, it has pushed real commits |

The league had no rosters, no picks and no games at time of writing. Every
"available: false" and empty state you see is correct, not broken.

**The settings have already changed twice** during development (14→13 weeks,
6→8 playoff teams, FLEX→superflex). Do not hardcode any of them; they all come
from `mSettings` and could change again before the draft.

---

## Architecture

```
ESPN API  ──fetch.mjs──▶  data/raw/     (gitignored, regenerable cache)
                              │
                         build.mjs      normalize → analyse → emit
                              │
                          docs/data/    (committed — this IS the published site)
                              │
                          docs/*.js     dependency-free front end
```

Four rules that shape everything:

1. **The browser never calls ESPN.** No CORS headers, so it can't. All fetching
   happens in Node; the site only reads pre-computed JSON.
2. **All analysis happens at build time.** The front end is presentational. This
   keeps the site fast on a phone and the maths unit-testable.
3. **`docs/` is the published artefact.** Cloudflare Pages serves it directly.
   Writing derived JSON straight there means the site and its data cannot drift.
4. **Layers do not leak.** `scripts/lib/espn.mjs` + `constants.mjs` +
   `normalize.mjs` are the only files that know ESPN's shapes. Everything in
   `analytics.mjs` / `draft.mjs` / `advisor.mjs` / `lineup.mjs` is pure functions
   over the clean model, which is why they can be tested without a network.

---

## ESPN API gotchas

This API is undocumented. Everything below was discovered the hard way and cost
real debugging time. **This is the most valuable section in this file.**

### Field names that are not what you'd guess

| Expectation | Reality |
| --- | --- |
| `draftSettings.draftDate` | **`draftSettings.date`.** The `draftDate` key does not exist at all, so reading it silently yields `null` and the site shows "TBD" forever. Cost a real bug. |
| `draftSettings.availableDate` | When the draft *room opens*, usually 1h before the draft. |
| Trade deadline | `tradeSettings.deadlineDate`, not on `scheduleSettings`. |

### Two position scales that disagree

This is the single most dangerous trap in the whole API.

| Scale | Field | QB | RB | WR | TE | K |
| --- | --- | --- | --- | --- | --- | --- |
| Lineup slot | `lineupSlotId` | 0 | 2 | 4 | 6 | 17 |
| Player position | `defaultPositionId` | 1 | 2 | 3 | 4 | 5 |

Using the slot map on `defaultPositionId` mislabels WR as "RB/WR" and TE as
"WR", which then silently corrupts every draft grade and positional prize.
`constants.mjs` keeps them strictly separate with an `eligibleSlots` fallback.
**There are tests pinning this — do not "simplify" them away.**

Slot IDs worth knowing: `20` bench, `21` IR, `23` FLEX (RB/WR/TE), **`7` OP
(QB/RB/WR/TE — superflex)**. This league uses 7, not 23.

### A pre-built draft board is not a draft

ESPN creates all 192 pick slots the moment the league exists, with
`playerId: -1` and `drafted: false`. A non-empty `picks` array does **not** mean
the draft happened. Count picks where `playerId > 0`. There is a test for this.

### Endpoint quirks

- **Activity feed** lives at `.../leagues/{id}/communication/?view=kona_league_communication`.
  Requesting that view on the league root returns 200 with a completely
  different, useless payload. The `/communication/` path is load-bearing.
- **Trades are only in the activity feed.** `mTransactions2` rejects any
  `TRADE_*` value in its filter with a bare 400. Only `FREEAGENT`, `WAIVER`,
  `WAIVER_ERROR` are accepted.
- **Player pool filters must nest under `players`.** A flat
  `{limit, offset}` X-Fantasy-Filter gets a 400 with no explanation.
- **`players_wl` has no ranks, projections or ownership** — it is a bare name
  lookup (11,600 players). Rankings and projections come from
  `kona_player_info`.

### Stats are keyed four ways

Every entry in `player.stats[]` carries `seasonId`, `scoringPeriodId`,
`statSourceId` and `statSplitTypeId`. Mixing them up is the classic fantasy
data bug.

- `statSourceId`: **0 = actual, 1 = projected**
- `scoringPeriodId > 0` + `statSplitTypeId 1` = that week
- `scoringPeriodId 0` + `statSplitTypeId 0` = **season total**

So a season-long projection is `seasonId: 2026, statSourceId: 1,
statSplitTypeId: 0` — and last year's actual production is the same with
`seasonId: 2025, statSourceId: 0`.

### Superflex rankings exist and matter enormously

`draftRanksByRankType` has `STANDARD`, `PPR`, `ELIMINATION` **and `SUPERFLEX`**.
For this league SUPERFLEX is the only correct one:

| Player | SUPERFLEX | PPR | Moves |
| --- | --- | --- | --- |
| Josh Allen | 1 | 36 | +35 |
| Jayden Daniels | 3 | 56 | +53 |
| Drake Maye | 13 | 60 | +47 |

`fetch.mjs` picks the rank type by checking whether lineup slot 7 exists. If the
league ever leaves superflex that switches back to PPR automatically.

### Finding a user's leagues

`npm run myleagues` hits `fan.api.espn.com/apis/v2/fans/{SWID}` and lists every
league on the account. This is how we discovered the originally-supplied league
ID was an empty shell and the account had three others.

---

## Non-ESPN gotchas

- **Cloudflare Pages serves `index.html` for missing paths** — a 200 with
  `Content-Type: text/html`, not a 404. So `res.ok` is not proof a JSON file
  exists; only parsing is. `loadJson()` relies on `res.json()` throwing. This is
  deliberate and load-bearing for the money-ledger privacy behaviour.
- **Windows PowerShell 5.1 has no `&&`.** It is a parse error, and PowerShell
  parses the whole line before running any of it — so `a && b` runs *neither*.
  Use `;`, or `npm run ship`. Documented in the README because it bit us.
- **`git rebase` has no `--allow-unrelated-histories`** (that's a merge flag).
  To reparent onto an unrelated history: `git reset --soft <target>` then commit.
- **The daily automation pushes commits.** Expect to need `git pull --rebase`
  before pushing. Conflicts will be in `docs/data/*.json`, which are build
  artefacts — resolve by running `node scripts/build.mjs`, never by hand-merging
  minified JSON.

---

## Decisions that look odd but aren't

**The money ledger is generated but never published.** `docs/data/money.json` is
gitignored. It renders locally via `npm run serve`; on the public site the Money
tab is absent entirely rather than showing a "kept private" placeholder — the
owner asked for that explicitly. To publish it: delete that line from
`.gitignore` and set `site.showMoney: true`.

**SWIDs are stripped at the publish boundary.** `build.mjs` drops
`teams[].ownerIds` (each manager's permanent ESPN account ID) before writing
`docs/`, and **fails the build** if a SWID or `espn_s2` string appears in the
output. That guard exists because the strip is easy to forget when adding a new
output file.

**Lineup advice is two lists, not paired swaps.** It is tempting to zip
"start X" against "sit Y" so each row reads as one decision. That quietly lies
whenever they occupy different slots — pairing a bench QB against a starting TE
produces "start the QB instead of the TE", which is not a legal move. There is a
test (`never pairs players across incompatible slots`) preventing a regression.

**Waiver thresholds come from the solved optimal lineup, not a per-position slot
count.** Counting slots per position double-counts every flex: with 2 RB + 2 WR
+ 1 FLEX, each of RB, WR and TE separately believes it needs three starters, so
any roster with a filled flex reads as "short everywhere", the bar collapses to
zero, and every warm body clears it.

**Mock draft grades score the startable lineup, not all 16 players.** A fourth
quarterback scores nothing on a Sunday; a grade that rewarded roster hoarding
would teach the wrong lesson.

**Big board replacement level is derived, not hardcoded** — see
`computeReplacementLevels()`. It greedily fills all twelve starting lineups and
reads off the worst starter per position. Hardcoding "QB12" would misprice every
quarterback in this league, where the OP slot pushes QB replacement to **QB24**.
Two tests pin this: superflex → 24, standard flex → 12.

**Big board tiers are per position, not global.** Two failed attempts got here.
Tiering the whole board by absolute VORP gap puts every break in the top ten —
elite gaps are enormous, mid-board gaps are fractions of a point — leaving 240
of 250 players in one bucket. And a global tier answers a question `valueRank`
already answers. Per-position tiers answer the one drafters actually have: how
far does it fall if I miss this group?

**Big board grades are banded in standard deviations, not fixed thresholds.**
Fixed ±40 place bands were calibrated on a short board; across 250 players,
where deltas routinely exceed 100, they put 54% of the league at A+ or F. A
delta of zero still lands at B-, so the absolute anchor survives.

**K and D/ST are flagged `streamable` rather than corrected.** VORP genuinely
rates them well — a kicker 26 points above replacement beats the 150th wide
receiver. But they are replaceable off waivers most weeks, so that edge does not
need a draft pick. Week-to-week volatility is not in ESPN's payload, so the
model cannot measure it. Inventing a positional fudge factor would have been
dishonest; the flag says what is known and what is not.

**The countdown is `aria-hidden` with a static sentence behind it.** A value
announced every second is unusable with a screen reader.

**Draft value is measured inside the draft itself** — rank every drafted player
by points actually scored, compare to where they were taken. No external ADP
feed needed, self-normalising, and it answers the question people actually argue
about. It needs real results, so it stays quiet until games are played.

---

## Verified vs assumed

Be honest about this line; it is where the risk lives.

**Verified against the live API:** auth, all endpoint shapes for an *empty*
league, the player pool, free agents with projections, the superflex-ranked
draft board, league settings, phase detection.

**Verified only against synthetic fixtures** (`npm run fixtures`): every
analytics engine, the advisor, draft grading, prizes, the money ledger.
`fixtures.mjs` generates a deterministic full 12-team season — draft, 14 weeks
of box scores, deliberately imperfect lineups, trades, waivers — and runs it
through the real pipeline.

**Not verified at all:** the exact shape of ESPN's payloads once real picks and
box scores exist for *this* league. Populated shapes are modelled on the
documented API and on `espn-api`'s behaviour, not observed here.

> **The single most important thing for draft day:** run `npm run ship`
> immediately after the draft finishes, not the following week. If a field name
> differs from what's modelled, that gives days of slack instead of discovering
> it mid-Week-1.

---

## Draft day runbook — 5 Sept 2026

**Before:**
- Confirm all 12 managers have joined (`npm run check`, or the Overview page)
- Set the real buy-in in `config/money.json` — it is still a `$50` placeholder
- Agree which of the 18 side prizes actually pay out
- Run a few reps of `#mock` — the board auto-refreshes daily, so it tracks the
  real market as the date approaches

**Immediately after the draft:**
```bash
npm run ship
```
Then check the Draft tab. Expect: 192 picks, per-manager positional breakdowns,
and the full board. **Grades stay absent until games are played** — that is
correct, not a bug; value is measured against actual production.

If something looks wrong, `data/raw/2026/draft.json` holds the raw payload —
diff it against what `normalizeDraft()` expects.

**After Week 1:** standings, power rankings, luck, efficiency, prize winners,
and the coaching report all light up on their own.

---

## Known gaps / next steps

- **Manager real names are public** on the site (pulled from ESPN member
  profiles). Never resolved with the owner. If it matters, render team names and
  ESPN display names only — the change is confined to `normalizeTeams()`.
- **Buy-in is still a `$50` placeholder.** Payouts are percentage-based so they
  re-balance automatically once the real number is set.
- **No playoff odds simulation.** The scaffolding is there (`computeAllPlay`,
  schedule data) but a Monte Carlo over the remaining schedule was never built.
- **Trade analysis is descriptive only.** It lists what moved; it does not
  attribute post-trade points to each side. `buildPlayerSeasonPoints()` plus
  trade dates would make that straightforward.
- **The advisor uses ESPN projections uncritically.** No opponent adjustment, no
  matchup weighting, no injury-probability discount.
- **Historical seasons are unsupported in practice.** The code handles the
  pre-2018 `leagueHistory` endpoint, but this league has no history so that path
  has never executed.
