# Roe Leauge — Fantasy Football Hub

League stats, draft analysis, trades, side prizes, and the money ledger for ESPN
league `274568741`, as a static site your whole league can open on a phone.

Nothing here talks to ESPN from the browser (their API sends no CORS headers, so
it can't). Instead a Node script pulls the data down, a build step computes every
statistic ahead of time, and the site just renders the results.

> **Coming back to this later?** Read **[HANDOFF.md](HANDOFF.md)** first — the
> architecture, the ESPN API traps that each cost real debugging time, the
> decisions that look wrong until explained, and an honest line between what is
> verified and what is merely assumed. None of it is inferable from the code.
>
> **[SOURCE-BUNDLE.md](SOURCE-BUNDLE.md)** is the entire codebase in one file,
> for reading end to end or handing to a fresh session. Refresh it with
> `npm run bundle`, and check its commit SHA before trusting it.

```
npm run check     # verify config + cookies + connectivity
npm run fetch     # pull the latest from ESPN  -> data/raw/
npm run build     # compute everything         -> docs/data/
npm run serve     # preview at http://localhost:4173
npm run update    # fetch + build in one go
npm run ship      # fetch + build + commit + push (the weekly one-liner)
npm test          # verify the analytics math
npm run bundle    # regenerate SOURCE-BUNDLE.md
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
| Player cards | After one `npm run update` — needs a fetch to build |
| Challenges | **Now** — Week 1's challenge is drawn; the rest stay sealed |
| Prizes (catalogue) | **Now** — see the 18 prizes so you can agree rules early |
| Teams | As managers claim their spots |
| Draft | Draft night, **Sept 5 2026** |
| Team pages: roster, lineup advice, waivers | Once rosters exist (draft night) |
| Standings, Power, Prizes (winners) | After Week 1 |
| Team pages: coaching report, week log, head-to-head | After Week 1 |
| Trades | First completed trade |

## Big Board

`#board` ranks the **top 250 players by value over replacement**, not by ESPN's
published order — because raw projections are not comparable across positions.
300 points is elite for a tight end and ordinary for a quarterback.

**Replacement level is derived, never hardcoded.** The build fills all twelve
starting lineups greedily from the projection-ranked pool and reads off the
worst starter at each position. In this league that puts QB replacement at
**QB24**, because all twelve OP slots go to quarterbacks. Change the league back
to a standard flex and it recomputes to QB12 on its own — there is a test
pinning both.

Each player carries:

| Column | Meaning |
| --- | --- |
| **#** | Rank by value over replacement |
| **Tier** | Positional tier, broken at the biggest cliffs — TE1–2 then a 33-point drop |
| **Proj** | ESPN's season projection |
| **VORP** | Points above the worst starter at that position |
| **Take at** | The pick where this player *should* go, with round |
| **ADP** | Average draft position across ESPN leagues |
| **Grade** | A+ to F, **compared only to others at the same position** |
| **Status** | Undrafted, or who took them and at which pick |

### Recommended draft position

"Take at" comes from a **deterministic simulation of a well-run draft**, not from
converting value rank into a pick number. That distinction matters: VORP rates
kickers highly, so a naive mapping would recommend one in round four. Simulating
a real draft applies the constraints that actually govern draft order — rosters
fill up, nobody carries three tight ends, and kickers go last — so the answer is
one a person could follow. Kickers and defences land in rounds 15–16, where they
belong.

Pick your **draft slot** and the board lists who should still be on the board at
each of your sixteen picks.

### Why grades are per position

Comparing ADP to overall value sounds right and is badly misleading here. ADP is
collected from mostly-standard leagues, so in superflex **every quarterback
graded A+ and every receiver graded F** — the grade had stopped saying "is this
player good value" and started saying "is this a quarterback", which the
position column already tells you.

Ranking cost and value separately inside each position cancels that out by
construction. An A now means *good value for a quarterback*. The league-wide
positional story is still told once, in the **Where the value is** card, which is
where a league-wide effect belongs rather than repeated down 250 rows.

It is a projection of a well-run draft, not a promise — one manager reaching
changes everything downstream.

Sortable on every numeric column, filterable by position, searchable by name.
Once the draft happens the Status column fills in automatically and you can hide
drafted players to see only what's left.

### Beer sheet

**🍺 Beer sheet (print / save PDF)**, next to the search box, opens the browser's
print dialog on a paper-ready cheat sheet: the overall top 250 plus one table per
position, each with a checkbox to cross a player off as they're drafted. A heavy
rule marks every tier break so the cliffs are visible at a glance, and injury
status prints right next to the name. It reads straight from the same board data
on screen, so re-fetching mid-draft and reprinting picks up whatever's changed —
including who's already been drafted, once the draft is underway. "Save as PDF"
in the print dialog downloads it instead of printing.

### Two honest caveats

**Kickers and defences grade too well.** VORP counts 26 points above replacement
the same wherever they come from, but K and D/ST are replaceable off waivers
most weeks, so that edge does not need a draft pick. Week-to-week volatility
isn't in ESPN's payload, so the model cannot see it — those positions are
flagged **Streamable** rather than silently corrected.

**Every grade inherits ESPN's projections.** If ESPN is wrong about a player,
the board is wrong about them too. It is a pricing model, not a crystal ball.

## Mock draft

`#mock` runs a full practice draft against 11 AI managers, in **this league's
exact format** — 12 teams, 16 rounds, snake, superflex. Pick a slot, draft, get
graded. Nothing is saved; refresh to start over.

The board uses ESPN's **SUPERFLEX** rankings rather than standard PPR, which is
the entire point:

| Player | Superflex | PPR | Moves |
| --- | --- | --- | --- |
| Josh Allen | 1 | 36 | +35 |
| Jayden Daniels | 3 | 56 | +53 |
| Drake Maye | 13 | 60 | +47 |

Anyone drafting off default rankings in this league will be catastrophically
wrong about quarterbacks. ESPN's public mock lobby drafts standard formats, so
it will not rehearse this.

The AI drafts off those ranks with positional need and a little randomness, so
no two runs are identical. While drafting you get a live **"still need…"**
readout of unfilled starting slots, which turns red when you have more holes
than picks remaining. Grades score the lineup you could actually **start**, not
the sum of all 16 players — hoarding a fourth quarterback adds nothing on a
Sunday, and a grade that rewarded it would teach the wrong lesson.

Rebuild the board any time with `npm run update`; rankings shift as the real
draft approaches.

## Weekly challenges

`#challenges` draws **one challenge at random for each week of the regular
season**, and each one pays cash. It replaces the idea of a fixed list of
season-end awards with something that gives every manager a reason to set a
lineup in Week 11 whether or not they can still make the playoffs.

Current league: **$195 across 13 weeks = $15 a week.**

The deck holds 23 challenges. Some are about scoring, some about the specific
decisions a manager actually makes:

| | |
| --- | --- |
| **Top Gun** | Most points scored this week |
| **Price Is Right** | Closest to 100 without going over — bust and you're out |
| **Sitting On A Gold Mine** | Most points left on the bench |
| **Robbed** | Highest score that still lost |
| **Stole One** | Lowest score that still won |
| **Gunslinger / Ground Game / Hands Team / …** | Best started player at one position |
| **No Weak Links** | Smallest gap between your best and worst starter |
| **Second Fiddle** | Highest-scoring *second*-best starter — your stud doesn't count |
| **Overachiever** | Beat your own projection by the most |

### Why the draw is seeded

The schedule is a **seeded shuffle** keyed on the league id and season, dealt
once, without replacement. That matters more than it sounds:

- **It cannot reshuffle.** The site rebuilds every day, including the rebuild
  that happens *after* Sunday's games. A `Math.random()` draw would silently
  re-pick Week 4's challenge with Week 4's results already known. That is not a
  bug, it is a rigged league — so there are tests pinning the draw's
  reproducibility.
- **Nothing repeats.** 13 weeks means 13 different challenges.
- **The seed is published** at the bottom of the page. Anyone can take that
  string, run the same shuffle, and confirm the deck was never restacked.

### What is revealed when

Each week's challenge is announced **before that week is played** — you cannot
play for a target you don't know. Everything after it stays sealed, so there is
something to find out each Sunday rather than a spoiler-filled list in
September. Sealed weeks still show what they are worth.

Ties split the pot rather than falling back to a tiebreak nobody agreed to. A
challenge nobody qualifies for (everyone busts Price Is Right) simply has no
winner.

### Changing it

Everything lives in `config/money.json` under `weeklyChallenge`:

```jsonc
"weeklyChallenge": {
  "enabled": true,
  "cadence": "weekly",   // or "biweekly" — one challenge every other week
  "startWeek": 1,
  "salt": "",            // change to reshuffle the whole season
  "payoutId": "challenges"
}
```

> **Only ever change `salt` before Week 1.** Mid-season it re-draws weeks that
> have already been played and settled.

To add a challenge of your own, append to `CHALLENGE_DECK` in
`scripts/lib/challenges.mjs`. A challenge is an id, a label, a rule in plain
English, a function that scores one team's week (highest wins, `null` means
"did not qualify"), and a function that explains the number. It can only read
what the box score proves.

