# duels-meta-tracker

Weekly tracking of the Lorcana meta from the public statistics of
[duels.ink](https://duels.ink/stats) (`/api/stats/meta` endpoint):

- **collection** of every finished week into `data/`, to keep the history;
- **web page** (d3.js): meta of the week, trends, matchup matrix;
- **Discord digest** posted on Monday morning with the same charts as images, to prepare the
  team's training session that evening.

The code and docs are in English; the charts, the page and the Discord message are in French,
for the team.

> Data: © Duels.ink — `updatedAt` and the number of games are shown under every chart, with a
> link to https://duels.ink/stats, as the API docs ask.

## How it works

```
GitHub Actions, Monday 05:17 UTC
  npm run collect    → data/<queue>/weeks/<start>.json   (committed automatically)
  npm run digest     → out/digest/*.png + digest.json
  npm run build      → dist/  → GitHub Pages
  post-discord.js    → message + 4 images in the channel
```

The charts are written once (`src/charts/`): the page renders them in the browser, the digest
renders them in Node (jsdom + resvg, bundled Inter font), with no headless browser.

| Chart                    | What it shows                                                                     |
| ------------------------ | --------------------------------------------------------------------------------- |
| Méta de la semaine       | Play rate, change vs the previous week, win rate with its 95% confidence interval |
| Popularité — 12 semaines | One small chart per deck (9 most played), same scale, set releases marked         |
| Matchups — 4 semaines    | Win rate of the row deck against the column deck, cells under 100 games greyed    |
| Win rate — 12 semaines   | Same grid as play rate, with the uncertainty band and a 50% reference line        |

Settings (collected queues, number of weeks, thresholds) live in [src/config.js](src/config.js).

### Queues and set betas

`config.queues` lists the collected queues in priority order. The digest and the page feature the
first one that has data for the last finished week; the page lets you switch to the others.

During a set's beta, put the beta queue first: when duels.ink closes it at release, it stops
getting new weeks and the next queue takes over on its own.

## Setup

```bash
nvm use        # Node 24 (.nvmrc)
npm install

npm run collect    # first run: backfills every week the API exposes (~40 s)
npm run dev        # page on http://localhost:5173
npm run digest     # images in out/digest/ (--theme light, --week 2026-09-27)
```

## GitHub setup

1. In Discord: channel settings → Integrations → Webhooks → New Webhook → copy the URL.
2. Store it as a repository secret: `gh secret set DISCORD_WEBHOOK_URL` (or **Settings →
   Secrets and variables → Actions**).
3. Optional: **Settings → Pages → Source: GitHub Actions** to publish the page. On a private
   repo this needs GitHub Pro, and the published site is public. Without Pages, the deploy job
   fails but the Discord message still goes out, without a link.
4. **Actions → Weekly digest → Run workflow** to test (tick "Post the digest to Discord" to
   send the message).

The workflow then runs on its own every Monday. Locally, `npm run post:discord` reads the
webhook from `.env` (see `.env.example`); `-- --dry-run` prints the message without sending it.

## Scripts

| Command                | Purpose                                                |
| ---------------------- | ------------------------------------------------------ |
| `npm run collect`      | Stores finished weeks that are missing or have changed |
| `npm run digest`       | Renders the digest images and message                  |
| `npm run post:discord` | Posts the digest through the Discord webhook           |
| `npm run dev`          | Web page locally                                       |
| `npm run build`        | Static build into `dist/`                              |
| `npm run check:api`    | API smoke test + payload summary                       |
| `npm run format`       | Prettier formatting                                    |

## Notes on the data

- Only the fields documented as **stable** are stored. Play rate isn't one of them, so it is
  recomputed (the deck's `games` / total decks played).
- Weeks run Sunday to Saturday. duels.ink computes them every night around 01:30 UTC and
  freezes them after Saturday's computation, so the rest of Saturday is never counted. The
  collector fetches a week again if its game count in `availableWeeks` changes.
- A single week is too thin for matchups (many cells under 100 games): the matrix sums 4
  weeks, never reaching back before the current set's release.
- "Meilleur win rate" (best win rate) is ranked on the lower bound of the confidence interval,
  so a rarely played deck that got lucky doesn't come out on top.

## Structure

```
src/config.js          settings
src/lib/               API client, storage, computations, formatting, PNG rendering
src/charts/            d3 charts (shared by the page and the digest)
scripts/               collection, digest, Discord posting
web/                   page (Vite)
data/                  collected data (committed)
assets/fonts/          Inter (OFL) for PNG rendering
```
