// Blacksmithing: pick a blueprint and a material for each part, then forge the
// parts one at a time — keep the metal in its heat range with the bellows and
// hammer the glowing stock down to the outline. Saved parts become a weapon.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Flame, Hammer, Wind, Droplets, ArrowLeft, Check } from "lucide-react";
import type { AgNote } from "@shared/agnostic/types";
import {
  FORGE_SHAPES, FORGE_COLS, FORGE_ROWS, startingStock, shapeMask, shapeScore, partStats, weaponStats, numOf, TIER_COLOR, TIER_LABEL,
  type ForgeConfig, type ForgePart,
} from "@shared/agnostic/crafting";
import { useAg } from "../hooks";
import { useToast } from "@/hooks/use-toast";
import { valueOn, hasValue, qtyOf, type CraftState } from "./session";
import { ItemTile, ResultBanner, QuickCraftButton, Panel, useDefs, NotHere, stationNameOf, announceRoll, colorOf, Needs, NoneKnown, type CraftOutcome, type KnownDef } from "./common";
import { drawMetal, heatColor, shapePath, stepParticles, weaponPortrait, partPortrait, type Particle } from "./render";

interface Props { characterId: string; state: CraftState; set: (p: CraftState) => void; playing: boolean; /** The station item it's worked at. */ stationId?: string }

/** A material's numbers (an item with heat_min / heat_max / hardness / metal_color). */
function materialOf(st: ReturnType<typeof useAg>["state"], id: string | undefined) {
  if (!id) return null;
  // "Heat to" 0: a material that isn't heated (wood, leather).
  const hasHeat = (hasValue(st, id, "heat_min") || hasValue(st, id, "heat_max")) && numOf(valueOn(st, id, "heat_max"), 100) > 0;
  return {
    heatMin: numOf(valueOn(st, id, "heat_min"), 0), heatMax: numOf(valueOn(st, id, "heat_max"), 100), hasHeat,
    hardness: numOf(valueOn(st, id, "hardness"), 3), color: colorOf(st, id, "metal_color", "#9ca3af"),
    weight: numOf(valueOn(st, id, "weight"), 1), value: numOf(valueOn(st, id, "value"), 1),
  };
}
const isMaterial = (st: ReturnType<typeof useAg>["state"], n: AgNote) => hasValue(st, n.id, "heat_min") || hasValue(st, n.id, "hardness") || valueOn(st, n.id, "item_type") === "Material";

export function ForgeTool({ characterId, state: s, set, playing, stationId }: Props) {
  const ag = useAg();
  const defs = useDefs<ForgeConfig>("forge", characterId, stationId);
  const bp = defs.find((d) => d.defId === s.bp && d.here);
  if (s.stage === "anvil" && bp) return <Anvil characterId={characterId} bp={bp} s={s} set={set} playing={playing} stationId={stationId} />;
  return <ForgePlan characterId={characterId} defs={defs} s={s} set={set} playing={playing} openNote={ag.openNote} stationId={stationId} />;
}

