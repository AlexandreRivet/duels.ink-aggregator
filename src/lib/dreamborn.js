/**
 * Reads a public deck from dreamborn.ink, for the proxy generator.
 *
 * dreamborn has no public deck API (/api/decks/<id> answers 401 without a session), but a public
 * deck's page embeds the deck in its Nuxt payload, and both the page and the card images are
 * served with `Access-Control-Allow-Origin: *`, so the browser can read them directly. This
 * relies on the page's shape, not on a documented contract: if dreamborn changes it, loading
 * fails with an `unreadable` error rather than a wrong deck.
 */

export const BASE_URL = 'https://dreamborn.ink';
const IMAGES_URL = 'https://cdn.dreamborn.ink/images';

/** A card's image (734 × 1024 WebP, full bleed), in one of dreamborn's languages ('fr', 'en'…). */
export function cardImageUrl(cardId, language) {
  return `${IMAGES_URL}/${language}/cards/${cardId}`;
}

export function deckUrl(deckId) {
  return `${BASE_URL}/decks/${deckId}`;
}

/**
 * The deck id in a dreamborn link (…/decks/<id>, with or without a language prefix, or
 * …/builder/<id>), or a bare id; null when there is none.
 */
export function parseDeckId(input) {
  const text = input.trim();
  if (/^[A-Za-z0-9]{12,}$/.test(text)) return text;
  return (
    text.match(/dreamborn\.ink\/(?:[a-z]{2}\/)?(?:decks|builder)\/([A-Za-z0-9]+)/)?.[1] ?? null
  );
}

const deckError = (code, message) => Object.assign(new Error(message), { code });

/**
 * @returns {Promise<{ id: string, name: string, cards: { id: string, name: string | null, count: number }[] }>}
 *   Cards in the deck's order. Throws with `code` 'not-found' (unknown or private deck) or
 *   'unreadable' (the page no longer has the expected shape).
 */
export async function fetchDeck(deckId) {
  const res = await fetch(deckUrl(deckId));
  if (res.status === 404) throw deckError('not-found', `No public deck ${deckId} on dreamborn`);
  if (!res.ok) throw new Error(`HTTP ${res.status} on ${res.url}`);
  return deckFromPage(await res.text(), deckId);
}

export function deckFromPage(html, deckId) {
  const json = html.match(/<script[^>]*id="__NUXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)?.[1];
  const deck = json ? unflatten(JSON.parse(json))?.data?.[deckId] : null;
  const entries = Object.entries(deck?.cards ?? {});
  if (!entries.length || !entries.every(([, count]) => Number.isInteger(count) && count > 0)) {
    throw deckError('unreadable', `No deck list found in dreamborn's page for ${deckId}`);
  }
  const names = pixelbornNames(deck.pbCode, entries);
  return {
    id: deckId,
    name: deck.name || deckId,
    cards: entries.map(([id, count], i) => ({ id, name: names?.[i] ?? null, count })),
  };
}

/**
 * Card names from the deck's Pixelborn export code: base64 of "Name_Title$count|…", in the same
 * order as the deck's cards. Only used when it lines up with them (same length, same counts):
 * the order isn't documented anywhere.
 */
function pixelbornNames(code, entries) {
  if (!code) return null;
  try {
    const bytes = Uint8Array.from(atob(code), (char) => char.charCodeAt(0));
    const items = new TextDecoder().decode(bytes).split('|').filter(Boolean);
    if (items.length !== entries.length) return null;
    const names = [];
    for (const [i, item] of items.entries()) {
      const at = item.lastIndexOf('$');
      if (Number(item.slice(at + 1)) !== entries[i][1]) return null;
      names.push(item.slice(0, at).split('_').join(' - '));
    }
    return names;
  } catch {
    return null;
  }
}

/**
 * Rebuilds a Nuxt payload (devalue's flat format: every value is an index into the array, typed
 * values are ["Type", …]). Vue wrappers (Reactive, Ref…) are unwrapped.
 */
function unflatten(values) {
  const done = new Map();
  const hydrate = (index) => {
    // -1 is undefined; the other negative indices (NaN, ±Infinity, -0, holes) don't occur here
    if (index < 0) return undefined;
    if (done.has(index)) return done.get(index);
    const value = values[index];
    let out = value;
    if (Array.isArray(value)) {
      if (typeof value[0] !== 'string') out = value.map(hydrate);
      else if (value[0] === 'Set') out = new Set(value.slice(1).map(hydrate));
      else if (value[0] === 'Date') out = new Date(value[1]);
      else out = value.length > 1 ? hydrate(value[1]) : undefined;
    } else if (value && typeof value === 'object') {
      out = Object.fromEntries(Object.entries(value).map(([key, i]) => [key, hydrate(i)]));
    }
    done.set(index, out);
    return out;
  };
  return hydrate(0);
}