## Player cards

Hover any player name — on the Big Board, a roster, the draft board or the mock
draft — and a card shows **last season's real production**, their **injury
status**, and any **news**.

| | |
| --- | --- |
| **Stat line** | Position-appropriate: a quarterback gets passing yards, TDs and picks; a running back gets carries and receptions; a kicker gets field goals by distance. A field with no data is left out rather than printed as a zero — "0 rushing TDs" and "we have no rushing data" look identical on screen and are not the same claim. |
| **Injury** | Only shown when it is not "Active", so the card stays quiet for healthy players. |
| **News** | Up to three headlines, newest first, **each stamped with its age**. |

### It is not hover-only

Hover alone would have shipped this to whoever happens to be at a desk. The same
card opens on **tap** (this site is meant to be read on a phone) and on
**keyboard focus**, and closes on Escape with focus returned to the name you
came from. Player names with a card are `<button>`s for exactly that reason;
players with nothing to show stay plain text, because a control that opens
nothing is worse than no control.

### About the news timestamps

The site rebuilds once a day. Last season's stat line is as true tomorrow as it
is today, but **an injury note is the most perishable thing in fantasy
football** — "limited in practice" is worth nothing by Sunday afternoon. So
every headline carries its own age ("3h ago", "yesterday") rather than being
presented as current. Stale news that admits it is stale is useful; stale news
wearing a confident face is worse than none, because somebody starts a player
who was ruled out that morning.

