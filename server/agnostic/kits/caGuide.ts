// The crafting guide: one long note in every C.A. Agnostic game that says how
// to build the three crafts — the forge, the pot and the pen, the materials,
// ingredients and inks they eat, and the blueprints, recipes and runes that
// tell them what to make.
//
// It's a note like any other: the GM can rewrite it, add their own house rules
// to it, hand it to a player with Share, or throw it away. Nothing reads it but
// a person.
import type { AgNote, AgSnapshot } from "@shared/agnostic/types";
import type { ChangeSet, ScopeStore } from "../store";
import * as snap from "../snapshot";
import { p, b, i, t, h, hr, muted, icon, table, tabs, buildDocState, type DocNode, type DocText } from "./doc";
import { CA_CRAFT_FOLDER } from "./caCrafting";

export const CRAFT_GUIDE_NAME = "Crafting — how to set it up";

const GILT = "#d4a24c";
/** A bulleted list; each item is one paragraph's worth of content. */
type Bit = DocNode | DocText | string;
const ul = (...items: Array<Bit[]>): DocNode => ({
  type: "bulletList",
  content: items.map((c) => ({ type: "listItem", content: [p(...c)] })),
});
/** A numbered list — the steps of a job, in order. */
const ol = (...items: Array<Bit[]>): DocNode => ({
  type: "orderedList",
  attrs: { start: 1 },
  content: items.map((c) => ({ type: "listItem", content: [p(...c)] })),
});
/** A row of a table, from plain text. */
const row = (...cells: Array<Bit[] | string>): Array<DocNode[]> =>
  cells.map((c) => [p(...(typeof c === "string" ? [c] : c))]);
const ui = (name: string) => t(name, { bold: {}, textStyle: { color: "#fcd34d" } });
const key = (k: string) => t(k, { code: {} });

const overview: DocNode[] = [
  p("Three crafts, and all three are made of ordinary sheets you can open and change. Nothing here is hidden machinery:"),
  ul(
    [b("Blacksmithing"), " — a ", ui("Forge"), ". A player draws the mold of the weapon they want, picks a metal, keeps it in its heat range and hammers it down to the shape. The shape they drew is the weapon."],
    [b("Alchemy"), " — an ", ui("Alchemist Pot"), ". A player follows a recipe step by step (stir, dice, heat, add, grind, strain, rest), scored as they go, or experiments and leaves it to you."],
    [b("Rune Making"), " — a ", ui("Runemaking Pen"), ". A player traces a rune's sigil onto an item that has room left on it, in whatever ink the rune asks for."],
  ),
  p("Four kinds of thing make up a craft, and you make each one the same way you make any sheet:"),
  table([
    row("What", "What it is", "Where it comes from"),
    row("A station", "The forge, pot or pen itself. Whoever carries it crafts at it.", ["An ", key("item"), " from the ", ui("CA Forge"), " / ", ui("CA Alchemist Pot"), " / ", ui("CA Runemaking Pen"), " template"]),
    row("Stock", "Metals, ingredients, inks and tools — what a craft eats and what it's worked with.", ["An ", key("item"), " from ", ui("CA Material"), ", ", ui("CA Ingredient"), ", ", ui("CA Ink"), " or ", ui("CA Tool")]),
    row("A definition", "What can be made: a blueprint, a recipe, a rune.", ["A sheet from ", ui("CA Blueprint"), ", ", ui("CA Recipe"), " or ", ui("CA Rune Recipe")]),
    row("A scroll", "Who knows the recipe. Whoever carries one can make that thing.", [ui("CA Scroll"), " — one is made for each definition"]),
  ]),
  p(muted("Every one of those templates is on the "), ui("Items"), muted(" tab, in the “Cultivator's Adventure — Crafting” folder. To make one of something: "), ui("New"), muted(" → pick the template → name it. To make a new kind of template: "), ui("New"), muted(" → tick "), ui("Make this a template"), muted(".")),
  h(3, icon("Dices", GILT, 16), " Quick Craft, and the five tiers"),
  p("Every craft can be played out or rolled through. ", ui("Quick Craft"), " rolls d20 + the craft's skill (+ the station's Quick Craft bonus, + any tool's skill points) and lands on a tier. Playing it out scores you against the recipe and lands on the same five."),
  table([
    row("Roll", "Tier", "What it does to what's made"),
    row("Natural 1", "Failed", "It's made, and it does nothing"),
    row("2–11", "Weak", "−2 to its effect, a die less, worth less"),
    row("12–19", "Standard", "As written"),
    row("20–24", "Fine", "+2 to its effect, a die more"),
    row("25+", "Masterwork", "+5 to its effect, two dice more, worth three times as much"),
  ]),
  p(muted("A natural 20 is always at least Fine. A recipe can override any of that with its own "), ui("By craftsmanship"), muted(" rows — a Fine potion healing 3d6 instead of 2d6, say.")),
];

