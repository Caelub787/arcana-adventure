// Rune Making: pick a rune, the item it goes on, the tool that carves or draws
// it and (if any) the ink, then trace its sigil on the item. The guide can be
// hidden — harder to follow, so bonuses come easier. The rune shows on the
// item (and its picture) in the ink's colour and glow, carved or drawn by the tool.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { PenTool, Eye, EyeOff, Undo2, Eraser, Sparkles, ArrowLeft } from "lucide-react";
import type { AgNote } from "@shared/agnostic/types";
import { traceAccuracy, runeTier, itemMatches, numOf, TIER_COLOR, TIER_LABEL, type RuneConfig } from "@shared/agnostic/crafting";
import { useAg } from "../hooks";
import { useToast } from "@/hooks/use-toast";
import { valueOn, hasValue, runesOn, qtyOf, type CraftState } from "./session";
import { ItemTile, ResultBanner, QuickCraftButton, Panel, useDefs, announceRoll, colorOf, Needs, type CraftOutcome } from "./common";
import { drawSigil, loadImage, runePortrait, type MarkStyle, type RuneLook } from "./render";

interface Props { characterId: string; state: CraftState; set: (p: CraftState) => void; playing: boolean }
type ScopeState = ReturnType<typeof useAg>["state"];
const FREEHAND = "freehand";
/** Where a freehand rune will go (a plain ring, since there's no sigil to show). */
const FREEHAND_MARK: number[][][] = [Array.from({ length: 25 }, (_, i) => [50 + 40 * Math.cos((i / 24) * Math.PI * 2), 50 + 40 * Math.sin((i / 24) * Math.PI * 2)])];

const parse = <T,>(v: unknown, d: T): T => { if (typeof v !== "string" || !v) return d; try { return JSON.parse(v) as T; } catch { return d; } };
/** How an existing rune on an item looks (from its values). */
export function runeLookOf(state: ScopeState, rune: AgNote): RuneLook {
  const drawn = parse<number[][][]>(valueOn(state, rune.id, "rune_drawn"), []);
  return {
    strokes: drawn.length ? drawn : parse<number[][][]>(valueOn(state, rune.id, "sigil"), []),
    color: String(valueOn(state, rune.id, "rune_color") ?? ""), glow: numOf(valueOn(state, rune.id, "rune_glow")),
    style: (valueOn(state, rune.id, "rune_style") === "Drawn" ? "Drawn" : "Carved") as MarkStyle,
    placement: parse(valueOn(state, rune.id, "placement"), { x: 50, y: 50, s: 30, r: 0 }),
  };
}
const baseOf = (state: ScopeState, item: AgNote | undefined) => { if (!item) return null; const b = valueOn(state, item.id, "base_portrait"); return (typeof b === "string" && b) || (hasValue(state, item.id, "base_portrait") ? null : item.portrait) || null; };

