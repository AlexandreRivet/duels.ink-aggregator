/**
 * Week-by-week trends as small multiples: one panel per deck, all on the same scale
 * so heights compare at a glance.
 * metric = 'playRate' or 'winRate' (with a confidence-interval band).
 */
import { area, extent, line, max, scaleLinear } from 'd3';
import { formatDay, formatDelta, formatInt, formatPct } from '../lib/format.js';
import { deckName } from '../lib/inks.js';
import { PAD, createSvg, deckLabel, finalize, footer, header, hitArea, middle } from './common.js';

const COLUMNS = 3;
const GAP_X = 24;
const GAP_Y = 22;
const PANEL_HEADER = 42;
const PLOT_HEIGHT = 84;
const GUTTER = 34;

const METRICS = {
  playRate: {
    title: (n) => `Popularité — ${n} dernières semaines`,
    subtitle: 'Part des decks joués chaque semaine · même échelle pour tous les decks',
    value: (deck) => deck.playRate,
  },
  winRate: {
    title: (n) => `Win rate — ${n} dernières semaines`,
    subtitle: 'Win rate hebdomadaire · bande : intervalle de confiance à 95 % · repère à 50 %',
    value: (deck) => deck.winRate,
  },
};

export function trendsChart(
  report,
  { document, theme, metric = 'playRate', width = 800, decks: count },
) {
  const spec = METRICS[metric];
  const { weeks, eraMarkers } = report.trend;
  const decks = report.decks.slice(0, count ?? report.options.trendDecks);
  const title = spec.title(weeks.length);
  const svg = createSvg(document, { width, title, theme });

  const eraNote = eraMarkers.length
    ? ` · trait vertical : sortie du ${eraMarkers.map((e) => e.name).join(', ')}`
    : '';
  const top = header(svg, { title, subtitle: spec.subtitle + eraNote, theme }) + 8;

  const panelWidth = (width - 2 * PAD - (COLUMNS - 1) * GAP_X) / COLUMNS;
  const panelHeight = PANEL_HEADER + PLOT_HEIGHT + 18;

  const points = decks.flatMap((d) => d.history);
  let domain;
  if (metric === 'playRate') {
    domain = [0, max(points, (p) => p.playRate)];
  } else {
    const bounds = points.filter((p) => p.ci).flatMap((p) => p.ci);
    const [lo, hi] = extent(bounds);
    domain = [Math.min(lo, 48), Math.max(hi, 52)];
  }
  const y = scaleLinear().domain(domain).nice(3).range([PLOT_HEIGHT, 0]).clamp(true);
  const yTicks = y.ticks(3);

  decks.forEach((deck, i) => {
    const px = PAD + (i % COLUMNS) * (panelWidth + GAP_X);
    const py = top + Math.floor(i / COLUMNS) * (panelHeight + GAP_Y);
    const panel = svg.append('g').attr('transform', `translate(${px},${py})`);
    const plotLeft = GUTTER;
    const plotRight = panelWidth - 6;
    const x = scaleLinear()
      .domain([0, Math.max(1, weeks.length - 1)])
      .range([plotLeft, plotRight]);
    const plot = panel.append('g').attr('transform', `translate(0,${PANEL_HEADER})`);

    // Panel header: deck on the left, latest value and change on the right
    deckLabel(panel, deck, { x: 0, y: 9, theme, weight: 500 });
    panel
      .append('text')
      .attr('x', panelWidth)
      .attr('y', 9 + middle(15))
      .attr('font-size', 15)
      .attr('font-weight', 600)
      .attr('fill', theme.text)
      .attr('text-anchor', 'end')
      .text(formatPct(spec.value(deck)));
    const sub =
      metric === 'playRate'
        ? deck.deltaPlayRate == null
          ? 'nouveau'
          : `${formatDelta(deck.deltaPlayRate)} pt vs S−1`
        : `IC ${formatPct(deck.ci[0], 0)}–${formatPct(deck.ci[1], 0)}`;
    panel
      .append('text')
      .attr('x', panelWidth)
      .attr('y', 27 + middle(11))
      .attr('font-size', 11)
      .attr('fill', theme.text2)
      .attr('text-anchor', 'end')
      .text(sub);

    for (const t of yTicks) {
      const isBaseline = metric === 'winRate' ? t === 50 : t === 0;
      plot
        .append('line')
        .attr('x1', plotLeft)
        .attr('x2', plotRight)
        .attr('y1', y(t))
        .attr('y2', y(t))
        .attr('stroke', isBaseline ? theme.axis : theme.grid);
      plot
        .append('text')
        .attr('x', plotLeft - 6)
        .attr('y', y(t) + middle(10))
        .attr('font-size', 10)
        .attr('fill', theme.muted)
        .attr('text-anchor', 'end')
        .text(formatPct(t, 0));
    }
    if (metric === 'winRate' && !yTicks.includes(50)) {
      plot
        .append('line')
        .attr('x1', plotLeft)
        .attr('x2', plotRight)
        .attr('y1', y(50))
        .attr('y2', y(50))
        .attr('stroke', theme.axis);
    }

    for (const era of eraMarkers) {
      const ex = x(era.position);
      plot
        .append('line')
        .attr('x1', ex)
        .attr('x2', ex)
        .attr('y1', 0)
        .attr('y2', PLOT_HEIGHT)
        .attr('stroke', theme.axis);
      if (i === 0) {
        plot
          .append('text')
          .attr('x', ex + 4)
          .attr('y', 8)
          .attr('font-size', 10)
          .attr('fill', theme.muted)
          .text(era.name);
      }
    }

    const history = deck.history.map((p, idx) => ({ ...p, idx }));
    if (metric === 'playRate') {
      plot
        .append('path')
        .attr(
          'd',
          area()
            .x((p) => x(p.idx))
            .y0(y(0))
            .y1((p) => y(p.playRate))(history),
        )
        .attr('fill', theme.accent)
        .attr('fill-opacity', 0.1);
    } else {
      plot
        .append('path')
        .attr(
          'd',
          area()
            .defined((p) => p.ci)
            .x((p) => x(p.idx))
            .y0((p) => y(p.ci[0]))
            .y1((p) => y(p.ci[1]))(history),
        )
        .attr('fill', theme.accent)
        .attr('fill-opacity', 0.14);
    }

    const value = (p) => (metric === 'playRate' ? p.playRate : p.winRate);
    plot
      .append('path')
      .attr(
        'd',
        line()
          .defined((p) => value(p) != null)
          .x((p) => x(p.idx))
          .y((p) => y(value(p)))(history),
      )
      .attr('fill', 'none')
      .attr('stroke', theme.accent)
      .attr('stroke-width', 2)
      .attr('stroke-linejoin', 'round')
      .attr('stroke-linecap', 'round');

    const last = history.findLast((p) => value(p) != null);
    if (last) {
      plot
        .append('circle')
        .attr('cx', x(last.idx))
        .attr('cy', y(value(last)))
        .attr('r', 4)
        .attr('fill', theme.accent)
        .attr('stroke', theme.surface)
        .attr('stroke-width', 2);
    }

    const labelY = PLOT_HEIGHT + 14;
    plot
      .append('text')
      .attr('x', plotLeft)
      .attr('y', labelY)
      .attr('font-size', 10)
      .attr('fill', theme.muted)
      .text(formatDay(weeks[0]));
    plot
      .append('text')
      .attr('x', plotRight)
      .attr('y', labelY)
      .attr('font-size', 10)
      .attr('fill', theme.muted)
      .attr('text-anchor', 'end')
      .text(formatDay(weeks.at(-1)));

    // One hover area per week: readers aim at a date, not at a 2px line
    const step = weeks.length > 1 ? x(1) - x(0) : plotRight - plotLeft;
    for (const p of history) {
      const detail =
        metric === 'playRate'
          ? `${formatPct(p.playRate)} des decks`
          : p.winRate == null
            ? 'Pas de parties'
            : `${formatPct(p.winRate)} de victoires`;
      const extra =
        metric === 'winRate' && p.ci
          ? `IC 95 % : ${formatPct(p.ci[0])} – ${formatPct(p.ci[1])} · ${formatInt(p.games)} parties`
          : `${formatInt(p.games)} parties`;
      hitArea(plot, {
        x: Math.max(plotLeft - step / 2, x(p.idx) - step / 2),
        y: 0,
        width: step,
        height: PLOT_HEIGHT,
        tip: [`${deckName(deck.colors)} · semaine du ${formatDay(p.startDate)}`, detail, extra],
      });
    }
  });

  const rows = Math.ceil(decks.length / COLUMNS);
  const bottom = top + rows * panelHeight + (rows - 1) * GAP_Y + 24;
  const height = footer(svg, {
    y: bottom,
    theme,
    updatedAt: report.week.updatedAt,
    totalGames: report.trend.totalGames,
    note: `Semaines du ${formatDay(weeks[0])} au ${formatDay(report.trend.endDate)} · les ${decks.length} decks les plus joués la dernière semaine`,
  });
  return finalize(svg, height);
}