const forge: DocNode[] = [
  h(3, icon("Hammer", "#fb923c", 16), " 1. The forge itself"),
  ol(
    [ui("Items"), " → ", ui("New"), " → pick the ", ui("CA Forge"), " template → call it “Village Forge”."],
    ["On its sheet, ", ui("Station for"), " is already ", b("Blacksmithing"), ". Set ", ui("Quick Craft"), " to what the forge is worth: a master's forge might be +2, a camp fire −2."],
    ["Press ", ui("Station setup"), " (yours only) to tick which blueprints may be made here. Tick nothing and it makes anything its user knows."],
    ["Give it to whoever owns it: open their character, ", ui("Inventory"), " → ", ui("Add"), " → the forge. A forge in a player's pack travels with them; one that belongs to a town is simplest left on an NPC sheet the party can reach."],
  ),
  p(muted("Any item can be made a station: open it, "), ui("+ Insert"), muted(" → "), ui("Crafting station"), muted(". A sword that doubles as a field anvil is a perfectly good item.")),
  h(3, icon("Pickaxe", "#fb923c", 16), " 2. Metal to work"),
  p("A material is an ", key("item"), " from the ", ui("CA Material"), " template. Four values decide how it forges:"),
  ul(
    [ui("Heat from"), " / ", ui("Heat to"), " — the band the metal has to stay in while it's hammered. Outside it, blows do nothing and the piece suffers. Set ", ui("Heat to"), " 0 for anything that isn't heated at all: wood, bone, leather."],
    [ui("Hardness"), " (0–10) — harder metal moves less per blow, so it takes longer, and the part comes out tougher."],
    [ui("Colour"), " — what the finished thing looks like."],
    [ui("Weight"), ", ", ui("Value"), ", ", ui("Qty"), " — ordinary item values. One unit is used up per part forged."],
  ),
  p(muted("Three that cover most tables: ")),
  table([
    row("Material", "Heat", "Hardness", "Feels like"),
    row("Iron Ingot", "55–78", "4", "The standard. Forgives a sloppy hand."),
    row("Starsteel Ingot", "72–86", "8", "Narrow heat band, hard: slow, and worth it."),
    row("Oak Billet", "0 (unheated)", "2", "Hafts and bows. Carved cold."),
  ]),
  h(3, icon("Pen", "#fb923c", 16), " 3. What gets made"),
  p("Blacksmithing needs no blueprint. A player opens the forge, draws the mold of the thing they want with the pen tool — click to lay points, drag a line into a curve — and the silhouette they draw ", b("is"), " the weapon: a long thin point reaches and stabs, a heavy head out at the end hits hard and swings slow. Then they pick a metal, work the bellows to hold the heat, hammer the stock down to their outline, and name the thing."),
  p("A ", b("blueprint"), " is for when you want a known pattern that has to be learnt — a guild's sword, a dwarven axe. Make one with ", ui("New"), " → ", ui("CA Blueprint"), ", then on its page:"),
  ol(
    [ui("Parts"), " — one row per piece. Each has a name, a ", b("role"), " (blade adds damage, handle adds accuracy, extra does neither) and a ", b("shape"), " to hammer it down to."],
    [ui("Damage die"), " — the die the finished weapon rolls. The blade's quality adds to its damage, the handle's to its accuracy."],
    [ui("Makes"), " — the item template the weapon is copied from (", ui("CA Weapon"), " unless you have your own)."],
    [ui("By craftsmanship"), " — optional. A value on the finished weapon per tier, e.g. ", key("damage_bonus"), " 0 / 0 / 1 / 2 / 4."],
  ),
  p(muted("A scroll is made for every blueprint automatically — look for “<name> Scroll” beside it. Put one in a player's pack (or just "), ui("Share"), muted(" the blueprint with them) and they know it. Nobody can forge from a blueprint they don't know.")),
];

