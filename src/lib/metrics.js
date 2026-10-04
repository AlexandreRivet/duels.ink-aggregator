/**
 * Computations on the weekly snapshots, shared by the digest (Node) and the web page.
 * Pure functions: no dependency on the file system or the DOM.
 */
import { config as defaults } from '../config.js';
import { UNITS } from './format.js';
import { deckKey } from './inks.js';

const DAY_MS = 86_400_000;

/** 95% Wilson confidence interval, as percentages. */
export function wilson(wins, n, z = 1.96) {
  if (!n) return [NaN, NaN];
  const p = wins / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  return [100 * (center - half), 100 * (center + half)];
}

/**
 * 95% interval (Wald) of the difference between two proportions x1/n1 and x2/n2, in points.
 * `z` can be raised to be stricter, e.g. when many differences are tested at once.
 */
export function differenceCI(x1, n1, x2, n2, z = 1.96) {
  if (!n1 || !n2) return [NaN, NaN];
  const p1 = x1 / n1;
  const p2 = x2 / n2;
  const half = z * Math.sqrt((p1 * (1 - p1)) / n1 + (p2 * (1 - p2)) / n2);
  return [100 * (p1 - p2 - half), 100 * (p1 - p2 + half)];
}

/** Direction of a change whose interval excludes 0, or 'flat' when it is within the noise. */
export function changeSignal(ci) {
  if (ci[0] > 0) return 'up';
  if (ci[1] < 0) return 'down';
  return 'flat';
}

/** Where the win rate sits relative to 50%, accounting for uncertainty. */
export function winRateSignal(ci) {
  if (ci[0] > 50) return 'above';
  if (ci[1] < 50) return 'below';
  return 'neutral';
}

/** Sums the counters of several weekly snapshots. */
export function aggregate(snapshots) {
  const decks = new Map();
  const matchups = new Map();
  let updatedAt = null;

  for (const snapshot of snapshots) {
    if (!updatedAt || snapshot.updatedAt > updatedAt) updatedAt = snapshot.updatedAt;

    for (const pair of snapshot.colorPairs) {
      const key = deckKey(pair.colors);
      const deck = decks.get(key) ?? { key, colors: pair.colors, games: 0, wins: 0 };
      deck.games += pair.games;
      deck.wins += pair.wins;
      decks.set(key, deck);
    }

    for (const m of snapshot.matchups) {
      const a = deckKey(m.colorsA);
      const b = deckKey(m.colorsB);
      const row = matchups.get(`${a}|${b}`) ?? {
        a,
        b,
        games: 0,
        winsA: 0,
        firstPlayerGames: 0,
        firstPlayerWins: 0,
      };
      row.games += m.games;
      row.winsA += m.winsA;
      row.firstPlayerGames += m.firstPlayerGames;
      // The API only gives the rate: rebuild the number of wins.
      row.firstPlayerWins += ((m.firstPlayerWinRate ?? 0) * m.firstPlayerGames) / 100;
      matchups.set(`${a}|${b}`, row);
    }
  }

  return { updatedAt, decks, matchups };
}

/** True for BO3 queues, where decks and matchups are counted in matches rather than games. */
export function countsMatches(index) {
  return (index.gameMode ?? (index.queue.includes('bo3') ? 'bo3' : 'bo1')) === 'bo3';
}

/**
 * A week's sample size in the queue's unit. In BO3 queues activity.totalGames counts single
 * games while decks and matchups count matches; each match has two decks, so matches = deck
 * counts / 2.
 */
export function sampleSize(snapshot, perMatch) {
  if (!perMatch) return snapshot.totalGames;
  return snapshot.colorPairs.reduce((total, pair) => total + pair.games, 0) / 2;
}

/**
 * Play rate, win rate and confidence interval per deck, most played first.
 * Play rate is the share of decks played: each game counts two decks.
 */
export function deckStats(agg) {
  let seats = 0;
  for (const deck of agg.decks.values()) seats += deck.games;

  return [...agg.decks.values()]
    .map((deck) => {
      const ci = wilson(deck.wins, deck.games);
      return {
        ...deck,
        playRate: (100 * deck.games) / seats,
        winRate: (100 * deck.wins) / deck.games,
        ci,
        signal: winRateSignal(ci),
      };
    })
    .sort((x, y) => y.playRate - x.playRate);
}

