import { cardImageUrl, deckUrl, fetchDeck, parseDeckId } from '../../src/lib/dreamborn.js';
import { CARDS_PER_PAGE, proxySheets } from '../../src/lib/proxy-pdf.js';

const $ = (id) => document.getElementById(id);
const DEFAULT_LANGUAGE = 'fr';
// Images missing in the chosen language (promos often exist in English only) fall back to it.
const FALLBACK_LANGUAGE = 'en';
const MAX_COPIES = 99;

const state = readUrlState();
let deck = null;
// Copies to print per card id; the deck's counts at first.
let counts = new Map();
let loadToken = 0;
// JPEG bytes per card and language, kept so that a second PDF doesn't fetch everything again.
const jpegCache = new Map();

function el(tag, attrs = {}, text) {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value);
  if (text != null) node.textContent = text;
  return node;
}

function setStatus(text, isError = false) {
  $('status').textContent = text;
  $('status').classList.toggle('is-error', isError);
}

// --- State in the URL, to share a link that opens straight on a deck ---

function readUrlState() {
  const params = new URLSearchParams(location.search);
  const language = params.get('lang');
  return {
    deckId: params.get('deck'),
    language: ['fr', 'en'].includes(language) ? language : DEFAULT_LANGUAGE,
  };
}

function writeUrlState() {
  const params = new URLSearchParams();
  if (deck) params.set('deck', deck.id);
  if (state.language !== DEFAULT_LANGUAGE) params.set('lang', state.language);
  const query = params.toString();
  history.replaceState(null, '', query ? `?${query}` : location.pathname);
}

// --- Deck ---

function deckErrorMessage(error) {
  if (error.code === 'not-found') {
    return 'Deck introuvable sur dreamborn.ink : vérifier le lien et que le deck est public.';
  }
  if (error.code === 'unreadable') {
    return "Impossible de lire ce deck : dreamborn.ink a peut-être changé sa page. L'outil est à mettre à jour.";
  }
  return 'Impossible de joindre dreamborn.ink. Réessayer dans un instant.';
}

async function loadDeck(deckId) {
  const token = ++loadToken;
  setStatus('Chargement du deck…');
  try {
    const loaded = await fetchDeck(deckId);
    if (token !== loadToken) return;
    deck = loaded;
    counts = new Map(deck.cards.map((card) => [card.id, card.count]));
    renderDeck();
    writeUrlState();
    setStatus('');
  } catch (error) {
    if (token !== loadToken) return;
    console.error(error);
    setStatus(deckErrorMessage(error), true);
  }
}

/** Shows a card in the chosen language, or in English when it doesn't exist in it. */
function setImage(img, cardId) {
  img.onerror =
    state.language === FALLBACK_LANGUAGE
      ? null
      : () => {
          img.onerror = null;
          img.src = cardImageUrl(cardId, FALLBACK_LANGUAGE);
        };
  img.src = cardImageUrl(cardId, state.language);
}

/**
 * The card's image, which shows its name, and the copies to print. The name read from dreamborn
 * (always in English) is only given to screen readers: shown, it would clash with French images.
 */
function cardItem(card) {
  const name = card.name ?? card.id;
  const item = el('li', { class: 'deck-card', 'data-card': card.id });
  const img = el('img', { alt: card.name ?? '', loading: 'lazy', width: 734, height: 1024 });
  setImage(img, card.id);
  const input = el('input', {
    type: 'number',
    min: 0,
    max: MAX_COPIES,
    value: card.count,
    inputmode: 'numeric',
    'aria-label': `Exemplaires à imprimer : ${name}`,
  });
  const count = el('label', { class: 'card-count' });
  count.append(input, el('span', {}, `sur ${card.count}`));
  item.append(img, count);
  return item;
}

function renderDeck() {
  $('deck-name').textContent = deck.name;
  $('deck-name').href = deckUrl(deck.id);
  $('cards').replaceChildren(...deck.cards.map(cardItem));
  $('deck').hidden = false;
  updateSummary();
}

function setCount(item, value) {
  counts.set(item.dataset.card, value);
  item.querySelector('input').value = value;
  item.classList.toggle('is-skipped', value === 0);
}

