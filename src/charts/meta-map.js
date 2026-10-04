/**
 * "Carte du méta" (meta map): one dot per deck, play rate across, win rate up, with an arrow
 * from where the deck stood the previous week. The 50% line and the median play rate split it
 * into quadrants: popular and strong (top right), rarely played but strong (top left), etc.
 * Dot colour: win rate significantly above / below 50% (the intervals are in the meta table).
 */
import { max, median, min, scaleLinear } from 'd3';
import { formatCount, formatPct, formatWeekRange } from '../lib/format.js';
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
 * above, below, then the four diagonals — that stays in the plot with the fewest collisions:
 * labels already placed weigh most, then dots, then arrows. Most played decks are placed first.
 */
function placeLabels(groups, bounds) {
  const dots = groups.map((g) => ({ x0: g.x - 7, x1: g.x + 7, y0: g.y - 7, y1: g.y + 7 }));
  const marks = groups.flatMap((g) => g.marks);
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
      // Further away, with a leader line: only when everything close by is taken
      ...[
        centred(g.x, g.y - 26),
        centred(g.x, g.y + 28),
        right(g.x + 14, g.y - 20),
        left(g.x - 14, g.y - 20),
        right(g.x + 14, g.y + 20),
        left(g.x - 14, g.y + 20),
      ].map((c) => ({ ...c, far: true })),
    ].map((c) => ({ ...c, y0: c.y - h / 2, y1: c.y + h / 2 }));
    const inside = candidates.filter(
      (c) => c.x0 >= bounds.x0 && c.x1 <= bounds.x1 && c.y0 >= bounds.y0 && c.y1 <= bounds.y1,
    );
    const ownDot = dots[groups.indexOf(g)];
    const cost = (c) =>
      (c.far ? 3 : 0) +
      10 * labels.filter((box) => overlaps(c, box)).length +
      5 * dots.filter((box) => box !== ownDot && overlaps(c, box)).length +
      // An arrow counts once however much of it the label covers
      new Set(marks.filter((box) => overlaps(c, box)).map((box) => box.arrow)).size;
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
      subtitle: `${report.queueName} · ${formatWeekRange(
        week.startDate,
        week.endDate,
      )} · flèche : depuis la semaine précédente`,
      theme,
    }) + 28;

  const signalColor = {
    above: theme.positive,
    neutral: theme.neutral,
    below: theme.negative,
  };

  const plot = { x0: PAD + LEFT, x1: width - PAD, y0: top, y1: top + PLOT_HEIGHT };
  const x = scaleLinear()
    .domain([0, max(decks, (d) => Math.max(d.playRate, d.previous?.playRate ?? 0)) * 1.05])
    .nice()
    .range([plot.x0, plot.x1]);
  const y = scaleLinear()
    .domain([
      Math.min(48, min(decks, (d) => Math.min(d.winRate, d.previous?.winRate ?? 100)) - 1),
      Math.max(52, max(decks, (d) => Math.max(d.winRate, d.previous?.winRate ?? 0)) + 1),
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
    from: deck.previous ? { x: x(deck.previous.playRate), y: y(deck.previous.winRate) } : null,
    label: deckName(deck.colors),
  }));

  /** Small boxes along a deck's arrow, so labels can avoid it. */
  const arrowMarks = (p) => {
    if (!p.from) return [];
    const length = Math.hypot(p.x - p.from.x, p.y - p.from.y);
    const steps = Math.floor(length / 6);
    return Array.from({ length: steps + 1 }, (_, k) => {
      const t = steps ? k / steps : 0;
      const mx = p.from.x + (p.x - p.from.x) * t;
      const my = p.from.y + (p.y - p.from.y) * t;
      return { x0: mx - 2, x1: mx + 2, y0: my - 2, y1: my + 2, arrow: p };
    });
  };

  // Tiny samples put several decks on the same spot (0 % or 100 %): one label for all of them.
  const groups = [];
  for (const p of points) {
    const group = groups.find((g) => Math.abs(g.x - p.x) < 2 && Math.abs(g.y - p.y) < 2);
    if (group) {
      group.label += ` · ${p.label}`;
      group.marks.push(...arrowMarks(p));
    } else {
      groups.push({
        x: p.x,
        y: p.y,
        playRate: p.deck.playRate,
        label: p.label,
        marks: arrowMarks(p),
      });
    }
  }

  // Arrows first, so every dot sits on top: from last week's position to this week's
  for (const p of points) {
    if (!p.from) continue;
    const dx = p.x - p.from.x;
    const dy = p.y - p.from.y;
    const length = Math.hypot(dx, dy);
    if (length < 10) continue;
    const ux = dx / length;
    const uy = dy / length;
    // Stop short of the dot, and draw the head by hand (no SVG markers needed)
    const tipX = p.x - ux * 7;
    const tipY = p.y - uy * 7;
    const arrow = svg.append('g').attr('opacity', 0.75);
    arrow
      .append('circle')
      .attr('cx', p.from.x)
      .attr('cy', p.from.y)
      .attr('r', 2.5)
      .attr('fill', 'none')
      .attr('stroke', theme.text2)
      .attr('stroke-width', 1.5);
    arrow
      .append('line')
      .attr('x1', p.from.x + ux * 2.5)
      .attr('y1', p.from.y + uy * 2.5)
      .attr('x2', tipX - ux * 5)
      .attr('y2', tipY - uy * 5)
      .attr('stroke', theme.text2)
      .attr('stroke-width', 1.5);
    arrow
      .append('path')
      .attr(
        'd',
        `M${tipX},${tipY}L${tipX - ux * 6 - uy * 3.5},${tipY - uy * 6 + ux * 3.5}L${
          tipX - ux * 6 + uy * 3.5
        },${tipY - uy * 6 - ux * 3.5}Z`,
      )
      .attr('fill', theme.text2);
  }

  const labels = placeLabels(groups, {
    x0: plot.x0 + 2,
    x1: plot.x1,
    y0: plot.y0 - 6,
    y1: plot.y1 - 2,
  });
  for (const g of groups) {
    const label = labels.get(g);
    if (label.far) {
      // Leader line from the dot to the nearest point of the label
      const nx = Math.min(Math.max(g.x, label.x0), label.x1);
      const ny = Math.min(Math.max(g.y, label.y0), label.y1);
      const d = Math.hypot(nx - g.x, ny - g.y);
      svg
        .append('line')
        .attr('x1', g.x + ((nx - g.x) / d) * 7)
        .attr('y1', g.y + ((ny - g.y) / d) * 7)
        .attr('x2', nx)
        .attr('y2', ny)
        .attr('stroke', theme.muted)
        .attr('stroke-width', 1);
    }
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
          deck.previous
            ? `Semaine précédente : ${formatPct(deck.previous.playRate)} des decks, ${formatPct(
                deck.previous.winRate,
              )} de victoires`
            : 'Absent la semaine précédente',
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
    note: 'Flèche : déplacement depuis la semaine précédente · en haut à droite : populaires et performants · en haut à gauche : peu joués mais performants',
  });
  return finalize(svg, height);
}
