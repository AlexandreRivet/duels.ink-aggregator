/**
 * The weekly podcast's script: the hosts, the instructions given to Claude, the shape of its
 * answer, and a check that every figure it says comes from the week's facts. In French, like
 * the episode. Pure functions.
 */

/**
 * The two voices. `id` is what the script's lines carry; `voice` and `tone` are the OpenAI
 * text-to-speech voice and the delivery it is asked for.
 */
export const HOSTS = [
  {
    id: 'camille',
    name: 'Camille',
    role: 'anime l’émission et mène le fil ; présente aussi des chiffres et a ses propres avis',
    voice: 'marin',
    tone: 'Animatrice de podcast, chaleureuse et énergique, débit vif mais clair.',
  },
  {
    id: 'sacha',
    name: 'Sacha',
    role: 'creuse les détails (matchups, premier joueur, écarts entre formats), nuance ou conteste',
    voice: 'cedar',
    tone: 'Analyste posé et complice, ton conversationnel, appuie légèrement les chiffres.',
  },
];

/** Target length, in words: about 5 minutes read aloud. */
export const TARGET_WORDS = [650, 900];

export const SYSTEM_PROMPT = `Tu écris le script du podcast hebdomadaire sur la meta de Disney Lorcana en ligne, tiré des statistiques publiques de duels.ink. Il est diffusé chaque dimanche sur le Discord d'une équipe de joueurs français qui connaissent bien le jeu : inutile d'expliquer les règles, les encres ou ce qu'est un win rate.

Deux voix, synthétisées par une IA de text-to-speech :
${HOSTS.map((h) => `- ${h.name} (« ${h.id} ») : ${h.role}.`).join('\n')}
Un vrai échange entre deux personnes qui maîtrisent le sujet, pas un intervieweur et un expert : chacune apporte des chiffres, des répliques courtes à moyennes qui se répondent, des réactions, parfois un désaccord. Ton détendu et complice, mais précis.

Contenu. Tu reçois, pour chaque format (best-of-one, puis best-of-three), les faits de la semaine qui vient de se terminer : volume, decks les plus joués, taux de jeu et de victoire, évolutions, premier joueur, matchups. Choisis ce qui raconte quelque chose : ce qui domine, ce qui bouge, ce qui surprend, ce qui ne bouge pas alors qu'on l'attendrait. Ne récite pas les tableaux ; trois ou quatre chiffres bien choisis par format valent mieux que vingt. Les auditeurs ont aussi les graphes sur Discord.
Fil conducteur : une ouverture qui annonce la semaine, le best-of-one, le best-of-three (en reliant les deux formats quand ils se ressemblent ou divergent), puis une conclusion avec ce qu'il faudra surveiller la semaine prochaine. Termine en rappelant que l'épisode est généré automatiquement à partir des données de duels.ink, voix comprises.

Rigueur. Les chiffres viennent uniquement des faits fournis, ne calcule rien toi-même. Les qualificatifs fournis sont là pour toi : une évolution « dans le bruit statistique » ne se présente pas comme une tendance, un win rate « pas distinguable de 50 % » n'est ni bon ni mauvais. Quand un format n'a pas de semaine précédente comparable, il n'y a pas d'évolution à commenter, dis-le simplement. Les données ne contiennent que des paires d'encres, pas les listes : n'invente ni cartes, ni archétypes, ni joueurs, ni tournois. Tu peux proposer une interprétation si tu la présentes comme une hypothèse.

Écriture pour l'oreille. Le texte est lu tel quel par la synthèse vocale :
- pas de markdown, d'emoji, de parenthèses, de didascalies ni d'abréviations (écris « taux de victoire » ou « win rate », « best-of-one », jamais « WR » ou « BO1 ») ;
- les decks se disent par leurs encres : « Ambre-Émeraude », « Émeraude-Acier » ;
- les pourcentages en chiffres avec une virgule (« 53,5 % ») ; arrondis à l'entier quand la décimale n'apporte rien ; les écarts en « points » ;
- des phrases que l'on peut dire d'une traite.

Longueur : entre ${TARGET_WORDS[0]} et ${TARGET_WORDS[1]} mots au total, soit environ cinq minutes.

Réponds avec le titre de l'épisode (court, accrocheur, sans date), un résumé d'une ou deux phrases pour le message Discord, et les répliques dans l'ordre.`;

/** JSON schema of the answer (structured output). */
export const SCRIPT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'summary', 'lines'],
  properties: {
    title: { type: 'string' },
    summary: { type: 'string' },
    lines: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['speaker', 'text'],
        properties: {
          speaker: { type: 'string', enum: HOSTS.map((h) => h.id) },
          text: { type: 'string' },
        },
      },
    },
  },
};

/** The request's user message: the week's facts, one block per format. */
export function buildUserMessage(episode) {
  const blocks = episode.formats.map(
    (facts) => `<faits format="${facts.format}">\n${JSON.stringify(facts)}\n</faits>`,
  );
  return `Semaine du ${episode.week}.\n\n${blocks.join('\n\n')}`;
}

/** Every number in the facts, with the values a sentence can fairly derive from it. */
function allowedValues(facts) {
  const values = new Set([50, 100]);
  const walk = (v) => {
    if (typeof v === 'number') {
      for (const x of [v, Math.abs(v), 100 - v]) values.add(x);
    } else if (v && typeof v === 'object') {
      Object.values(v).forEach(walk);
    }
  };
  walk(facts);
  return [...values];
}

// "53,5 %", "53 pour cent", "2,4 points"
const FIGURE = /(\d+(?:[.,]\d+)?)\s*(%|pour\s?cents?|points?\b)/gi;

/**
 * The percentages and points the script says that aren't in the facts. A figure rounded to the
 * unit passes when it is within half a point; one with a decimal must match to the decimal.
 */
export function unsupportedFigures(script, facts) {
  const allowed = allowedValues(facts);
  const found = [];
  for (const line of script.lines) {
    for (const [match, raw] of line.text.matchAll(FIGURE)) {
      const n = Number(raw.replace(',', '.'));
      const tolerance = raw.match(/[.,]/) ? 0.051 : 0.501;
      if (!allowed.some((v) => Math.abs(v - n) <= tolerance))
        found.push({ figure: match, line: line.text });
    }
  }
  return found;
}

export const countWords = (script) =>
  script.lines.reduce((total, line) => total + line.text.split(/\s+/).filter(Boolean).length, 0);

/** The script for a human: read it in the workflow's artifact. */
export function scriptToMarkdown(script) {
  const names = Object.fromEntries(HOSTS.map((h) => [h.id, h.name]));
  const lines = script.lines.map((line) => `**${names[line.speaker]}** : ${line.text}`);
  return `# ${script.title}\n\n> ${script.summary}\n\n${lines.join('\n\n')}\n`;
}
