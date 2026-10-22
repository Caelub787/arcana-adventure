// Blacksmithing: pick a blueprint, then make its parts one at a time — pick a
// material, keep the metal in its heat range with the bellows, and hammer the
// glowing stock down to the outline. Parts already made (now or in an earlier
// session) are used for that blueprint; with every part made, assemble the weapon.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Flame, Hammer, Wind, Droplets, ArrowLeft, Check, Circle } from "lucide-react";
import type { AgNote } from "@shared/agnostic/types";
import {
  FORGE_COLS, FORGE_ROWS, startingStock, shapeMask, shapeScore, strikeMetal, metalFits, partStats, numOf, TIER_COLOR, TIER_LABEL,
  type ForgeConfig, type ForgePart,
} from "@shared/agnostic/crafting";
import { useAg } from "../hooks";
import { useToast } from "@/hooks/use-toast";
import { valueOn, hasValue, qtyOf, inventoryOf, type CraftState } from "./session";
import { ItemTile, ResultBanner, QuickCraftButton, useDefs, announceRoll, colorOf, Needs, NoneKnown, NotHere, stationNameOf, ChoiceRow, DefStrip, DefCard, type CraftOutcome, type KnownDef } from "./common";
import { drawMetal, drawTarget, heatColor, stepParticles, weaponPortrait, partPortrait, type Particle } from "./render";

interface Props {
  characterId: string; state: CraftState; set: (p: CraftState) => void; playing: boolean;
  /** Begin crafting (whoever does is the one at the controls) with these changes. */ start: (p: CraftState) => void;
  /** The station item it's worked at. */ stationId?: string;
}
type ScopeState = ReturnType<typeof useAg>["state"];

/** A material's numbers (an item with heat_min / heat_max / hardness / metal_color). */
function materialOf(st: ScopeState, id: string | undefined) {
  if (!id) return null;
  // "Heat to" 0: a material that isn't heated (wood, leather).
  const hasHeat = (hasValue(st, id, "heat_min") || hasValue(st, id, "heat_max")) && numOf(valueOn(st, id, "heat_max"), 100) > 0;
  return {
    heatMin: numOf(valueOn(st, id, "heat_min"), 0), heatMax: numOf(valueOn(st, id, "heat_max"), 100), hasHeat,
    hardness: numOf(valueOn(st, id, "hardness"), 3), color: colorOf(st, id, "metal_color", "#9ca3af"),
    weight: numOf(valueOn(st, id, "weight"), 1), value: numOf(valueOn(st, id, "value"), 1),
  };
}
const isMaterial = (st: ScopeState, n: AgNote) => hasValue(st, n.id, "heat_min") || hasValue(st, n.id, "hardness") || valueOn(st, n.id, "item_type") === "Material";
const ROLE_WORD: Record<string, string> = { blade: "damage", handle: "accuracy", extra: "extra" };

export function ForgeTool({ characterId, state: s, set, start, playing, stationId }: Props) {
  const ag = useAg();
  const defs = useDefs<ForgeConfig>("forge", characterId, stationId);
  const bp = defs.find((d) => d.defId === s.bp && d.here);
  if (s.stage === "anvil" && bp) return <Anvil characterId={characterId} bp={bp} s={s} set={set} playing={playing} stationId={stationId} />;
  return <ForgePlan characterId={characterId} defs={defs} s={s} set={set} start={start} playing={playing} openNote={ag.openNote} stationId={stationId} />;
}