**Treat the card as background, not as a start/sit source.** For a live inactive
list, check ESPN.

### Where the data comes from

Stats and injury status were **already in ESPN's payload** — the build was
keeping only the fantasy-point total and discarding the per-stat breakdown
sitting next to it. That part costs no extra requests.

News is a separate endpoint, fetched one player at a time for the top 300 of the
draft pool plus everyone rostered. It is entirely optional: if it is
unreachable, rate-limited or moved, cards still show stats and injury.

Cards live in `docs/data/players-{year}.json`, keyed by player id and loaded
separately from the landing payload — the same player appears on four different
screens, and inlining the card in each would multiply every payload that carries
a player list. **The file only exists after a fetch**, so run `npm run update`
once to turn the feature on; until then names simply stay plain text.

## Team pages

Every manager gets their own page at `#team/{id}` — e.g.
`https://fantasyfootballhub.pages.dev/#team/3`. Tell people to open **Teams**,
click theirs, and hit **"Set as my team"**; the browser remembers it and a **My
Team** shortcut appears in the nav from then on.

Each page carries:

- **Start/sit advice for the coming week.** Runs the optimal-lineup solver over
  ESPN's own projections and reports who should be in and who should be out.
  Stays quiet unless the change is worth at least a point — projections are not
  precise enough for a 0.4-point "upgrade" to mean anything.
- **Waiver targets.** Free agents projected above your weakest starter at that
  position, plus a flag for any injured starter. Deliberately conservative: a
  player has to beat what you already start by 2+ points to show up.
- **A coaching report.** Every start/sit call you got wrong, ranked by cost,
  with the ones that actually flipped a loss marked. This part is not a
  projection — those points were scored or they weren't.
- Week-by-week log, full roster with projections, draft picks, head-to-head.

**There is no login.** A static site has nothing to authenticate against, so any
team page is readable by anyone with the link. For a fantasy league that is
arguably the point — none of it is more private than what ESPN already shows the
whole league. Real per-manager privacy would need a backend and accounts, which
is a much bigger thing than this project is.

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

After Monday night, run:

```bash
npm run ship
```

