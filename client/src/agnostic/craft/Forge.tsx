// Blacksmithing: pick a blueprint, then make its parts one at a time — pick a
// material, keep the metal in its heat range with the bellows, and hammer the
// glowing stock down to the outline. Parts already made (now or in an earlier
// session) are used for that blueprint; with every part made, assemble the weapon.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Flame, Hammer, Wind, Droplets, ArrowLeft, Check, Circle, Disc3 } from "lucide-react";
import type { AgNote } from "@shared/agnostic/types";
import {
  FORGE_SHAPES, FINE_COLS, FINE_ROWS, startingStock, shapeMask, shapeScore, hammerMetal, grindMetal, outlineDistance, GRIND_REACH, breakLoose, packMetal, unpackMetal, partStats, numOf, TIER_COLOR, TIER_LABEL,
  type ForgeConfig, type ForgePart, type Metal,
} from "@shared/agnostic/crafting";
import { useAg } from "../hooks";
import { useToast } from "@/hooks/use-toast";
import { valueOn, hasValue, qtyOf, inventoryOf, craftHand, toolEffectsOn, type CraftState } from "./session";
import { ItemTile, ResultBanner, QuickCraftButton, useDefs, announceRoll, colorOf, Needs, NoneKnown, NotHere, stationNameOf, ChoiceRow, DefStrip, DefCard, type CraftOutcome, type KnownDef } from "./common";
import { drawMetal, drawTarget, drawBlocks, drawWheel, heatColor, stepParticles, weaponPortrait, partPortrait, type Particle } from "./render";
import { Anvil, materialOf } from "./Anvil";
import { MoldForge, ForgeModeSwitch } from "./Mold";

interface Props {
  characterId: string; state: CraftState; set: (p: CraftState) => void; playing: boolean;
  /** Begin crafting (whoever does is the one at the controls) with these changes. */ start: (p: CraftState) => void;
  /** The station item it's worked at. */ stationId?: string;
}
type ScopeState = ReturnType<typeof useAg>["state"];

const isMaterial = (st: ScopeState, n: AgNote) => hasValue(st, n.id, "heat_min") || hasValue(st, n.id, "hardness") || valueOn(st, n.id, "item_type") === "Material";
const ROLE_WORD: Record<string, string> = { blade: "damage", handle: "accuracy", extra: "extra" };

export function ForgeTool({ characterId, state: s, set, start, playing, stationId }: Props) {
  const ag = useAg();
  const defs = useDefs<ForgeConfig>("forge", characterId, stationId);
  const bp = defs.find((d) => d.defId === s.bp && d.here);
  // Free forging — draw your own mold — is how the forge works now; blueprints
  // are still here for anyone who has the scrolls for them. A session already
  // part-way through a blueprint stays on it rather than jumping to the pen.
  const free = s.forge ? s.forge !== "blueprint" : !s.bp;
  if (free) return <MoldForge characterId={characterId} s={s} set={set} start={start} playing={playing} stationId={stationId} onMode={() => set({ forge: "blueprint", stage: undefined, result: undefined })} hasBlueprints={defs.length > 0} />;
  if (s.stage === "anvil" && bp) return <PartAnvil characterId={characterId} bp={bp} s={s} set={set} playing={playing} stationId={stationId} />;
  return <ForgePlan characterId={characterId} defs={defs} s={s} set={set} start={start} playing={playing} openNote={ag.openNote} stationId={stationId} onMode={() => set({ forge: "free", stage: undefined, result: undefined })} />;
}

