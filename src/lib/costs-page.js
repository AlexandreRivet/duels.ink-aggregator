/**
 * The local costs dashboard (npm run costs): one self-contained HTML file, the costs embedded,
 * rendered by a small inline script so it works opened from disk. In French, like the site.
 * Series colours: the first two slots of the validated categorical palette, in provider order.
 */

const STYLE = `
:root {
  color-scheme: light;
  --page: #f9f9f7;
  --surface: #fcfcfb;
  --text: #0b0b0b;
  --text-2: #52514e;
  --muted: #898781;
  --grid: #e1e0d9;
  --border: rgba(11, 11, 11, 0.1);
  --hover: rgba(11, 11, 11, 0.05);
  --series-anthropic: #2a78d6;
  --series-openai: #eb6834;
  --warning: #9a6700;
}
@media (prefers-color-scheme: dark) {
  :root {
    color-scheme: dark;
    --page: #0d0d0d;
    --surface: #1a1a19;
    --text: #f0efec;
    --text-2: #c3c2b7;
    --muted: #898781;
    --grid: #2c2c2a;
    --border: rgba(255, 255, 255, 0.1);
    --hover: rgba(255, 255, 255, 0.06);
    --series-anthropic: #3987e5;
    --series-openai: #d95926;
    --warning: #d4a72c;
  }
}
* { box-sizing: border-box; }
[hidden] { display: none !important; }
body {
  margin: 0;
  background: var(--page);
  color: var(--text);
  font: 14px/1.5 Inter, system-ui, -apple-system, 'Segoe UI', sans-serif;
}
a { color: var(--series-anthropic); }
main { max-width: 1100px; margin: 0 auto; padding: 32px 16px 48px; }
h1 { margin: 0; font-size: 28px; font-weight: 600; }
h2 { margin: 0 0 12px; font-size: 16px; font-weight: 600; }
.subtitle { margin: 4px 0 0; color: var(--text-2); }
.card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 20px 24px;
  margin-top: 16px;
}
.notice { border-color: var(--warning); }
.notice p { margin: 4px 0 0; color: var(--text-2); }
.notice code { font-size: 13px; }
.kpis {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 200px), 1fr));
  gap: 12px;
  margin-top: 24px;
}
.kpi { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 14px 16px; }
.kpi-label { color: var(--text-2); font-size: 13px; }
.kpi-value { font-size: 26px; font-weight: 600; font-variant-numeric: tabular-nums; }
.kpi-split { color: var(--muted); font-size: 12px; font-variant-numeric: tabular-nums; }
.legend { display: flex; flex-wrap: wrap; gap: 8px 20px; margin-bottom: 12px; color: var(--text-2); }
.legend-item { display: flex; align-items: center; gap: 8px; }
.swatch { width: 12px; height: 12px; border-radius: 3px; }
.legend-total { color: var(--text); font-weight: 600; font-variant-numeric: tabular-nums; }
.chart { position: relative; }
.chart svg { display: block; width: 100%; height: 280px; overflow: visible; }
.axis text { fill: var(--muted); font-size: 11px; font-variant-numeric: tabular-nums; }
.gridline { stroke: var(--grid); stroke-width: 1; }
.baseline { stroke: var(--muted); stroke-width: 1; }
.hit { fill: transparent; }
.hit:hover, .hit.active { fill: var(--hover); }
.tooltip {
  position: absolute;
  pointer-events: none;
  min-width: 170px;
  padding: 10px 12px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
  font-size: 13px;
}
.tooltip-date { font-weight: 600; margin-bottom: 4px; }
.tooltip-row { display: flex; align-items: center; gap: 8px; color: var(--text-2); }
.tooltip-row span:last-child { margin-left: auto; color: var(--text); font-variant-numeric: tabular-nums; }
.tooltip-total { border-top: 1px solid var(--border); margin-top: 6px; padding-top: 6px; }
.empty { color: var(--text-2); }
.tables { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 420px), 1fr)); gap: 16px; }
.tables .card { overflow-x: auto; }
table { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
th, td { padding: 6px 8px; text-align: right; border-bottom: 1px solid var(--border); white-space: nowrap; }
th:first-child, td:first-child, td.item { text-align: left; }
th { color: var(--text-2); font-weight: 500; }
tr:last-child td { border-bottom: 0; }
tfoot td { font-weight: 600; }
.provider-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 6px; }
footer { margin-top: 32px; color: var(--muted); font-size: 12px; }
`;

