// Posts the digests rendered by `npm run digest` to a Discord channel through a webhook:
// one message per format, BO1 first.
// Env: DISCORD_WEBHOOK_URL (required). In CI, the Weekly Discord report workflow also sets
// SITE_URL to the GitHub Pages address (the site's root) so each message links to the meta page
// on its queue; it's empty when Pages is off.
// Usage: npm run post:discord [-- --dry-run]
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { setTimeout as sleep } from 'node:timers/promises';
import { SOURCE_URL } from '../src/config.js';

const OUT_DIR = fileURLToPath(new URL('../out/digest/', import.meta.url));
// The charts' accent blue, as an integer for the embeds' side bar.
const EMBED_COLOR = 0x3987e5;

const { values: args } = parseArgs({ options: { 'dry-run': { type: 'boolean', default: false } } });

// out/digest/bo1/, out/digest/bo3/: alphabetical order is the posting order.
const entries = await readdir(OUT_DIR, { withFileTypes: true }).catch(() => []);
const digests = [];
for (const entry of entries
  .filter((e) => e.isDirectory())
  .sort((a, b) => a.name.localeCompare(b.name))) {
  const dir = path.join(OUT_DIR, entry.name);
  const digest = JSON.parse(await readFile(path.join(dir, 'digest.json'), 'utf8'));
  digests.push({ dir, digest });
}
if (!digests.length) {
  console.log('No digest to post.');
  process.exit(0);
}

/**
 * The published meta page, opened on the digest's queue and week (null when Pages is off). The
 * week matters: the page otherwise opens on the week in progress, not the one the card describes.
 */
function pageLink(digest) {
  // Missing or not a URL (e.g. an API error message): no link rather than a crash
  if (!process.env.SITE_URL || !URL.canParse(process.env.SITE_URL)) return null;
  // The meta page sits under meta/; the root's trailing slash keeps its last path segment
  const root = process.env.SITE_URL.replace(/\/?$/, '/');
  const link = new URL('meta/', root);
  link.searchParams.set('queue', digest.queue);
  link.searchParams.set('week', digest.week.startDate);
  return link.href;
}

function payloadFor(digest) {
  const page = pageLink(digest);
  const { title, description, footer } = digest.card;
  // Embeds sharing the same url are shown by Discord as a single card with a 2×2 image grid.
  const url = page ?? SOURCE_URL;
  // A card can come without images, when the week had too little data
  const [first, ...others] = digest.images;
  return {
    embeds: [
      {
        author: { name: 'Source : duels.ink', url: SOURCE_URL },
        title,
        url,
        description: page ? `${description}\n[Graphes interactifs](${page})` : description,
        color: EMBED_COLOR,
        ...(first ? { image: { url: `attachment://${first.file}` } } : {}),
        footer: { text: footer },
      },
      ...others.map((image) => ({ url, image: { url: `attachment://${image.file}` } })),
    ],
    attachments: digest.images.map((image, id) => ({ id, filename: image.file })),
    allowed_mentions: { parse: [] },
  };
}

if (args['dry-run']) {
  console.log(
    JSON.stringify(
      digests.map(({ digest }) => payloadFor(digest)),
      null,
      2,
    ),
  );
  process.exit(0);
}

const webhook = process.env.DISCORD_WEBHOOK_URL;
if (!webhook) throw new Error('DISCORD_WEBHOOK_URL is missing (see .env.example)');

async function post(dir, digest) {
  const form = new FormData();
  form.append('payload_json', JSON.stringify(payloadFor(digest)));
  for (const [id, image] of digest.images.entries()) {
    const bytes = await readFile(path.join(dir, image.file));
    form.append(`files[${id}]`, new Blob([bytes], { type: 'image/png' }), image.file);
  }
  const url = new URL(webhook);
  url.searchParams.set('wait', 'true');
  return fetch(url, { method: 'POST', body: form });
}

for (const [i, { dir, digest }] of digests.entries()) {
  // A short pause keeps the messages in order and clear of Discord's rate limit.
  if (i > 0) await sleep(1000);
  let res = await post(dir, digest);
  if (res.status === 429) {
    const { retry_after: retryAfter = 5 } = await res.json();
    await sleep(retryAfter * 1000);
    res = await post(dir, digest);
  }
  if (!res.ok) {
    throw new Error(`Discord answered ${res.status} for ${digest.queue}: ${await res.text()}`);
  }
  console.log(`Posted the ${digest.queue} digest for the week of ${digest.week.startDate}.`);
}
