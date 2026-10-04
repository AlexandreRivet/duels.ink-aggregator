/**
 * Lorcana inks: names (French, for the team), chip colours, and the closest coloured-circle
 * emoji for text-only places (Discord messages, drop-down lists).
 * Decks are shown by their ink chips; names remain in tooltips and for screen readers.
 */
export const INKS = {
  amber: { name: 'Ambre', color: '#f5b202', emoji: '🟡' },
  amethyst: { name: 'Améthyste', color: '#81377b', emoji: '🟣' },
  emerald: { name: 'Émeraude', color: '#2a8934', emoji: '🟢' },
  ruby: { name: 'Rubis', color: '#d3082f', emoji: '🔴' },
  sapphire: { name: 'Saphir', color: '#0189c4', emoji: '🔵' },
  steel: { name: 'Acier', color: '#9fa8b4', emoji: '⚪' },
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

/** "🟡🟢": a deck's inks as emoji, where only text can be shown. */
export function deckEmoji(colors) {
  return colors.map((ink) => INKS[ink]?.emoji ?? '⚫').join('');
}