/** A blueprint part at the anvil: the blueprint's outline, and a part saved at the quench. */
function PartAnvil({ characterId, bp, s, set, playing, stationId }: { characterId: string; bp: KnownDef<ForgeConfig>; s: CraftState; set: Props["set"]; playing: boolean; stationId?: string }) {
  const { state, request } = useAg();
  const { toast } = useToast();
  const part = bp.config.parts.find((p) => p.key === s.part) ?? bp.config.parts[0];
  const matId: string | undefined = (s.mats ?? {})[part.key];
  const mat = materialOf(state, matId) ?? { heatMin: 0, heatMax: 100, hasHeat: false, hardness: 3, color: "#9ca3af", weight: 1, value: 1 };
  const hand = craftHand(state, characterId, "blacksmithing", [s.hammer]);
  const quench = async (metal: Metal, shape: number, heat: number) => {
    if (!matId) return;
    try {
      const portrait = partPortrait(part.shape, metal, mat.color);
      const res: CraftOutcome = await request({ op: "craft.forgePart", characterId, stationId, blueprintId: bp.id, partKey: part.key, materialId: matId, shape, heat, portrait, metal: packMetal(metal) });
      set({ stage: "plan", metal: undefined, tool: undefined, result: res, picks: { ...(s.picks ?? {}), [part.key]: res.noteId }, mats: { ...(s.mats ?? {}), [part.key]: undefined } });
    } catch (e: any) { toast({ title: "Couldn't save the part", description: e.message, variant: "destructive" }); }
  };
  return (
    <Anvil title={`${bp.name} — ${part.label}`} shape={part.shape} matId={matId} skill={hand.skill} s={s} set={set} playing={playing}
      onBack={() => set({ stage: "plan" })} onQuench={quench}
      stats={(shapePct, heatPct) => {
        const preview = partStats(part.role, shapePct, heatPct, mat);
        return <>Durability <b className="text-stone-200">{preview.durability}%</b> · {part.role === "blade" ? <>Damage <b style={{ color: TIER_COLOR[preview.tier] }}>{preview.damageBonus >= 0 ? "+" : ""}{preview.damageBonus}</b></> : part.role === "handle" ? <>Accuracy <b style={{ color: TIER_COLOR[preview.tier] }}>{preview.accuracy >= 0 ? "+" : ""}{preview.accuracy}</b></> : <b style={{ color: TIER_COLOR[preview.tier] }}>{TIER_LABEL[preview.tier]}</b>}</>;
      }} />
  );
}

