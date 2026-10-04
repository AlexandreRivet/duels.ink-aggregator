/**
 * Minimal client for duels.ink's public /api/stats/meta endpoint.
 * Docs: https://duels.ink/api-docs#community-stats
 *
 * Only the fields listed as "stable" in the docs should be relied on.
 */

export const BASE_URL = 'https://duels.ink';

/**
 * @param {object} [options]
 * @param {string} [options.queue='core-bo1'] Always pass it explicitly.
 * @param {string} [options.era] e.g. 'set-13'
 * @param {string} [options.period] 'all_time' | 'week:YYYY-MM-DD' | 'weeks:YYYY-MM-DD,...'
 * @param {string[]} [options.ranks] e.g. ['Legendary', 'Epic']
 * @param {string} [options.etag] ETag of the previous response (→ 304 if unchanged)
 * @returns {Promise<{ status: number, etag: string | null, data: any | null }>}
 */
export async function fetchMeta({ queue = 'core-bo1', era, period, ranks, etag } = {}) {
  const url = new URL('/api/stats/meta', BASE_URL);
  url.searchParams.set('queue', queue);
  if (era) url.searchParams.set('era', era);
  if (period) url.searchParams.set('period', period);
  if (ranks?.length) url.searchParams.set('ranks', ranks.join(','));

  const headers = { Accept: 'application/json' };
  if (etag) headers['If-None-Match'] = etag;

  const res = await fetch(url, { headers });

  if (res.status === 304) {
    return { status: 304, etag, data: null };
  }

  if (res.status === 429) {
    const retryAfter = Number(res.headers.get('retry-after') ?? 60);
    throw Object.assign(new Error(`Rate limited, retry in ${retryAfter}s`), {
      retryAfter,
    });
  }

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} on ${url}`);
  }

  return { status: res.status, etag: res.headers.get('etag'), data: await res.json() };
}