/**
 * Matchup from deck `row`'s point of view against deck `col`.
 * The API stores each pair once (A < B): flip the numbers when `row` is side B.
 * Draws, which are very rare, then count as wins for B.
 */
export function matchupFor(agg, row, col) {
  const direct = agg.matchups.get(`${row}|${col}`);
  if (direct) {
    return {
      games: direct.games,
      wins: direct.winsA,
      onPlay: { games: direct.firstPlayerGames, wins: direct.firstPlayerWins },
      onDraw: {
        games: direct.games - direct.firstPlayerGames,
        wins: direct.winsA - direct.firstPlayerWins,
      },
    };
  }

  const flipped = agg.matchups.get(`${col}|${row}`);
  if (!flipped) return null;
  const drawGamesA = flipped.games - flipped.firstPlayerGames;
  const drawWinsA = flipped.winsA - flipped.firstPlayerWins;
  return {
    games: flipped.games,
    wins: flipped.games - flipped.winsA,
    onPlay: { games: drawGamesA, wins: drawGamesA - drawWinsA },
    onDraw: {
      games: flipped.firstPlayerGames,
      wins: flipped.firstPlayerGames - flipped.firstPlayerWins,
    },
  };
}

const rate = ({ games, wins }) => (games > 0 ? (100 * wins) / games : null);

/**
 * A deck's results when it goes first and when it goes second, summed over its matchup rows.
 * A mirror game is counted once, from seat A, which is a random seat.
 */
export function playDrawFor(agg, key) {
  const onPlay = { games: 0, wins: 0 };
  const onDraw = { games: 0, wins: 0 };
  for (const row of agg.matchups.values()) {
    if (row.a !== key && row.b !== key) continue;
    const m = matchupFor(agg, key, row.a === key ? row.b : row.a);
    onPlay.games += m.onPlay.games;
    onPlay.wins += m.onPlay.wins;
    onDraw.games += m.onDraw.games;
    onDraw.wins += m.onDraw.wins;
  }
  const withRate = (c) => ({ ...c, winRate: rate(c), ci: wilson(c.wins, c.games) });
  return { onPlay: withRate(onPlay), onDraw: withRate(onDraw) };
}

/** Share of games won by the player who goes first (in BO3: who starts game 1). */
export function firstPlayerWinRate(agg) {
  let games = 0;
  let wins = 0;
  for (const row of agg.matchups.values()) {
    games += row.games;
    // A's wins on the play, plus B's wins on the play (games A started second and didn't win).
    wins +=
      row.firstPlayerWins + (row.games - row.firstPlayerGames) - (row.winsA - row.firstPlayerWins);
  }
  return games ? (100 * wins) / games : null;
}

/**
 * A deck's change since the previous week: last week's figures, the changes in points with
 * their 95% interval, and whether each change stands out from the noise.
 */
function weekOverWeek(deck, prev, seats, previousSeats) {
  if (!prev) {
    return { previous: null, deltaWinRate: null, playRateChange: null, winRateChange: null };
  }
  const playRateCI = differenceCI(deck.games, seats, prev.games, previousSeats);
  const winRateCI = differenceCI(deck.wins, deck.games, prev.wins, prev.games);
  return {
    previous: { playRate: prev.playRate, winRate: prev.winRate, ci: prev.ci, games: prev.games },
    deltaWinRate: deck.winRate - prev.winRate,
    playRateChange: { ci: playRateCI, signal: changeSignal(playRateCI) },
    winRateChange: { ci: winRateCI, signal: changeSignal(winRateCI) },
  };
}

/** Minimum games this week for a matchup to be compared with the weeks before. */
const MIN_WEEK_GAMES = 30;
/** Matchups need a clear move: ~100 cells are tested each week, so ~99.7% and ≥ 5 points. */
const MATCHUP_TREND_Z = 3;
const MATCHUP_TREND_MIN_POINTS = 5;

/**
 * Whether a matchup did clearly better (up) or worse (down) this week than over the earlier
 * weeks of the window, with both figures.
 */
