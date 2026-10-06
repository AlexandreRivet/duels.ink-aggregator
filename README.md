# duels-meta-tracker

Weekly tracking of the Lorcana meta from the public statistics of
[duels.ink](https://duels.ink/stats) (`/api/stats/meta` endpoint):

- **collection** every morning into `data/`: finished weeks, to keep the history, and the week
  in progress;
- **web page** (d3.js), refreshed every morning: meta of the week, trends, matchup matrix. It is
  the first tool of a small site: the homepage lists the tools, each one in its own folder
  (`meta/` here);
- **Discord digest** posted on Monday morning for the week that just ended, with the same charts
  as images, one message for BO1 and one for BO3, to prepare the team's training session that
  evening.

The code and docs are in English; the charts, the page and the Discord message are in French,
for the team. Decks are shown by their two ink chips (coloured-circle emoji in the Discord
text); names remain in tooltips and for screen readers.

> Data: © Duels.ink — `updatedAt` and the number of games are shown under every chart, with a
> link to https://duels.ink/stats, as the API docs ask.

## How it works

```
Daily data aggregation — every day at 06:07 UTC (8:07 / 7:07 in Paris)
  npm run collect    → data/<queue>/weeks/<start>.json   (committed automatically)
  Website deploy     → npm run build → dist/ (homepage, meta/, data) → GitHub Pages

Weekly Discord report — right after the daily aggregation, on Mondays
  npm run digest     → out/digest/{bo1,bo3}/*.png + digest.json   (last finished week)
  post-discord.js    → one compact card per format (BO1, then BO3), charts in a 2×2 grid
```

Every push to `main` (a merged pull request included) also rebuilds and redeploys the page
([website-deploy.yml](.github/workflows/website-deploy.yml)), the same workflow the daily
aggregation calls after committing its data; deployments run one at a time.

The charts are written once (`src/charts/`): the page renders them in the browser, the digest
renders them in Node (jsdom + resvg, bundled Inter font), with no headless browser.

Discord gets the charts that compare the week with the previous one (S−1):

| Chart                        | What it shows                                                                                                                        | Discord |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------- |
| Méta de la semaine           | Play rate and win rate (95% interval), with last week's values and the changes (Δ)                                                   | ✓       |
| Carte du méta                | Each deck's ink chips at play rate × win rate, with an arrow from where it stood last week                                           | ✓       |
| Mouvements de la semaine     | Change in play rate and in win rate per deck, coloured only when it beats the noise                                                  | ✓       |
| Matchups — 4 semaines        | Win rate of the row deck against the column deck; ▲▼ when this week clearly differs                                                  |         |
| Évolution                    | Each deck's play rate (left scale) and win rate (right scale) week by week, on one plot: 12 weeks on the page, the last 2 in Discord | ✓       |
| Fiche deck                   | One deck (picked on the page) against the other shown decks, most frequent opponents first                                           |         |
| Commencer ou jouer en second | Each deck's win rate going first and going second, and the gap                                                                       |         |

Settings (collected queues, number of decks shown — `topDecks`, the 12 most played, used by every
chart, table and summary —, number of weeks, thresholds) live in [src/config.js](src/config.js).

### Queues and set betas

`config.queues` lists the collected queues in priority order. The page features the first one
that has data for the last finished week and lets you switch to the others. The digest does the
same per format (BO1, BO3) and skips a format whose queue has no data for the week that just
ended, so a closed queue never gets its last week posted again.

During a set's beta, put the beta queue first. Right now only the Set 14 betas are collected:
`quick-play-core-set14` (BO1, featured) and `core-bo3-set14`. When duels.ink closes them at
release, they stop getting new weeks and their digests stop: put `core-bo1` (and `core-bo3`)
back at the top of the list then. The BO1 beta is unranked quick play: players
experiment and skill levels are mixed, so read it as an early signal.

In BO3 queues the API counts decks and matchups in **matches** (and `activity.totalGames` in
single games): win rates are match win rates, and every count is shown as "matchs".

## Setup

```bash
nvm use        # Node 24 (.nvmrc)
npm install

npm run collect    # first run: backfills every week the API exposes (~40 s)
npm run dev        # homepage on http://localhost:5173, meta page on /meta/
npm run digest     # out/digest/bo1/ and bo3/ (--theme light, --week 2026-09-27, --queue core-bo1)
```

## GitHub setup

1. In Discord: channel settings → Integrations → Webhooks → New Webhook → copy the URL.
2. Store it as a repository secret: `gh secret set DISCORD_WEBHOOK_URL` (or **Settings →
   Secrets and variables → Actions**).
3. Optional: **Settings → Pages → Source: GitHub Actions** to publish the page. On a private
   repo this needs GitHub Pro, and the published site is public. Without Pages, the deploy job
   fails but the Discord message still goes out, without a link.
4. **Actions → Weekly Discord report → Run workflow** to test (tick "Post the digest to Discord" to
   send the message).

Both workflows then run on their own: the aggregation every morning, the report on Mondays. Locally, `npm run post:discord` reads the
webhook from `.env` (see `.env.example`); `-- --dry-run` prints the messages without sending them.

## Scripts

| Command                | Purpose                                                |
| ---------------------- | ------------------------------------------------------ |
| `npm run collect`      | Stores finished weeks that are missing or have changed |
| `npm run digest`       | Renders one digest (images + message) per format       |
| `npm run post:discord` | Posts each digest as its own Discord message           |
| `npm run dev`          | Web page locally                                       |
| `npm run build`        | Static build into `dist/`                              |
| `npm run check:api`    | API smoke test + payload summary                       |
| `npm run format`       | Prettier formatting                                    |

## Notes on the data

- Only the fields documented as **stable** are stored. Play rate isn't one of them, so it is
  recomputed (the deck's `games` / total decks played).
- Weeks run Sunday to Saturday. duels.ink computes them every night around 01:30 UTC and
  freezes them after Saturday's computation, so the rest of Saturday is never counted. The
  collector stores the week in progress too and fetches a week again whenever its game count
  in `availableWeeks` changes: daily while it runs, rarely afterwards. The page shows the week
  in progress, marked "en cours"; the digest always covers the last finished week.
- A chart is only shown with enough data to say something (`minWeekSample`, 500 games or BO3
  matches a week; a previous week under it isn't compared with; Évolution needs two such weeks;
  the matchup matrix and deck sheet need half their cells over 100 games). Otherwise the page
  shows a note with the reason and Discord leaves the chart out — a text-only card if none is
  left.
- A single week is too thin for matchups (many cells under 100 games): the matrix sums 4
  weeks, never reaching back before the current set's release.
- A change is shown as real only when its 95% interval excludes 0 (grey otherwise). Matchup
  flags compare this week alone with the window's earlier weeks (independent samples) and need a
  ≥ 5-point gap at ~99.7%, since about a hundred cells are tested each week.
- "Meilleur win rate" (best win rate) is ranked on the lower bound of the confidence interval,
  so a rarely played deck that got lucky doesn't come out on top.

## Structure

```
src/config.js          settings
src/lib/               API client, storage, computations, formatting, PNG rendering
src/charts/            d3 charts (shared by the page and the digest)
scripts/               collection, digest, Discord posting
web/                   site (Vite): homepage, common.css shared by every page, one folder per tool
web/meta/              meta page
data/                  collected data (committed)
assets/fonts/          Inter (OFL) for PNG rendering
```
