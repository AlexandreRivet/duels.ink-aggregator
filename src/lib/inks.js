/**
 * Lorcana inks: display names (French, for the team) and chip colours.
 * Chips are an icon next to the deck name, never the only way to identify a deck.
 */
export const INKS = {
  amber: { name: 'Ambre', color: '#f5b202' },
  amethyst: { name: 'Améthyste', color: '#81377b' },
  emerald: { name: 'Émeraude', color: '#2a8934' },
  ruby: { name: 'Rubis', color: '#d3082f' },
  sapphire: { name: 'Saphir', color: '#0189c4' },
  steel: { name: 'Acier', color: '#9fa8b4' },
};

/** Stable deck key: sorted ink names joined by "/", as in the API. */
export function deckKey(colors) {
  return colors.join('/');
}

export function inkName(ink) {
  return INKS[ink]?.name ?? ink;
}

export function deckName(colors) {
  return colors.map(inkName).join(' / ');
}
