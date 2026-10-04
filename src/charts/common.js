/**
 * Shared chart building blocks. Each chart builds a standalone <svg> from the given
 * `document`: the browser's for the page, jsdom's for the PNGs.
 * No text measurement (getBBox): jsdom can't do it, so widths are estimated.
 */
import { select } from 'd3';
import { SOURCE_URL } from '../config.js';
import { formatInt, formatUpdatedAt } from '../lib/format.js';
import { INKS, deckName } from '../lib/inks.js';
import { FONT_FAMILY } from './theme.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

export const PAD = 24;

/** Approximate width of a string in Inter (≈ 0.53 em per character). */
export const textWidth = (text, size) => text.length * size * 0.53;

/** Vertical offset that centres a line of text on `y`. */
export const middle = (size) => size * 0.35;

export function createSvg(document, { width, title, theme }) {
  const svg = select(document.createElementNS(SVG_NS, 'svg'))
    .attr('width', width)
    .attr('font-family', FONT_FAMILY)
    .attr('role', 'img');
  svg.append('title').text(title);
  svg.append('rect').attr('class', 'background').attr('width', width).attr('fill', theme.surface);
  return svg;
}

/** Sets the height once the layout is done. */
export function finalize(svg, height) {
  const width = Number(svg.attr('width'));
  svg.attr('height', height).attr('viewBox', `0 0 ${width} ${height}`);
  svg.select('rect.background').attr('height', height);
  return svg.node();
}

/** Title + subtitle. Returns the y coordinate available below. */
export function header(svg, { title, subtitle, theme }) {
  svg
    .append('text')
    .attr('x', PAD)
    .attr('y', PAD + 16)
    .attr('font-size', 20)
    .attr('font-weight', 600)
    .attr('fill', theme.text)
    .text(title);
  svg
    .append('text')
    .attr('x', PAD)
    .attr('y', PAD + 40)
    .attr('font-size', 13)
    .attr('fill', theme.text2)
    .text(subtitle);
  return PAD + 60;
}

/** Source line, required by the API's terms. Returns the final height. */
export function footer(svg, { y, theme, updatedAt, totalGames, note }) {
  const source = `Source : ${SOURCE_URL.replace('https://', '')} · données du ${formatUpdatedAt(
    updatedAt,
  )} · ${formatInt(totalGames)} parties`;
  let line = y;
  if (note) {
    svg
      .append('text')
      .attr('x', PAD)
      .attr('y', line)
      .attr('font-size', 11)
      .attr('fill', theme.muted)
      .text(note);
    line += 16;
  }
  svg
    .append('text')
    .attr('x', PAD)
    .attr('y', line)
    .attr('font-size', 11)
    .attr('fill', theme.muted)
    .text(source);
  return line + PAD - 8;
}

/** A deck's ink chips, vertically centred on `y`. Returns the width used. */
export function inkChips(parent, colors, { x, y, theme, r = 5 }) {
  const g = parent.append('g').attr('transform', `translate(${x},${y})`);
  colors.forEach((ink, i) => {
    g.append('circle')
      .attr('cx', r + i * (r * 2 - 1))
      .attr('cy', 0)
      .attr('r', r)
      .attr('fill', INKS[ink]?.color ?? theme.neutral)
      .attr('stroke', theme.surface)
      .attr('stroke-width', 1.5);
  });
  return r * 2 + (colors.length - 1) * (r * 2 - 1);
}

/** Ink chips + deck name. */
export function deckLabel(parent, deck, { x, y, theme, size = 13, weight = 400 }) {
  const chipsWidth = inkChips(parent, deck.colors, { x, y, theme });
  parent
    .append('text')
    .attr('x', x + chipsWidth + 7)
    .attr('y', y + middle(size))
    .attr('font-size', size)
    .attr('font-weight', weight)
    .attr('fill', theme.text)
    .text(deckName(deck.colors));
}

/**
 * Path of a horizontal bar: square at the baseline, rounded (4 px) at the tip.
 */
export function horizontalBar(x0, y, width, height, radius = 4) {
  const r = Math.min(radius, width / 2, height / 2);
  const x1 = x0 + width;
  return [
    `M${x0},${y}`,
    `H${x1 - r}`,
    `Q${x1},${y} ${x1},${y + r}`,
    `V${y + height - r}`,
    `Q${x1},${y + height} ${x1 - r},${y + height}`,
    `H${x0}`,
    'Z',
  ].join('');
}

/** Transparent hover area carrying the tooltip (web page only). */
export function hitArea(parent, { x, y, width, height, tip }) {
  return parent
    .append('rect')
    .attr('class', 'hit')
    .attr('x', x)
    .attr('y', y)
    .attr('width', width)
    .attr('height', height)
    .attr('fill', 'transparent')
    .attr('tabindex', 0)
    .attr('data-tip', tip.join('\n'));
}

/** Legend item: a coloured dot followed by a label. Returns its width. */
export function legendDot(parent, { x, y, color, label, theme }) {
  parent
    .append('circle')
    .attr('cx', x + 5)
    .attr('cy', y)
    .attr('r', 5)
    .attr('fill', color)
    .attr('stroke', theme.surface)
    .attr('stroke-width', 2);
  parent
    .append('text')
    .attr('x', x + 15)
    .attr('y', y + middle(12))
    .attr('font-size', 12)
    .attr('fill', theme.text2)
    .text(label);
  return 15 + textWidth(label, 12);
}
