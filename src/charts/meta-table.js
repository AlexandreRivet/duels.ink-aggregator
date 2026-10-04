/**
 * "Méta de la semaine" (meta of the week): one row per deck, most played first.
 * Play rate as bars, change vs the previous week, win rate with its 95% confidence
 * interval (the dot is only coloured when the gap to 50% is significant).
 */
import { max, min, scaleLinear } from 'd3';
import { formatDelta, formatInt, formatPct, formatWeekRange } from '../lib/format.js';
import { deckName } from '../lib/inks.js';
import {
  PAD,
  createSvg,
  deckLabel,
  finalize,
  footer,
  header,
  hitArea,
  horizontalBar,
  legendDot,
  middle,
} from './common.js';

const ROW_HEIGHT = 30;
const BAR_HEIGHT = 14;

export const SIGNAL_LABELS = {
  above: 'Au-dessus de 50 %',
  neutral: "Pas d'écart significatif",
  below: 'En dessous de 50 %',
};

export function metaTableChart(report, { document, theme, width = 800 }) {
  const { decks, week } = report;
  const title = 'Méta de la semaine';
  const svg = createSvg(document, { width, title, theme });

  let y = header(svg, {
    title,
    subtitle: `${report.queueName} · ${formatWeekRange(week.startDate, week.endDate)} · ${formatInt(
      week.totalGames,
    )} parties`,
    theme,
  });

  const col = {
    deck: PAD,
    bar: 230,
    barMax: 140,
    delta: 474,
    dotsFrom: 500,
    dotsTo: 640,
    winRate: 708,
    games: width - PAD,
  };

  const signalColor = {
    above: theme.positive,
    neutral: theme.neutral,
    below: theme.negative,
  };

  const playScale = scaleLinear()
    .domain([0, max(decks, (d) => d.playRate)])
    .range([0, col.barMax]);
  const lo = Math.min(
    48,
    min(decks, (d) => d.ci[0]),
  );
  const hi = Math.max(
    52,
    max(decks, (d) => d.ci[1]),
  );
  const winScale = scaleLinear()
    .domain([lo, hi])
    .nice()
    .range([col.dotsFrom, col.dotsTo])
    .clamp(true);

  // Column headers
  y += 14;
  const columnHeader = (x, label, anchor = 'start') =>
    svg
      .append('text')
      .attr('x', x)
      .attr('y', y)
      .attr('font-size', 11)
      .attr('font-weight', 500)
      .attr('fill', theme.muted)
      .attr('text-anchor', anchor)
      .text(label);
  columnHeader(col.deck, 'DECK');
  columnHeader(col.bar, 'POPULARITÉ');
  columnHeader(col.delta, 'Δ PTS', 'end');
  columnHeader(col.dotsFrom, 'WIN RATE · IC 95 %');
  columnHeader(col.games, 'PARTIES', 'end');

  const top = y + 10;
  const rowsHeight = decks.length * ROW_HEIGHT;

  // Win-rate gridlines, behind the rows
  // 3 ticks: on a wide scale (tiny samples, 0–100 %) more of them would collide.
  const ticks = winScale.ticks(3);
  const grid = svg.append('g');
  for (const t of ticks) {
    grid
      .append('line')
      .attr('x1', winScale(t))
      .attr('x2', winScale(t))
      .attr('y1', top)
      .attr('y2', top + rowsHeight)
      .attr('stroke', t === 50 ? theme.axis : theme.grid)
      .attr('stroke-width', 1);
    grid
      .append('text')
      .attr('x', winScale(t))
      .attr('y', top + rowsHeight + 14)
      .attr('font-size', 10)
      .attr('fill', theme.muted)
      .attr('text-anchor', 'middle')
      .text(formatPct(t, 0));
  }

  decks.forEach((deck, i) => {
    const rowTop = top + i * ROW_HEIGHT;
    const cy = rowTop + ROW_HEIGHT / 2;
    const row = svg.append('g');

    if (i > 0) {
      row
        .append('line')
        .attr('x1', PAD)
        .attr('x2', width - PAD)
        .attr('y1', rowTop)
        .attr('y2', rowTop)
        .attr('stroke', theme.grid);
    }

    deckLabel(row, deck, { x: col.deck, y: cy, theme });

    const barWidth = Math.max(2, playScale(deck.playRate));
    row
      .append('path')
      .attr('d', horizontalBar(col.bar, cy - BAR_HEIGHT / 2, barWidth, BAR_HEIGHT))
      .attr('fill', theme.accent);
    row
      .append('text')
      .attr('x', col.bar + barWidth + 6)
      .attr('y', cy + middle(12))
      .attr('font-size', 12)
      .attr('fill', theme.text2)
      .text(formatPct(deck.playRate));

    row
      .append('text')
      .attr('x', col.delta)
      .attr('y', cy + middle(12))
      .attr('font-size', 12)
      .attr('fill', deck.deltaPlayRate == null ? theme.muted : theme.text2)
      .attr('text-anchor', 'end')
      .text(deck.deltaPlayRate == null ? 'nouveau' : formatDelta(deck.deltaPlayRate));

    const color = signalColor[deck.signal];
    row
      .append('line')
      .attr('x1', winScale(deck.ci[0]))
      .attr('x2', winScale(deck.ci[1]))
      .attr('y1', cy)
      .attr('y2', cy)
      .attr('stroke', color)
      .attr('stroke-width', 2)
      .attr('stroke-linecap', 'round');
    row
      .append('circle')
      .attr('cx', winScale(deck.winRate))
      .attr('cy', cy)
      .attr('r', 5)
      .attr('fill', color)
      .attr('stroke', theme.surface)
      .attr('stroke-width', 2);

    row
      .append('text')
      .attr('x', col.winRate)
      .attr('y', cy + middle(13))
      .attr('font-size', 13)
      .attr('font-weight', 500)
      .attr('fill', theme.text)
      .attr('text-anchor', 'end')
      .text(formatPct(deck.winRate));
    row
      .append('text')
      .attr('x', col.games)
      .attr('y', cy + middle(12))
      .attr('font-size', 12)
      .attr('fill', theme.text2)
      .attr('text-anchor', 'end')
      .text(formatInt(deck.games));

    hitArea(row, {
      x: PAD,
      y: rowTop,
      width: width - 2 * PAD,
      height: ROW_HEIGHT,
      tip: [
        deckName(deck.colors),
        `${formatPct(deck.winRate)} de victoires`,
        `IC 95 % : ${formatPct(deck.ci[0])} – ${formatPct(deck.ci[1])}`,
        `${formatPct(deck.playRate)} des decks · ${formatInt(deck.games)} parties`,
        deck.deltaPlayRate == null
          ? 'Absent la semaine précédente'
          : `${formatDelta(deck.deltaPlayRate)} pt vs semaine précédente`,
      ],
    });
  });

  // Legend
  const ly = top + rowsHeight + 40;
  let lx = PAD;
  for (const signal of ['above', 'neutral', 'below']) {
    lx +=
      legendDot(svg, {
        x: lx,
        y: ly,
        color: signalColor[signal],
        label: SIGNAL_LABELS[signal],
        theme,
      }) + 20;
  }

  const height = footer(svg, {
    y: ly + 30,
    theme,
    updatedAt: week.updatedAt,
    totalGames: week.totalGames,
    note: 'Δ pts : évolution de la popularité vs la semaine précédente · trait : intervalle de confiance à 95 % du win rate',
  });
  return finalize(svg, height);
}
