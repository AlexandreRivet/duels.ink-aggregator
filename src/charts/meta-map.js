/**
 * "Carte du méta" (meta map): one dot per deck, play rate across, win rate up, with the 95%
 * confidence interval as a vertical bar. The 50% line and the median play rate split it into
 * quadrants: popular and strong (top right), rarely played but strong (top left), etc.
 */
import { max, median, min, scaleLinear } from 'd3';
import { formatCount, formatDelta, formatPct, formatWeekRange } from '../lib/format.js';
import { deckName } from '../lib/inks.js';
import {
  PAD,
  createSvg,
  finalize,
  footer,
  header,
  legendDot,
  middle,
  textWidth,
} from './common.js';
import { SIGNAL_LABELS } from './meta-table.js';

const PLOT_HEIGHT = 400;
const LEFT = 64;
const LABEL_SIZE = 11;

// Boxes that merely touch (1px) don't count as overlapping.
const overlaps = (a, b) => a.x0 < b.x1 - 1 && b.x0 < a.x1 - 1 && a.y0 < b.y1 - 1 && b.y0 < a.y1 - 1;

/**
 * Places one label per dot (decks sharing a position share a label) on the side — right, left,
 * above, below, then the four diagonals — that stays in the plot with the fewest collisions: labels already placed weigh
 * most, then dots, then interval bars. Most played decks are placed first.
 */
function placeLabels(groups, bounds) {
  const dots = groups.map((g) => ({ x0: g.x - 7, x1: g.x + 7, y0: g.y - 7, y1: g.y + 7 }));
  const bars = groups.flatMap((g) => g.bars);
  const labels = [];
  const placed = new Map();
  for (const g of [...groups].sort((a, b) => b.playRate - a.playRate)) {
    const w = textWidth(g.label, LABEL_SIZE);
    const h = LABEL_SIZE + 2;
    const right = (x, y) => ({ x, y, anchor: 'start', x0: x, x1: x + w });
    const left = (x, y) => ({ x, y, anchor: 'end', x0: x - w, x1: x });
    const centred = (x, y) => ({ x, y, anchor: 'middle', x0: x - w / 2, x1: x + w / 2 });
    const candidates = [
      right(g.x + 9, g.y),
      left(g.x - 9, g.y),
      centred(g.x, g.y - 13),
      centred(g.x, g.y + 15),
      right(g.x + 6, g.y - 11),
      right(g.x + 6, g.y + 12),
      left(g.x - 6, g.y - 11),
      left(g.x - 6, g.y + 12),
    ].map((c) => ({ ...c, y0: c.y - h / 2, y1: c.y + h / 2 }));
    const inside = candidates.filter(
      (c) => c.x0 >= bounds.x0 && c.x1 <= bounds.x1 && c.y0 >= bounds.y0 && c.y1 <= bounds.y1,
    );
    const ownDot = dots[groups.indexOf(g)];
    const cost = (c) =>
      10 * labels.filter((box) => overlaps(c, box)).length +
      5 * dots.filter((box) => box !== ownDot && overlaps(c, box)).length +
      bars.filter((box) => overlaps(c, box)).length;
    // Stable sort: on equal cost, the earlier side (right first) wins.
    const choice = (inside.length ? inside : candidates)
      .map((c) => ({ c, cost: cost(c) }))
      .sort((a, b) => a.cost - b.cost)[0].c;
    labels.push(choice);
    placed.set(g, choice);
  }
  return placed;
}

