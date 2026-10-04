// Renders the weekly digests into out/digest/<format>/: one per format (bo1, bo3), for that
// format's featured queue (see config.queues), with its images and Discord message.
// A format whose featured queue has no data for the week that just ended is skipped, so a
// closed beta queue doesn't get its last week posted again every Monday.
// Usage: npm run digest [-- --week 2026-09-27] [-- --queue core-bo1] [-- --theme light]
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { matchupsChart } from '../src/charts/matchups.js';
import { metaTableChart } from '../src/charts/meta-table.js';
import { themes } from '../src/charts/theme.js';
import { trendsChart } from '../src/charts/trends.js';
import { config } from '../src/config.js';
import { buildDigestCard } from '../src/lib/digest-message.js';
import { buildReport, countsMatches } from '../src/lib/metrics.js';
import { lastFinishedWeekEnd, pickFeaturedQueue } from '../src/lib/queues.js';
import { createDocument, svgToPng } from '../src/lib/render-png.js';
import { readAllWeeks, readIndex } from '../src/lib/store.js';

export const OUT_DIR = fileURLToPath(new URL('../out/digest/', import.meta.url));

// Posting order on Discord.
const FORMATS = ['bo1', 'bo3'];
const formatOf = (index) => (countsMatches(index) ? 'bo3' : 'bo1');

const { values: args } = parseArgs({
  options: {
    queue: { type: 'string' },
    week: { type: 'string' },
    // Most people use Discord in dark mode.
    theme: { type: 'string', default: 'dark' },
  },
});

const theme = themes[args.theme];
if (!theme) throw new Error(`Unknown theme: ${args.theme} (light | dark)`);

const indexes = (
  args.queue ? [await readIndex(args.queue)] : await Promise.all(config.queues.map(readIndex))
).filter(Boolean);
if (!indexes.length) {
  throw new Error(`No data for ${args.queue ?? 'any queue'}: run npm run collect first`);
}

const document = createDocument();

async function renderDigest(report, dir) {
  const images = [
    { file: 'meta.png', svg: metaTableChart(report, { document, theme }) },
    { file: 'popularite.png', svg: trendsChart(report, { document, theme, metric: 'playRate' }) },
    { file: 'matchups.png', svg: matchupsChart(report, { document, theme }) },
    { file: 'winrate.png', svg: trendsChart(report, { document, theme, metric: 'winRate' }) },
  ];
  await mkdir(dir, { recursive: true });
  for (const image of images) {
    await writeFile(path.join(dir, image.file), svgToPng(image.svg));
  }
  const digest = {
    queue: report.queue,
    week: report.week,
    card: buildDigestCard(report),
    images: images.map(({ file }) => ({ file })),
  };
  await writeFile(path.join(dir, 'digest.json'), `${JSON.stringify(digest, null, 2)}\n`);
  return digest;
}

await rm(OUT_DIR, { recursive: true, force: true });
const lastEnd = lastFinishedWeekEnd();
// Always written, so the workflow has an artifact to hand over even when nothing was rendered.
const summary = { weekEnding: lastEnd, rendered: [], skipped: [] };

for (const format of FORMATS) {
  const candidates = indexes.filter((index) => formatOf(index) === format);
  if (!candidates.length) continue;
  const index = pickFeaturedQueue(candidates);
  const snapshots = await readAllWeeks(index.queue);
  const label = format.toUpperCase();

  if (args.week && !snapshots.some((s) => s.week.startDate === args.week)) {
    console.log(`${label}: ${index.queue} has no week ${args.week}, skipped.\n`);
    summary.skipped.push({ format, queue: index.queue });
    continue;
  }
  const report = buildReport({ index, snapshots, weekStart: args.week });
  if (!args.week && !args.queue && report.week.endDate < lastEnd) {
    console.log(
      `${label}: ${index.queue} has no data for the week ending ${lastEnd} (latest: ${report.week.endDate}), skipped.\n`,
    );
    summary.skipped.push({ format, queue: index.queue });
    continue;
  }

  const dir = path.join(OUT_DIR, format);
  const digest = await renderDigest(report, dir);
  const { title, description } = digest.card;
  console.log(`${title}\n${description}\n→ ${path.relative(process.cwd(), dir)}/\n`);
  summary.rendered.push({ format, queue: report.queue, week: report.week.startDate });
}

await mkdir(OUT_DIR, { recursive: true });
await writeFile(path.join(OUT_DIR, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
if (!summary.rendered.length) console.log('No digest rendered.');