// Runs in the page: reads the embedded costs and renders everything
const SCRIPT = `
const costs = JSON.parse(document.getElementById('costs').textContent);
const $ = (id) => document.getElementById(id);
const DAY_MS = 86400000;
const number = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const usd = (v) => (v > 0 && v < 0.005 ? '< 0,01 $' : number.format(v) + ' $');
const dayLabel = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const longDay = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
const monthLabel = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const parse = (iso) => new Date(iso + 'T00:00:00Z');
const iso = (date) => date.toISOString().slice(0, 10);
const colour = (id) => 'var(--series-' + id + ')';

function el(tag, attrs = {}, text) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (text != null) node.textContent = text;
  return node;
}
function svgEl(tag, attrs = {}) {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}

const providers = costs.providers;
const live = providers.filter((p) => p.status === 'ok');
const days = [];
for (let t = parse(costs.start).getTime(); t <= parse(costs.end).getTime(); t += DAY_MS) days.push(iso(new Date(t)));
// Per day, per provider
const byDay = new Map(days.map((d) => [d, Object.fromEntries(providers.map((p) => [p.id, 0]))]));
for (const p of providers) for (const row of p.rows) if (byDay.has(row.date)) byDay.get(row.date)[p.id] += row.usd;
const dayTotal = (d) => providers.reduce((sum, p) => sum + byDay.get(d)[p.id], 0);
const sumOver = (list, id) => list.reduce((sum, d) => sum + (id ? byDay.get(d)[id] : dayTotal(d)), 0);

$('period').textContent = 'Du ' + dayLabel.format(parse(costs.start)) + ' au ' + dayLabel.format(parse(costs.end)) +
  ' · mis à jour le ' + new Date(costs.generatedAt).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });

// Providers without figures: why, and how to fix it
for (const p of providers.filter((p) => p.status !== 'ok')) {
  const card = el('section', { class: 'card notice' });
  card.append(el('h2', {}, p.name + (p.status === 'missing' ? ' : clé admin manquante' : ' : erreur')));
  const text = el('p');
  if (p.status === 'missing') {
    text.append('Ajoute ', el('code', {}, p.env), ' dans le fichier .env local (clé admin, différente de la clé API). ');
    const link = el('a', { href: p.console }, 'Créer une clé admin');
    text.append(link, '.');
  } else {
    text.textContent = p.error;
  }
  card.append(text);
  $('notices').append(card);
}

// No provider readable: nothing to add up, rather than zeros that read as "nothing spent"
if (!live.length) {
  for (const id of ['kpis', 'chart-card', 'tables']) $(id).hidden = true;
}

// Headline figures
const thisMonth = days.filter((d) => d.slice(0, 7) === costs.end.slice(0, 7));
const last30 = days.slice(-30);
const kpis = [
  ['Ce mois-ci', thisMonth],
  ['30 derniers jours', last30],
  ['Sur la période', days],
];
for (const [label, list] of kpis) {
  const box = el('div', { class: 'kpi' });
  box.append(el('div', { class: 'kpi-label' }, label), el('div', { class: 'kpi-value' }, usd(sumOver(list))));
  box.append(el('div', { class: 'kpi-split' }, live.map((p) => p.name + ' ' + usd(sumOver(list, p.id))).join(' · ')));
  $('kpis').append(box);
}
const average = el('div', { class: 'kpi' });
average.append(el('div', { class: 'kpi-label' }, 'Moyenne par jour (30 j)'), el('div', { class: 'kpi-value' }, usd(sumOver(last30) / last30.length)));
average.append(el('div', { class: 'kpi-split' }, 'soit ' + usd((sumOver(last30) / last30.length) * 30) + ' par mois'));
$('kpis').append(average);

// Legend: every provider with figures, with its total (identity never by colour alone)
for (const p of live) {
  const item = el('span', { class: 'legend-item' });
  const swatch = el('span', { class: 'swatch' });
  swatch.style.background = colour(p.id);
  item.append(swatch, p.name + ' · ' + p.usage, el('span', { class: 'legend-total' }, usd(sumOver(days, p.id))));
  $('legend').append(item);
}

const tooltip = $('tooltip');
function showTooltip(d, x) {
  tooltip.replaceChildren(el('div', { class: 'tooltip-date' }, longDay.format(parse(d))));
  for (const p of live) {
    const row = el('div', { class: 'tooltip-row' });
    const swatch = el('span', { class: 'swatch' });
    swatch.style.background = colour(p.id);
    row.append(swatch, el('span', {}, p.name), el('span', {}, usd(byDay.get(d)[p.id])));
    tooltip.append(row);
  }
  const total = el('div', { class: 'tooltip-row tooltip-total' });
  total.append(el('span', {}, 'Total'), el('span', {}, usd(dayTotal(d))));
  tooltip.append(total);
  tooltip.hidden = false;
  // Beside the column, on its right unless that runs off the chart, at the top of the plot
  const width = $('chart').getBoundingClientRect().width;
  const right = x + 16;
  tooltip.style.left = (right + tooltip.offsetWidth <= width ? right : Math.max(0, x - 16 - tooltip.offsetWidth)) + 'px';
  tooltip.style.top = '0px';
}

/** Rounded top corners only: the data end, anchored to the baseline. */
function topRounded(x, y, w, h, r) {
  r = Math.min(r, w / 2, h);
  return 'M' + x + ',' + (y + h) + 'V' + (y + r) + 'Q' + x + ',' + y + ' ' + (x + r) + ',' + y +
    'H' + (x + w - r) + 'Q' + (x + w) + ',' + y + ' ' + (x + w) + ',' + (y + r) + 'V' + (y + h) + 'Z';
}

/** A round step for the four gridlines above the baseline (0,10 $, 0,20 $…), covering v. */
function niceStep(v) {
  const raw = v > 0 ? v / 4 : 0.25;
  const unit = Math.pow(10, Math.floor(Math.log10(raw)));
  return [1, 2, 5, 10].map((m) => m * unit).find((m) => m >= raw);
}

function renderChart() {
  const svg = $('svg');
  svg.replaceChildren();
  const width = svg.clientWidth;
  const height = 280;
  const m = { top: 8, right: 4, bottom: 28, left: 56 };
  const innerW = width - m.left - m.right;
  const innerH = height - m.top - m.bottom;
  svg.setAttribute('viewBox', '0 0 ' + width + ' ' + height);
  const step = niceStep(Math.max(...days.map(dayTotal)));
  const max = step * 4;
  const y = (v) => m.top + innerH - (v / max) * innerH;
  const band = innerW / days.length;
  const barW = Math.max(1, band - 2);

  // Like the bars, the gridlines let the pointer through to the columns
  const axis = svgEl('g', { class: 'axis', 'pointer-events': 'none' });
  for (let i = 0; i <= 4; i++) {
    const v = step * i;
    axis.append(svgEl('line', { class: i ? 'gridline' : 'baseline', x1: m.left, x2: width - m.right, y1: y(v), y2: y(v) }));
    const label = svgEl('text', { x: m.left - 8, y: y(v) + 4, 'text-anchor': 'end' });
    label.textContent = usd(v);
    axis.append(label);
  }
  // A date label at each month start, or every 14 days on a short period
  days.forEach((d, i) => {
    const show = days.length > 45 ? d.endsWith('-01') : i % 7 === 0;
    if (!show) return;
    const label = svgEl('text', { x: m.left + i * band + band / 2, y: height - 8, 'text-anchor': 'middle' });
    label.textContent = dayLabel.format(parse(d));
    axis.append(label);
  });
  svg.append(axis);

  // The bars let the pointer through to the column under them
  const bars = svgEl('g', { 'pointer-events': 'none' });
  const hits = svgEl('g');
  days.forEach((d, i) => {
    const x = m.left + i * band + (band - barW) / 2;
    const parts = live.map((p) => ({ id: p.id, v: byDay.get(d)[p.id] })).filter((s) => s.v > 0);
    let base = 0;
    parts.forEach((s, j) => {
      const top = y(base + s.v);
      // A 2px surface gap between stacked segments
      let bottom = y(base) - (j > 0 ? 2 : 0);
      const h = Math.max(0, bottom - top);
      base += s.v;
      if (h <= 0) return;
      const last = j === parts.length - 1;
      bars.append(last
        ? svgEl('path', { d: topRounded(x, top, barW, h, 4), fill: colour(s.id) })
        : svgEl('rect', { x, y: top, width: barW, height: h, fill: colour(s.id) }));
    });
    // Hit target: the whole column, wider than the bar
    const hit = svgEl('rect', { class: 'hit', x: m.left + i * band, y: m.top, width: band, height: innerH });
    hit.addEventListener('mouseenter', () => showTooltip(d, m.left + i * band + band / 2));
    hit.addEventListener('mouseleave', () => (tooltip.hidden = true));
    hits.append(hit);
  });
  svg.prepend(hits);
  svg.append(bars);
  svg.setAttribute('aria-label', 'Coûts par jour et par fournisseur, ' + usd(sumOver(days)) + ' sur la période. Détail dans les tableaux.');
}

if (live.length && sumOver(days) > 0) {
  renderChart();
  new ResizeObserver(renderChart).observe($('chart'));
} else {
  $('chart').replaceChildren(el('p', { class: 'empty' }, live.length ? 'Aucun coût sur la période.' : 'Aucun fournisseur lisible : ajoute une clé admin.'));
}

// By month
const months = [...new Set(days.map((d) => d.slice(0, 7)))].reverse();
const monthHead = el('tr');
monthHead.append(el('th', {}, 'Mois'), ...live.map((p) => el('th', {}, p.name)), el('th', {}, 'Total'));
$('months').append(el('thead'));
$('months').tHead.append(monthHead);
const monthBody = el('tbody');
for (const month of months) {
  const list = days.filter((d) => d.startsWith(month));
  const row = el('tr');
  row.append(el('td', {}, monthLabel.format(parse(month + '-01'))), ...live.map((p) => el('td', {}, usd(sumOver(list, p.id)))), el('td', {}, usd(sumOver(list))));
  monthBody.append(row);
}
$('months').append(monthBody);

// By model / line item
const items = [];
for (const p of live) {
  const totals = new Map();
  for (const row of p.rows) if (byDay.has(row.date)) totals.set(row.item, (totals.get(row.item) ?? 0) + row.usd);
  for (const [item, total] of totals) items.push({ p, item, total });
}
items.sort((a, b) => b.total - a.total);
const all = sumOver(days);
const itemHead = el('tr');
itemHead.append(el('th', {}, 'Poste'), el('th', {}, 'Coût'), el('th', {}, 'Part'));
$('items').append(el('thead'));
$('items').tHead.append(itemHead);
const itemBody = el('tbody');
for (const { p, item, total } of items) {
  const row = el('tr');
  const name = el('td', { class: 'item' });
  const dot = el('span', { class: 'provider-dot' });
  dot.style.background = colour(p.id);
  name.append(dot, p.name + ' · ' + item);
  row.append(name, el('td', {}, usd(total)), el('td', {}, all ? Math.round((100 * total) / all) + ' %' : '—'));
  itemBody.append(row);
}
if (!items.length) {
  const row = el('tr');
  row.append(el('td', { colspan: 3, class: 'item' }, 'Aucun coût sur la période.'));
  itemBody.append(row);
}
$('items').append(itemBody);
`;