function matchupTrend(weekAgg, priorAgg, row, col, minGames) {
  const none = { trend: null, thisWeek: null, before: null };
  if (!priorAgg || row === col) return none;
  const now = matchupFor(weekAgg, row, col);
  const before = matchupFor(priorAgg, row, col);
  if (!now || !before || now.games < MIN_WEEK_GAMES || before.games < minGames) return none;
  const ci = differenceCI(now.wins, now.games, before.wins, before.games, MATCHUP_TREND_Z);
  const delta = rate(now) - rate(before);
  const signal = changeSignal(ci);
  return {
    trend: signal !== 'flat' && Math.abs(delta) >= MATCHUP_TREND_MIN_POINTS ? signal : null,
    thisWeek: { games: now.games, winRate: rate(now) },
    before: { games: before.games, winRate: rate(before) },
  };
}

/** Era (card set) in force at the end of a week. */
function eraAt(eras, isoDay) {
  return eras.filter((era) => era.startedAt.slice(0, 10) <= isoDay).at(-1) ?? null;
}

/**
 * Position of a dated event on an axis where point i stands for the middle of week i.
 */
function weekAxisPosition(weekStarts, isoDateTime) {
  const t = new Date(isoDateTime).getTime();
  const i = weekStarts.findLastIndex((start) => new Date(`${start}T00:00:00Z`).getTime() <= t);
  if (i < 0) return null;
  const offset = (t - new Date(`${weekStarts[i]}T00:00:00Z`).getTime()) / (7 * DAY_MS);
  return i + offset - 0.5;
}

/**
 * Builds everything the digest and the page show for a given week.
 *
 * @param {object} params
 * @param {object} params.index contents of data/<queue>/index.json
 * @param {object[]} params.snapshots weekly snapshots (data/<queue>/weeks/*.json)
 * @param {string} [params.weekStart] target week (default: the latest collected)
 * @param {Partial<typeof defaults>} [params.options]
 */