const alchemy: DocNode[] = [
  h(3, icon("FlaskConical", "#34d399", 16), " 1. The pot"),
  ol(
    [ui("Items"), " → ", ui("New"), " → ", ui("CA Alchemist Pot"), " → name it."],
    [ui("Station for"), " is ", b("Alchemy"), " already. ", ui("Quick Craft"), " is the pot's quality."],
    [ui("Station setup"), " ticks which recipes can be brewed in it — a field kit that only does salves, say."],
    ["Put it in somebody's inventory. Whoever carries it brews at it."],
  ),
  h(3, icon("Leaf", "#34d399", 16), " 2. Ingredients"),
  p("An ingredient is an ", key("item"), " from ", ui("CA Ingredient"), ". There is nothing to set beyond the name, the weight and the value — a recipe asks for it ", b("by name"), ", and any item of that name counts, as does any copy of the exact sheet you point the recipe at."),
  p(muted("Keep the names plain and reuse them: “Emberbloom”, “Cave Moss”, “Silver Dust”. The recipe is written against the name, so a second Emberbloom sheet with the same name works just as well.")),
  h(3, icon("ScrollText", "#34d399", 16), " 3. A recipe"),
  p(ui("New"), " → ", ui("CA Recipe"), " → name it (“Draught of Ember Vigor”). On its page:"),
  ol(
    [ui("Ingredients"), " — name and how many of each. They're used up when the brew finishes."],
    [ui("Steps"), ", in order. Each one is a little game the player has to play: ", b("Mix"), " (stir for so many seconds), ", b("Dice"), " (so many cuts of an ingredient), ", b("Heat"), " (bring it to a temperature and hold it), ", b("Add"), " (drop an ingredient in at the right moment of a sweep), ", b("Grind"), " (strokes to a beat), ", b("Strain"), ", ", b("Rest"), ". Every step is scored, and the scores together make the tier."],
    [ui("Makes"), " — the item template the result is copied from, usually ", ui("CA Consumable"), "."],
    [ui("By craftsmanship"), " — what the tier changes on the result. A potion that heals ", key("2d6"), " can heal ", key("1d6"), " weak and ", key("4d6"), " masterwork; or set a plain number like ", key("potency"), " −2 / 0 / 2 / 5."],
  ),
  p(b("Experimenting"), ": a player can brew with no recipe at all — they throw in what they like, play the steps they like, and you decide what comes out of it. Nothing to set up; it's always available at a pot."),
  p(muted("Recipes are yours until you give them away: "), ui("Share"), muted(" one with the players who've learnt it, or hand out its scroll. A player can only brew what they know and what the pot allows.")),
];

const runes: DocNode[] = [
  h(3, icon("PenTool", "#a78bfa", 16), " 1. The pen"),
  ol(
    [ui("Items"), " → ", ui("New"), " → ", ui("CA Runemaking Pen"), " → name it."],
    [ui("Station for"), " is ", b("Rune Making"), ". ", ui("Mark style"), " decides how its runes look: ", b("Drawn"), " sits on the surface, ", b("Carved"), " is cut into it."],
    [ui("Station setup"), " ticks which runes may be made with it."],
  ),
  h(3, icon("Droplet", "#f0abfc", 16), " 2. Inks and tools"),
  ul(
    ["An ", b("ink"), " is an item from ", ui("CA Ink"), ": a ", ui("colour"), " and a ", ui("glow"), " (0 none, 100 blazing). The rune takes both, on the item and in its picture. One unit is used per rune."],
    ["A ", b("tool"), " is an item from ", ui("CA Tool"), ": its ", ui("Mark style"), " sets carved or drawn, its ", ui("Skill points"), " are lent to whoever works with it (so a fine needle makes a steadier hand), and its ", ui("Finest rune"), " is the smallest mark it can manage — a blunt chisel can't do delicate work."],
  ),
  h(3, icon("Sparkles", "#a78bfa", 16), " 3. A rune recipe"),
  p(ui("New"), " → ", ui("CA Rune Recipe"), " → name it (“Rune of the Twinned Flame”). On its page:"),
  ol(
    ["Draw the ", ui("sigil"), ". The pen draws freehand; ", ui("line"), ", ", ui("arc"), ", ", ui("ring"), ", ", ui("polygon"), " and ", ui("star"), " draw the shapes properly. ", ui("Snap"), " makes strokes meet; ", ui("Mirror"), " lays down both halves at once; ", ui("Fit"), " centres the whole thing and fills the box."],
    [ui("Ingredients"), " — anything the rune eats besides ink."],
    [ui("Tools"), " — a particular tool it needs, or leave it empty for any tool that marks."],
    [ui("Inks"), " — one, or several. With more than one, say which ink each stroke wants: the crafter changes ink part-way through, and what's already down keeps the ink it was drawn with. A two-ink rune is a real test."],
    [ui("Makes"), " — the item the rune becomes, normally ", ui("CA Rune"), "."],
    [ui("What it does"), " — a value on the item it's set into, per tier: ", key("damage_bonus"), " 1 / 2 / 3 is the usual shape. A failed trace gives nothing."],
  ),
  h(3, icon("Shapes", "#a78bfa", 16), " 4. Room on the item"),
  p("A rune is cut or drawn into a real surface, so it takes real room. Runes can't overlap, a bigger item holds more, and a tool can only work so fine. When an item has no room left, no more runes go on it."),
  p(b("A botched rune stays on the item."), " Miss the shape, or use the wrong ink, and the mark is still there — spoiled, doing nothing, and taking up the room. Only you can take one off again (a player can't rub out their own mistake)."),
];

