// Built-in content every Agnostic scope starts with — ordinary, fully
// editable components (the GM can restyle, rename or delete them). Each scope
// gets each round once: a deleted built-in stays deleted.
import { randomUUID } from "crypto";
import type { AgCampaignSettings, AgComponentDef, AgLayout, AgWidget } from "@shared/agnostic/types";
import { scopeKey } from "@shared/agnostic/types";
import * as repo from "./repo";
import type { ScopeStore } from "./store";

interface Builtin { key: string; name: string; params: string[]; layout: AgLayout }

/**
 * Round 1: the HP pieces blank characters / NPCs and the default tracker card
 * use. Their parameters are named after the values ($hp, $hp_max), so placed
 * anywhere with nothing connected they show that sheet's own HP.
 */
const ROUND_1: Builtin[] = [
  {
    key: "hp_bar", name: "HP bar", params: ["hp", "hp_max"],
    layout: { width: 160, height: 18, items: [
      { id: "bar", x: 0, y: 0, w: 160, h: 18, widget: { kind: "field", ref: "$hp", maxRef: "$hp_max", display: "bar", label: "HP", showLabel: true, color: "#16a34a",
        look: { labelPos: "inside", numbers: "fraction", barStyle: "gradient", radius: 4, track: "#1c1917" } } },
    ] },
  },
  {
    key: "hp", name: "HP", params: ["hp"],
    layout: { width: 150, height: 28, items: [
      { id: "v", x: 0, y: 0, w: 150, h: 28, widget: { kind: "field", ref: "$hp", display: "input", label: "HP", showLabel: true } },
    ] },
  },
  {
    key: "hp_max", name: "Max HP", params: ["hp_max"],
    layout: { width: 170, height: 28, items: [
      { id: "v", x: 0, y: 0, w: 170, h: 28, widget: { kind: "field", ref: "$hp_max", display: "input", label: "Max HP", showLabel: true } },
    ] },
  },
];

const ROUNDS: Builtin[][] = [ROUND_1];
export const BUILTIN_SEED_LEVEL = ROUNDS.length;

/** The default tracker card's plain HP bar, from before the HP bar was a component. */
function isPlainHpBar(w: AgWidget) {
  return w.kind === "field" && w.display === "bar" && w.ref === "hp" && w.maxRef === "hp_max";
}

/** Add any built-ins this scope hasn't had yet. Runs while the scope loads (nobody is connected). */
export async function seedBuiltins(store: ScopeStore): Promise<void> {
  const key = scopeKey(store.scope);
  const level = await repo.getSeedLevel(key);
  if (level >= BUILTIN_SEED_LEVEL) return;
  const created: Record<string, string> = {};
  for (let r = level; r < ROUNDS.length; r++) {
    for (const b of ROUNDS[r]) {
      const c: AgComponentDef = {
        id: randomUUID(), scope: store.scope.kind, scopeId: store.scope.id,
        name: b.name, params: b.params, layout: JSON.parse(JSON.stringify(b.layout)), updatedAt: Date.now(),
      };
      await repo.upsertComponent(c);
      store.components.set(c.id, c);
      created[b.key] = c.id;
    }
  }
  // Campaign tracker cards: point the stock HP bar at the component, so
  // restyling "HP bar" restyles the tracker too.
  if (created.hp_bar && store.scope.kind === "campaign" && store.settings) {
    const s: AgCampaignSettings = store.settings;
    let changed = false;
    for (const card of s.tracker.cards) {
      for (const it of card.layout.items) {
        if (isPlainHpBar(it.widget)) {
          it.widget = { kind: "component", componentId: created.hp_bar, bindings: {} };
          changed = true;
        }
      }
    }
    if (changed) await repo.saveSettings(store.scope.id, s);
  }
  await repo.setSeedLevel(key, BUILTIN_SEED_LEVEL);
}
