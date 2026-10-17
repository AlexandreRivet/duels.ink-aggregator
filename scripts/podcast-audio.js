// Reads the podcast script (out/podcast/script.json, from `npm run podcast:script`) aloud with
// OpenAI's text-to-speech, one request per line in the host's voice, and assembles the episode
// into out/podcast/episode.mp3: short pauses between lines, loudness normalised, mono 64 kb/s
// (~2.5 MB for 5 minutes, well under Discord's attachment limit). Needs ffmpeg on the PATH.
// Env: OPENAI_API_KEY (required), PODCAST_TTS_MODEL (default gpt-4o-mini-tts).
// Usage: npm run podcast:audio
import { execFile } from 'node:child_process';
import { readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { HOSTS } from '../src/lib/podcast-script.js';

const OUT_DIR = fileURLToPath(new URL('../out/podcast/', import.meta.url));
const MODEL = process.env.PODCAST_TTS_MODEL || 'gpt-4o-mini-tts';
// The API's raw PCM: 24 kHz, 16-bit, mono
const SAMPLE_RATE = 24_000;
const BYTES_PER_SECOND = SAMPLE_RATE * 2;
const PAUSE_SECONDS = 0.35;
// Below this amplitude (about −40 dBFS) a sample counts as silence
const SILENCE_LEVEL = 330;
const TRIM_MARGIN_SECONDS = 0.08;
// Lines read at once, under the API's rate limits
const CONCURRENCY = 4;
const ATTEMPTS = 3;
const SHARED_TONE =
  'Tu parles en français de France, dans un podcast entre joueurs de Lorcana. Naturel, comme une vraie conversation, jamais comme une lecture.';

const script = JSON.parse(
  await readFile(path.join(OUT_DIR, 'script.json'), 'utf8').catch(() => 'null'),
);
if (!script) {
  console.log('No podcast script: no episode this week.');
  process.exit(0);
}
const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) throw new Error('OPENAI_API_KEY is missing (see .env.example)');

const hosts = new Map(HOSTS.map((host) => [host.id, host]));

async function speak(line) {
  const host = hosts.get(line.speaker);
  if (!host) throw new Error(`Unknown speaker: ${line.speaker}`);
  for (let attempt = 1; ; attempt++) {
    const res = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        voice: host.voice,
        input: line.text,
        instructions: `${SHARED_TONE} ${host.tone}`,
        response_format: 'pcm',
      }),
    });
    if (res.ok) return Buffer.from(await res.arrayBuffer());
    // Rate limit or server error: wait and retry; anything else is a mistake to report
    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt === ATTEMPTS) {
      throw new Error(`OpenAI answered ${res.status}: ${await res.text()}`);
    }
    await sleep(attempt * 5000);
  }
}

// In order, a few at a time
const clips = new Array(script.lines.length);
let next = 0;
async function worker() {
  while (next < script.lines.length) {
    const i = next++;
    clips[i] = await speak(script.lines[i]);
    process.stdout.write('.');
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
process.stdout.write('\n');

/**
 * A clip without the silence the API sometimes leaves at either end (up to seconds), keeping a
 * few milliseconds so words aren't clipped: the pauses between lines are then all the same.
 */
function trimSilence(clip) {
  const samples = clip.length >> 1;
  const loud = (i) => Math.abs(clip.readInt16LE(i * 2)) > SILENCE_LEVEL;
  let start = 0;
  while (start < samples && !loud(start)) start++;
  let end = samples;
  while (end > start && !loud(end - 1)) end--;
  const margin = Math.round(TRIM_MARGIN_SECONDS * SAMPLE_RATE);
  return clip.subarray(Math.max(0, start - margin) * 2, Math.min(samples, end + margin) * 2);
}

const pause = Buffer.alloc(Math.round(PAUSE_SECONDS * SAMPLE_RATE) * 2);
const pcm = Buffer.concat(
  clips.map(trimSilence).flatMap((clip, i) => (i ? [pause, clip] : [clip])),
);
const pcmFile = path.join(OUT_DIR, 'episode.pcm');
const mp3File = path.join(OUT_DIR, 'episode.mp3');
await writeFile(pcmFile, pcm);

await promisify(execFile)('ffmpeg', [
  '-y',
  '-loglevel',
  'error',
  ...['-f', 's16le', '-ar', String(SAMPLE_RATE), '-ac', '1', '-i', pcmFile],
  // Podcast loudness (-16 LUFS), so it plays at a steady level next to other audio
  ...['-af', 'loudnorm=I=-16:TP=-1.5:LRA=11', '-ar', '44100'],
  ...['-c:a', 'libmp3lame', '-b:a', '64k'],
  ...['-metadata', `title=${script.title}`, '-metadata', 'artist=duels.ink meta podcast'],
  mp3File,
]);
await rm(pcmFile);

const seconds = pcm.length / BYTES_PER_SECOND;
const { size } = await stat(mp3File);
const duration = `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, '0')}`;
console.log(
  `${script.lines.length} lines, ${duration} → ${path.relative(process.cwd(), mp3File)} (${(size / 1e6).toFixed(1)} MB)`,
);