// --------------------------------------------------------------------------- planning
function ForgePlan({ characterId, defs, s, set, start, playing, openNote, stationId }: { characterId: string; defs: Array<KnownDef<ForgeConfig>>; s: CraftState; set: Props["set"]; start: Props["start"]; playing: boolean; openNote: (id: string) => void; stationId?: string }) {
  const { state, request, scope } = useAg();
  const { toast } = useToast();
  const character = state.notes.get(characterId);
  const inventory = inventoryOf(state, characterId);
  const bp = defs.find((d) => d.defId === s.bp && d.here) ?? null;
  const mats: Record<string, string | undefined> = s.mats ?? {};
  const picks: Record<string, string | undefined> = s.picks ?? {};
  const materials = inventory.filter((n) => isMaterial(state, n));
  // Parts made for this blueprint (now, or in an earlier session) — the best is used unless another is picked.
  const made = (part: ForgePart) => inventory.filter((n) => valueOn(state, n.id, "blueprint_id") === bp?.defId && valueOn(state, n.id, "part_key") === part.key)
    .sort((a, b) => numOf(valueOn(state, b.id, "quality")) - numOf(valueOn(state, a.id, "quality")));
  const pieceFor = (part: ForgePart) => { const m = made(part); return m.find((n) => n.id === picks[part.key]) ?? m[0]; };
  const [busy, setBusy] = useState(false);
  const required = bp ? bp.config.parts.filter((p) => !p.optional) : [];
  const preview = useMemo(() => {
    if (!bp) return null;
    const parts = bp.config.parts.filter((p) => !p.optional || mats[p.key] || pieceFor(p)).map((p) => {
      const piece = pieceFor(p);
      return { part: p, color: piece ? colorOf(state, piece.id, "metal_color", "#9ca3af") : mats[p.key] ? colorOf(state, mats[p.key]!, "metal_color", "#9ca3af") : "#57534e" };
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
      const parts = bp.config.parts.filter((p) => chosen[p.key]).map((p) => ({ part: p, color: colorOf(state, chosen[p.key]!, "metal_color", "#9ca3af") }));
      const portrait = weaponPortrait(parts, 320);
      const res: CraftOutcome = await request(op === "craft.forgeQuick"
        ? { op, characterId, stationId, blueprintId: bp.id, materials: Object.fromEntries(Object.entries(mats).filter(([, v]) => !!v)) as Record<string, string>, portrait }
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
                        sub={`${numOf(valueOn(state, n.id, "quality"))}% · dur ${numOf(valueOn(state, n.id, "durability"))}`} testId={`forge-saved-${part.key}-${n.name}`} />)}
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
                        onClick={() => start({ stage: "anvil", part: part.key, metal: startingStock(part.shape), heat: 20, good: 0, bad: 0, strikes: 0, result: undefined })}
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
                <QuickCraftButton kind="forge" characterId={characterId} busy={busy} disabled={missingMats.length > 0 || short.length > 0} onClick={() => finish("craft.forgeQuick")} title="Roll d20 + Blacksmithing and forge the whole weapon at once from the materials picked for each part" />
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
/** A part's outline as its cells (what it really looks like hammered). */
function ShapeChip({ shape, color }: { shape: string; color: string }) {
  const mask = useMemo(() => shapeMask(shape), [shape]);
  let r0 = FORGE_ROWS, r1 = 0, c0 = FORGE_COLS, c1 = 0;
  mask.forEach((m, i) => { if (!m) return; const r = Math.floor(i / FORGE_COLS), c = i % FORGE_COLS; r0 = Math.min(r0, r); r1 = Math.max(r1, r); c0 = Math.min(c0, c); c1 = Math.max(c1, c); });
  return (
    <svg viewBox={`${c0} ${r0} ${Math.max(1, c1 - c0 + 1)} ${Math.max(1, r1 - r0 + 1)}`} className="h-5 w-12 shrink-0" preserveAspectRatio="xMidYMid meet" shapeRendering="crispEdges">
      {mask.map((m, i) => (m ? <rect key={i} x={i % FORGE_COLS} y={Math.floor(i / FORGE_COLS)} width={1} height={1} fill={color} /> : null))}
    </svg>
  );
}

// --------------------------------------------------------------------------- the anvil
// The bar fills the canvas (it's what you hammer); the heat gauge sits below it.
const W = 760, H = 320;
const BAR = { x: 20, y: 16, w: 720, h: 288 };

function Anvil({ characterId, bp, s, set, playing, stationId }: { characterId: string; bp: KnownDef<ForgeConfig>; s: CraftState; set: Props["set"]; playing: boolean; stationId?: string }) {
  const { state, request, openNote } = useAg();
  const { toast } = useToast();
  const part = bp.config.parts.find((p) => p.key === s.part) ?? bp.config.parts[0];
  const matId: string | undefined = (s.mats ?? {})[part.key];
  const mat = materialOf(state, matId) ?? { heatMin: 0, heatMax: 100, hasHeat: false, hardness: 3, color: "#9ca3af", weight: 1, value: 1 };
  const mask = useMemo(() => shapeMask(part.shape), [part.shape]);
  const canvas = useRef<HTMLCanvasElement>(null);
  const live = useRef({ heat: Number(s.heat ?? 20), bellows: false, metal: metalFits(s.metal) ? s.metal : startingStock(part.shape), lastSync: 0 });
  const particles = useRef<Particle[]>([]);
  const shake = useRef(0);
  const [busy, setBusy] = useState(false);
  const [fine, setFine] = useState(false);
  // Watchers follow the crafter's heat and metal; the crafter runs the furnace.
  useEffect(() => { if (!playing) live.current.heat = Number(s.heat ?? 20); }, [s.heat, playing]);
  useEffect(() => { if (!playing && metalFits(s.metal)) live.current.metal = s.metal; }, [s.metal, playing]);
  const inRange = (h: number) => !mat.hasHeat || (h >= mat.heatMin && h <= mat.heatMax);

  useEffect(() => {
    let raf = 0, last = performance.now(), t = 0;
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now; t += dt;
      const L = live.current;
      if (playing) {
        // The furnace: the bellows push heat in; otherwise the metal cools toward the air.
        if (mat.hasHeat) L.heat = Math.max(8, Math.min(100, L.heat + (L.bellows ? 32 : -7) * dt));
        if (now - L.lastSync > 140) { L.lastSync = now; set({ heat: Math.round(L.heat * 10) / 10, bellows: L.bellows }); }
      }
      draw(ctx, t, dt);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  const draw = (ctx: CanvasRenderingContext2D, t: number, dt: number) => {
    const L = live.current;
    const heat01 = mat.hasHeat ? L.heat / 100 : 0.08;
    ctx.save();
    if (shake.current > 0) { ctx.translate((Math.random() - 0.5) * shake.current, (Math.random() - 0.5) * shake.current); shake.current = Math.max(0, shake.current - dt * 30); }
    // The anvil's face under the bar, the furnace glow breathing from below.
    const bg = ctx.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, "#1a1614"); bg.addColorStop(1, "#0a0807");
    ctx.fillStyle = bg; ctx.fillRect(-10, -10, W + 20, H + 20);
    const flick = 0.75 + 0.25 * Math.sin(t * 7) * Math.sin(t * 3.3) + (s.bellows ? 0.35 : 0);
    const fg = ctx.createRadialGradient(W / 2, H + 40, 10, W / 2, H + 40, 420 * flick);
    fg.addColorStop(0, `rgba(255,140,40,${0.35 * flick})`); fg.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = fg; ctx.fillRect(0, 0, W, H);
    // A faint grid: the cells the metal moves in.
    ctx.strokeStyle = "rgba(255,255,255,0.05)"; ctx.lineWidth = 1; ctx.beginPath();
    for (let c = 0; c <= FORGE_COLS; c++) { const x = BAR.x + (c * BAR.w) / FORGE_COLS; ctx.moveTo(x, BAR.y); ctx.lineTo(x, BAR.y + BAR.h); }
    for (let r = 0; r <= FORGE_ROWS; r++) { const y = BAR.y + (r * BAR.h) / FORGE_ROWS; ctx.moveTo(BAR.x, y); ctx.lineTo(BAR.x + BAR.w, y); }
    ctx.stroke();
    drawMetal(ctx, L.metal, mat.color, heat01, BAR.x, BAR.y, BAR.w, BAR.h);
    drawTarget(ctx, mask, L.metal, BAR.x, BAR.y, BAR.w, BAR.h, t);
    if (Math.random() < (s.bellows ? 0.6 : 0.15)) particles.current.push({ x: Math.random() * W, y: H, vx: (Math.random() - 0.5) * 30, vy: -50 - Math.random() * 60, life: 1.4, max: 1.4, color: "#ff8a3d", size: 1.4 });
    stepParticles(ctx, particles.current, dt);
    ctx.restore();
  };

  const strike = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!playing || busy) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * W, y = ((e.clientY - rect.top) / rect.height) * H;
    if (x < BAR.x - 10 || x > BAR.x + BAR.w + 10 || y < BAR.y - 10 || y > BAR.y + BAR.h + 10) return;
    const L = live.current;
    const good = inRange(L.heat);
    const cold = mat.hasHeat && L.heat < mat.heatMin;
    // The fine hammer moves one spot; the heavy one more (less on hard or cold metal, more when it's too hot).
    const radius = fine ? 0.75 : Math.max(1, Math.min(2.6, (2.6 - mat.hardness * 0.12) * (cold ? 0.55 : good ? 1 : 1.25)));
    const cx = ((x - BAR.x) / BAR.w) * FORGE_COLS, cy = ((y - BAR.y) / BAR.h) * FORGE_ROWS;
    const { metal, hit } = strikeMetal(L.metal, cx, cy, radius);
    if (mat.hasHeat) L.heat = Math.max(8, L.heat - (fine ? 0.8 : 1.6));
    shake.current = fine ? 2 : 6;
    const sparkCol = good ? "#ffcc55" : cold ? "#93c5fd" : "#ff5533";
    for (let k = 0; k < (hit.length ? (good ? 22 : 10) : 4); k++) { const a = -Math.PI * Math.random(); const v = 120 + Math.random() * 240; particles.current.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.5 + Math.random() * 0.5, max: 1, color: sparkCol, size: 1.4 + Math.random() * 1.6 }); }
    if (!hit.length) return;
    L.metal = metal;
    set({ metal, strikes: Number(s.strikes ?? 0) + 1, good: Number(s.good ?? 0) + (good ? 1 : 0), bad: Number(s.bad ?? 0) + (good ? 0 : 1), lastHit: { x, y, good, at: Date.now() } });
  };

  // Watchers see the crafter's sparks too.
  useEffect(() => {
    if (playing || !s.lastHit) return;
    const { x, y, good } = s.lastHit;
    shake.current = 5;
    for (let k = 0; k < 18; k++) { const a = -Math.PI * Math.random(); const v = 120 + Math.random() * 240; particles.current.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.6, max: 0.6, color: good ? "#ffcc55" : "#ff5533", size: 1.8 }); }
  }, [s.lastHit?.at]); // eslint-disable-line react-hooks/exhaustive-deps

  const metalNow = metalFits(s.metal) ? s.metal : live.current.metal;
  const shapePct = shapeScore(part.shape, metalNow);
  const strikes = Number(s.strikes ?? 0);
  const heatPct = strikes ? Math.round((100 * Number(s.good ?? 0)) / strikes) : mat.hasHeat ? 0 : 100;
  const preview = partStats(part.role, shapePct, mat.hasHeat ? heatPct : 100, mat);
  const heatNow = Number(s.heat ?? live.current.heat);

  const quench = async () => {
    if (!matId) return;
    setBusy(true);
    try {
      const portrait = partPortrait(part.shape, metalNow, mat.color);
      const res: CraftOutcome = await request({ op: "craft.forgePart", characterId, stationId, blueprintId: bp.id, partKey: part.key, materialId: matId, shape: shapePct, heat: mat.hasHeat ? heatPct : 100, portrait });
      set({ stage: "plan", metal: undefined, result: res, picks: { ...(s.picks ?? {}), [part.key]: res.noteId }, mats: { ...(s.mats ?? {}), [part.key]: undefined } });
    } catch (e: any) { toast({ title: "Couldn't save the part", description: e.message, variant: "destructive" }); }
    finally { setBusy(false); }
  };
  const pctColor = (v: number) => (v >= 80 ? "#4ade80" : v >= 55 ? "#fbbf24" : "#f87171");

  return (
    <div className="space-y-2" data-testid="forge-anvil">
      <div className="flex items-center gap-2 min-w-0">
        {playing && <button type="button" onClick={() => set({ stage: "plan" })} className="h-8 w-8 shrink-0 rounded-md border border-stone-700 text-stone-300 grid place-items-center hover:border-stone-500" title="Back to the plan (this part isn't saved)" data-testid="forge-back"><ArrowLeft className="h-4 w-4" /></button>}
        <div className="min-w-0">
          <div className="text-sm font-semibold text-stone-100 truncate">{bp.name} — {part.label}</div>
          <div className="text-[11px] text-stone-400 truncate">{matId ? state.notes.get(matId)?.name : "no material"}{mat.hasHeat ? ` · keep it at ${mat.heatMin}–${mat.heatMax}°` : " · no heat needed"}</div>
        </div>
        <div className="ml-auto flex items-center gap-1.5 shrink-0">
          <Stat icon={<Hammer className="h-3.5 w-3.5" />} value={`${shapePct}%`} color={pctColor(shapePct)} title="Shape: how close it is to the outline" testId="forge-shape" />
          {mat.hasHeat && <Stat icon={<Flame className="h-3.5 w-3.5" />} value={strikes ? `${heatPct}%` : "—"} color={pctColor(heatPct)} title="Heat control: blows struck in the green band" />}
        </div>
      </div>
      <canvas ref={canvas} width={W} height={H} onPointerDown={strike} className={`w-full block rounded-lg border border-stone-700 touch-none ${playing ? "cursor-crosshair" : ""}`} data-testid="forge-canvas" />
      {mat.hasHeat && <HeatGauge heat={heatNow} min={mat.heatMin} max={mat.heatMax} />}
      <div className="flex flex-wrap items-center gap-2">
        {playing && mat.hasHeat && (
          <button type="button"
            onPointerDown={(e) => { e.preventDefault(); live.current.bellows = true; }} onPointerUp={() => { live.current.bellows = false; }} onPointerLeave={() => { live.current.bellows = false; }} onPointerCancel={() => { live.current.bellows = false; }}
            className={`h-10 px-4 rounded-md border text-sm font-medium inline-flex items-center gap-2 select-none touch-none ${s.bellows ? "border-orange-400 bg-orange-600/30 text-orange-100" : "border-stone-600 bg-stone-800 text-stone-100"}`} data-testid="forge-bellows">
            <Wind className="h-4 w-4" /> Bellows <span className="text-[10px] text-stone-400">hold</span>
          </button>
        )}
        {playing && (
          <div className="inline-flex rounded-md border border-stone-700 overflow-hidden text-xs" data-testid="forge-hammer">
            <button type="button" onClick={() => setFine(false)} className={`h-10 px-3 ${!fine ? "bg-stone-700 text-stone-100" : "bg-stone-900 text-stone-400"}`}>Heavy</button>
            <button type="button" onClick={() => setFine(true)} className={`h-10 px-3 ${fine ? "bg-stone-700 text-stone-100" : "bg-stone-900 text-stone-400"}`} data-testid="forge-fine">Fine</button>
          </div>
        )}
        <span className="text-[11px] text-stone-400">Durability <b className="text-stone-200">{preview.durability}</b> · {part.role === "blade" ? <>Damage <b style={{ color: TIER_COLOR[preview.tier] }}>{preview.damageBonus >= 0 ? "+" : ""}{preview.damageBonus}</b></> : part.role === "handle" ? <>Accuracy <b style={{ color: TIER_COLOR[preview.tier] }}>{preview.accuracy >= 0 ? "+" : ""}{preview.accuracy}</b></> : <b style={{ color: TIER_COLOR[preview.tier] }}>{TIER_LABEL[preview.tier]}</b>}</span>
        {playing && (
          <button type="button" disabled={busy || strikes === 0} onClick={quench}
            className="ml-auto h-10 px-4 rounded-md bg-amber-600 hover:bg-amber-500 text-white text-sm font-medium inline-flex items-center gap-2 disabled:opacity-40" data-testid="forge-quench">
            <Droplets className="h-4 w-4" /> Quench & save
          </button>
        )}
      </div>
      {playing && <div className="text-[11px] text-stone-500">Tap the red stock to hammer it away, down to the gold line — each blow moves the surface it reaches. Strike while the heat is in the green band; the fine hammer for the last bits.</div>}
      <ResultBanner result={s.result} onOpen={openNote} />
    </div>
  );
}

