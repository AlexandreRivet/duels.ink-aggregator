// Posts the digest rendered by `npm run digest` to a Discord channel through a webhook.
// Env: DISCORD_WEBHOOK_URL (required). In CI, the workflow also sets SITE_URL to the
// GitHub Pages address so the message links to the page; it's empty when Pages is off.
// Usage: npm run post:discord [-- --dry-run]
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { setTimeout as sleep } from 'node:timers/promises';

const OUT_DIR = fileURLToPath(new URL('../out/digest/', import.meta.url));
// The charts' accent blue, as an integer for the embeds' side bar.
const EMBED_COLOR = 0x3987e5;

const { values: args } = parseArgs({ options: { 'dry-run': { type: 'boolean', default: false } } });

const digest = JSON.parse(await readFile(path.join(OUT_DIR, 'digest.json'), 'utf8'));

let content = digest.content;
if (process.env.SITE_URL) content += `\n-# Graphes interactifs : <${process.env.SITE_URL}>`;

const payload = {
  content,
  // One embed per image, each with its title; no accidental mentions.
  embeds: digest.images.map((image) => ({
    title: image.title,
    color: EMBED_COLOR,
    image: { url: `attachment://${image.file}` },
  })),
  attachments: digest.images.map((image, id) => ({ id, filename: image.file })),
  allowed_mentions: { parse: [] },
};

if (args['dry-run']) {
  console.log(JSON.stringify(payload, null, 2));
  process.exit(0);
}

const webhook = process.env.DISCORD_WEBHOOK_URL;
if (!webhook) throw new Error('DISCORD_WEBHOOK_URL is missing (see .env.example)');

async function post() {
  const form = new FormData();
  form.append('payload_json', JSON.stringify(payload));
  for (const [id, image] of digest.images.entries()) {
    const bytes = await readFile(path.join(OUT_DIR, image.file));
    form.append(`files[${id}]`, new Blob([bytes], { type: 'image/png' }), image.file);
  }
  const url = new URL(webhook);
  url.searchParams.set('wait', 'true');
  return fetch(url, { method: 'POST', body: form });
}

let res = await post();
if (res.status === 429) {
  const { retry_after: retryAfter = 5 } = await res.json();
  await sleep(retryAfter * 1000);
  res = await post();
}
if (!res.ok) {
  throw new Error(`Discord answered ${res.status}: ${await res.text()}`);
}

console.log(
  `Posted the ${digest.queue} digest for the week of ${digest.week.startDate} to Discord.`,
);
