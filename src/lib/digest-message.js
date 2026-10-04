/**
 * Text of the Discord message posted with the Monday charts (in French, for the team).
 */
import { SOURCE_URL } from '../config.js';
import { formatDelta, formatInt, formatPct, formatUpdatedAt, formatWeekRange } from './format.js';
import { deckName } from './inks.js';

export function buildDigestMessage(report) {
  const { week, previousWeek, summary } = report;
  const lines = [`## Méta ${report.queueName} · ${formatWeekRange(week.startDate, week.endDate)}`];

  let volume = `${formatInt(week.totalGames)} parties`;
  if (previousWeek?.totalGames) {
    const change = (100 * (week.totalGames - previousWeek.totalGames)) / previousWeek.totalGames;
    volume += ` (${formatDelta(change)} % vs semaine précédente)`;
  }
  lines.push(volume, '');

  const { topDeck, risers, fallers, bestWinRate } = summary;
  if (topDeck) {
    lines.push(`**Le plus joué** : ${deckName(topDeck.colors)} — ${formatPct(topDeck.playRate)}`);
  }
  const movers = (decks) =>
    decks.map((d) => `${deckName(d.colors)} (${formatDelta(d.deltaPlayRate)} pt)`).join(', ');
  if (risers.length) lines.push(`**En hausse** : ${movers(risers)}`);
  if (fallers.length) lines.push(`**En baisse** : ${movers(fallers)}`);
  if (bestWinRate) {
    lines.push(
      `**Meilleur win rate** : ${deckName(bestWinRate.colors)} — ${formatPct(
        bestWinRate.winRate,
      )} (IC 95 % ${formatPct(bestWinRate.ci[0])}–${formatPct(bestWinRate.ci[1])}, ${formatInt(
        bestWinRate.games,
      )} parties)`,
    );
  }

  lines.push('', `-# Source : <${SOURCE_URL}> · données du ${formatUpdatedAt(week.updatedAt)}`);
  return lines.join('\n');
}
