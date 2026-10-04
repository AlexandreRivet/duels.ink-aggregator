# duels-meta-tracker

Regular collection of the public statistics of [duels.ink](https://duels.ink/stats)
(`/api/stats/meta` endpoint) to follow how the Lorcana meta evolves week after week.

> Data: © Duels.ink — always show `updatedAt` and the number of games next to published
> figures, with a link to https://duels.ink/stats.

## Prerequisites (macOS)

```bash
# Homebrew: https://brew.sh
brew install nvm
mkdir -p ~/.nvm
# Add to ~/.zshrc:
#   export NVM_DIR="$HOME/.nvm"
#   [ -s "$(brew --prefix nvm)/nvm.sh" ] && . "$(brew --prefix nvm)/nvm.sh"

nvm install   # reads .nvmrc (Node 24 LTS)
nvm use
```

## Setup

```bash
npm install
npm run check:api            # core-bo1 by default
npm run check:api -- infinity-bo1
```

## Structure

```
src/lib/duels-api.js   API client (ETag / 429 handling)
scripts/               executable scripts (collection, backfill…)
data/                  collected data
```

## Scripts

| Command             | Purpose                          |
| ------------------- | -------------------------------- |
| `npm run check:api` | API smoke test + payload summary |
| `npm run format`    | Prettier formatting              |