// --------------------------------------------------------------------------- planning
function ForgePlan({ characterId, defs, s, set, playing, openNote, stationId }: { characterId: string; defs: Array<KnownDef<ForgeConfig>>; s: CraftState; set: Props["set"]; playing: boolean; openNote: (id: string) => void; stationId?: string }) {
  const { state, request, scope } = useAg();
  const { toast } = useToast();
  const character = state.notes.get(characterId);
  const inventory = useMemo(() => Array.from(new Set(Array.from(state.links.values()).filter((l) => l.toNoteId === characterId).map((l) => l.fromNoteId)))
    .map((id) => state.notes.get(id)).filter((n): n is AgNote => !!n && n.type === "item" && !n.isTemplate), [state, characterId]);
  const bp = defs.find((d) => d.defId === s.bp && d.here) ?? null;
  const mats: Record<string, string> = s.mats ?? {};
  const picks: Record<string, string> = s.picks ?? {};
  const materials = inventory.filter((n) => isMaterial(state, n));
  const savedParts = (part: ForgePart) => inventory.filter((n) => valueOn(state, n.id, "blueprint_id") === bp?.defId && valueOn(state, n.id, "part_key") === part.key);
  const [busy, setBusy] = useState(false);
  const required = bp ? bp.config.parts.filter((p) => !p.optional) : [];
  const preview = useMemo(() => {
    if (!bp) return null;
    const parts = bp.config.parts.filter((p) => !p.optional || mats[p.key] || picks[p.key]).map((p) => ({ part: p, color: picks[p.key] ? colorOf(state, picks[p.key], "metal_color", "#9ca3af") : mats[p.key] ? colorOf(state, mats[p.key], "metal_color", "#9ca3af") : "#57534e" }));
    try { return weaponPortrait(parts, 280); } catch { return null; }
  }, [bp, JSON.stringify(mats), JSON.stringify(picks), state]); // eslint-disable-line react-hooks/exhaustive-deps

  const finish = async (op: "craft.forgeQuick" | "craft.forgeWeapon") => {
    if (!bp || !character) return;
    setBusy(true);
    try {
      const chosen = op === "craft.forgeQuick" ? mats : picks;
      const parts = bp.config.parts.filter((p) => chosen[p.key]).map((p) => ({ part: p, color: colorOf(state, chosen[p.key], "metal_color", "#9ca3af") }));
      const portrait = weaponPortrait(parts, 320);
      const res: CraftOutcome = await request(op === "craft.forgeQuick"
        ? { op, characterId, stationId, blueprintId: bp.id, materials: mats, portrait }
        : { op, characterId, stationId, blueprintId: bp.id, partIds: picks, portrait });
      announceRoll(character.name, res.roll, scope.kind === "campaign");
      set({ result: res, picks: {}, ...(op === "craft.forgeQuick" ? { mats: {} } : {}) });
    } catch (e: any) { toast({ title: "Couldn't forge it", description: e.message, variant: "destructive" }); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-3">
      <ResultBanner result={s.result} onOpen={openNote} onClose={playing ? () => set({ result: undefined }) : undefined} />
      <Panel title="Blueprint">
        {!defs.length && <NoneKnown what="blueprints" />}
        <div className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-1.5">
          {defs.map((d) => (
            <button key={d.defId} type="button" disabled={!playing || !d.here} onClick={() => set({ bp: d.defId, mats: {}, picks: {}, result: undefined })}
              className={`rounded-md border p-1.5 text-left transition-colors disabled:cursor-default ${!d.here ? "border-stone-800 bg-stone-950 opacity-50" : s.bp === d.defId ? "border-amber-500 bg-amber-500/10" : "border-stone-700 bg-stone-900 hover:border-amber-700"}`} data-testid={`forge-bp-${d.name}`}>
              <BlueprintSketch config={d.config} />
              <div className="text-xs font-semibold text-stone-100 truncate mt-1">{d.name}</div>
              <div className="text-[10px] text-stone-400">{d.here ? `${d.config.parts.length} parts · d${d.config.damageDie}` : <NotHere station={stationNameOf(state, stationId)} />}</div>
            </button>
          ))}
        </div>
      </Panel>
      {bp && (
        <>
          <div className="grid sm:grid-cols-[1fr_200px] gap-3">
            <Panel title="Parts">
              {bp.config.parts.map((part) => {
                const mat = mats[part.key];
                const saved = savedParts(part);
                return (
                  <div key={part.key} className="rounded-lg border border-stone-800 bg-stone-900/60 p-2 space-y-1.5" data-testid={`forge-part-${part.key}`}>
                    <div className="flex items-center gap-2">
                      <ShapeChip shape={part.shape} color={mat ? colorOf(state, mat, "metal_color", "#a8a29e") : "#78716c"} />
                      <span className="text-sm font-semibold text-stone-100">{part.label}</span>
                      <span className="text-[10px] uppercase tracking-wide px-1.5 rounded-full border" style={{ borderColor: part.role === "blade" ? "#f87171" : part.role === "handle" ? "#60a5fa" : "#a8a29e", color: part.role === "blade" ? "#fca5a5" : part.role === "handle" ? "#93c5fd" : "#d6d3d1" }}>{part.role === "blade" ? "damage" : part.role === "handle" ? "accuracy" : "extra"}</span>
                      {part.optional && <span className="text-[10px] text-stone-500">optional</span>}
                      <button type="button" disabled={!playing || !mat} title={!mat ? `Pick a material for the ${part.label.toLowerCase()} first` : undefined} onClick={() => set({ stage: "anvil", part: part.key, metal: startingStock(part.shape), heat: 20, good: 0, bad: 0, strikes: 0, result: undefined })}
                        className="ml-auto h-7 px-2.5 rounded-md bg-amber-600 hover:bg-amber-500 text-white text-[11px] font-semibold inline-flex items-center gap-1 disabled:opacity-40" data-testid={`forge-start-${part.key}`}>
                        <Hammer className="h-3.5 w-3.5" /> Forge
                      </button>
                    </div>
                    <div className="text-[11px] text-stone-400">Needs <span className="text-stone-200">1 material</span> from the inventory — {part.role === "handle" ? "wood, leather or metal" : "a metal (heated at the forge)"}{mat ? <> · using <span className="text-amber-200">{state.notes.get(mat)?.name}</span></> : <span className="text-amber-300/90"> · pick one below to forge it</span>}</div>
                    <div className="flex gap-1 overflow-x-auto no-scrollbar pb-0.5">
                      {materials.length ? materials.map((m) => {
                        const mm = materialOf(state, m.id)!;
                        return <ItemTile key={m.id} note={m} selected={mat === m.id} disabled={!playing} color={mm.color} onClick={() => set({ mats: { ...mats, [part.key]: mat === m.id ? undefined : m.id } })}
                          sub={mm.hasHeat ? `heat ${mm.heatMin}–${mm.heatMax} · hard ${mm.hardness}` : `hardness ${mm.hardness}`} testId={`forge-mat-${part.key}-${m.name}`} />;
                      }) : <span className="text-[11px] text-amber-300/90">No materials in the inventory — you need an ingot, wood or leather (the GM can give you some).</span>}
                    </div>
                    {saved.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1">
                        <span className="text-[10px] text-stone-500">Made:</span>
                        {saved.map((n) => <ItemTile key={n.id} note={n} selected={picks[part.key] === n.id} disabled={!playing} onClick={() => set({ picks: { ...picks, [part.key]: picks[part.key] === n.id ? undefined : n.id } })}
                          sub={`${numOf(valueOn(state, n.id, "quality"))}% · dur ${numOf(valueOn(state, n.id, "durability"))}`} testId={`forge-saved-${part.key}-${n.name}`} />)}
                      </div>
                    )}
                  </div>
                );
              })}
            </Panel>
            <Panel title="Preview">
              {preview && <img src={preview} alt="" className="w-full max-w-[220px] mx-auto rounded-md border border-stone-800" />}
              <div className="text-[10px] text-stone-400 leading-snug">Blades give damage (d{bp.config.damageDie} + their quality), handles give accuracy; durability is the parts' average; worth is materials plus durability.</div>
            </Panel>
          </div>
          {playing && (() => {
            const missingMats = required.filter((p) => !mats[p.key]).map((p) => p.label.toLowerCase());
            const missingParts = required.filter((p) => !picks[p.key]).map((p) => p.label.toLowerCase());
            const short = Object.entries(Object.values(mats).filter(Boolean).reduce<Record<string, number>>((a, id) => ({ ...a, [id as string]: (a[id as string] ?? 0) + 1 }), {}))
              .filter(([id, n]) => qtyOf(state, id) < n).map(([id, n]) => `${n}× ${state.notes.get(id)?.name ?? "that material"} (you have ${qtyOf(state, id)})`);
            return (<>
            <div className="flex flex-wrap items-center gap-2">
              <QuickCraftButton kind="forge" characterId={characterId} busy={busy} disabled={missingMats.length > 0 || short.length > 0} onClick={() => finish("craft.forgeQuick")} title="Roll d20 + Blacksmithing and forge the whole weapon from the chosen materials" />
              <button type="button" disabled={busy || required.some((p) => !picks[p.key])} onClick={() => finish("craft.forgeWeapon")}
                className="h-9 px-3 rounded-md bg-amber-600 hover:bg-amber-500 text-white text-xs font-medium inline-flex items-center gap-1.5 disabled:opacity-40" data-testid="forge-assemble">
                <Check className="h-4 w-4" /> Assemble weapon
              </button>
              <span className="text-[10px] text-stone-500">Quick Craft uses the chosen materials; Assemble uses the parts you've made.</span>
            </div>
            <Needs items={[
              missingMats.length > 0 && `Quick Craft: pick a material for the ${missingMats.join(", ")}`,
              ...short.map((t) => `Quick Craft needs ${t}`),
              missingParts.length > 0 && `Assemble: forge the ${missingParts.join(", ")} first`,
            ]} />
          </>); })()}
        </>
      )}
    </div>
  );
}