That fetches, builds, commits, and pushes — Cloudflare redeploys about a minute
later. The commit message names itself after where the season is ("Week 6",
"Draft results"). Override it with `npm run ship -- "your message"`.

Finished weeks are cached, so each run only pulls the new week.

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

```jsonc
{
  "buyIn": 75,
  "payouts": {
    "structure": [
      { "id": "first",      "label": "1st Place",         "amount": 350 },
      { "id": "second",     "label": "2nd Place",         "amount": 130 },
      { "id": "third",      "label": "3rd Place",         "amount": 75  },
      { "id": "challenges", "label": "Weekly Challenges", "remainder": true }
    ]
  }
}
```

A slot can be defined three ways:

| Field | Behaviour |
| --- | --- |
| `"amount": 275` | A fixed sum, unchanged if the pot moves |
| `"pct": 25` | A share of the pot, rebalances automatically |
| `"remainder": true` | Whatever is left after the others |

Current league: **10 × $75 = $750**, paying **$350 / $130 / $75** with **$195**
funding the weekly challenges — **$15 a week across 13 weeks**. Third place is
exactly the buy-in back, so finishing third costs you nothing.

The remainder slot is the useful part. If an eleventh manager joins, the three
places stay exactly as announced and the weekly challenge grows from $15 to $20
— rather than every prize shifting by a few dollars and nobody being sure what
was agreed. The site warns if the fixed amounts exceed the pot, or if nothing
absorbs the difference.

The challenge pot is divided in whole cents with the leftover handed to the
earliest weeks, so the thirteen weekly amounts add back up to $195 exactly. A
naive `pot / weeks` drifts, and a ledger that cannot account for six cents is a
ledger nobody trusts with the other $555.

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

Nothing, if automation is on (below). Otherwise:

```bash
npm run ship
```

Fetches, builds, commits, pushes. Cloudflare redeploys automatically.

## Automation — the hands-off option

`.github/workflows/update.yml` runs every 3 hours, around the clock. It fetches,
rebuilds, runs the tests, and commits **only when something actually
changed** — Cloudflare redeploys off that push. You never have to touch it
during the season.

**To switch it on**, add two repository secrets — Settings → Secrets and
variables → Actions → New repository secret:

| Name | Value |
| --- | --- |
| `ESPN_S2` | the same value as in `config/secrets.json` |
| `ESPN_SWID` | the same value, braces included |

You can also trigger it by hand from the Actions tab ("Run workflow"), with an
option to re-fetch every week instead of using the cache.

**When your cookies expire** the workflow fails and GitHub emails you. Update
both secrets and it resumes. Nothing silently goes stale — a failed run is loud,
and the site keeps serving the last good data until it's fixed.

> Note for PowerShell: don't chain commands with `&&` — Windows PowerShell 5.1
> treats it as a syntax error. Use `;` between commands, or just use
> `npm run ship`, which avoids the problem entirely.

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

### Photos

Player headshots, NFL team logos and each manager's fantasy team logo are
**hotlinked from ESPN's CDN** rather than downloaded and committed. That keeps
the repo small and means a traded player's picture is right the moment ESPN
updates it — at the cost of the site no longer being fully self-contained.

Two consequences worth knowing:

- **`docs/_headers` names those hosts in `img-src`.** Nothing else can load an
  image. If you ever move to another host, carry that header across or every
  picture on the site silently disappears.
- **Fantasy team logos are filtered before they are rendered.** A team logo is
  a URL ESPN hands back from the league payload, and ESPN's classic UI lets a
  manager paste in *any* URL — so an unfiltered one would let a manager point
  every visitor's browser at a server of their choosing and collect the IP of
  everyone who opens the site. `sanitizeTeamLogo()` in `scripts/lib/images.mjs`
  drops anything not on ESPN's CDN, and a test pins that list against the CSP so
  the two cannot drift apart.

Anything with no picture — a rookie ESPN has no headshot for, a manager who
never set a logo — falls back to a monogram of their initials. Same box, no
layout shift, no broken-image icon.

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
    challenges.mjs the weekly challenge deck and its seeded draw
    draft.mjs      draft value and grading
    images.mjs     headshot/logo URLs and the team-logo allowlist
    playercard.mjs hover-card stats, injury and news
    money.mjs      the ledger
docs/            the published site (this is what GitHub Pages serves)
tests/           141 tests covering the analytics, challenges, images and cards
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
