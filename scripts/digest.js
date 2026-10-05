// Renders the weekly digests into out/digest/<format>/: one per format (bo1, bo3), for that
// format's featured queue (see config.queues), with its images and Discord message.
// The digest covers the last finished week, never the one in progress. A format whose queue has
// no data for it is skipped, so a closed beta queue isn't posted again every Monday. Charts
// without enough data are left out; with none, the card is text only.
// Usage: npm run digest [-- --week 2026-09-27] [-- --queue core-bo1] [-- --theme light]
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { evolutionChart } from '../src/charts/evolution.js';
import { metaMapChart } from '../src/charts/meta-map.js';
import { metaTableChart } from '../src/charts/meta-table.js';
import { moversChart } from '../src/charts/movers.js';
import { themes } from '../src/charts/theme.js';
import { config } from '../src/config.js';
import { buildDigestCard } from '../src/lib/digest-message.js';
import { buildReport, countsMatches } from '../src/lib/metrics.js';
import { chartRelevance } from '../src/lib/relevance.js';
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

async function renderDigest(report, trendReport, dir) {
  const relevance = chartRelevance(report);
  const charts = [
    // A weekly digest compares with the previous week. Discord shows at most 4 images in a
    // card's grid: matchups, play/draw and the long-term trends stay on the page.
    {
      file: 'meta.png',
      ok: relevance.meta.ok,
      render: () => metaTableChart(report, { document, theme }),
    },
    {
      file: 'carte.png',
      ok: relevance.map.ok,
      render: () => metaMapChart(report, { document, theme }),
    },
    {
      file: 'mouvements.png',
      ok: relevance.movers.ok,
      render: () => moversChart(report, { document, theme }),
    },
    {
      file: 'evolution.png',
      ok: chartRelevance(trendReport).evolution.ok,
      render: () => evolutionChart(trendReport, { document, theme }),
    },
  ];
  // Only the charts with enough data to say something
  const images = charts.filter((c) => c.ok).map((c) => ({ file: c.file, svg: c.render() }));
  await mkdir(dir, { recursive: true });
  for (const image of images) {
    await writeFile(path.join(dir, image.file), svgToPng(image.svg));
  }
  const digest = {
    queue: report.queue,
    week: report.week,
    card: buildDigestCard(report, relevance),
    images: images.map(({ file }) => ({ file })),
  };
  await writeFile(path.join(dir, 'digest.json'), `${JSON.stringify(digest, null, 2)}\n`);
  return digest;
}

await rm(OUT_DIR, { recursive: true, force: true });
const lastEnd = lastFinishedWeekEnd();
// Always written, so the report workflow's artifact is never empty, even with nothing rendered.
const summary = { weekEnding: lastEnd, rendered: [], skipped: [] };

for (const format of FORMATS) {
  const candidates = indexes.filter((index) => formatOf(index) === format);
  if (!candidates.length) continue;
  const index = pickFeaturedQueue(candidates);
  const snapshots = await readAllWeeks(index.queue);
  const label = format.toUpperCase();

  // The last finished week (the one in progress is stored too, for the page)
  const finished = snapshots.filter((s) => s.week.endDate <= lastEnd);
  const weekStart = args.week ?? finished.at(-1)?.week.startDate;
  if (!weekStart || !snapshots.some((s) => s.week.startDate === weekStart)) {
    console.log(`${label}: ${index.queue} has no week ${weekStart ?? 'finished yet'}, skipped.\n`);
    summary.skipped.push({ format, queue: index.queue });
    continue;
  }
  const report = buildReport({ index, snapshots, weekStart });
  if (!args.week && !args.queue && report.week.endDate < lastEnd) {
    console.log(
      `${label}: ${index.queue} has no data for the week ending ${lastEnd} (latest: ${report.week.endDate}), skipped.\n`,
    );
    summary.skipped.push({ format, queue: index.queue });
    continue;
  }

  const dir = path.join(OUT_DIR, format);
  // Same week, with the trend window cut to the week and the one before
  const trendReport = buildReport({
    index,
    snapshots,
    weekStart,
    options: { trendWeeks: config.digestTrendWeeks },
  });
  const digest = await renderDigest(report, trendReport, dir);
  const { title, description } = digest.card;
  const files = digest.images.map((image) => image.file).join(', ') || 'no image';
  console.log(`${title}\n${description}\n→ ${path.relative(process.cwd(), dir)}/ (${files})\n`);
  summary.rendered.push({ format, queue: report.queue, week: report.week.startDate });
}

await mkdir(OUT_DIR, { recursive: true });
await writeFile(path.join(OUT_DIR, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
if (!summary.rendered.length) console.log('No digest rendered.');
