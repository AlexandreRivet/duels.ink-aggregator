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
  // Set 14 betas only for now: put core-bo1 back (first) when Set 14 is released.
  queues: ['quick-play-core-set14', 'core-bo3-set14'],

  /**
   * Decks shown everywhere — every chart, table, the deck picker and the Discord summary: the
   * most played ones that week. Applied once, when the report is built.
   */
  topDecks: 12,

  /** Floor under the top decks: a deck below this play rate (%) is never shown. */
  minPlayRate: 1,

  /** Number of weeks shown in the trend chart. */
  trendWeeks: 12,

  /** Weeks summed for the matchup matrix (a single week is too thin). */
  matchupWeeks: 4,

  /** Below this, a matchup cell is greyed out: the win rate isn't reliable. */
  minMatchupGames: 100,

  /** Play-rate change (points) from which a deck is listed as rising / falling. */
  moverThreshold: 0.5,
};

export const SOURCE_URL = 'https://duels.ink/stats';