/** A blueprint's parts, laid out as the weapon they make. */
function BlueprintSketch({ config }: { config: ForgeConfig }) {
  const src = useMemo(() => { try { return weaponPortrait(config.parts.map((p) => ({ part: p, color: p.role === "handle" ? "#7c5a3a" : "#94a3b8" })), 160); } catch { return ""; } }, [config]);
  return src ? <img src={src} alt="" className="w-full max-w-[140px] mx-auto aspect-square rounded-md opacity-90" /> : null;
}
function ShapeChip({ shape, color }: { shape: string; color: string }) {
  const pts = FORGE_SHAPES[shape]?.points ?? [];
  return <svg viewBox="0 0 100 40" className="h-5 w-12 shrink-0"><polygon points={pts.map(([x, y]) => `${x},${y}`).join(" ")} fill={color} stroke="#0c0a09" strokeWidth={1.5} /></svg>;
}

// --------------------------------------------------------------------------- the anvil
const W = 760, H = 380;
const BAR = { x: 100, y: 70, w: 560, h: 224 };

function Anvil({ characterId, bp, s, set, playing, stationId }: { characterId: string; bp: KnownDef<ForgeConfig>; stationId?: string; s: CraftState; set: Props["set"]; playing: boolean }) {
  const { state, request, openNote } = useAg();
  const { toast } = useToast();
  const part = bp.config.parts.find((p) => p.key === s.part) ?? bp.config.parts[0];
  const matId: string | undefined = (s.mats ?? {})[part.key];
  const mat = materialOf(state, matId) ?? { heatMin: 0, heatMax: 100, hasHeat: false, hardness: 3, color: "#9ca3af", weight: 1, value: 1 };
  const mask = useMemo(() => shapeMask(part.shape), [part.shape]);
  const canvas = useRef<HTMLCanvasElement>(null);
  const live = useRef({ heat: Number(s.heat ?? 20), bellows: false, metal: String(s.metal ?? startingStock(part.shape)), lastSync: 0 });
  const particles = useRef<Particle[]>([]);
  const shake = useRef(0);
  const [busy, setBusy] = useState(false);
  // Watchers follow the crafter's heat and metal; the crafter runs the furnace.
  useEffect(() => { if (!playing) { live.current.heat = Number(s.heat ?? 20); } }, [s.heat, playing]);
  useEffect(() => { if (!playing || !live.current.metal) live.current.metal = String(s.metal ?? live.current.metal); }, [s.metal, playing]);
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
    // The smithy: dark stone, the furnace's glow breathing in the corner.
    const bg = ctx.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, "#14100e"); bg.addColorStop(1, "#060403");
    ctx.fillStyle = bg; ctx.fillRect(-10, -10, W + 20, H + 20);
    const flick = 0.75 + 0.25 * Math.sin(t * 7) * Math.sin(t * 3.3) + (s.bellows ? 0.35 : 0);
    const fg = ctx.createRadialGradient(40, H + 10, 10, 40, H + 10, 300 * flick);
    fg.addColorStop(0, `rgba(255,140,40,${0.55 * flick})`); fg.addColorStop(0.4, "rgba(200,60,10,0.18)"); fg.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = fg; ctx.fillRect(0, 0, W, H);
    // Embers drifting up from the furnace.
    if (Math.random() < (s.bellows ? 0.9 : 0.25)) particles.current.push({ x: 20 + Math.random() * 80, y: H - 5, vx: 20 + Math.random() * 40, vy: -60 - Math.random() * 80, life: 1.6, max: 1.6, color: "#ff8a3d", size: 1.6 });
    // The anvil.
    ctx.fillStyle = "#1f1b19"; ctx.beginPath(); ctx.moveTo(130, 270); ctx.lineTo(620, 270); ctx.lineTo(700, 250); ctx.lineTo(620, 305); ctx.lineTo(530, 318); ctx.lineTo(510, 380); ctx.lineTo(250, 380); ctx.lineTo(230, 318); ctx.lineTo(130, 305); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "#3a3330"; ctx.lineWidth = 2; ctx.stroke();
    // The metal, glowing with its heat, then the outline it must become.
    drawMetal(ctx, L.metal, mat.color, heat01, BAR.x, BAR.y, BAR.w, BAR.h);
    ctx.save(); ctx.setLineDash([7, 6]); ctx.lineDashOffset = -t * 20; ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(250,204,21,0.9)"; ctx.shadowColor = "#facc15"; ctx.shadowBlur = 8;
    shapePath(ctx, part.shape, BAR.x, BAR.y, BAR.w, BAR.h); ctx.stroke(); ctx.restore();
    stepParticles(ctx, particles.current, dt);
    // The heat gauge: the material's range in green; the needle is the metal now.
    if (mat.hasHeat) {
      const gx = W - 46, gy = 40, gh = 280;
      ctx.fillStyle = "#0c0a09"; ctx.strokeStyle = "#44403c"; ctx.lineWidth = 2; ctx.beginPath(); ctx.roundRect(gx, gy, 22, gh, 8); ctx.fill(); ctx.stroke();
      const grad = ctx.createLinearGradient(0, gy + gh, 0, gy); for (let k = 0; k <= 10; k++) grad.addColorStop(k / 10, heatColor(k / 10, "#57534e"));
      ctx.globalAlpha = 0.55; ctx.fillStyle = grad; ctx.fillRect(gx + 4, gy + 4, 14, gh - 8); ctx.globalAlpha = 1;
      const yOf = (v: number) => gy + gh - 4 - ((gh - 8) * v) / 100;
      ctx.strokeStyle = "#22c55e"; ctx.lineWidth = 3; ctx.shadowColor = "#22c55e"; ctx.shadowBlur = 10;
      ctx.strokeRect(gx - 3, yOf(mat.heatMax), 28, yOf(mat.heatMin) - yOf(mat.heatMax)); ctx.shadowBlur = 0;
      const ny = yOf(L.heat);
      ctx.fillStyle = inRange(L.heat) ? "#4ade80" : L.heat < mat.heatMin ? "#60a5fa" : "#f87171";
      ctx.beginPath(); ctx.moveTo(gx - 12, ny); ctx.lineTo(gx - 2, ny - 6); ctx.lineTo(gx - 2, ny + 6); ctx.closePath(); ctx.fill();
      ctx.font = "bold 12px ui-monospace, monospace"; ctx.textAlign = "right"; ctx.fillText(`${Math.round(L.heat)}°`, gx - 14, ny + 4);
    }
    ctx.restore();
  };

  const strike = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!playing || busy) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * W, y = ((e.clientY - rect.top) / rect.height) * H;
    const bh = BAR.h;
    if (x < BAR.x || x > BAR.x + BAR.w || y < BAR.y || y > BAR.y + bh) return;
    const L = live.current;
    const good = inRange(L.heat);
    const cold = mat.hasHeat && L.heat < mat.heatMin;
    // Hot metal moves; cold metal barely does (and cracks); harder metal moves less.
    const radius = Math.max(0.9, Math.min(3.2, (2.9 - mat.hardness * 0.17) * (cold ? 0.45 : good ? 1 : 1.3)));
    const cx = ((x - BAR.x) / BAR.w) * FORGE_COLS, cy = ((y - BAR.y) / bh) * FORGE_ROWS;
    const arr = L.metal.split("");
    let hit = 0;
    for (let r = Math.floor(cy - radius); r <= Math.ceil(cy + radius); r++) for (let c = Math.floor(cx - radius); c <= Math.ceil(cx + radius); c++) {
      if (r < 0 || c < 0 || r >= FORGE_ROWS || c >= FORGE_COLS) continue;
      if ((c + 0.5 - cx) ** 2 + (r + 0.5 - cy) ** 2 > radius * radius) continue;
      const i = r * FORGE_COLS + c;
      if (arr[i] === "1") { arr[i] = "0"; hit++; }
    }
    L.metal = arr.join("");
    if (mat.hasHeat) L.heat = Math.max(8, L.heat - 1.6);
    shake.current = 6;
    const sparkCol = good ? "#ffcc55" : cold ? "#93c5fd" : "#ff5533";
    for (let k = 0; k < (good ? 26 : 12); k++) { const a = -Math.PI * Math.random(); const v = 120 + Math.random() * 260; particles.current.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.5 + Math.random() * 0.5, max: 1, color: sparkCol, size: 1.4 + Math.random() * 1.6 }); }
    set({ metal: L.metal, strikes: Number(s.strikes ?? 0) + 1, good: Number(s.good ?? 0) + (good ? 1 : 0), bad: Number(s.bad ?? 0) + (good ? 0 : 1), lastHit: { x, y, good, at: Date.now() } });
    void hit; void mask;
  };

  // Watchers see the crafter's sparks too.
  useEffect(() => {
    if (playing || !s.lastHit) return;
    const { x, y, good } = s.lastHit;
    shake.current = 5;
    for (let k = 0; k < 18; k++) { const a = -Math.PI * Math.random(); const v = 120 + Math.random() * 240; particles.current.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.6, max: 0.6, color: good ? "#ffcc55" : "#ff5533", size: 1.8 }); }
  }, [s.lastHit?.at]); // eslint-disable-line react-hooks/exhaustive-deps

  const shapePct = shapeScore(part.shape, String(s.metal ?? live.current.metal));
  const strikes = Number(s.strikes ?? 0);
  const heatPct = strikes ? Math.round((100 * Number(s.good ?? 0)) / strikes) : mat.hasHeat ? 0 : 100;
  const preview = partStats(part.role, shapePct, mat.hasHeat ? heatPct : 100, mat);

  const quench = async () => {
    if (!matId) return;
    setBusy(true);
    try {
      const portrait = partPortrait(part.shape, String(s.metal ?? live.current.metal), mat.color);
      const res: CraftOutcome = await request({ op: "craft.forgePart", characterId, stationId, blueprintId: bp.id, partKey: part.key, materialId: matId, shape: shapePct, heat: mat.hasHeat ? heatPct : 100, portrait });
      set({ stage: "plan", metal: undefined, result: res, picks: { ...(s.picks ?? {}), [part.key]: res.noteId }, mats: { ...(s.mats ?? {}), [part.key]: undefined } });
    } catch (e: any) { toast({ title: "Couldn't save the part", description: e.message, variant: "destructive" }); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-2" data-testid="forge-anvil">
      <div className="flex flex-wrap items-center gap-2">
        {playing && <button type="button" onClick={() => set({ stage: "plan" })} className="h-8 px-2 rounded-md border border-stone-700 text-xs text-stone-300 inline-flex items-center gap-1 hover:border-stone-500"><ArrowLeft className="h-3.5 w-3.5" /> Plan</button>}
        <span className="text-sm font-bold text-amber-200">{bp.name} — {part.label}</span>
        <span className="text-[11px] text-stone-400">{matId ? state.notes.get(matId)?.name : "no material"}{mat.hasHeat ? ` · keep it at ${mat.heatMin}–${mat.heatMax}°` : " · no heat needed"}</span>
      </div>
      <div className="relative rounded-xl overflow-hidden border border-orange-900/60">
        <canvas ref={canvas} width={W} height={H} onPointerDown={strike} className={`w-full block touch-none ${playing ? "cursor-crosshair" : ""}`} data-testid="forge-canvas" />
        {!playing && <div className="absolute top-2 left-2 text-[10px] px-2 py-0.5 rounded-full bg-black/60 text-amber-200 border border-amber-700/50">Watching live</div>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {mat.hasHeat && (
          <button type="button" disabled={!playing}
            onPointerDown={(e) => { e.preventDefault(); live.current.bellows = true; }} onPointerUp={() => { live.current.bellows = false; }} onPointerLeave={() => { live.current.bellows = false; }} onPointerCancel={() => { live.current.bellows = false; }}
            className={`h-10 px-4 rounded-lg border text-sm font-semibold inline-flex items-center gap-2 select-none touch-none ${s.bellows ? "border-orange-400 bg-orange-600/40 text-orange-100" : "border-orange-800 bg-orange-950/40 text-orange-200"}`} data-testid="forge-bellows">
            <Wind className="h-4 w-4" /> Hold: Bellows
          </button>
        )}
        <Stat icon={<Hammer className="h-3.5 w-3.5" />} label="Shape" value={`${shapePct}%`} color={shapePct >= 80 ? "#4ade80" : shapePct >= 55 ? "#fbbf24" : "#f87171"} />
        {mat.hasHeat && <Stat icon={<Flame className="h-3.5 w-3.5" />} label="Heat control" value={strikes ? `${heatPct}%` : "—"} color={heatPct >= 80 ? "#4ade80" : heatPct >= 55 ? "#fbbf24" : "#f87171"} />}
        <Stat label="Durability" value={String(preview.durability)} color="#e7e5e4" />
        <Stat label={part.role === "blade" ? "Damage" : part.role === "handle" ? "Accuracy" : "Tier"} value={part.role === "blade" ? `${preview.damageBonus >= 0 ? "+" : ""}${preview.damageBonus}` : part.role === "handle" ? `${preview.accuracy >= 0 ? "+" : ""}${preview.accuracy}` : TIER_LABEL[preview.tier]} color={TIER_COLOR[preview.tier]} />
        {playing && (
          <button type="button" disabled={busy || strikes === 0} onClick={quench}
            className="ml-auto h-10 px-4 rounded-md bg-amber-600 hover:bg-amber-500 text-white text-sm font-medium inline-flex items-center gap-2 disabled:opacity-40" data-testid="forge-quench">
            <Droplets className="h-4 w-4" /> Quench & save part
          </button>
        )}
      </div>
      <div className="text-[11px] text-stone-500">Tap the glowing metal to hammer it down to the gold outline. Strike while the needle is in the green band — too cold and it barely moves, too hot and it burns; both cost durability. Hitting inside the outline ruins the shape.</div>
      <ResultBanner result={s.result} onOpen={openNote} />
    </div>
  );
}

function Stat({ label, value, color, icon }: { label: string; value: string; color: string; icon?: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 h-10 px-3 rounded-lg border border-stone-700 bg-stone-950/80">
      {icon && <span className="text-stone-400">{icon}</span>}
      <span className="text-[10px] uppercase tracking-wide text-stone-400">{label}</span>
      <span className="text-sm font-bold font-mono" style={{ color, textShadow: `0 0 8px ${color}55` }}>{value}</span>
    </span>
  );
}
void weaponStats;
