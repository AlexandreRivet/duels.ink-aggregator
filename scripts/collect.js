// Stores every duels.ink week in data/<queue>/weeks/, the one in progress included.
// On the first run, backfills every week the API still exposes. A queue that fails doesn't stop
// the others; the run only fails when no queue could be collected.
// Usage: npm run collect [-- queue …]
import { setTimeout as sleep } from 'node:timers/promises';
import { config } from '../src/config.js';
import { fetchMeta } from '../src/lib/duels-api.js';
import { readAllWeeks, readWeek, writeIndex, writeWeek } from '../src/lib/store.js';

// 60 requests / 60 s per IP: stay below it.
const REQUEST_INTERVAL_MS = 1100;

const queues = process.argv.length > 2 ? process.argv.slice(2) : config.queues;

/** Fetches, retrying rate limits, server errors and network failures with a growing delay. */
async function fetchWithRetry(params, attempts = 4) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fetchMeta(params);
    } catch (error) {
      if (!error.retryable || attempt >= attempts) throw error;
      // A rate limit says how long to wait; otherwise 5 s, 10 s, 20 s
      const wait = error.retryAfter ?? 5 * 2 ** (attempt - 1);
      console.warn(`  ${error.message} (attempt ${attempt}/${attempts}, retrying in ${wait} s)`);
      await sleep(wait * 1000);
    }
  }
}

/** Keeps only the fields listed as stable in the API docs. */
function toSnapshot(queue, week, { data, etag }) {
  return {
    queue,
    week: { startDate: week.startDate, endDate: week.endDate, label: week.label },
    updatedAt: data.updatedAt,
    fetchedAt: new Date().toISOString(),
    etag,
    totalGames: data.activity.totalGames,
    colorPairs: data.colorPairs.map(({ colors, games, wins, winRate, firstPlayerWinRate }) => ({
      colors,
      games,
      wins,
      winRate,
      firstPlayerWinRate,
    })),
    matchups: data.matchups.map(
      ({ colorsA, colorsB, games, winsA, winRate, firstPlayerGames, firstPlayerWinRate }) => ({
        colorsA,
        colorsB,
        games,
        winsA,
        winRate,
        firstPlayerGames,
        firstPlayerWinRate,
      }),
    ),
  };
}

async function collectQueue(queue) {
  console.log(`▸ ${queue}`);
  const { data: overview } = await fetchWithRetry({ queue });
  const { meta } = overview;

  // duels.ink recomputes the current week every night (~01:30 UTC) and freezes it after
  // Saturday's run. Every week is stored, the current one included, and fetched again whenever
  // its game count changes: daily for the week in progress, rarely afterwards.
  const weeks = (meta.availableWeeks ?? []).filter((w) => w.totalGames > 0);

  let written = 0;
  for (const week of weeks) {
    const stored = await readWeek(queue, week.startDate);
    if (stored && stored.totalGames === week.totalGames) continue;

    await sleep(REQUEST_INTERVAL_MS);
    const res = await fetchWithRetry({
      queue,
      period: `week:${week.startDate}`,
      etag: stored?.etag,
    });
    if (res.status === 304) continue;
    if (res.data.meta.period !== `week:${week.startDate}`) {
      throw new Error(`Unexpected response for ${week.startDate}: ${res.data.meta.period}`);
    }

    await writeWeek(queue, toSnapshot(queue, week, res));
    written++;
    console.log(`  ${week.startDate}  ${res.data.activity.totalGames} games`);
  }

  const snapshots = await readAllWeeks(queue);
  // A closed beta queue moves from the active list to the archived one.
  const info = [...(meta.queues?.active ?? []), ...(meta.queues?.archived ?? [])].find(
    (q) => q.id === queue,
  );
  const eras = [meta.eras?.currentEra, ...(meta.eras?.pastEras ?? [])]
    .filter(Boolean)
    .map(({ key, name, startedAt, endedAt }) => ({
      key,
      name,
      startedAt,
      endedAt: endedAt ?? null,
    }))
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt));

  await writeIndex(queue, {
    queue,
    queueName: info?.name ?? queue,
    // bo1 | bo3: in BO3 queues, decks and matchups are counted in matches.
    gameMode: info?.gameMode ?? null,
    eras,
    weeks: snapshots.map((s) => ({
      ...s.week,
      totalGames: s.totalGames,
      updatedAt: s.updatedAt,
    })),
  });

  console.log(`  ${written} week(s) written, ${snapshots.length} stored`);
}

const failed = [];
for (const queue of queues) {
  try {
    await collectQueue(queue);
  } catch (error) {
    failed.push(queue);
    // GitHub annotation: shows in the run summary without stopping the other queues
    console.log(`::error title=Collect ${queue}::${error.message}`);
  }
}
// Fail only when nothing could be collected; otherwise the queues that worked get committed
if (failed.length === queues.length) process.exitCode = 1;