/** The page, the costs embedded as JSON (escaped so no "</script>" can close the tag). */
export function buildCostsPage(costs) {
  const data = JSON.stringify(costs).replace(/</g, '\\u003c');
  return `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light dark" />
    <title>Coûts des API</title>
    <style>${STYLE}</style>
  </head>
  <body>
    <main>
      <header>
        <h1>Coûts des API</h1>
        <p id="period" class="subtitle"></p>
      </header>
      <div id="notices"></div>
      <div id="kpis" class="kpis"></div>
      <section id="chart-card" class="card">
        <h2>Coût par jour</h2>
        <div id="legend" class="legend"></div>
        <div id="chart" class="chart">
          <svg id="svg" role="img"></svg>
          <div id="tooltip" class="tooltip" hidden></div>
        </div>
      </section>
      <div id="tables" class="tables">
        <section class="card">
          <h2>Par mois</h2>
          <table id="months"></table>
        </section>
        <section class="card">
          <h2>Par poste</h2>
          <table id="items"></table>
        </section>
      </div>
      <footer>
        Page locale générée par npm run costs, jamais publiée. Sources : rapports de coûts des API
        Admin d'Anthropic et d'OpenAI, par jour UTC. Le rapport d'Anthropic est quotidien : les
        coûts du jour en cours n'y apparaissent que le lendemain.
      </footer>
    </main>
    <script id="costs" type="application/json">${data}</script>
    <script>${SCRIPT}</script>
  </body>
</html>
`;
}
