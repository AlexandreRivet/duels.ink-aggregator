/**
 * What the podcast pages share: the episode index, and how an episode's week, length and meta
 * links are shown.
 */
import { formatWeekRange } from '../../src/lib/format.js';

/**
 * The episodes, newest first. Collected data is served at the site root (publicDir in
 * vite.config.js); `root` is that root relative to the page (`../` from podcast/, `../../` from
 * podcast/episode/), so relative URLs keep working wherever the site is hosted.
 */
export async function loadEpisodes(root) {
  const res = await fetch(`${root}episodes/index.json`);
  // No episode published yet
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`HTTP ${res.status} on episodes/index.json`);
  return (await res.json()).episodes;
}

export const episodeWeek = (episode) =>
  formatWeekRange(episode.week.startDate, episode.week.endDate);

/** 326 → "5 min 26 s" */
export function formatDuration(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return m ? `${m} min ${String(s).padStart(2, '0')} s` : `${s} s`;
}

/** 83.4 → "1:23", for the transcript's timestamps */
export function formatClock(seconds) {
  const total = Math.floor(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/** Links to the meta page on each queue the episode covers, opened on its week. */
export function metaLinks(episode, root) {
  return episode.formats.map(({ format, queue }) => {
    const params = new URLSearchParams({ queue, week: episode.week.startDate });
    const link = document.createElement('a');
    link.className = 'meta-link';
    link.href = `${root}meta/?${params}`;
    link.textContent = `Méta ${format.toUpperCase()}`;
    return link;
  });
}
