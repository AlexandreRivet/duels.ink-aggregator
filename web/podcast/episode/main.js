// One episode: its player, and the conversation above it, which follows the audio. Each line
// carries the time it is heard at (written by npm run podcast:audio); clicking one plays from it.
// Scrolling the conversation by hand stops it following, until "Suivre la lecture".
import { HOSTS } from '../../../src/lib/podcast-script.js';
import { episodeWeek, formatClock, formatDuration, loadEpisodes, metaLinks } from '../episodes.js';

const ROOT = '../../';
const $ = (id) => document.getElementById(id);
const audio = $('audio');
const transcript = $('transcript');
const resumeButton = $('resume-follow');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const hostNames = new Map(HOSTS.map((host) => [host.id, host.name]));

let lines = [];
let items = [];
let current = -2;
let following = true;
let frame = null;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function lineItem(line, i) {
  const item = el('li', `line ${line.speaker}`);
  const bubble = el('button', 'bubble');
  bubble.type = 'button';
  const speaker = el('span', 'speaker', hostNames.get(line.speaker) ?? line.speaker);
  speaker.append(el('span', 'timestamp', formatClock(line.start)));
  bubble.append(speaker, el('span', 'line-text', line.text));
  bubble.addEventListener('click', () => {
    audio.currentTime = lines[i].start;
    setFollowing(true);
    audio.play();
  });
  item.append(bubble);
  return item;
}

/** The line being heard: the last one started (during a pause, the one just said). */
function lineAt(time) {
  let index = -1;
  for (let i = 0; i < lines.length && lines[i].start <= time + 0.05; i++) index = i;
  return index;
}

function scrollToLine(index, smooth = true) {
  const item = items[Math.max(index, 0)];
  if (!item) return;
  const top = item.offsetTop - (transcript.clientHeight - item.offsetHeight) / 2;
  transcript.scrollTo({ top, behavior: smooth && !reducedMotion.matches ? 'smooth' : 'auto' });
}

function update() {
  const index = lineAt(audio.currentTime);
  if (index === current) return;
  current = index;
  items.forEach((item, i) => {
    item.classList.toggle('heard', i < index);
    item.classList.toggle('current', i === index);
    if (i === index) item.setAttribute('aria-current', 'true');
    else item.removeAttribute('aria-current');
  });
  if (following) scrollToLine(index);
}

function loop() {
  update();
  frame = requestAnimationFrame(loop);
}

function setFollowing(value) {
  following = value;
  resumeButton.hidden = value;
  if (value) scrollToLine(current);
}

// Only the listener's own scrolling stops the follow: scrollTo fires none of these
for (const type of ['wheel', 'touchmove']) {
  transcript.addEventListener(type, () => setFollowing(false), { passive: true });
}
transcript.addEventListener('keydown', (event) => {
  if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End'].includes(event.key)) {
    setFollowing(false);
  }
});
resumeButton.addEventListener('click', () => setFollowing(true));

audio.addEventListener('play', () => {
  cancelAnimationFrame(frame);
  loop();
});
for (const type of ['pause', 'ended']) {
  audio.addEventListener(type, () => cancelAnimationFrame(frame));
}
// Seeking with the player's bar, paused or not
audio.addEventListener('seeked', update);

function siblingLink(episode, label) {
  const link = el('a', 'meta-link', label);
  link.href = `?week=${episode.week.startDate}`;
  link.title = episode.title;
  return link;
}

async function main() {
  const episodes = await loadEpisodes(ROOT);
  const params = new URLSearchParams(location.search);
  const week = params.get('week');
  // No week asked: the latest episode
  const index = week ? episodes.findIndex((e) => e.week.startDate === week) : 0;
  const episode = episodes[index];
  if (!episode) {
    $('status').textContent = week
      ? `Pas d’épisode pour la semaine du ${week}.`
      : 'Pas encore d’épisode : le premier sort dimanche.';
    return;
  }

  const res = await fetch(`${ROOT}episodes/${episode.script}`);
  if (!res.ok) throw new Error(`HTTP ${res.status} on ${episode.script}`);
  lines = (await res.json()).lines;

  document.title = `${episode.title} · Podcast Lorcana`;
  $('title').textContent = episode.title;
  $('details').textContent = `${episodeWeek(episode)} · ${formatDuration(episode.duration)}`;
  $('summary').textContent = episode.summary;
  $('links').append(...metaLinks(episode, ROOT));

  // Newest first: the previous episode comes after this one in the list
  const older = episodes[index + 1];
  const newer = episodes[index - 1];
  if (older) $('siblings').append(siblingLink(older, '← Épisode précédent'));
  if (newer) $('siblings').append(siblingLink(newer, 'Épisode suivant →'));

  items = lines.map(lineItem);
  transcript.append(...items);
  audio.src = `${ROOT}episodes/${episode.audio}`;
  if ('mediaSession' in navigator) {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: episode.title,
      artist: 'Camille et Sacha',
      album: 'Podcast Lorcana',
    });
  }

  $('status').hidden = true;
  $('episode').hidden = false;
  update();
  scrollToLine(0, false);

  // &t=95: opens at that moment (seconds), to share a passage
  const start = Number(params.get('t'));
  if (start > 0) {
    audio.addEventListener('loadedmetadata', () => (audio.currentTime = start), { once: true });
  }
}

main().catch((error) => {
  $('status').textContent = `Impossible de charger l’épisode (${error.message}).`;
});
