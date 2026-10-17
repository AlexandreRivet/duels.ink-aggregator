// Writes the weekly podcast's script with Claude, from the facts `npm run digest` left in
// out/digest/<format>/facts.json, into out/podcast/ (script.json for the audio step, script.md to
// read). Every percentage the script says is checked against the facts; one rewrite is asked
// when some aren't there, then the run fails rather than airing made-up figures.
// Env: ANTHROPIC_API_KEY (required), PODCAST_MODEL (default claude-sonnet-5-5).
// Usage: npm run podcast:script [-- --dry-run]
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import Anthropic from '@anthropic-ai/sdk';
import { formatWeekRange } from '../src/lib/format.js';
import {
  buildUserMessage,
  countWords,
  SCRIPT_SCHEMA,
  scriptToMarkdown,
  SYSTEM_PROMPT,
  TARGET_WORDS,
  unsupportedFigures,
} from '../src/lib/podcast-script.js';

const DIGEST_DIR = fileURLToPath(new URL('../out/digest/', import.meta.url));
export const OUT_DIR = fileURLToPath(new URL('../out/podcast/', import.meta.url));
const MODEL = process.env.PODCAST_MODEL || 'claude-sonnet-5-5';

const { values: args } = parseArgs({
  options: { 'dry-run': { type: 'boolean', default: false } },
});

// A stale episode must never go out with this week's digest; a dry run leaves it alone
if (!args['dry-run']) await rm(OUT_DIR, { recursive: true, force: true });
const summary = JSON.parse(
  await readFile(path.join(DIGEST_DIR, 'summary.json'), 'utf8').catch(() => 'null'),
);
if (!summary?.rendered.length) {
  console.log('No digest rendered: no podcast this week.');
  process.exit(0);
}

const formats = [];
for (const { format } of summary.rendered) {
  formats.push(JSON.parse(await readFile(path.join(DIGEST_DIR, format, 'facts.json'), 'utf8')));
}
// The digest's week, which is not summary.weekEnding when rendered with --week
const { week } = JSON.parse(
  await readFile(path.join(DIGEST_DIR, summary.rendered[0].format, 'digest.json'), 'utf8'),
);
const episode = { week: formatWeekRange(week.startDate, week.endDate), formats };
const userMessage = buildUserMessage(episode);

if (args['dry-run']) {
  console.log(`${SYSTEM_PROMPT}\n\n---\n\n${userMessage}`);
  process.exit(0);
}

const client = new Anthropic();
const messages = [{ role: 'user', content: userMessage }];

async function write() {
  const response = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    // On a safety decline, Anthropic reruns the request on its recommended model
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'high', format: { type: 'json_schema', schema: SCRIPT_SCHEMA } },
    system: SYSTEM_PROMPT,
    messages,
  });
  const { input_tokens: input, output_tokens: output } = response.usage;
  console.log(`${response.model}: ${input} tokens in, ${output} out (${response.stop_reason})`);
  if (response.stop_reason !== 'end_turn') {
    throw new Error(`The script was cut short: ${response.stop_reason}`);
  }
  const text = response.content.find((block) => block.type === 'text')?.text;
  // Kept for a rewrite request, thinking blocks included
  messages.push({ role: 'assistant', content: response.content });
  return JSON.parse(text);
}

let script = await write();
let unsupported = unsupportedFigures(script, episode);
if (unsupported.length) {
  console.log(`Figures not in the facts, asking for a rewrite:`);
  for (const { figure } of unsupported) console.log(`  ${figure}`);
  messages.push({
    role: 'user',
    content: `Ces chiffres ne figurent pas dans les faits fournis : ${unsupported.map((u) => `« ${u.figure} »`).join(', ')}. Réécris le script complet en n'utilisant que des chiffres présents dans les faits.`,
  });
  script = await write();
  unsupported = unsupportedFigures(script, episode);
}

await mkdir(OUT_DIR, { recursive: true });
const result = {
  week: { startDate: week.startDate, endDate: week.endDate },
  model: MODEL,
  ...script,
};
await writeFile(path.join(OUT_DIR, 'script.json'), `${JSON.stringify(result, null, 2)}\n`);
await writeFile(path.join(OUT_DIR, 'script.md'), scriptToMarkdown(script));

const words = countWords(script);
console.log(`\n${script.title}\n${script.summary}`);
console.log(
  `${script.lines.length} lines, ${words} words → ${path.relative(process.cwd(), OUT_DIR)}/`,
);
if (words < TARGET_WORDS[0] || words > TARGET_WORDS[1]) {
  console.log(`Warning: outside the ${TARGET_WORDS.join('–')} words aimed at.`);
}
if (unsupported.length) {
  throw new Error(
    `Figures still not in the facts after a rewrite: ${unsupported.map((u) => u.figure).join(', ')}`,
  );
}
