/**
 * French number and date formatting (the charts are in French), identical in Node and the browser.
 */
import { formatLocale } from 'd3';

const NBSP = '\u00a0';

const locale = formatLocale({
  decimal: ',',
  thousands: NBSP,
  grouping: [3],
  currency: ['', `${NBSP}€`],
  minus: '−',
});

const int = locale.format(',d');
const one = locale.format(',.1f');
const signedOne = locale.format('+,.1f');

export const formatInt = (v) => int(v);

/** What the counts measure: games in BO1 queues, matches in BO3 ones. */
export const UNITS = {
  game: { one: 'partie', many: 'parties', played: 'Parties jouées' },
  match: { one: 'match', many: 'matchs', played: 'Matchs joués' },
};

/** "57 550 parties", "1 match". */
export const formatCount = (v, unit) => `${int(v)} ${Math.abs(v) >= 2 ? unit.many : unit.one}`;
export const formatPct = (v, digits = 1) =>
  v == null || Number.isNaN(v) ? '—' : `${locale.format(`,.${digits}f`)(v)}${NBSP}%`;
export const formatNumber1 = (v) => one(v);
/** Signed change in points: +1,2 / −0,8. */
export const formatDelta = (v) => signedOne(v);

const dayMonth = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
});
const dayMonthYear = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});
const dateTimeParis = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Paris',
});

/** "2026-09-27" → Date at midnight UTC. */
export const parseDay = (iso) => new Date(`${iso}T00:00:00Z`);

/** "27 sept." */
export const formatDay = (iso) => dayMonth.format(parseDay(iso));

/** "27 sept. – 3 oct. 2026" */
export function formatWeekRange(startDate, endDate) {
  return `${dayMonth.format(parseDay(startDate))} – ${dayMonthYear.format(parseDay(endDate))}`;
}

/** ISO timestamp → "4 oct. 2026, 03:36" (Paris time). */
export const formatUpdatedAt = (iso) => (iso ? dateTimeParis.format(new Date(iso)) : '—');
