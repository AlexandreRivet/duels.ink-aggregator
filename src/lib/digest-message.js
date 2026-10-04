/**
 * Content of the Discord card posted with the Monday charts (in French, for the team).
 * Decks appear as their inks in coloured-circle emoji, like the chips in the charts.
 * Kept short on purpose: the charts carry the detail (intervals, counts, matchups).
 */
import { formatCount, formatDelta, formatPct, formatUpdatedAt, formatWeekRange } from './format.js';
import { deckEmoji } from './inks.js';

/** Rising / falling decks listed in the card, per direction. */
const MOVERS = 2;

export function buildDigestCard(report) {
  const { week, previousWeek, summary, unit } = report;
  const { topDeck, risers, fallers, bestWinRate } = summary;

  let volume = formatCount(week.sampleSize, unit);
  if (previousWeek?.sampleSize) {
    const change = (100 * (week.sampleSize - previousWeek.sampleSize)) / previousWeek.sampleSize;
    volume += ` (${formatDelta(change)} % vs S−1)`;
  }
  const movers = (decks) =>
    decks
      .slice(0, MOVERS)
      .map((d) => `${deckEmoji(d.colors)} ${formatDelta(d.deltaPlayRate)} pt`)
      .join(' · ');

  const lines = [volume];
  if (topDeck) {
    lines.push(`Le plus joué : ${deckEmoji(topDeck.colors)} ${formatPct(topDeck.playRate)}`);
  }
  if (risers.length) lines.push(`En hausse : ${movers(risers)}`);
  if (fallers.length) lines.push(`En baisse : ${movers(fallers)}`);
  if (bestWinRate) {
    lines.push(
      `Meilleur win rate : ${deckEmoji(bestWinRate.colors)} ${formatPct(bestWinRate.winRate)}`,
    );
  }

  return {
    title: `${report.queueName} · ${formatWeekRange(week.startDate, week.endDate)}`,
    description: lines.join('\n'),
    footer: `Données duels.ink du ${formatUpdatedAt(week.updatedAt)}`,
  };
}