export function RuneTool({ characterId, state: s, set, playing }: Props) {
  const { state, request, scope, openNote } = useAg();
  const { toast } = useToast();
  const defs = useDefs<RuneConfig>("rune", characterId);
  // Freehand: no rune picked and no guide — whatever the marks come closest to (if close enough) is what takes.
  const freehand = s.rune === FREEHAND;
  const rune = freehand ? null : defs.find((d) => d.defId === s.rune) ?? null;
  const character = state.notes.get(characterId);
  const inventory = useMemo(() => Array.from(new Set(Array.from(state.links.values()).filter((l) => l.toNoteId === characterId).map((l) => l.fromNoteId)))
    .map((id) => state.notes.get(id)).filter((n): n is AgNote => !!n && n.type === "item" && !n.isTemplate).sort((a, b) => a.name.localeCompare(b.name)), [state, characterId]);
  const inks = inventory.filter((n) => hasValue(state, n.id, "ink_color"));
  const tools = inventory.filter((n) => hasValue(state, n.id, "mark_style"));
  // What a rune can go on: gear, not supplies (inks, tools, materials, ingredients, stations, scrolls).
  const targets = inventory.filter((n) => !["ink_color", "mark_style", "heat_min", "station_for", "teaches"].some((k) => hasValue(state, n.id, k)) && valueOn(state, n.id, "item_type") !== "Ingredient");
  const target = s.target ? state.notes.get(s.target) : undefined;
  const ink = s.ink ? state.notes.get(s.ink) : undefined;
  const tool = s.tool ? state.notes.get(s.tool) : undefined;
  const look = { color: ink ? colorOf(state, ink.id, "ink_color", "#a78bfa") : "", glow: ink ? numOf(valueOn(state, ink.id, "ink_glow")) : 0, style: (tool && valueOn(state, tool.id, "mark_style") === "Drawn" ? "Drawn" : "Carved") as MarkStyle };
  const placement = s.placement ?? { x: 50, y: 50, s: 34, r: 0 };
  const guide = s.guide !== false;
  const strokes: number[][][] = s.strokes ?? [];
  const [busy, setBusy] = useState(false);
  const have = (need: { noteId?: string | null; name: string; qty: number }) => inventory.filter((n) => n.id !== s.target && itemMatches(n, need)).reduce((a, n) => a + qtyOf(state, n.id), 0);
  const toolOk = !rune?.config.tools.length || (!!tool && rune.config.tools.some((t) => itemMatches(tool, t)));
  const missing = rune ? [
    !target && "Pick the item to inscribe",
    !toolOk && `Needs a tool: ${rune.config.tools.map((t) => t.name).join(" or ")}`,
    rune.config.needsInk && !ink && "Needs a liquid or ink",
    ...rune.config.ingredients.filter((i) => have(i) < i.qty).map((i) => `Needs ${i.qty}× ${i.name} (you have ${have(i)})`),
  ] : freehand ? [!target && "Pick the item to inscribe"] : [];
  const ready = (!!rune || freehand) && !missing.some(Boolean);

  const inscribe = async (mode: "quick" | "game" | "freehand") => {
    if ((!rune && mode !== "freehand") || !target || !character) return;
    setBusy(true);
    try {
      const drawn = mode === "quick" ? rune!.config.sigil : strokes;
      const accuracy = mode === "game" ? traceAccuracy(rune!.config.sigil, strokes) : 0;
      const existing = runesOn(state, target.id).map((r) => runeLookOf(state, r));
      const portrait = await runePortrait(baseOf(state, target), target.name, [...existing, { strokes: drawn, ...look, placement }]);
      const res: CraftOutcome = await request({ op: "craft.rune", characterId, runeId: rune?.id ?? null, targetId: target.id, inkId: ink?.id ?? null, toolId: tool?.id ?? null, mode, accuracy, guide, strokes: drawn, placement, portrait: portrait || null });
      announceRoll(character.name, res.roll, scope.kind === "campaign");
      set({ stage: "plan", strokes: [], result: { ...res, message: mode === "game" ? `${res.message} (traced ${accuracy}%)` : res.message } });
    } catch (e: any) { toast({ title: "Couldn't inscribe it", description: e.message, variant: "destructive" }); }
    finally { setBusy(false); }
  };

  if (s.stage === "trace" && (rune || freehand) && target) {
    const useGuide = !freehand && guide;
    return (
      <div className="space-y-2" data-testid="rune-trace">
        <div className="flex flex-wrap items-center gap-2">
          {playing && <button type="button" onClick={() => set({ stage: "plan" })} className="h-8 px-2 rounded-md border border-stone-700 text-xs text-stone-300 inline-flex items-center gap-1"><ArrowLeft className="h-3.5 w-3.5" /> Back</button>}
          <span className="text-sm font-bold text-stone-100">{rune ? rune.name : "Freehand rune"} on {target.name}</span>
          <span className="text-[11px] text-stone-400">{look.style}{ink ? ` · ${ink.name}` : " · no ink"} · {freehand ? "no guide" : `guide ${guide ? "on" : "off"}`}</span>
          {!playing && <span className="text-[10px] px-2 py-0.5 rounded-full border border-stone-600 text-stone-300">Watching live</span>}
        </div>
        <TraceCanvas base={baseOf(state, target)} name={target.name} existing={runesOn(state, target.id).map((r) => runeLookOf(state, r))} sigil={rune?.config.sigil ?? []} guide={useGuide} placement={placement} look={look} strokes={strokes} playing={playing} onStrokes={(st) => set({ strokes: st })} />
        {playing && (
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => set({ strokes: strokes.slice(0, -1) })} disabled={!strokes.length} className="h-9 px-3 rounded-lg border border-stone-700 text-xs text-stone-200 inline-flex items-center gap-1 disabled:opacity-40"><Undo2 className="h-4 w-4" /> Undo</button>
            <button type="button" onClick={() => set({ strokes: [] })} disabled={!strokes.length} className="h-9 px-3 rounded-lg border border-stone-700 text-xs text-stone-200 inline-flex items-center gap-1 disabled:opacity-40"><Eraser className="h-4 w-4" /> Clear</button>
            <button type="button" disabled={busy || !strokes.length} onClick={() => inscribe(freehand ? "freehand" : "game")} className="ml-auto h-10 px-4 rounded-md bg-amber-600 hover:bg-amber-500 text-white text-sm font-medium inline-flex items-center gap-2 disabled:opacity-40" data-testid="rune-inscribe"><Sparkles className="h-4 w-4" /> Inscribe</button>
          </div>
        )}
        <div className="text-[11px] text-stone-500">{freehand ? "Draw freely. If your marks come close enough to any rune (60%+) it takes as that rune: 80%+ is fine, 95%+ masterwork. Under 60% nothing takes and nothing is used up." : <>Trace the sigil{guide ? " over the guide" : " from memory"}. {guide ? "With the guide: 60%+ takes, 80%+ is fine, 95%+ masterwork." : "Without the guide: 40%+ takes, 65%+ is fine, 85%+ masterwork."} Under that, the socket is spent with no effect.</>}</div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <ResultBanner result={s.result} onOpen={openNote} onClose={playing ? () => set({ result: undefined }) : undefined} />
      <Panel title="Rune">
        <div className="grid grid-cols-[repeat(auto-fill,minmax(96px,1fr))] gap-1.5">
          <button type="button" disabled={!playing} onClick={() => set({ rune: FREEHAND, strokes: [], result: undefined })}
            className={`rounded-md border p-1.5 transition-colors ${freehand ? "border-amber-500 bg-amber-500/10" : "border-stone-700 bg-stone-900 hover:border-amber-700"}`} data-testid="rune-freehand">
            <div className="w-full max-w-[110px] mx-auto aspect-square rounded-md bg-stone-950 grid place-items-center"><PenTool className="h-8 w-8 text-stone-400" /></div>
            <div className="text-[11px] font-semibold text-stone-100 truncate">Freehand</div>
          </button>
          {defs.map((d) => (
            <button key={d.defId} type="button" disabled={!playing} onClick={() => set({ rune: d.defId, strokes: [], result: undefined })}
              className={`rounded-md border p-1.5 transition-colors ${s.rune === d.defId ? "border-amber-500 bg-amber-500/10" : "border-stone-700 bg-stone-900 hover:border-amber-700"}`} data-testid={`rune-def-${d.name}`}>
              <SigilThumb strokes={d.config.sigil} />
              <div className="text-[11px] font-semibold text-stone-100 truncate">{d.name}</div>
            </button>
          ))}
        </div>
        <div className="text-[11px] text-stone-400">{defs.length ? "Runes you know (from scrolls) can be traced over a guide. " : "You don't know any runes yet (each is learned from a scroll). "}Freehand needs no scroll: draw without a guide, and if it comes close enough to a rune, it takes.</div>
      </Panel>
      {(rune || freehand) && (
        <>
          <div className="grid sm:grid-cols-2 gap-3">
            <Panel title="Inscribe on">
              <div className="flex flex-wrap gap-1.5">{targets.map((n) => <ItemTile key={n.id} note={n} selected={s.target === n.id} disabled={!playing} onClick={() => set({ target: n.id })} sub={`${runesOn(state, n.id).length} rune${runesOn(state, n.id).length === 1 ? "" : "s"}`} testId={`rune-target-${n.name}`} />)}</div>
              {!targets.length && <div className="text-[11px] text-stone-500">Nothing to inscribe in the inventory.</div>}
            </Panel>
            <Panel title="Needs">
              {freehand && <div className="text-[11px] text-stone-400">Whatever the rune you draw needs (its ingredients, tool and ink) — checked when it takes.</div>}
              {rune && rune.config.ingredients.map((i, k) => { const h = have(i); return <div key={k} className="flex items-center gap-2 text-xs"><span className={`h-2 w-2 rounded-full ${h >= i.qty ? "bg-emerald-400" : "bg-red-500"}`} /><span className="flex-1 text-stone-200">{i.qty} × {i.name}</span><span className="text-stone-500">have {h}</span></div>; })}
              {rune && rune.config.tools.length > 0 && <div className="text-xs text-stone-300 flex items-center gap-2"><span className={`h-2 w-2 rounded-full ${toolOk ? "bg-emerald-400" : "bg-red-500"}`} />Tool: {rune.config.tools.map((t) => t.name).join(" or ")}</div>}
              {rune?.config.needsInk && <div className="text-xs text-stone-300 flex items-center gap-2"><span className={`h-2 w-2 rounded-full ${ink ? "bg-emerald-400" : "bg-red-500"}`} />A liquid or ink</div>}
              {rune?.config.effect && <div className="text-[11px] text-stone-300">Effect: {rune.config.effect.key.replace(/_/g, " ")} {(["default", "slight", "huge"] as const).map((t) => `${rune.config.effect!.values[t] ?? 0}`).join(" / ")} (standard / fine / masterwork)</div>}
            </Panel>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <Panel title="Tool">
              <div className="flex flex-wrap gap-1.5">{tools.map((n) => <ItemTile key={n.id} note={n} selected={s.tool === n.id} disabled={!playing} onClick={() => set({ tool: s.tool === n.id ? undefined : n.id })} sub={String(valueOn(state, n.id, "mark_style") ?? "Carved")} testId={`rune-tool-${n.name}`} />)}</div>
              {!tools.length && <div className="text-[11px] text-stone-500">No carving tools or pens (items with a mark style).</div>}
            </Panel>
            <Panel title="Ink or liquid">
              <div className="flex flex-wrap gap-1.5">
                {inks.map((n) => <ItemTile key={n.id} note={n} selected={s.ink === n.id} disabled={!playing} color={colorOf(state, n.id, "ink_color", "#a78bfa")} onClick={() => set({ ink: s.ink === n.id ? undefined : n.id })} sub={`glow ${numOf(valueOn(state, n.id, "ink_glow"))}`} testId={`rune-ink-${n.name}`} />)}
              </div>
              {!inks.length && <div className="text-[11px] text-stone-500">No inks or liquids (items with an ink colour) — the rune will be plain.</div>}
            </Panel>
          </div>
          {target && (
            <Panel title="Placement" right={!freehand && <label className="inline-flex items-center gap-1.5 text-[11px] text-stone-300"><input type="checkbox" checked={guide} disabled={!playing} onChange={(e) => set({ guide: e.target.checked })} data-testid="rune-guide" />{guide ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />} Guide</label>}>
              <div className="grid sm:grid-cols-[220px_1fr] gap-3 items-start">
                <PlacementPreview base={baseOf(state, target)} name={target.name} existing={runesOn(state, target.id).map((r) => runeLookOf(state, r))} sigil={rune?.config.sigil ?? FREEHAND_MARK} placement={placement} look={look} />
                <div className="space-y-1.5 text-xs">
                  {(["x", "y", "s", "r"] as const).map((k) => (
                    <label key={k} className="flex items-center gap-2"><span className="w-14 text-stone-400">{k === "x" ? "Across" : k === "y" ? "Down" : k === "s" ? "Size" : "Turn"}</span>
                      <input type="range" min={k === "s" ? 12 : k === "r" ? -180 : 10} max={k === "s" ? 80 : k === "r" ? 180 : 90} value={placement[k]} disabled={!playing} onChange={(e) => set({ placement: { ...placement, [k]: Number(e.target.value) } })} className="flex-1 accent-violet-500" /></label>
                  ))}
                  <div className="text-[10px] text-stone-500">{freehand ? "Where the rune goes on the item." : "Hiding the guide makes it harder to follow — so the bonuses come easier."}</div>
                </div>
              </div>
            </Panel>
          )}
          {playing && (<>
            <div className="flex flex-wrap items-center gap-2">
              {rune && <QuickCraftButton kind="rune" characterId={characterId} busy={busy} disabled={!ready} onClick={() => inscribe("quick")} />}
              <button type="button" disabled={!ready} onClick={() => set({ stage: "trace", strokes: [], result: undefined })} className="h-9 px-3 rounded-md bg-amber-600 hover:bg-amber-500 text-white text-xs font-medium inline-flex items-center gap-1.5 disabled:opacity-40" data-testid="rune-start"><PenTool className="h-4 w-4" /> {freehand ? "Start drawing" : "Start tracing"}</button>
            </div>
            <Needs items={missing} />
          </>)}
        </>
      )}
    </div>
  );
}

