// Profanity detection + censoring — single source of truth shared by client and
// server. Used for AA V3 crafted-spell names: the server computes a `flagged`
// boolean when a spell name is written, and names are censored for viewers in
// campaigns that do not have the 18+ / mature-content toggle enabled.
//
// Censoring rules (matches product direction):
//   - Match whole words only (case-insensitive) to avoid the Scunthorpe problem
//     (e.g. "ass" must NOT match "class", "hell" must NOT match "hellfire").
//   - If the word has a PG substitute, replace it with the substitute wrapped in
//     asterisks on both ends, e.g. "shit" -> "*poop*".
//   - Otherwise mask the word: keep the first letter, replace the rest with "*",
//     e.g. "Shit" -> "S***".
//   - Only the offending word(s) change; the rest of the name is preserved.

export interface ProfanityEntry {
  word: string;
  /** Optional PG substitute. When present, shown wrapped in asterisks: *pg*. */
  pg?: string;
}

// Longer / more-specific entries should win over shorter ones; the matcher sorts
// by length descending so e.g. "motherfucker" is handled before "fuck".
export const PROFANITY_LIST: ProfanityEntry[] = [
  { word: "motherfucker", pg: "motherflower" },
  { word: "motherfuckers", pg: "motherflowers" },
  { word: "fucking", pg: "fricking" },
  { word: "fucker", pg: "fricker" },
  { word: "fuckers", pg: "frickers" },
  { word: "fucked", pg: "fricked" },
  { word: "fuck", pg: "frick" },
  { word: "fucks", pg: "fricks" },
  { word: "bullshit", pg: "bull" },
  { word: "shitty", pg: "poopy" },
  { word: "shithead", pg: "poophead" },
  { word: "shits", pg: "poops" },
  { word: "shit", pg: "poop" },
  { word: "asshole", pg: "jerk" },
  { word: "assholes", pg: "jerks" },
  { word: "dumbass", pg: "dummy" },
  { word: "jackass", pg: "rascal" },
  { word: "ass", pg: "butt" },
  { word: "arse", pg: "butt" },
  { word: "bitches", pg: "witches" },
  { word: "bitch", pg: "witch" },
  { word: "bastard", pg: "rascal" },
  { word: "bastards", pg: "rascals" },
  { word: "goddamn", pg: "goshdarn" },
  { word: "damn", pg: "darn" },
  { word: "damned", pg: "darned" },
  { word: "dick", pg: "jerk" },
  { word: "dickhead", pg: "jerk" },
  { word: "piss", pg: "tinkle" },
  { word: "pissed", pg: "ticked" },
  { word: "crap", pg: "crud" },
  { word: "crappy", pg: "cruddy" },
  { word: "hell", pg: "heck" },
  { word: "cock" },
  { word: "cocks" },
  { word: "pussy" },
  { word: "cunt" },
  { word: "slut" },
  { word: "whore" },
  { word: "twat" },
  { word: "wanker" },
  { word: "bollocks" },
  { word: "nigger" },
  { word: "nigga" },
  { word: "faggot" },
  { word: "fag" },
  { word: "retard" },
  { word: "retarded" },
];

// Map for quick lookup of a word's PG substitute.
const PG_BY_WORD: Record<string, string | undefined> = Object.fromEntries(
  PROFANITY_LIST.map((e) => [e.word.toLowerCase(), e.pg]),
);

// One alternation regex of all profane words bounded by word boundaries, sorted
// longest-first so the regex engine prefers the most specific match.
const SORTED_WORDS = [...PROFANITY_LIST]
  .map((e) => e.word)
  .sort((a, b) => b.length - a.length);

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildRegex(): RegExp {
  const alternation = SORTED_WORDS.map(escapeRegExp).join("|");
  // \b...\b enforces whole-word matching (letters only).
  return new RegExp(`\\b(${alternation})\\b`, "gi");
}

const PROFANITY_REGEX = buildRegex();

/** True if the text contains at least one profane whole word. */
export function containsProfanity(text: string | null | undefined): boolean {
  if (!text) return false;
  // Fresh lastIndex each call (regex has the global flag).
  PROFANITY_REGEX.lastIndex = 0;
  return PROFANITY_REGEX.test(text);
}

/** Mask a single matched word: keep first letter, asterisks for the rest. */
function maskWord(match: string): string {
  if (match.length <= 1) return "*";
  return match[0] + "*".repeat(match.length - 1);
}

/**
 * Return the censored version of a name. Profane words are replaced with their
 * PG substitute wrapped in asterisks (*pg*) when one exists, otherwise masked.
 * Non-profane text is left untouched.
 */
export function censorName(text: string | null | undefined): string {
  if (!text) return text ?? "";
  return text.replace(PROFANITY_REGEX, (match) => {
    const pg = PG_BY_WORD[match.toLowerCase()];
    if (pg) return `*${pg}*`;
    return maskWord(match);
  });
}

/**
 * Convenience for display surfaces: censor only when the content is flagged and
 * the viewing campaign is NOT 18+. Admin contexts should pass is18Plus=true (or
 * simply not call this) so names are never censored for moderation.
 */
export function displaySpellName(
  name: string | null | undefined,
  flagged: boolean,
  is18Plus: boolean,
): string {
  const raw = name ?? "";
  if (!flagged || is18Plus) return raw;
  return censorName(raw);
}