export function metaMapChart(report, { document, theme, width = 800 }) {
  const { decks, week, unit } = report;
  const title = 'Carte du méta';
  const svg = createSvg(document, { width, title, theme });

  const top =
    header(svg, {
      title,
      subtitle: `Popularité et win rate de la semaine · ${report.queueName} · ${formatWeekRange(
        week.startDate,
        week.endDate,
      )}`,
      theme,
    }) + 28;

  const signalColor = {
    above: theme.positive,
    neutral: theme.neutral,
    below: theme.negative,
  };

  const plot = { x0: PAD + LEFT, x1: width - PAD, y0: top, y1: top + PLOT_HEIGHT };
  const x = scaleLinear()
    .domain([0, max(decks, (d) => d.playRate) * 1.05])
    .nice()
    .range([plot.x0, plot.x1]);
  const y = scaleLinear()
    .domain([
      Math.min(
        48,
        min(decks, (d) => d.ci[0]),
      ),
      Math.max(
        52,
        max(decks, (d) => d.ci[1]),
      ),
    ])
    .nice()
    .range([plot.y1, plot.y0])
    .clamp(true);

  const axisText = (selection) => selection.attr('font-size', 10).attr('fill', theme.muted);

  // Gridlines and axes
  for (const t of y.ticks(5)) {
    svg
      .append('line')
      .attr('x1', plot.x0)
      .attr('x2', plot.x1)
      .attr('y1', y(t))
      .attr('y2', y(t))
      .attr('stroke', t === 50 ? theme.axis : theme.grid);
    svg
      .append('text')
      .attr('x', plot.x0 - 8)
      .attr('y', y(t) + middle(10))
      .attr('text-anchor', 'end')
      .call(axisText)
      .text(formatPct(t, 0));
  }
  if (!y.ticks(5).includes(50)) {
    svg
      .append('line')
      .attr('x1', plot.x0)
      .attr('x2', plot.x1)
      .attr('y1', y(50))
      .attr('y2', y(50))
      .attr('stroke', theme.axis);
  }
  svg
    .append('line')
    .attr('x1', plot.x0)
    .attr('x2', plot.x1)
    .attr('y1', plot.y1)
    .attr('y2', plot.y1)
    .attr('stroke', theme.axis);
  for (const t of x.ticks(6)) {
    svg
      .append('text')
      .attr('x', x(t))
      .attr('y', plot.y1 + 16)
      .attr('text-anchor', 'middle')
      .call(axisText)
      .text(formatPct(t, 0));
  }
  svg
    .append('text')
    .attr('x', plot.x1)
    .attr('y', plot.y1 + 32)
    .attr('text-anchor', 'end')
    .attr('font-size', 11)
    .attr('fill', theme.text2)
    .text('Popularité →');
  svg
    .append('text')
    .attr('x', PAD)
    .attr('y', plot.y0 - 14)
    .attr('font-size', 11)
    .attr('fill', theme.text2)
    .text('↑ Win rate');

  // Median play rate: splits popular decks from the rarely played ones
  const medianPlayRate = median(decks, (d) => d.playRate);
  svg
    .append('line')
    .attr('x1', x(medianPlayRate))
    .attr('x2', x(medianPlayRate))
    .attr('y1', plot.y0)
    .attr('y2', plot.y1)
    .attr('stroke', theme.axis);
  svg
    .append('text')
    .attr('x', x(medianPlayRate))
    .attr('y', plot.y1 + 32)
    .attr('text-anchor', 'middle')
    .call(axisText)
    .text(`médiane ${formatPct(medianPlayRate)}`);

  const points = decks.map((deck) => ({
    deck,
    x: x(deck.playRate),
    y: y(deck.winRate),
    label: deckName(deck.colors),
  }));

  // Tiny samples put several decks on the same spot (0 % or 100 %): one label for all of them.
  const groups = [];
  for (const p of points) {
    const group = groups.find((g) => Math.abs(g.x - p.x) < 2 && Math.abs(g.y - p.y) < 2);
    const bar = { x0: p.x - 2, x1: p.x + 2, y0: y(p.deck.ci[1]), y1: y(p.deck.ci[0]) };
    if (group) {
      group.label += ` · ${p.label}`;
      group.bars.push(bar);
    } else {
      groups.push({ x: p.x, y: p.y, playRate: p.deck.playRate, label: p.label, bars: [bar] });
    }
  }

  // Intervals first, so every dot sits on top of every bar
  for (const p of points) {
    svg
      .append('line')
      .attr('x1', p.x)
      .attr('x2', p.x)
      .attr('y1', y(p.deck.ci[0]))
      .attr('y2', y(p.deck.ci[1]))
      .attr('stroke', signalColor[p.deck.signal])
      .attr('stroke-opacity', 0.45)
      .attr('stroke-width', 2)
      .attr('stroke-linecap', 'round');
  }

  const labels = placeLabels(groups, {
    x0: plot.x0 + 2,
    x1: plot.x1,
    y0: plot.y0 - 6,
    y1: plot.y1 - 2,
  });
  for (const g of groups) {
    const label = labels.get(g);
    svg
      .append('text')
      .attr('x', label.x)
      .attr('y', label.y + middle(LABEL_SIZE))
      .attr('text-anchor', label.anchor)
      .attr('font-size', LABEL_SIZE)
      .attr('fill', theme.text)
      .attr('pointer-events', 'none')
      .text(g.label);
  }

  for (const p of points) {
    const { deck } = p;
    svg
      .append('circle')
      .attr('cx', p.x)
      .attr('cy', p.y)
      .attr('r', 5)
      .attr('fill', signalColor[deck.signal])
      .attr('stroke', theme.surface)
      .attr('stroke-width', 2);
    // 24px hit target around the dot, carrying the tooltip on the page
    svg
      .append('circle')
      .attr('class', 'hit')
      .attr('cx', p.x)
      .attr('cy', p.y)
      .attr('r', 12)
      .attr('fill', 'transparent')
      .attr('tabindex', 0)
      .attr(
        'data-tip',
        [
          p.label,
          `${formatPct(deck.winRate)} de victoires`,
          `IC 95 % : ${formatPct(deck.ci[0])} – ${formatPct(deck.ci[1])}`,
          `${formatPct(deck.playRate)} des decks · ${formatCount(deck.games, unit)}`,
          deck.deltaPlayRate == null
            ? 'Absent la semaine précédente'
            : `${formatDelta(deck.deltaPlayRate)} pt vs semaine précédente`,
        ].join('\n'),
      );
  }

  // Legend
  const ly = plot.y1 + 60;
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
    sampleSize: week.sampleSize,
    unit,
    note: 'En haut à droite : populaires et performants · en haut à gauche : peu joués mais performants · trait : IC 95 %',
  });
  return finalize(svg, height);
}
