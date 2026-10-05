/**
 * Minimal client for duels.ink's public /api/stats/meta endpoint.
 * Docs: https://duels.ink/api-docs#community-stats
 *
 * Only the fields listed as "stable" in the docs should be relied on.
 */

export const BASE_URL = 'https://duels.ink';

/** Seconds to wait from a Retry-After header (seconds or an HTTP date); 60 when unusable. */
export function retryAfterSeconds(value, now = Date.now()) {
  if (value == null || value === '') return 60;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(1, seconds);
  const date = Date.parse(value);
  if (Number.isFinite(date)) return Math.max(1, Math.ceil((date - now) / 1000));
  return 60;
}

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

  let res;
  try {
    res = await fetch(url, { headers });
  } catch (error) {
    // Network failure (DNS, reset, timeout): worth another try
    throw Object.assign(new Error(`Network error on ${url}: ${error.message}`), {
      retryable: true,
    });
  }

  if (res.status === 304) {
    return { status: 304, etag, data: null };
  }

  if (res.status === 429) {
    const retryAfter = retryAfterSeconds(res.headers.get('retry-after'));
    throw Object.assign(new Error(`Rate limited, retry in ${retryAfter}s`), {
      retryAfter,
      retryable: true,
    });
  }

  // Server-side trouble is usually short-lived: worth another try
  if (res.status >= 500) {
    throw Object.assign(new Error(`HTTP ${res.status} on ${url}`), { retryable: true });
  }

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} on ${url}`);
  }

  return { status: res.status, etag: res.headers.get('etag'), data: await res.json() };
}