const handing: DocNode[] = [
  h(3, icon("Share2", GILT, 16), " Who can make what"),
  p("Three gates, and they stack:"),
  ol(
    [b("Knowing it"), " — a player can only make a definition they can see. ", ui("Share"), " it with them, or put its scroll in their pack. Scrolls are made for every blueprint, recipe and rune: look for “<name> Scroll” beside it."],
    [b("Having a station"), " — the forge, pot or pen has to be in somebody's inventory, and they have to open its sheet. The craft opens underneath it."],
    [b("The station allowing it"), " — ", ui("Station setup"), " on the station ticks which definitions it can make. Empty means anything its user knows."],
  ),
  p(muted("Whoever takes the first step is at the controls; everybody who can see the sheet watches it happen live. Only you can take over mid-craft.")),
  h(3, icon("Lightbulb", GILT, 16), " A first evening's worth"),
  p("If you set up nothing else, set up this:"),
  ol(
    ["A ", b("Village Forge"), " (CA Forge) and an ", b("Iron Ingot"), " (CA Material, heat 55–78, hardness 4, qty 20) in the party's pack. That alone gets you a working smithy — mold-drawing needs no blueprint."],
    ["An ", b("Alchemist Pot"), " (CA Alchemist Pot), two ingredients (", b("Emberbloom"), ", ", b("Cave Moss"), ", qty 10 each) and one recipe with three or four steps. Players can also just experiment."],
    ["A ", b("Runemaking Pen"), " (CA Runemaking Pen), one ", b("Voidblack Ink"), " (CA Ink) and one rune recipe worth +1/+2/+3 damage. Hand its scroll to whoever's earned it."],
  ),
  p(muted("Everything above is an ordinary sheet. Open it, change its values, rewrite its page, copy it, throw it away — the crafts read whatever is there at the time.")),
];

export function craftGuideSnapshot(): AgSnapshot {
  const page: DocNode[] = [
    p(icon("Anvil", GILT, 18), " ", t("Crafting in Cultivator's Adventure", { bold: {}, textStyle: { color: "#fde68a" } })),
    p(i("Everything a craft needs is a sheet you can open. This is how to build each one, and what every value on it does.")),
    hr(),
    ...overview,
    hr(),
    tabs("craft-guide", [
      { title: "Blacksmithing", icon: "Hammer", content: forge },
      { title: "Alchemy", icon: "FlaskConical", content: alchemy },
      { title: "Rune Making", icon: "PenTool", content: runes },
      { title: "Handing it out", icon: "Share2", content: handing },
    ]),
  ];
  return {
    note: {
      type: "note", isTemplate: false, templateMeta: null, templateId: null, templateVersion: null,
      name: CRAFT_GUIDE_NAME, portrait: null, ownerIds: [],
      // Yours to read; Share it with the table if you want them to have it.
      acl: { view: "gm", edit: "gm" }, bodyAcl: { view: "inherit", edit: "inherit" },
      tokenBars: null, folder: CA_CRAFT_FOLDER, sortOrder: -10,
    },
    fields: [], regions: [], actions: [], modifiers: [],
    docs: { note: buildDocState(page) },
  };
}

/** The guide, made once per scope. Renaming or deleting it keeps it gone. */
export async function ensureCraftGuide(store: ScopeStore, cs: ChangeSet): Promise<AgNote | null> {
  const have = Array.from(store.notes.values()).find((n) => !n.isTemplate && n.name === CRAFT_GUIDE_NAME);
  if (have) return have;
  return snap.createFromSnapshot(store, craftGuideSnapshot(), {}, cs);
}
