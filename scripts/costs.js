// Local dashboard of what the APIs cost: reads the providers' cost reports with their admin keys
// and writes out/costs/index.html (gitignored, never published), plus the costs as JSON.
// Admin keys can read the whole organisation's billing: they stay in the local .env only, never
// in GitHub secrets, and nothing of them ends up in the page.
// Env: ANTHROPIC_ADMIN_KEY (sk-ant-admin01-…), OPENAI_ADMIN_KEY (sk-admin-…); a provider whose key
// is missing is shown as such.
// Usage: npm run costs [-- --days 90] [-- --from out/costs/costs.json] [-- --open]
import { execFile } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { buildCostsPage } from '../src/lib/costs-page.js';

const OUT_DIR = fileURLToPath(new URL('../out/costs/', import.meta.url));
const DAY_MS = 86_400_000;

const { values: args } = parseArgs({
  options: {
    days: { type: 'string', default: '90' },
    // Renders a costs.json written earlier, without calling the APIs
    from: { type: 'string' },
    open: { type: 'boolean', default: false },
  },
});

const day = (date) => date.toISOString().slice(0, 10);

/** Every page of a paginated report, the cursor carried by `next`. */
async function allPages(fetchPage) {
  const buckets = [];
  let cursor = null;
  do {
    const page = await fetchPage(cursor);
    buckets.push(...page.data);
    cursor = page.has_more !== false ? page.next_page : null;
  } while (cursor);
  return buckets;
}

async function getJson(url, headers) {
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`HTTP ${res.status} : ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

/** Anthropic's cost report: daily, amounts in cents as decimal strings. */
async function anthropicCosts(key, start, end) {
  const buckets = await allPages((page) => {
    const url = new URL('https://api.anthropic.com/v1/organizations/cost_report');
    url.searchParams.set('starting_at', start.toISOString());
    url.searchParams.set('ending_at', end.toISOString());
    url.searchParams.append('group_by[]', 'description');
    url.searchParams.set('limit', '31');
    if (page) url.searchParams.set('page', page);
    return getJson(url, { 'x-api-key': key, 'anthropic-version': '2023-06-01' });
  });
  return buckets.flatMap((bucket) =>
    bucket.results.map((result) => ({
      date: bucket.starting_at.slice(0, 10),
      // "Claude Opus 5.5 - Output Tokens": model and token type, like OpenAI's line items
      item: result.description ?? result.model ?? 'Autre',
      usd: Number(result.amount) / 100,
    })),
  );
}

/** OpenAI's costs endpoint: daily buckets in Unix seconds, amounts in dollars. */
async function openaiCosts(key, start, end) {
  const buckets = await allPages((page) => {
    const url = new URL('https://api.openai.com/v1/organization/costs');
    url.searchParams.set('start_time', String(Math.floor(start.getTime() / 1000)));
    url.searchParams.set('end_time', String(Math.floor(end.getTime() / 1000)));
    url.searchParams.set('bucket_width', '1d');
    url.searchParams.append('group_by', 'line_item');
    url.searchParams.set('limit', '180');
    if (page) url.searchParams.set('page', page);
    return getJson(url, { Authorization: `Bearer ${key}` });
  });
  return buckets.flatMap((bucket) =>
    bucket.results.map((result) => ({
      date: day(new Date(bucket.start_time * 1000)),
      item: result.line_item ?? 'Autre',
      usd: Number(result.amount?.value ?? 0),
    })),
  );
}

const PROVIDERS = [
  {
    id: 'anthropic',
    name: 'Anthropic',
    usage: 'script du podcast',
    env: 'ANTHROPIC_ADMIN_KEY',
    console: 'https://platform.claude.com/settings/admin-keys',
    fetch: anthropicCosts,
  },
  {
    id: 'openai',
    name: 'OpenAI',
    usage: 'voix du podcast',
    env: 'OPENAI_ADMIN_KEY',
    console: 'https://platform.openai.com/settings/organization/admin-keys',
    fetch: openaiCosts,
  },
];

async function collect(days) {
  // Whole UTC days, today included (its costs keep coming in)
  const end = new Date(Date.parse(day(new Date())) + DAY_MS);
  const start = new Date(end.getTime() - days * DAY_MS);
  const providers = [];
  for (const provider of PROVIDERS) {
    const { fetch: fetchCosts, ...info } = provider;
    const key = process.env[provider.env];
    if (!key) {
      providers.push({ ...info, status: 'missing', rows: [] });
      continue;
    }
    try {
      const rows = (await fetchCosts(key, start, end)).filter((row) => row.usd > 0);
      providers.push({ ...info, status: 'ok', rows });
      console.log(`${provider.name}: ${rows.length} lines`);
    } catch (error) {
      providers.push({ ...info, status: 'error', error: error.message, rows: [] });
      console.log(`${provider.name}: ${error.message}`);
    }
  }
  return {
    generatedAt: new Date().toISOString(),
    start: day(start),
    end: day(new Date(end.getTime() - DAY_MS)),
    providers,
  };
}

const costs = args.from
  ? JSON.parse(await readFile(args.from, 'utf8'))
  : await collect(Number(args.days));

await mkdir(OUT_DIR, { recursive: true });
if (!args.from) {
  await writeFile(path.join(OUT_DIR, 'costs.json'), `${JSON.stringify(costs, null, 2)}\n`);
}
const page = path.join(OUT_DIR, 'index.html');
await writeFile(page, buildCostsPage(costs));
console.log(`→ ${path.relative(process.cwd(), page)}`);

if (args.open) {
  const opener = { win32: 'explorer', darwin: 'open' }[process.platform] ?? 'xdg-open';
  // explorer exits with 1 even when it opens the file
  execFile(opener, [page], () => {});
}
