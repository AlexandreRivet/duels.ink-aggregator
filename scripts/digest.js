// Renders the weekly digest images and the Discord message into out/digest/.
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
import { buildDigestMessage } from '../src/lib/digest-message.js';
import { buildReport } from '../src/lib/metrics.js';
import { createDocument, svgToPng } from '../src/lib/render-png.js';
import { readAllWeeks, readIndex } from '../src/lib/store.js';

export const OUT_DIR = fileURLToPath(new URL('../out/digest/', import.meta.url));

const { values: args } = parseArgs({
  options: {
    queue: { type: 'string', default: config.defaultQueue },
    week: { type: 'string' },
    // Most people use Discord in dark mode.
    theme: { type: 'string', default: 'dark' },
  },
});

const theme = themes[args.theme];
if (!theme) throw new Error(`Unknown theme: ${args.theme} (light | dark)`);

const index = await readIndex(args.queue);
if (!index) throw new Error(`No data for ${args.queue}: run npm run collect first`);
const report = buildReport({
  index,
  snapshots: await readAllWeeks(args.queue),
  weekStart: args.week,
});

const document = createDocument();
const images = [
  { file: 'meta.png', svg: metaTableChart(report, { document, theme }) },
  { file: 'popularite.png', svg: trendsChart(report, { document, theme, metric: 'playRate' }) },
  { file: 'matchups.png', svg: matchupsChart(report, { document, theme }) },
  { file: 'winrate.png', svg: trendsChart(report, { document, theme, metric: 'winRate' }) },
];

await rm(OUT_DIR, { recursive: true, force: true });
await mkdir(OUT_DIR, { recursive: true });
for (const image of images) {
  await writeFile(path.join(OUT_DIR, image.file), svgToPng(image.svg));
}

const digest = {
  queue: report.queue,
  week: report.week,
  content: buildDigestMessage(report),
  images: images.map(({ file, svg }) => ({ file, title: svg.querySelector('title').textContent })),
};
await writeFile(path.join(OUT_DIR, 'digest.json'), `${JSON.stringify(digest, null, 2)}\n`);

console.log(digest.content);
console.log(`\n${images.length} images in ${path.relative(process.cwd(), OUT_DIR)}/`);