export function buildReport({ index, snapshots, weekStart, options = {} }) {
  const opts = { ...defaults, ...options };
  const byStart = new Map(snapshots.map((s) => [s.week.startDate, s]));
  const starts = [...byStart.keys()].sort();
  if (!starts.length) throw new Error(`No week collected for ${index.queue}`);

  const targetIdx = weekStart ? starts.indexOf(weekStart) : starts.length - 1;
  if (targetIdx < 0) throw new Error(`Week ${weekStart} is not in the data`);
  const target = byStart.get(starts[targetIdx]);
  const previous = targetIdx > 0 ? byStart.get(starts[targetIdx - 1]) : null;

  const statsByWeek = new Map();
  const statsOf = (start) => {
    if (!statsByWeek.has(start)) {
      const stats = deckStats(aggregate([byStart.get(start)]));
      statsByWeek.set(start, new Map(stats.map((d) => [d.key, d])));
    }
    return statsByWeek.get(start);
  };

  const trendStarts = starts.slice(Math.max(0, targetIdx - opts.trendWeeks + 1), targetIdx + 1);
  const previousStats = previous ? statsOf(previous.week.startDate) : new Map();
  const seatsOf = (stats) => [...stats.values()].reduce((total, d) => total + d.games, 0);
  const seats = seatsOf(statsOf(target.week.startDate));
  const previousSeats = seatsOf(previousStats);

  const decks = [...statsOf(target.week.startDate).values()]
    .filter((deck) => deck.playRate >= opts.minPlayRate)
    .map((deck) => {
      const prev = previousStats.get(deck.key);
      return {
        ...deck,
        deltaPlayRate: prev ? deck.playRate - prev.playRate : null,
        ...weekOverWeek(deck, prev, seats, previousSeats),
        history: trendStarts.map((start) => {
          const s = statsOf(start).get(deck.key);
          return {
            startDate: start,
            // Missing that week: nobody played it (or too few games to be published).
            playRate: s?.playRate ?? 0,
            winRate: s?.winRate ?? null,
            ci: s?.ci ?? null,
            games: s?.games ?? 0,
          };
        }),
      };
    });

  const eras = [...(index.eras ?? [])].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  const era = eraAt(eras, target.week.endDate);
  const eraMarkers = eras
    .filter((e) => e.startedAt.slice(0, 10) > trendStarts[0])
    .filter((e) => e.startedAt.slice(0, 10) <= target.week.endDate)
    .map((e) => ({
      key: e.key,
      name: e.name,
      position: weekAxisPosition(trendStarts, e.startedAt),
    }))
    .filter((e) => e.position != null);

  // Matchups: several weeks summed, never reaching back before the current set's release.
  const eraStart = era?.startedAt.slice(0, 10);
  let matchupStarts = starts
    .slice(Math.max(0, targetIdx - opts.matchupWeeks + 1), targetIdx + 1)
    .filter((start) => !eraStart || start >= eraStart);
  if (!matchupStarts.length) matchupStarts = [target.week.startDate];
  const matchupSnapshots = matchupStarts.map((start) => byStart.get(start));
  const matchupAgg = aggregate(matchupSnapshots);
  // This week alone against the window's earlier weeks: two independent samples.
  const weekAgg = aggregate([target]);
  const priorSnapshots = matchupSnapshots.filter((snapshot) => snapshot !== target);
  const priorAgg = priorSnapshots.length ? aggregate(priorSnapshots) : null;
  const matchupDecks = decks.slice(0, opts.matchupDecks);
  // Every pair of shown decks: the matrix uses the top ones, the deck sheet all of them.
  const cells = decks.flatMap((row) =>
    decks.map((col) => {
      const m = matchupFor(matchupAgg, row.key, col.key);
      return {
        row: row.key,
        col: col.key,
        mirror: row.key === col.key,
        games: m?.games ?? 0,
        winRate: m ? rate(m) : null,
        onPlay: m ? { games: m.onPlay.games, winRate: rate(m.onPlay) } : null,
        onDraw: m ? { games: m.onDraw.games, winRate: rate(m.onDraw) } : null,
        ...matchupTrend(weekAgg, priorAgg, row.key, col.key, opts.minMatchupGames),
      };
    }),
  );

  for (const deck of decks) deck.playDraw = playDrawFor(matchupAgg, deck.key);

  const withPrev = decks.filter((d) => d.deltaPlayRate != null);
  const summary = {
    topDeck: decks[0] ?? null,
    risers: withPrev
      .filter((d) => d.deltaPlayRate >= opts.moverThreshold)
      .sort((a, b) => b.deltaPlayRate - a.deltaPlayRate)
      .slice(0, 3),
    fallers: withPrev
      .filter((d) => d.deltaPlayRate <= -opts.moverThreshold)
      .sort((a, b) => a.deltaPlayRate - b.deltaPlayRate)
      .slice(0, 3),
    // Conservative ranking on the interval's lower bound, so a small lucky sample doesn't win.
    bestWinRate: [...decks].sort((a, b) => b.ci[0] - a.ci[0])[0] ?? null,
  };

  const perMatch = countsMatches(index);
  const size = (snapshot) => sampleSize(snapshot, perMatch);
  const sumSize = (list) => list.reduce((total, snapshot) => total + size(snapshot), 0);

  return {
    queue: index.queue,
    queueName: index.queueName ?? index.queue,
    gameMode: perMatch ? 'bo3' : 'bo1',
    unit: perMatch ? UNITS.match : UNITS.game,
    options: opts,
    era: era ? { key: era.key, name: era.name } : null,
    week: { ...target.week, sampleSize: size(target), updatedAt: target.updatedAt },
    previousWeek: previous ? { ...previous.week, sampleSize: size(previous) } : null,
    decks,
    trend: {
      weeks: trendStarts,
      endDate: target.week.endDate,
      sampleSize: sumSize(trendStarts.map((start) => byStart.get(start))),
      eraMarkers,
    },
    matchups: {
      weeks: matchupStarts,
      endDate: target.week.endDate,
      sampleSize: sumSize(matchupSnapshots),
      firstPlayerWinRate: firstPlayerWinRate(matchupAgg),
      updatedAt: matchupAgg.updatedAt,
      decks: matchupDecks,
      cells,
    },
    summary,
  };
}