function updateSummary() {
  const total = [...counts.values()].reduce((sum, n) => sum + n, 0);
  const pages = Math.ceil(total / CARDS_PER_PAGE);
  $('summary').textContent = total
    ? `${total} carte${total > 1 ? 's' : ''} · ${pages} page${pages > 1 ? 's' : ''} A4`
    : 'Aucune carte à imprimer';
  $('generate').disabled = total === 0;
  return { total, pages };
}

// --- PDF ---

/**
 * A card's image as JPEG: jsPDF embeds JPEG as is, while dreamborn serves WebP, so each image is
 * decoded and encoded again once.
 */
function cardJpeg(cardId, language) {
  const key = `${language}:${cardId}`;
  if (!jpegCache.has(key)) {
    const jpeg = (async () => {
      let res = await fetch(cardImageUrl(cardId, language));
      if (res.status === 404 && language !== FALLBACK_LANGUAGE) {
        res = await fetch(cardImageUrl(cardId, FALLBACK_LANGUAGE));
      }
      if (!res.ok) throw new Error(`HTTP ${res.status} on ${res.url}`);
      const bitmap = await createImageBitmap(await res.blob());
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      canvas.getContext('2d').drawImage(bitmap, 0, 0);
      bitmap.close();
      const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.92 });
      return new Uint8Array(await blob.arrayBuffer());
    })();
    // A failure (network, rate limit) shouldn't stick: the next try fetches again.
    jpeg.catch(() => jpegCache.delete(key));
    jpegCache.set(key, jpeg);
  }
  return jpegCache.get(key);
}

function slug(text) {
  const ascii = text.normalize('NFD').replace(/[̀-ͯ]/g, '');
  return (
    ascii
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'deck'
  );
}

function download(bytes, fileName) {
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
  el('a', { href: url, download: fileName }).click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

async function generate() {
  // Taken now: the counts or the language may change while the images load.
  const wanted = deck.cards
    .map((card) => ({ id: card.id, count: counts.get(card.id) }))
    .filter((card) => card.count > 0);
  const { language } = state;
  const { total, pages } = updateSummary();
  const fileName = `proxies-${slug(deck.name)}.pdf`;
  $('generate').disabled = true;
  try {
    let ready = 0;
    setStatus(`Préparation des images : 0/${wanted.length}`);
    const cards = await Promise.all(
      wanted.map(async (card) => {
        const jpeg = await cardJpeg(card.id, language);
        setStatus(`Préparation des images : ${++ready}/${wanted.length}`);
        return { ...card, jpeg };
      }),
    );
    setStatus('Mise en page du PDF…');
    download(await proxySheets(cards), fileName);
    setStatus(
      `PDF téléchargé : ${total} carte${total > 1 ? 's' : ''} sur ${pages} page${pages > 1 ? 's' : ''}.`,
    );
  } catch (error) {
    console.error(error);
    setStatus(
      "Impossible de préparer le PDF : une image de carte n'a pas pu être récupérée. Réessayer dans un instant.",
      true,
    );
  } finally {
    updateSummary();
  }
}

// --- Events ---

$('deck-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const deckId = parseDeckId($('deck-link').value);
  if (!deckId) {
    setStatus("Ce n'est pas un lien de deck dreamborn.ink (https://dreamborn.ink/decks/…).", true);
    return;
  }
  loadDeck(deckId);
});

$('language').addEventListener('change', (event) => {
  state.language = event.target.value;
  for (const item of $('cards').children) setImage(item.querySelector('img'), item.dataset.card);
  writeUrlState();
});

$('cards').addEventListener('change', (event) => {
  const item = event.target.closest('.deck-card');
  const value = Math.round(Number(event.target.value));
  setCount(item, Number.isFinite(value) ? Math.min(MAX_COPIES, Math.max(0, value)) : 0);
  updateSummary();
});

$('select-all').addEventListener('click', () => {
  for (const item of $('cards').children) {
    setCount(item, deck.cards.find((card) => card.id === item.dataset.card).count);
  }
  updateSummary();
});

$('select-none').addEventListener('click', () => {
  for (const item of $('cards').children) setCount(item, 0);
  updateSummary();
});

$('generate').addEventListener('click', generate);

$('language').value = state.language;
if (state.deckId) {
  $('deck-link').value = deckUrl(state.deckId);
  loadDeck(state.deckId);
}
