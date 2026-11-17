// The attributes and the addable skills of Cultivator's Adventure, in one place
// because both ends need them: the kit builds the sheets with them on the
// server, and the Skills block offers them on the Add button.
export const CA_ATTRS = [
  { key: "might", name: "Might", abbr: "MIG" },
  { key: "finesse", name: "Finesse", abbr: "FIN" },
  { key: "constitution", name: "Constitution", abbr: "CON" },
  { key: "will", name: "Will", abbr: "WIL" },
  { key: "anemos", name: "Anemos", abbr: "ANE" },
  { key: "intelligence", name: "Intelligence", abbr: "INT" },
] as const;
export const CA_ABBR: Record<string, string> = Object.fromEntries(CA_ATTRS.map((a) => [a.key, a.abbr]));

export interface CaExtraSkill { key: string; name: string; parent: string; icon: string; color: string; desc: string }
/**
 * Skills nobody starts with: they're added one at a time on the Skills tab, so
 * a character who never touches an anvil has no Blacksmithing row. The number
 * itself keeps its old name and its 1–4 range, so the forge, the cauldron and
 * the rune pen read it exactly as they always have — the attribute only comes
 * in on the skill's own roll.
 */
export const CA_EXTRA_SKILLS: CaExtraSkill[] = [
  { key: "blacksmithing", name: "Blacksmithing", parent: "might", icon: "Hammer", color: "#fb923c", desc: "Working metal at the forge: drawing a mold, hammering it down and finishing the piece." },
  { key: "alchemy", name: "Alchemy", parent: "intelligence", icon: "FlaskConical", color: "#34d399", desc: "Brewing at the cauldron: following a recipe step by step, or experimenting with what's to hand." },
  { key: "rune_making", name: "Rune Making", parent: "finesse", icon: "PenTool", color: "#a78bfa", desc: "Tracing a rune's sigil onto an item with a steady hand, or drawing one freehand." },
  { key: "orb_hunting", name: "Orb Hunting", parent: "anemos", icon: "Sparkles", color: "#38bdf8", desc: "Finding loose Anemos orbs, drawing them in and keeping hold of them." },
];
export const EXTRA_SKILL_MIN = 1, EXTRA_SKILL_MAX = 4;
export const EXTRA_SKILL_NOTE = `An added skill is worth ${EXTRA_SKILL_MIN} to ${EXTRA_SKILL_MAX} on its own, and its roll adds the attribute it hangs off. Crafting reads the plain number, the way it always has.`;
/** The bonus that goes with a skill's own number. */
export const bonusKey = (key: string) => `${key}_bonus`;