/** The metal's heat, with the material's working range in green. */
function HeatGauge({ heat, min, max }: { heat: number; min: number; max: number }) {
  const ok = heat >= min && heat <= max;
  return (
    <div className="relative h-4 rounded-full bg-stone-900 border border-stone-700 overflow-hidden" data-testid="forge-heat">
      <div className="absolute inset-0 opacity-50" style={{ background: `linear-gradient(90deg, #44403c, ${heatColor(0.5)}, ${heatColor(0.75)}, ${heatColor(1)})` }} />
      <div className="absolute inset-y-0 border-x-2 border-emerald-400 bg-emerald-400/20" style={{ left: `${min}%`, width: `${Math.max(1, max - min)}%` }} />
      <div className="absolute inset-y-0 w-1 -ml-0.5 rounded-full" style={{ left: `${Math.max(0, Math.min(100, heat))}%`, background: ok ? "#4ade80" : heat < min ? "#60a5fa" : "#f87171", boxShadow: "0 0 6px rgba(0,0,0,0.8)" }} />
      <div className="absolute right-1.5 inset-y-0 text-[10px] font-mono leading-4 text-stone-200">{Math.round(heat)}°</div>
    </div>
  );
}

function Stat({ value, color, icon, title, testId }: { value: string; color: string; icon?: React.ReactNode; title?: string; testId?: string }) {
  return (
    <span className="inline-flex items-center gap-1 h-8 px-2 rounded-md border border-stone-700 bg-stone-900" title={title} data-testid={testId}>
      {icon && <span className="text-stone-400">{icon}</span>}
      <span className="text-sm font-bold font-mono" style={{ color }}>{value}</span>
    </span>
  );
}
