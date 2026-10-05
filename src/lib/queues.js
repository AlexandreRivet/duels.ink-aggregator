/**
 * Picks the queue to feature (digest, page default) from the queues' indexes.
 */
const DAY_MS = 86_400_000;

/** End date (Saturday, YYYY-MM-DD) of the last week that is over, duels.ink weeks being Sunday–Saturday. */
export function lastFinishedWeekEnd(today = new Date()) {
  const day = today.getUTCDay();
  const daysBack = day === 6 ? 7 : day + 1;
  return new Date(today.getTime() - daysBack * DAY_MS).toISOString().slice(0, 10);
}

/** Whether a week is over (its data won't change any more), as opposed to still in progress. */
export function isWeekComplete(week, today = new Date()) {
  return week.endDate <= lastFinishedWeekEnd(today);
}

/**
 * First index, in the given order, whose data covers the last finished week; otherwise the one
 * with the most recent data, so a closed queue never wins over a live one.
 *
 * @param {object[]} indexes contents of data/<queue>/index.json, in priority order
 * @returns {object | null} null when no index has any week
 */
export function pickFeaturedQueue(indexes, today = new Date()) {
  const lastEnd = lastFinishedWeekEnd(today);
  const latest = (index) => index.weeks.at(-1)?.endDate ?? '';
  const candidates = indexes.filter((index) => index?.weeks.length);
  if (!candidates.length) return null;
  return (
    candidates.find((index) => latest(index) >= lastEnd) ??
    candidates.reduce((best, index) => (latest(index) > latest(best) ? index : best))
  );
}
