/**
 * Whether each chart has enough data to say something. The page replaces a chart that doesn't
 * with a short note giving the reason; the Discord digest leaves it out.
 */
import { formatCount, formatInt } from './format.js';

const OK = { ok: true, reason: null };
const no = (reason) => ({ ok: false, reason });

/** Share of non-mirror matchup cells backed by enough games. */
function solidShare(cells, minGames) {
  const pairs = cells.filter((c) => !c.mirror);
  if (!pairs.length) return 0;
  return pairs.filter((c) => c.winRate != null && c.games >= minGames).length / pairs.length;
}

/** At least this share of the matchup cells must have enough games. */
const MIN_SOLID_SHARE = 0.5;

/**
 * @returns {{ week, meta, map, movers, evolution, matchups, playDraw, deckSheet: (key) => object }}
 *   each an `{ ok, reason }`
 */
export function chartRelevance(report) {
  const { options: opts, unit, week, previousWeek } = report;
  const min = opts.minWeekSample;
  const tooFew = (n, what) =>
    no(`Pas assez de données : ${formatCount(n, unit)} ${what} (minimum ${formatInt(min)})`);

  const weekOk = week.sampleSize >= min ? OK : tooFew(week.sampleSize, 'cette semaine');
  const gate = (check) => (weekOk.ok ? check() : weekOk);

  const matchupGate = (cells) => () => {
    const share = solidShare(cells, opts.minMatchupGames);
    return share >= MIN_SOLID_SHARE
      ? OK
      : no(
          `Pas assez de parties par matchup : ${Math.round(100 * share)} % des cases ont au moins ${opts.minMatchupGames} ${unit.many}`,
        );
  };

  return {
    week: weekOk,
    meta: weekOk,
    map: weekOk,
    movers: gate(() =>
      previousWeek
        ? OK
        : no(`Pas de semaine précédente assez fournie pour comparer (minimum ${formatInt(min)})`),
    ),
    evolution: gate(() =>
      report.trend.sampleSizes.filter((n) => n >= min).length >= 2
        ? OK
        : no('Pas encore deux semaines assez fournies pour montrer une évolution'),
    ),
    matchups: gate(matchupGate(report.matchups.cells)),
    playDraw:
      report.matchups.sampleSize >= min ? OK : tooFew(report.matchups.sampleSize, 'sur la période'),
    deckSheet: (key) => gate(matchupGate(report.matchups.cells.filter((c) => c.row === key))),
  };
}
