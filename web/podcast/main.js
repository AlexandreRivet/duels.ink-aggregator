import { episodeWeek, formatDuration, loadEpisodes, metaLinks } from './episodes.js';

const ROOT = '../';
const status = document.getElementById('status');
const list = document.getElementById('episodes');

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function episodeItem(episode, latest) {
  const item = el('li', 'episode');
  const header = el('div', 'episode-header');
  const title = el('h2', 'episode-title');
  const link = el('a', null, episode.title);
  link.href = `episode/?week=${episode.week.startDate}`;
  title.append(link);
  if (latest) header.append(el('span', 'badge', 'Dernier épisode'));
  header.append(title);

  const details = el(
    'p',
    'episode-details',
    `${episodeWeek(episode)} · ${formatDuration(episode.duration)}`,
  );
  const links = el('div', 'episode-links');
  const listen = el('a', 'button', 'Écouter');
  listen.href = link.href;
  listen.setAttribute('aria-label', `Écouter : ${episode.title}`);
  links.append(listen, ...metaLinks(episode, ROOT));

  item.append(header, details, el('p', 'episode-summary', episode.summary), links);
  return item;
}

try {
  const episodes = await loadEpisodes(ROOT);
  if (!episodes.length) {
    status.textContent = 'Pas encore d’épisode : le premier sort dimanche.';
  } else {
    list.append(...episodes.map((episode, i) => episodeItem(episode, i === 0)));
    list.hidden = false;
    status.hidden = true;
  }
} catch (error) {
  status.textContent = `Impossible de charger les épisodes (${error.message}).`;
}
