import { deckSheetChart } from '../src/charts/deck-sheet.js';
import { evolutionChart } from '../src/charts/evolution.js';
import { matchupsChart } from '../src/charts/matchups.js';
import { metaMapChart } from '../src/charts/meta-map.js';
import { metaTableChart } from '../src/charts/meta-table.js';
import { moversChart } from '../src/charts/movers.js';
import { playDrawChart } from '../src/charts/play-draw.js';
import { themes } from '../src/charts/theme.js';
import { config } from '../src/config.js';
import {
  formatCount,
  formatDay,
  formatDelta,
  formatInt,
  formatPct,
  formatUpdatedAt,
  formatWeekRange,
} from '../src/lib/format.js';
import { INKS, deckEmoji, deckName } from '../src/lib/inks.js';
import { buildReport, countsMatches, sampleSize, wilson } from '../src/lib/metrics.js';
import { isWeekComplete, pickFeaturedQueue } from '../src/lib/queues.js';
import { chartRelevance } from '../src/lib/relevance.js';

const BASE = import.meta.env.BASE_URL;
const $ = (id) => document.getElementById(id);
const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');

const indexCache = new Map();
const cache = new Map();
const state = readUrlState();
let featuredQueue = null;
let lastReport = null;
let renderToken = 0;

function el(tag, attrs = {}, text) {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value);
  if (text != null) node.textContent = text;
  return node;
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} on ${url}`);
  return res.json();
}

/** A queue's index, or null when nothing has been collected for it yet. */
function loadIndex(queue) {
  if (!indexCache.has(queue)) {
    indexCache.set(
      queue,
      fetchJson(`${BASE}${queue}/index.json`).catch(() => null),
    );
  }
  return indexCache.get(queue);
}

function loadQueue(queue) {
  if (!cache.has(queue)) {
    cache.set(
      queue,
      (async () => {
        const index = await loadIndex(queue);
        if (!index) throw new Error(`No data for ${queue}`);
        const snapshots = await Promise.all(
          index.weeks.map((w) => fetchJson(`${BASE}${queue}/weeks/${w.startDate}.json`)),
        );
        return { index, snapshots };
      })(),
    );
  }
  return cache.get(queue);
}

// --- State in the URL, to share a link to a specific week ---

function readUrlState() {
  const params = new URLSearchParams(location.search);
  return {
    queue: params.get('queue'),
    week: params.get('week'),
    matchupWeeks: Number(params.get('matchups')) || config.matchupWeeks,
    // Deck shown in the deck sheet (null: the most played one).
    deck: params.get('deck'),
  };
}

function writeUrlState() {
  const params = new URLSearchParams();
  if (state.queue !== featuredQueue) params.set('queue', state.queue);
  if (state.week) params.set('week', state.week);
  if (state.matchupWeeks !== config.matchupWeeks) params.set('matchups', state.matchupWeeks);
  if (state.deck) params.set('deck', state.deck);
  const query = params.toString();
  history.replaceState(null, '', query ? `?${query}` : location.pathname);
}

// --- Filters ---

async function setupFilters() {
  // Only queues with at least one week: one the API doesn't know has an empty index
  const indexes = (await Promise.all(config.queues.map(loadIndex))).filter(
    (index) => index?.weeks.length,
  );
  if (!indexes.length) throw new Error('No data collected yet');
  featuredQueue = pickFeaturedQueue(indexes).queue;
  if (!indexes.some((index) => index.queue === state.queue)) state.queue = featuredQueue;

  if (indexes.length > 1) {
    $('queue-field').hidden = false;
    $('queue').replaceChildren(
      ...indexes.map((index) => el('option', { value: index.queue }, index.queueName)),
    );
  }
  $('queue').value = state.queue;
  $('matchup-weeks').value = String(state.matchupWeeks);

  $('filters').addEventListener('change', (event) => {
    const { id, value } = event.target;
    if (id === 'queue') {
      state.queue = value;
      state.week = null;
    }
    if (id === 'week') state.week = value === event.target.options[0]?.value ? null : value;
    if (id === 'matchup-weeks') state.matchupWeeks = Number(value);
    writeUrlState();
    render();
  });
}

function fillWeekSelect(index, snapshots, unit, selected) {
  const perMatch = countsMatches(index);
  const weeks = [...snapshots].reverse();
  $('week').replaceChildren(
    ...weeks.map((snapshot) =>
      el(
        'option',
        { value: snapshot.week.startDate },
        `${formatWeekRange(snapshot.week.startDate, snapshot.week.endDate)} · ${formatCount(
          sampleSize(snapshot, perMatch),
          unit,
        )}${isWeekComplete(snapshot.week) ? '' : ' · en cours'}`,
      ),
    ),
  );
  $('week').value = selected;
}

// --- Key figures ---

/**
 * A deck as its ink chips. The name stays available: hidden text for screen readers (and
 * copy-paste), and a tooltip on hover.
 */
function chips(colors) {
  const wrapper = el('span', { class: 'chips', title: deckName(colors) });
  for (const ink of colors) {
    const chip = el('span', { class: 'chip', 'aria-hidden': 'true' });
    chip.style.background = INKS[ink]?.color ?? 'gray';
    wrapper.append(chip);
  }
  wrapper.append(el('span', { class: 'sr-only' }, deckName(colors)));
  return wrapper;
}

function kpi(label, value, detail) {
  const tile = el('div', { class: 'kpi' });
  const valueNode = el('div', { class: 'kpi-value' });
  if (typeof value === 'string') valueNode.textContent = value;
  else valueNode.append(chips(value.colors));
  tile.append(el('div', { class: 'kpi-label' }, label), valueNode);
  if (detail) tile.append(el('div', { class: 'kpi-delta' }, detail));
  return tile;
}

function renderKpis(report, relevance) {
  const { week, previousWeek, summary, unit } = report;
  const { topDeck, risers, bestWinRate } = summary;
  // A week in progress keeps growing: its volume isn't comparable with a full week yet
  let volumeChange = null;
  if (!week.complete) volumeChange = 'Semaine en cours · mise à jour chaque matin';
  else if (previousWeek?.sampleSize) {
    volumeChange = `${formatDelta((100 * (week.sampleSize - previousWeek.sampleSize)) / previousWeek.sampleSize)} % vs semaine précédente`;
  }

  // Too little data: only the volume, with the reason; the other figures would mean nothing
  if (!relevance.week.ok) {
    $('kpis').replaceChildren(kpi(unit.played, formatInt(week.sampleSize), relevance.week.reason));
    return;
  }
  const tiles = [kpi(unit.played, formatInt(week.sampleSize), volumeChange)];
  if (topDeck) {
    tiles.push(kpi('Deck le plus joué', topDeck, `${formatPct(topDeck.playRate)} des decks`));
  }
  tiles.push(
    risers[0]
      ? kpi(
          'Plus forte hausse',
          risers[0],
          `${formatDelta(risers[0].deltaPlayRate)} pt de popularité`,
        )
      : kpi(
          'Plus forte hausse',
          '—',
          previousWeek ? 'Aucun deck ne bouge de plus de 0,5 pt' : 'Pas de semaine précédente',
        ),
  );
  if (bestWinRate) {
    tiles.push(
      kpi(
        'Meilleur win rate',
        bestWinRate,
        `${formatPct(bestWinRate.winRate)} · IC 95 % ${formatPct(bestWinRate.ci[0])}–${formatPct(bestWinRate.ci[1])}`,
      ),
    );
  }
  $('kpis').replaceChildren(...tiles);
}

// --- Table views: every chart has an equivalent readable without colour or hover ---

const capitalize = (text) => text.charAt(0).toUpperCase() + text.slice(1);

function table(headers, rows) {
  const node = el('table');
  const head = node.createTHead().insertRow();
  // Values are text, or nodes (a deck's chips)
  const cell = (tag, attrs, value) => {
    const node = el(tag, attrs);
    node.append(value);
    return node;
  };
  for (const label of headers) head.append(cell('th', { scope: 'col' }, label));
  const body = node.createTBody();
  for (const row of rows) {
    const tr = body.insertRow();
    row.forEach((value, i) =>
      tr.append(i === 0 ? cell('th', { scope: 'row' }, value) : cell('td', {}, value)),
    );
  }
  return node;
}

function metaTableView(report) {
  return table(
    ['Deck', 'Popularité', 'Δ pts vs S−1', 'Win rate', 'IC 95 %', capitalize(report.unit.many)],
    report.decks.map((d) => [
      chips(d.colors),
      formatPct(d.playRate),
      d.deltaPlayRate == null ? 'nouveau' : formatDelta(d.deltaPlayRate),
      formatPct(d.winRate),
      `${formatPct(d.ci[0])} – ${formatPct(d.ci[1])}`,
      formatInt(d.games),
    ]),
  );
}

function evolutionTableView(report) {
  return table(
    ['Deck', ...report.trend.weeks.map((w) => `${formatDay(w)} · popularité / win rate`)],
    report.decks.map((d) => [
      chips(d.colors),
      ...d.history.map((p) => `${formatPct(p.playRate)} / ${formatPct(p.winRate)}`),
    ]),
  );
}

function matchupTableView(report) {
  const { decks, cells } = report.matchups;
  const byKey = new Map(cells.map((c) => [`${c.row}|${c.col}`, c]));
  return table(
    ['Deck \\ contre', ...decks.map((d) => chips(d.colors))],
    decks.map((row) => [
      chips(row.colors),
      ...decks.map((col) => {
        const cell = byKey.get(`${row.key}|${col.key}`);
        if (cell.mirror) return 'miroir';
        if (cell.winRate == null) return '—';
        return `${formatPct(cell.winRate, 0)} (${formatInt(cell.games)})`;
      }),
    ]),
  );
}

function moversTableView(report) {
  const flat = (change) => (change.signal === 'flat' ? ' (bruit)' : '');
  return table(
    ['Deck', 'Popularité S−1', 'Popularité', 'Δ pts', 'Win rate S−1', 'Win rate', 'Δ pts'],
    report.decks
      .filter((d) => d.previous)
      .sort((a, b) => b.deltaPlayRate - a.deltaPlayRate)
      .map((d) => [
        chips(d.colors),
        formatPct(d.previous.playRate),
        formatPct(d.playRate),
        formatDelta(d.deltaPlayRate) + flat(d.playRateChange),
        formatPct(d.previous.winRate),
        formatPct(d.winRate),
        formatDelta(d.deltaWinRate) + flat(d.winRateChange),
      ]),
  );
}

function playDrawTableView(report) {
  return table(
    ['Deck', 'En commençant', 'En second', 'Écart', capitalize(report.unit.many)],
    report.decks.map((d) => {
      const { onPlay, onDraw } = d.playDraw;
      return [
        chips(d.colors),
        formatPct(onPlay.winRate),
        formatPct(onDraw.winRate),
        onPlay.winRate == null || onDraw.winRate == null
          ? '—'
          : `${formatDelta(onPlay.winRate - onDraw.winRate)} pts`,
        `${formatInt(Math.round(onPlay.games))} / ${formatInt(Math.round(onDraw.games))}`,
      ];
    }),
  );
}

function deckSheetTableView(report, key) {
  const byKey = new Map(report.matchups.cells.map((c) => [`${c.row}|${c.col}`, c]));
  return table(
    [
      'Contre',
      'Fréq.',
      'Win rate',
      'IC 95 %',
      'En commençant',
      'En second',
      capitalize(report.unit.many),
    ],
    report.decks.map((opponent) => {
      const cell = byKey.get(`${key}|${opponent.key}`);
      if (cell.mirror || cell.winRate == null) {
        return [
          chips(opponent.colors),
          formatPct(opponent.playRate),
          cell.mirror ? 'miroir' : '—',
          '—',
          '—',
          '—',
          formatInt(cell.games),
        ];
      }
      const ci = wilson((cell.winRate * cell.games) / 100, cell.games);
      return [
        chips(opponent.colors),
        formatPct(opponent.playRate),
        formatPct(cell.winRate),
        `${formatPct(ci[0])} – ${formatPct(ci[1])}`,
        formatPct(cell.onPlay?.winRate),
        formatPct(cell.onDraw?.winRate),
        formatInt(cell.games),
      ];
    }),
  );
}

// --- Charts ---

const openedTables = () =>
  new Set([...$('charts').querySelectorAll('details[open]')].map((d) => d.closest('figure').id));

function card({ id, svg, table: tableNode, controls }, opened) {
  const figure = el('figure', { class: 'card', id });
  if (controls) figure.append(controls);
  const details = el('details', { class: 'table-view' });
  if (opened.has(id)) details.open = true;
  const scroll = el('div', { class: 'table-scroll' });
  scroll.append(tableNode);
  details.append(el('summary', {}, 'Voir les données en tableau'), scroll);
  figure.append(svg, details);
  return figure;
}

/** Stand-in for a chart without enough data: its title and why it isn't shown. */
function emptyCard({ id, title, reason, controls }) {
  const figure = el('figure', { class: 'card card-empty', id });
  if (controls) figure.append(controls);
  figure.append(
    el('h2', { class: 'card-empty-title' }, title),
    el('p', { class: 'card-empty-reason' }, reason),
  );
  return figure;
}

/** The deck sheet card, with its deck picker; changing the deck redraws only this card. */
function deckSheetCard(report, theme, opened, relevance) {
  const { decks } = report;
  const key = decks.some((d) => d.key === state.deck) ? state.deck : decks[0].key;
  const select = el('select', { 'aria-label': 'Deck de la fiche' });
  // Options are text only: the inks as coloured-circle emoji
  select.replaceChildren(...decks.map((d) => el('option', { value: d.key }, deckEmoji(d.colors))));
  select.value = key;
  select.addEventListener('change', () => {
    state.deck = select.value === decks[0].key ? null : select.value;
    writeUrlState();
    const fresh = deckSheetCard(report, theme, openedTables(), relevance);
    $('fiche').replaceWith(fresh);
    fresh.querySelector('select').focus();
  });
  const controls = el('label', { class: 'card-control' });
  controls.append(el('span', {}, 'Deck'), select);
  // The picker stays: another deck may have enough games
  const check = relevance.deckSheet(key);
  if (!check.ok)
    return emptyCard({ id: 'fiche', title: 'Fiche deck', reason: check.reason, controls });
  return card(
    {
      id: 'fiche',
      svg: deckSheetChart(report, key, { document, theme }),
      table: deckSheetTableView(report, key),
      controls,
    },
    opened,
  );
}

function renderCharts(report, relevance) {
  const theme = darkQuery.matches ? themes.dark : themes.light;
  const container = $('charts');
  const opened = openedTables();

  // Built only when there is enough data to show them
  const charts = [
    {
      id: 'meta',
      title: 'Méta de la semaine',
      check: relevance.meta,
      svg: () => metaTableChart(report, { document, theme }),
      table: () => metaTableView(report),
    },
    {
      // Same figures as the meta table, placed on a map: same table view.
      id: 'carte',
      title: 'Carte du méta',
      check: relevance.map,
      svg: () => metaMapChart(report, { document, theme }),
      table: () => metaTableView(report),
    },
    {
      id: 'mouvements',
      title: 'Mouvements de la semaine',
      check: relevance.movers,
      svg: () => moversChart(report, { document, theme }),
      table: () => moversTableView(report),
    },
    {
      id: 'evolution',
      title: 'Évolution',
      check: relevance.evolution,
      svg: () => evolutionChart(report, { document, theme }),
      table: () => evolutionTableView(report),
    },
    {
      id: 'matchups',
      title: 'Matchups',
      check: relevance.matchups,
      svg: () => matchupsChart(report, { document, theme }),
      table: () => matchupTableView(report),
    },
    {
      id: 'premier',
      title: 'Commencer ou jouer en second',
      check: relevance.playDraw,
      svg: () => playDrawChart(report, { document, theme }),
      table: () => playDrawTableView(report),
    },
  ];

  const cards = charts.map(({ id, title, check, svg, table: tableView }) =>
    check.ok
      ? card({ id, svg: svg(), table: tableView() }, opened)
      : emptyCard({ id, title, reason: check.reason }),
  );
  // The deck sheet sits next to the matchup matrix.
  cards.splice(5, 0, deckSheetCard(report, theme, opened, relevance));
  container.replaceChildren(...cards);
}

function showError(error) {
  console.error(error);
  $('subtitle').textContent = 'Impossible de charger les données.';
  $('charts').replaceChildren(el('p', { class: 'error' }, error.message));
}

async function render() {
  const token = ++renderToken;
  // On reload, keep the previous render dimmed rather than an empty screen.
  if (lastReport) $('charts').classList.add('loading');
  try {
    const { index, snapshots } = await loadQueue(state.queue);
    if (token !== renderToken) return;
    if (state.week && !index.weeks.some((w) => w.startDate === state.week)) state.week = null;
    const report = buildReport({
      index,
      snapshots,
      weekStart: state.week ?? undefined,
      options: { matchupWeeks: state.matchupWeeks },
    });
    lastReport = report;
    fillWeekSelect(index, snapshots, report.unit, report.week.startDate);
    const collected = index.weeks.length > 1 ? 'semaines collectées' : 'semaine collectée';
    $('subtitle').textContent =
      `${report.queueName} · ${index.weeks.length} ${collected} · données duels.ink du ${formatUpdatedAt(report.week.updatedAt)}`;
    const relevance = chartRelevance(report);
    renderKpis(report, relevance);
    renderCharts(report, relevance);
  } catch (error) {
    showError(error);
  } finally {
    if (token === renderToken) $('charts').classList.remove('loading');
  }
}

// --- Single tooltip: first line = context, second line = the highlighted value ---

const tooltip = $('tooltip');

function showTip(target, x, y) {
  const [label, value, ...rest] = target.getAttribute('data-tip').split('\n');
  const nodes = [];
  if (value) nodes.push(el('strong', {}, value));
  nodes.push(el('div', {}, label));
  for (const line of rest) nodes.push(el('div', {}, line));
  tooltip.replaceChildren(...nodes);
  tooltip.hidden = false;
  placeTip(x, y);
}

function placeTip(x, y) {
  const { width, height } = tooltip.getBoundingClientRect();
  const left = x + 14 + width > window.innerWidth ? x - 14 - width : x + 14;
  const top = y + 14 + height > window.innerHeight ? y - 14 - height : y + 14;
  tooltip.style.left = `${Math.max(4, left)}px`;
  tooltip.style.top = `${Math.max(4, top)}px`;
}

const tipTarget = (event) => event.target.closest?.('[data-tip]');

document.addEventListener('pointerover', (event) => {
  const target = tipTarget(event);
  if (target) showTip(target, event.clientX, event.clientY);
});
document.addEventListener('pointermove', (event) => {
  if (!tooltip.hidden && tipTarget(event)) placeTip(event.clientX, event.clientY);
});
document.addEventListener('pointerout', (event) => {
  if (tipTarget(event)) tooltip.hidden = true;
});
document.addEventListener('focusin', (event) => {
  const target = tipTarget(event);
  if (!target) return;
  const rect = target.getBoundingClientRect();
  showTip(target, rect.right, rect.top);
});
document.addEventListener('focusout', () => {
  tooltip.hidden = true;
});

darkQuery.addEventListener('change', () => {
  if (lastReport) renderCharts(lastReport, chartRelevance(lastReport));
});

setupFilters().then(render, showError);
