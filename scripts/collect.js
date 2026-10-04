// Stores every finished duels.ink week in data/<queue>/weeks/.
// On the first run, backfills every week the API still exposes.
// Usage: npm run collect [-- queue …]
import { setTimeout as sleep } from 'node:timers/promises';
import { config } from '../src/config.js';
import { fetchMeta } from '../src/lib/duels-api.js';
import { readAllWeeks, readWeek, writeIndex, writeWeek } from '../src/lib/store.js';

// 60 requests / 60 s per IP: stay below it.
const REQUEST_INTERVAL_MS = 1100;

const queues = process.argv.length > 2 ? process.argv.slice(2) : config.queues;
const today = new Date().toISOString().slice(0, 10);

async function fetchWithRetry(params, attempts = 3) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fetchMeta(params);
    } catch (error) {
      if (!error.retryAfter || attempt >= attempts) throw error;
      console.warn(`  ${error.message}`);
      await sleep(error.retryAfter * 1000);
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

for (const queue of queues) {
  console.log(`▸ ${queue}`);
  const { data: overview } = await fetchWithRetry({ queue });
  const { meta } = overview;

  // A week is frozen after its last computation (Saturday around 01:30 UTC): only finished
  // weeks are stored, and they're fetched again if their game count changes later.
  const complete = (meta.availableWeeks ?? []).filter((w) => w.endDate < today && w.totalGames > 0);

  let written = 0;
  for (const week of complete) {
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
    queueName: meta.queues?.active?.find((q) => q.id === queue)?.name ?? queue,
    eras,
    weeks: snapshots.map((s) => ({
      ...s.week,
      totalGames: s.totalGames,
      updatedAt: s.updatedAt,
    })),
  });

  console.log(`  ${written} week(s) written, ${snapshots.length} stored`);
}
