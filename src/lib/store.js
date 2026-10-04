/**
 * Reads and writes the collected data (Node only).
 *
 * data/<queue>/index.json         available weeks, eras, queue name
 * data/<queue>/weeks/<start>.json  snapshot of a finished week (stable fields only)
 */
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const DATA_DIR = fileURLToPath(new URL('../../data/', import.meta.url));

const queueDir = (queue) => path.join(DATA_DIR, queue);
const weeksDir = (queue) => path.join(queueDir(queue), 'weeks');

async function readJson(file) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

async function writeJson(file, data, { pretty = false } = {}) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(data, null, pretty ? 2 : undefined)}\n`);
}

export const readIndex = (queue) => readJson(path.join(queueDir(queue), 'index.json'));

export const writeIndex = (queue, index) =>
  writeJson(path.join(queueDir(queue), 'index.json'), index, { pretty: true });

export const readWeek = (queue, startDate) =>
  readJson(path.join(weeksDir(queue), `${startDate}.json`));

export const writeWeek = (queue, snapshot) =>
  writeJson(path.join(weeksDir(queue), `${snapshot.week.startDate}.json`), snapshot);

export async function readAllWeeks(queue) {
  let files;
  try {
    files = await readdir(weeksDir(queue));
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
  const names = files.filter((f) => f.endsWith('.json')).sort();
  return Promise.all(names.map((f) => readJson(path.join(weeksDir(queue), f))));
}
