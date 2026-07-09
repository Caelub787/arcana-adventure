/**
 * Draft-mode ItemBuildRecipeEditor.
 *
 * Lets an author define the "build recipe" for ANY item: the ingredients
 * needed to craft it (plus an output quantity). It also recommends a price
 * by summing the ingredient costs (respecting currency conversion), adding
 * 20%, rounding UP to a clean denomination, and AUTO-FILLING the item's
 * Price/Currency by default (the admin can still override; an explicit
 * "Apply" button re-applies the recommendation after a manual override).
 *
 * Build recipes are AA V2 / V3 only. The parent dialog bundles this draft
 * into its save payload under `buildRecipe`; persistence is handled by the
 * host transport bridge.
 */
import * as React from "react";
import { Button, Input, Select, SelectItem, Stack, Row, Section } from "../ui/primitives";
import { NumberInput } from "./NumberInput";
import { optionalNum } from "../lib/utils";
import type { HostAdapter } from "../types";

export type BuildRecipeIngredientDraft = {
  id?: string;
  itemId?: string | null;
  itemName: string;
  quantity: number;
  sortOrder?: number;
};

export type BuildRecipeDraft = {
  id?: string;
  outputQuantity: number;
  ingredients: BuildRecipeIngredientDraft[];
};

type PickerItem = { id: string; name: string; price: number; currency: string; rarity: string; itemType: string };

// Copper-equivalent value of one unit of each currency.
export const CURRENCY_RATE: Record<string, number> = { copper: 1, silver: 10, gold: 100, platinum: 1000 };

// Flat cost (in copper) added per item based on its rarity. Applied per
// ingredient (times its quantity) and once per crafted output item.
//   common 2s, uncommon 5s, rare 1g, epic 3g, legendary 5g
export const RARITY_SURCHARGE: Record<string, number> = {
  common: 20,
  uncommon: 50,
  rare: 100,
  epic: 300,
  legendary: 500,
};
export const raritySurcharge = (rarity?: string | null): number =>
  RARITY_SURCHARGE[(rarity ?? "common").toLowerCase()] ?? 0;

// Express an EXACT copper amount as the largest single denomination.
export function denominate(copper: number): { price: number; currency: string } {
  if (copper <= 0) return { price: 0, currency: "copper" };
  if (copper % 1000 === 0) return { price: copper / 1000, currency: "platinum" };
  if (copper % 100 === 0) return { price: copper / 100, currency: "gold" };
  if (copper % 10 === 0) return { price: copper / 10, currency: "silver" };
  return { price: copper, currency: "copper" };
}

/**
 * Round a copper amount UP to a clean denomination, then express it as the
 * largest single denomination. Rounds up to a whole number of the largest
 * denomination tier that is <= the amount, e.g. 96 copper -> 100 copper -> 1 gold.
 * Rounding up guarantees the price always exceeds cost + markup.
 */
export function recommendFromCopper(copper: number): { price: number; currency: string } {
  if (copper <= 0) return { price: 0, currency: "copper" };
  let tier = 1;
  for (const rate of [1000, 100, 10, 1]) {
    if (rate <= copper) { tier = rate; break; }
  }
  const rounded = Math.ceil(copper / tier) * tier;
  return denominate(rounded);
}

/**
 * Inline searchable item picker for V3 ingredient rows.
 * Uses only package primitives — no Radix, no shadcn, no Tailwind.
 */