// --------------------------------------------------------------------------- planning
function ForgePlan({ characterId, defs, s, set, start, playing, openNote, stationId, onMode }: { characterId: string; defs: Array<KnownDef<ForgeConfig>>; s: CraftState; set: Props["set"]; start: Props["start"]; playing: boolean; openNote: (id: string) => void; stationId?: string; onMode: () => void }) {
  const { state, request, scope } = useAg();
  const { toast } = useToast();
  const character = state.notes.get(characterId);
  const inventory = inventoryOf(state, characterId);
  const bp = defs.find((d) => d.defId === s.bp && d.here) ?? null;
  const mats: Record<string, string | undefined> = s.mats ?? {};
  const picks: Record<string, string | undefined> = s.picks ?? {};
  const materials = inventory.filter((n) => isMaterial(state, n));
  const tools = inventory.filter((n) => hasValue(state, n.id, "tool_skill") || hasValue(state, n.id, "mark_style"));
  // Parts made for this blueprint (now, or in an earlier session) — the best is used unless another is picked.
  const made = (part: ForgePart) => inventory.filter((n) => valueOn(state, n.id, "blueprint_id") === bp?.defId && valueOn(state, n.id, "part_key") === part.key)
    .sort((a, b) => numOf(valueOn(state, b.id, "quality")) - numOf(valueOn(state, a.id, "quality")));
  const metalOn = (id: string) => { const v = valueOn(state, id, "part_metal"); return typeof v === "string" ? unpackMetal(v) : null; };
  const pieceFor = (part: ForgePart) => { const m = made(part); return m.find((n) => n.id === picks[part.key]) ?? m[0]; };
  const [busy, setBusy] = useState(false);
  const required = bp ? bp.config.parts.filter((p) => !p.optional) : [];
  const preview = useMemo(() => {
    if (!bp) return null;
    const parts = bp.config.parts.filter((p) => !p.optional || mats[p.key] || pieceFor(p)).map((p) => {
      const piece = pieceFor(p);
      return { part: p, color: piece ? colorOf(state, piece.id, "metal_color", "#9ca3af") : mats[p.key] ? colorOf(state, mats[p.key]!, "metal_color", "#9ca3af") : "#57534e", metal: piece ? metalOn(piece.id) : null };
    });
    try { return weaponPortrait(parts, 240); } catch { return null; }
  }, [bp, JSON.stringify(mats), JSON.stringify(picks), state]); // eslint-disable-line react-hooks/exhaustive-deps

  const finish = async (op: "craft.forgeQuick" | "craft.forgeWeapon") => {
    if (!bp || !character) return;
    setBusy(true);
    try {
      const pieces: Record<string, string> = {};
      for (const p of bp.config.parts) { const piece = pieceFor(p); if (piece) pieces[p.key] = piece.id; }
      const chosen = op === "craft.forgeQuick" ? mats : pieces;
      // The weapon's picture is the parts as they were actually made.
      const parts = bp.config.parts.filter((p) => chosen[p.key]).map((p) => ({ part: p, color: colorOf(state, chosen[p.key]!, "metal_color", "#9ca3af"), metal: op === "craft.forgeWeapon" ? metalOn(chosen[p.key]!) : null }));
      const portrait = weaponPortrait(parts, 320);
      const res: CraftOutcome = await request(op === "craft.forgeQuick"
        ? { op, characterId, stationId, blueprintId: bp.id, materials: Object.fromEntries(Object.entries(mats).filter(([, v]) => !!v)) as Record<string, string>, toolId: s.hammer ?? null, portrait }
        : { op, characterId, stationId, blueprintId: bp.id, partIds: pieces, portrait });
      announceRoll(character.name, res.roll, scope.kind === "campaign");
      start({ result: res, picks: {}, ...(op === "craft.forgeQuick" ? { mats: {} } : {}) });
    } catch (e: any) { toast({ title: "Couldn't forge it", description: e.message, variant: "destructive" }); }
    finally { setBusy(false); }
  };

  const missingPieces = required.filter((p) => !pieceFor(p));
  const missingMats = required.filter((p) => !mats[p.key]);
  const short = Object.entries(Object.values(mats).filter(Boolean).reduce<Record<string, number>>((a, id) => ({ ...a, [id!]: (a[id!] ?? 0) + 1 }), {}))
    .filter(([id, n]) => qtyOf(state, id) < n).map(([id, n]) => `${n}× ${state.notes.get(id)?.name ?? "that material"} (you have ${qtyOf(state, id)})`);

  return (
    <div className="space-y-2.5">
      <ForgeModeSwitch mode="blueprint" onChange={onMode} playing={playing} />
      <ResultBanner result={s.result} onOpen={openNote} onClose={playing ? () => set({ result: undefined }) : undefined} />
      {!defs.length ? <NoneKnown what="blueprints" /> : (
        <DefStrip>
          {defs.map((d) => (
            <DefCard key={d.defId} selected={s.bp === d.defId} locked={!d.here} disabled={!playing} onClick={() => set({ bp: d.defId, mats: {}, picks: {}, result: undefined })}
              art={<BlueprintSketch config={d.config} />} name={d.name} testId={`forge-bp-${d.name}`}
              sub={d.here ? `${d.config.parts.length} parts · d${d.config.damageDie}` : <NotHere station={stationNameOf(state, stationId)} />} />
          ))}
        </DefStrip>
      )}
      {!bp && defs.length > 0 && <div className="text-[11px] text-stone-400">Pick a blueprint to see its parts.</div>}
      {bp && (
        <>
          <div className="flex items-center gap-3 rounded-lg border border-stone-700 bg-stone-900/60 p-2">
            {preview && <img src={preview} alt="" className="h-20 w-20 sm:h-24 sm:w-24 rounded-md border border-stone-800 shrink-0" />}
            <div className="min-w-0">
              <div className="text-sm font-semibold text-stone-100 truncate">{bp.name}</div>
              <div className="text-[11px] text-stone-400" data-testid="forge-progress">d{bp.config.damageDie} · {bp.config.parts.filter((p) => !!pieceFor(p)).length} of {bp.config.parts.length} parts made</div>
              <div className="text-[10px] text-stone-500 mt-0.5">Blades give damage, handles accuracy. Make each part (any time — they wait in the inventory), then assemble.</div>
            </div>
          </div>
          {tools.length > 0 && (
            <div className="rounded-lg border border-stone-700 bg-stone-900/60 p-2">
              <ChoiceRow label="Tool" empty="No smithing tools.">
                {tools.map((n) => { const e = toolEffectsOn(state, n.id); return (
                  <ItemTile key={n.id} compact note={n} selected={s.hammer === n.id} disabled={!playing} onClick={() => set({ hammer: s.hammer === n.id ? undefined : n.id })}
                    sub={e.skill ? `${e.skill > 0 ? "+" : "−"}${Math.abs(e.skill)} Blacksmithing` : "no help either way"} testId={`forge-tool-${n.name}`} />
                ); })}
              </ChoiceRow>
            </div>
          )}
          <div className="space-y-1.5">
            {bp.config.parts.map((part) => {
              const mat = mats[part.key];
              const pieces = made(part);
              const piece = pieceFor(part);
              const usable = part.role === "handle" ? materials : [...materials].sort((a, b) => Number(materialOf(state, b.id)!.hasHeat) - Number(materialOf(state, a.id)!.hasHeat));
              return (
                <div key={part.key} className="rounded-lg border border-stone-700 bg-stone-900/60 p-2 space-y-1.5" data-testid={`forge-part-${part.key}`}>
                  <div className="flex items-center gap-2">
                    <ShapeChip shape={part.shape} color={piece ? colorOf(state, piece.id, "metal_color", "#a8a29e") : mat ? colorOf(state, mat, "metal_color", "#a8a29e") : "#57534e"} />
                    <span className="text-sm font-semibold text-stone-100">{part.label}</span>
                    <span className="text-[10px] text-stone-500">{ROLE_WORD[part.role]}{part.optional ? " · optional" : ""}</span>
                    <span className="ml-auto inline-flex items-center gap-1 text-[11px]" data-testid={`forge-part-status-${part.key}`}>
                      {piece ? <><Check className="h-3.5 w-3.5 text-emerald-400" /><span className="text-emerald-300">made</span></> : <><Circle className="h-3 w-3 text-stone-500" /><span className="text-stone-400">to make</span></>}
                    </span>
                  </div>
                  {pieces.length > 0 && (
                    <ChoiceRow label="Made">
                      {pieces.map((n) => <ItemTile key={n.id} compact note={n} selected={piece?.id === n.id} disabled={!playing} onClick={() => set({ picks: { ...picks, [part.key]: n.id } })}
                        sub={`${numOf(valueOn(state, n.id, "quality"))}% · dur ${numOf(valueOn(state, n.id, "durability"))}%`} testId={`forge-saved-${part.key}-${n.name}`} />)}
                    </ChoiceRow>
                  )}
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="flex-1 min-w-0">
                      <ChoiceRow label={pieces.length ? "Forge new" : "Forge from"} empty="No materials — you need an ingot, wood or leather.">
                        {usable.map((m) => {
                          const mm = materialOf(state, m.id)!;
                          return <ItemTile key={m.id} compact note={m} selected={mat === m.id} disabled={!playing} color={mm.color} onClick={() => set({ mats: { ...mats, [part.key]: mat === m.id ? undefined : m.id } })}
                            sub={mm.hasHeat ? `${mm.heatMin}–${mm.heatMax}° · hard ${mm.hardness}` : `hard ${mm.hardness}`} testId={`forge-mat-${part.key}-${m.name}`} />;
                        })}
                      </ChoiceRow>
                    </div>
                    {playing && (
                      <button type="button" disabled={!mat || qtyOf(state, mat) < 1} title={!mat ? `Pick a material for the ${part.label.toLowerCase()}` : undefined}
                        onClick={() => start({ stage: "anvil", part: part.key, metal: packMetal(startingStock(part.shape)), tool: "hammer", heat: 20, good: 0, bad: 0, strikes: 0, result: undefined })}
                        className="shrink-0 h-8 px-3 rounded-md bg-amber-600 hover:bg-amber-500 text-white text-xs font-medium inline-flex items-center gap-1.5 disabled:opacity-40" data-testid={`forge-start-${part.key}`}>
                        <Hammer className="h-3.5 w-3.5" /> Forge
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          {playing && (
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" disabled={busy || missingPieces.length > 0} onClick={() => finish("craft.forgeWeapon")}
                  className="h-9 px-4 rounded-md bg-amber-600 hover:bg-amber-500 text-white text-sm font-medium inline-flex items-center gap-1.5 disabled:opacity-40" data-testid="forge-assemble">
                  <Check className="h-4 w-4" /> Assemble
                </button>
                <QuickCraftButton kind="forge" characterId={characterId} busy={busy} disabled={missingMats.length > 0 || short.length > 0} onClick={() => finish("craft.forgeQuick")} tools={[s.hammer]} title="Roll d20 + Blacksmithing and forge the whole weapon at once from the materials picked for each part" />
              </div>
              <Needs items={[
                missingPieces.length > 0 && `To assemble: make the ${missingPieces.map((p) => p.label.toLowerCase()).join(" and ")}`,
                ...short.map((t) => `Quick Craft needs ${t}`),
              ]} />
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** A blueprint's parts, laid out as the weapon they make. */
function BlueprintSketch({ config }: { config: ForgeConfig }) {
  const src = useMemo(() => { try { return weaponPortrait(config.parts.map((p) => ({ part: p, color: p.role === "handle" ? "#7c5a3a" : "#94a3b8" })), 128); } catch { return ""; } }, [config]);
  return src ? <img src={src} alt="" className="h-16 w-16 opacity-90" /> : null;
}
/** A part's outline. */
function ShapeChip({ shape, color }: { shape: string; color: string }) {
  const pts = FORGE_SHAPES[shape]?.points ?? [];
  return <svg viewBox="0 0 100 40" className="h-5 w-12 shrink-0"><polygon points={pts.map(([x, y]) => `${x},${y}`).join(" ")} fill={color} stroke="#0c0a09" strokeWidth={1.5} /></svg>;
}
