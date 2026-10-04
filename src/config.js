/**
 * Settings shared by the collector, the Discord digest and the web page.
 */
export const config = {
  /**
   * Queues collected every week (ids from meta.queues.active), in priority order: the digest
   * and the page feature the first one with data for the last finished week. During a set's
   * beta, list the beta queue first; once duels.ink closes it, it stops getting new weeks and
   * the next queue takes over.
   */
  queues: ['core-bo1'],

  /** A deck only appears in the charts above this play rate (%). */
  minPlayRate: 1,

  /** Number of weeks shown in the trend charts. */
  trendWeeks: 12,

  /** Decks shown in the small-multiple trend charts (3-column grid). */
  trendDecks: 9,

  /** Weeks summed for the matchup matrix (a single week is too thin). */
  matchupWeeks: 4,

  /** Decks shown in the matchup matrix. */
  matchupDecks: 10,

  /** Below this, a matchup cell is greyed out: the win rate isn't reliable. */
  minMatchupGames: 100,

  /** Play-rate change (points) from which a deck is listed as rising / falling. */
  moverThreshold: 0.5,
};

export const SOURCE_URL = 'https://duels.ink/stats';