function SigilThumb({ strokes }: { strokes: number[][][] }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => { const ctx = ref.current?.getContext("2d"); if (!ctx) return; ctx.clearRect(0, 0, 96, 96); drawSigil(ctx, strokes, 48, 48, 80, { color: "#c4b5fd", glow: 40, style: "Drawn", width: 3 }); }, [strokes]);
  return <canvas ref={ref} width={96} height={96} className="w-full max-w-[110px] mx-auto block aspect-square rounded-md bg-stone-950" />;
}

function useImage(src: string | null) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  useEffect(() => { let on = true; if (!src) { setImg(null); return; } void loadImage(src).then((i) => on && setImg(i)); return () => { on = false; }; }, [src]);
  return img;
}
function paintItem(ctx: CanvasRenderingContext2D, size: number, img: HTMLImageElement | null, name: string) {
  const g = ctx.createRadialGradient(size / 2, size / 2, 10, size / 2, size / 2, size * 0.7); g.addColorStop(0, "#26212b"); g.addColorStop(1, "#09080a");
  ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
  if (img) { const k = Math.max(size / img.width, size / img.height); ctx.drawImage(img, (size - img.width * k) / 2, (size - img.height * k) / 2, img.width * k, img.height * k); }
  else { ctx.fillStyle = "rgba(214,211,209,0.1)"; ctx.font = `bold ${size * 0.42}px serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText((name[0] ?? "?").toUpperCase(), size / 2, size / 2); }
}
function placeSigil(ctx: CanvasRenderingContext2D, size: number, r: RuneLook, alpha = 1) {
  ctx.save(); ctx.translate((r.placement.x / 100) * size, (r.placement.y / 100) * size); ctx.rotate(((r.placement.r ?? 0) * Math.PI) / 180);
  drawSigil(ctx, r.strokes, 0, 0, (r.placement.s / 100) * size, { color: r.color, glow: r.glow, style: r.style, alpha });
  ctx.restore();
}

function PlacementPreview({ base, name, existing, sigil, placement, look }: { base: string | null; name: string; existing: RuneLook[]; sigil: number[][][]; placement: RuneLook["placement"]; look: Omit<RuneLook, "strokes" | "placement"> }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const img = useImage(base);
  useEffect(() => {
    const ctx = ref.current?.getContext("2d"); if (!ctx) return;
    paintItem(ctx, 220, img, name);
    for (const r of existing) placeSigil(ctx, 220, r);
    placeSigil(ctx, 220, { strokes: sigil, ...look, color: look.color || "#c4b5fd", style: "Drawn", glow: 30, placement }, 0.55);
  }, [img, name, existing, sigil, placement, look]);
  return <canvas ref={ref} width={220} height={220} className="w-full rounded-lg border border-stone-700" />;
}

/** The tracing surface: the item, the runes already on it, the guide, and the player's strokes, live. */
function TraceCanvas({ base, name, existing, sigil, guide, placement, look, strokes, playing, onStrokes }: {
  base: string | null; name: string; existing: RuneLook[]; sigil: number[][][]; guide: boolean; placement: RuneLook["placement"]; look: Omit<RuneLook, "strokes" | "placement">;
  strokes: number[][][]; playing: boolean; onStrokes: (s: number[][][]) => void;
}) {
  const S = 520;
  const ref = useRef<HTMLCanvasElement>(null);
  const img = useImage(base);
  const current = useRef<number[][] | null>(null);
  const lastSync = useRef(0);
  const [, force] = useState(0);
  const local = useRef(strokes);
  useEffect(() => { if (!current.current) local.current = strokes; }, [strokes]);
  useEffect(() => {
    let raf = 0;
    const f = (t: number) => {
      const ctx = ref.current?.getContext("2d");
      if (ctx) {
        paintItem(ctx, S, img, name);
        for (const r of existing) placeSigil(ctx, S, r);
        // The sigil's box, softly lit.
        const cx = (placement.x / 100) * S, cy = (placement.y / 100) * S, sz = (placement.s / 100) * S;
        ctx.save(); ctx.strokeStyle = "rgba(167,139,250,0.25)"; ctx.setLineDash([4, 6]); ctx.beginPath(); ctx.arc(cx, cy, sz * 0.62, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
        if (guide) {
          const pulse = 0.35 + 0.15 * Math.sin(t / 400);
          ctx.save(); ctx.translate(cx, cy); ctx.rotate(((placement.r ?? 0) * Math.PI) / 180);
          drawSigil(ctx, sigil, 0, 0, sz, { color: "#e9d5ff", glow: 30, style: "Drawn", alpha: pulse, width: Math.max(2, sz / 30) });
          ctx.restore();
        }
        const all = current.current ? [...local.current, current.current] : local.current;
        if (all.length) placeSigil(ctx, S, { strokes: all, ...look, placement });
      }
      raf = requestAnimationFrame(f);
    };
    raf = requestAnimationFrame(f);
    return () => cancelAnimationFrame(raf);
  }, [img, name, existing, sigil, guide, placement, look]);

  /** A pointer position in the sigil's own 0–100 coordinates (undoing its placement). */
  const toSigil = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * S, py = ((e.clientY - r.top) / r.height) * S;
    const cx = (placement.x / 100) * S, cy = (placement.y / 100) * S, sz = (placement.s / 100) * S;
    const a = (-(placement.r ?? 0) * Math.PI) / 180;
    const dx = px - cx, dy = py - cy;
    const rx = dx * Math.cos(a) - dy * Math.sin(a), ry = dx * Math.sin(a) + dy * Math.cos(a);
    return [Math.round((50 + (rx / sz) * 100) * 10) / 10, Math.round((50 + (ry / sz) * 100) * 10) / 10];
  };
  return (
    <div className="relative rounded-xl overflow-hidden border border-violet-900/70 mx-auto max-w-[520px]">
      <canvas ref={ref} width={S} height={S} className={`w-full block touch-none ${playing ? "cursor-crosshair" : ""}`} data-testid="rune-canvas"
        onPointerDown={(e) => { if (!playing) return; e.currentTarget.setPointerCapture(e.pointerId); current.current = [toSigil(e)]; force((x) => x + 1); }}
        onPointerMove={(e) => {
          if (!playing || !current.current) return;
          current.current.push(toSigil(e));
          const now = performance.now();
          if (now - lastSync.current > 150) { lastSync.current = now; onStrokes([...local.current, current.current]); }
        }}
        onPointerUp={() => { if (!current.current) return; const st = current.current; current.current = null; if (st.length > 1) { local.current = [...local.current, st]; onStrokes(local.current); } }}
      />
      <div className="absolute bottom-2 right-2 text-[10px] px-2 py-0.5 rounded-full bg-black/60 border border-violet-700/50" style={{ color: "#ddd6fe" }}>{strokes.length ? `${strokes.length} stroke${strokes.length === 1 ? "" : "s"}` : "Draw"}</div>
    </div>
  );
}
void TIER_LABEL;