const InlineItemPicker: React.FC<{
  value: string | null | undefined;
  items: PickerItem[];
  onChange: (itemId: string | null, itemName: string) => void;
  rowIndex: number;
}> = ({ value, items, onChange, rowIndex }) => {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const containerRef = React.useRef<HTMLDivElement>(null);

  const selected = value ? items.find(it => it.id === value) : null;
  const q = search.trim().toLowerCase();
  const filtered = q ? items.filter(it => it.name.toLowerCase().includes(q)) : items;

  React.useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const pick = (itemId: string | null, itemName: string) => {
    onChange(itemId, itemName);
    setOpen(false);
    setSearch("");
  };

  return (
    <div ref={containerRef} style={{ position: "relative", flex: 1 }}>
      <Button
        size="sm"
        variant="outline"
        onClick={() => setOpen(o => !o)}
        style={{ width: "100%", textAlign: "left", justifyContent: "flex-start" }}
        data-testid={`button-build-ingredient-picker-${rowIndex}`}
      >
        {selected ? selected.name : <span style={{ opacity: 0.5 }}>— item —</span>}
      </Button>
      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            right: 0,
            zIndex: 50,
            background: "var(--ld-surface, #1c1917)",
            border: "1px solid var(--ld-border, #44403c)",
            borderRadius: 6,
            boxShadow: "0 4px 16px rgba(0,0,0,0.5)",
            minWidth: 200,
          }}
        >
          <div style={{ padding: "6px 8px", borderBottom: "1px solid var(--ld-border, #44403c)" }}>
            <Input
              autoFocus
              placeholder="Search items…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              data-testid={`input-build-ingredient-search-${rowIndex}`}
            />
          </div>
          <div style={{ maxHeight: 220, overflowY: "auto" }}>
            <button
              type="button"
              onClick={() => pick(null, "")}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                padding: "6px 10px",
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "var(--ld-muted, #a8a29e)",
                fontSize: 13,
              }}
              data-testid={`button-build-ingredient-none-${rowIndex}`}
            >
              — none —
            </button>
            {filtered.map(it => (
              <button
                key={it.id}
                type="button"
                onClick={() => pick(it.id, it.name)}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "6px 10px",
                  background: it.id === value ? "var(--ld-accent-muted, rgba(217,119,6,0.15))" : "none",
                  border: "none",
                  cursor: "pointer",
                  color: "var(--ld-text, #e7e5e4)",
                  fontSize: 13,
                }}
                data-testid={`button-build-ingredient-option-${rowIndex}-${it.id}`}
              >
                <span style={{ fontWeight: it.id === value ? 600 : 400 }}>{it.name}</span>
                {it.itemType && (
                  <span style={{ marginLeft: 6, opacity: 0.5, fontSize: 11 }}>{it.itemType}</span>
                )}
              </button>
            ))}
            {filtered.length === 0 && (
              <div style={{ padding: "8px 10px", color: "var(--ld-muted, #a8a29e)", fontSize: 13 }}>
                No items found.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export interface ItemBuildRecipeEditorProps {
  value: BuildRecipeDraft;
  onChange: (next: BuildRecipeDraft) => void;
  host: HostAdapter;
  /** Apply the recommended price/currency onto the parent item draft. */
  onApplyPrice: (price: number, currency: string) => void;
  /** Rarity of the item being made; adds a per-output rarity surcharge to the price. */
  outputRarity?: string | null;
  /** AA V3 uses an inline searchable popover to pick ingredients; V2 keeps the dropdown. */
  isV3?: boolean;
}

export const ItemBuildRecipeEditor: React.FC<ItemBuildRecipeEditorProps> = ({ value, onChange, host, onApplyPrice, outputRarity, isV3 }) => {
  const [items, setItems] = React.useState<PickerItem[]>([]);
  React.useEffect(() => {
    let cancelled = false;
    host.transport.list<any>("item")
      .then(res => {
        if (cancelled) return;
        setItems((res.data ?? []).map((it: any) => ({
          id: it.id,
          name: it.name,
          price: typeof it.price === "number" ? it.price : 0,
          currency: it.currency ?? "copper",
          rarity: it.rarity ?? "common",
          itemType: it.itemType ?? "",
        })));
      })
      .catch(e => host.notify("warning", `Could not load items for recipe picker: ${e?.message ?? e}`));
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const ingredients = value.ingredients ?? [];
  const outputQuantity = value.outputQuantity ?? 1;

  // Each ingredient costs its base price plus a flat rarity surcharge, per unit.
  // The crafted item adds its own rarity surcharge once per output item.
  // Recommended per-unit price = round-up( (ingredientsCost + madeRarity*qty) * 1.2 / outputQty ).
  const totalIngredientCopper = ingredients.reduce((sum, ing) => {
    const found = items.find(it => it.id === ing.itemId);
    if (!found) return sum;
    const rate = CURRENCY_RATE[found.currency] ?? 1;
    const perUnit = found.price * rate + raritySurcharge(found.rarity);
    return sum + perUnit * (ing.quantity || 0);
  }, 0);
  const madeItemRarityCopper = raritySurcharge(outputRarity) * Math.max(1, outputQuantity);
  const totalCostCopper = totalIngredientCopper + madeItemRarityCopper;
  const perUnitCopper = ingredients.length > 0
    ? Math.ceil((totalCostCopper * 1.2) / Math.max(1, outputQuantity))
    : 0;
  const recommended = recommendFromCopper(perUnitCopper);
  const hasUnpriced = ingredients.some(ing => ing.itemId && !items.find(it => it.id === ing.itemId));

  // Auto-fill the price/currency by default whenever the user changes the
  // recipe. We only apply after a real user edit (tracked via the ref) so we
  // never clobber a saved price on initial load or while the picker is loading.
  const userEditedRef = React.useRef(false);
  React.useEffect(() => {
    if (!userEditedRef.current) return;
    if (perUnitCopper <= 0) return;
    onApplyPrice(recommended.price, recommended.currency);
  }, [perUnitCopper, recommended.price, recommended.currency]); // eslint-disable-line react-hooks/exhaustive-deps

  const setIngredients = (next: BuildRecipeIngredientDraft[]) => {
    userEditedRef.current = true;
    onChange({ ...value, ingredients: next });
  };
  const setOutputQuantity = (n: number) => {
    userEditedRef.current = true;
    onChange({ ...value, outputQuantity: n });
  };

  const addIngredientRow = () => {
    setIngredients([...ingredients, { itemName: "", quantity: 1, sortOrder: ingredients.length }]);
  };

  return (
    <Stack data-testid="build-recipe-editor">
      <div className="ld-subtle">
        Define what this item is built from. Costs are summed (10 copper = 1 silver, 10 silver = 1 gold,
        10 gold = 1 platinum), +20% markup, rounded up to a clean price — auto-filled into Price below (you can change it).
      </div>

      <div style={{ maxWidth: 200 }}>
        <span className="ld-label">Output quantity</span>
        <NumberInput
          min={1} value={outputQuantity} fallback={1}
          onChange={(v) => setOutputQuantity(v ?? 1)}
          data-testid="input-build-output-quantity"
        />
      </div>

      <Section title={`Ingredients (${ingredients.length})`}>
        {ingredients.length === 0 && <div className="ld-subtle">No ingredients yet.</div>}
        {ingredients.map((ing, ii) => (
          <Row key={ing.id ?? ii} style={{ marginBottom: 6 }}>
            {isV3 ? (
              <InlineItemPicker
                value={ing.itemId}
                items={items}
                rowIndex={ii}
                onChange={(itemId, itemName) => {
                  const next = ingredients.slice();
                  next[ii] = { ...ing, itemId: itemId || null, itemName: itemName || ing.itemName };
                  setIngredients(next);
                }}
              />
            ) : (
              <Select value={ing.itemId ?? ""} onValueChange={v => {
                const found = items.find(it => it.id === v);
                const next = ingredients.slice();
                next[ii] = { ...ing, itemId: v || null, itemName: found?.name ?? ing.itemName };
                setIngredients(next);
              }}>
                <SelectItem value="">— item —</SelectItem>
                {items.map(it => <SelectItem key={it.id} value={it.id}>{it.name}</SelectItem>)}
              </Select>
            )}
            <NumberInput style={{ width: 80 }} min={1} value={ing.quantity} fallback={1}
              onChange={(v) => {
                const next = ingredients.slice();
                next[ii] = { ...ing, quantity: v ?? 1 };
                setIngredients(next);
              }} />
            <Button size="sm" variant="danger" onClick={() => setIngredients(ingredients.filter((_, i) => i !== ii))} data-testid={`button-remove-build-ingredient-${ii}`}>×</Button>
          </Row>
        ))}
        <Button size="sm" onClick={addIngredientRow} data-testid="button-add-build-ingredient">+ Add ingredient</Button>
      </Section>

      {ingredients.length > 0 && (
        <Row style={{ justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <span className="ld-label" style={{ margin: 0 }}>Recommended price (auto-filled)</span>
            <div style={{ color: "var(--ld-accent, #d97706)", fontWeight: 600 }} data-testid="text-recommended-price">
              {recommended.price} {recommended.currency}
              {hasUnpriced && <span className="ld-subtle" style={{ marginLeft: 8, fontWeight: 400 }}>(some ingredients unpriced)</span>}
            </div>
          </div>
          <Button size="sm" variant="primary" onClick={() => onApplyPrice(recommended.price, recommended.currency)} data-testid="button-apply-recommended-price">Re-apply</Button>
        </Row>
      )}
    </Stack>
  );
};
