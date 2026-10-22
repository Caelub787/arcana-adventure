// Alchemy: follow a recipe step by step over a bubbling cauldron — stir, dice,
// heat, add at the right moment, grind to the beat, strain, rest — each step
// scored; or experiment freely and let the GM decide what comes of it.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { FlaskConical, Play, Beaker, ArrowLeft, Plus, Minus, FlaskRound, Wand2 } from "lucide-react";
import type { AgNote } from "@shared/agnostic/types";
import { ALCHEMY_STEP_LABEL, TIER_COLOR, TIER_LABEL, accuracyTier, itemMatches, type AlchemyConfig, type AlchemyStep, type AlchemyStepType } from "@shared/agnostic/crafting";
import { useAg } from "../hooks";
import { useToast } from "@/hooks/use-toast";
import { qtyOf, hasValue, inventoryOf, type CraftState } from "./session";
import { ItemTile, ResultBanner, QuickCraftButton, Panel, ChoiceRow, DefStrip, DefCard, useDefs, NotHere, stationNameOf, announceRoll, Needs, NoneKnown, type CraftOutcome, type KnownDef } from "./common";
import { stepParticles, type Particle } from "./render";

interface Props { characterId: string; state: CraftState; set: (p: CraftState) => void; playing: boolean; /** Begin crafting (whoever does is the one at the controls). */ start: (p: CraftState) => void; /** The station item it's worked at. */ stationId?: string }

const STEP_HUE: Record<AlchemyStepType, number> = { mix: 150, dice: 95, heat: 18, add: 280, grind: 45, strain: 200, rest: 245 };
const STEP_HINT: Record<AlchemyStepType, string> = {
  mix: "Stir: drag round and round the cauldron at a steady pace — keep the needle in the green.",
  dice: "Dice: cut on each guide line.",
  heat: "Heat: bring it to the mark and hold it there — don't overshoot.",
  add: "Add: drop it in when the light crosses the mark.",
  grind: "Grind: press on the beat, when the ring is fullest.",
  strain: "Strain: hold to pour — not so fast that it spills over the line.",
  rest: "Rest: leave it be until it settles.",
};

export function AlchemyTool({ characterId, state: s, set, start, playing, stationId }: Props) {
  const defs = useDefs<AlchemyConfig>("alchemy", characterId, stationId);
  const recipe = defs.find((d) => d.defId === s.recipe && d.here) ?? null;
  if (s.stage === "brew" && (recipe || s.experiment)) return <Brewing characterId={characterId} recipe={recipe} s={s} set={set} playing={playing} stationId={stationId} />;
  return <Plan characterId={characterId} defs={defs} s={s} set={set} start={start} playing={playing} stationId={stationId} />;
}

function Plan({ characterId, defs, s, set, start, playing, stationId }: { characterId: string; defs: Array<KnownDef<AlchemyConfig>>; s: CraftState; set: Props["set"]; start: Props["start"]; playing: boolean; stationId?: string }) {
  const { state, request, scope, openNote } = useAg();
  const { toast } = useToast();
  const character = state.notes.get(characterId);
  const inventory = inventoryOf(state, characterId);
  const recipe = defs.find((d) => d.defId === s.recipe && d.here) ?? null;
  const [busy, setBusy] = useState(false);
  const have = (need: { noteId?: string | null; name: string; qty: number }) => inventory.filter((n) => itemMatches(n, need)).reduce((a, n) => a + qtyOf(state, n.id), 0);
  const ready = !!recipe && recipe.config.ingredients.every((i) => have(i) >= i.qty);
  const chosen: Array<{ itemId: string; qty: number }> = s.ingredients ?? [];
  const quick = async () => {
    if (!recipe || !character) return;
    setBusy(true);
    try {
      const res: CraftOutcome = await request({ op: "craft.brew", characterId, stationId, recipeId: recipe.id, mode: "quick" });
      announceRoll(character.name, res.roll, scope.kind === "campaign");
      start({ result: res });
    } catch (e: any) { toast({ title: "Couldn't brew it", description: e.message, variant: "destructive" }); }
    finally { setBusy(false); }
  };
  const pot = inventory.filter((n) => !hasValue(state, n.id, "station_for") && !hasValue(state, n.id, "teaches"));
  return (
    <div className="space-y-2.5">
      <ResultBanner result={s.result} onOpen={openNote} onClose={playing ? () => set({ result: undefined }) : undefined} />
      <DefStrip>
        <DefCard selected={!!s.experiment} disabled={!playing} onClick={() => set({ recipe: undefined, experiment: true, ingredients: [], result: undefined })}
          art={<Wand2 className="h-8 w-8 text-stone-400" />} name="Experiment" sub="no recipe needed" testId="alchemy-experiment" />
        {defs.map((d) => (
          <DefCard key={d.defId} selected={!s.experiment && s.recipe === d.defId} locked={!d.here} disabled={!playing} onClick={() => set({ recipe: d.defId, experiment: false, result: undefined })}
            art={<FlaskConical className="h-8 w-8 text-emerald-300" />} name={d.name.replace(/\s*recipe\s*$/i, "") || d.name} testId={`alchemy-recipe-${d.name}`}
            sub={d.here ? `${d.config.steps.length} steps` : <NotHere station={stationNameOf(state, stationId)} />} />
        ))}
      </DefStrip>
      {!defs.length && <NoneKnown what="recipes" extra="You don't need one to experiment, though — and you may discover one." />}
      {!recipe && !s.experiment && defs.length > 0 && <div className="text-[11px] text-stone-400">Pick a recipe you know for a guided brew, or Experiment.</div>}
      {recipe && !s.experiment && (
        <div className="rounded-lg border border-stone-700 bg-stone-900/60 p-2.5 grid sm:grid-cols-2 gap-x-4 gap-y-2">
          <div className="space-y-1">
            <div className="text-[10px] uppercase tracking-wide text-stone-500">Ingredients</div>
            {recipe.config.ingredients.map((i, k) => { const h = have(i); return (
              <div key={k} className="flex items-center gap-2 text-xs"><span className={`h-2 w-2 rounded-full ${h >= i.qty ? "bg-emerald-400" : "bg-red-500"}`} /><span className="text-stone-200 flex-1">{i.qty} × {i.name}</span><span className="text-stone-500">have {h}</span></div>
            ); })}
            {!recipe.config.ingredients.length && <div className="text-xs text-stone-500">None</div>}
          </div>
          <div className="space-y-1">
            <div className="text-[10px] uppercase tracking-wide text-stone-500">Steps</div>
            <ol className="space-y-0.5">{recipe.config.steps.map((st, k) => <li key={st.id} className="text-xs text-stone-300 flex gap-2"><span className="text-stone-500 font-mono">{k + 1}.</span>{stepText(st)}</li>)}</ol>
          </div>
        </div>
      )}
      {s.experiment && (
        <ChoiceRow label="Put in" empty="Nothing to put in." testId="alchemy-pot">
          {pot.map((n) => {
            const c = chosen.find((x) => x.itemId === n.id);
            return (
              <span key={n.id} className="inline-flex items-center gap-0.5 shrink-0">
                <ItemTile compact note={n} selected={!!c} disabled={!playing} onClick={() => set({ ingredients: c ? chosen.filter((x) => x.itemId !== n.id) : [...chosen, { itemId: n.id, qty: 1 }] })} sub={c ? `${c.qty} of ${qtyOf(state, n.id)}` : `× ${qtyOf(state, n.id)}`} testId={`alchemy-ing-${n.name}`} />
                {c && playing && <span className="flex flex-col"><button type="button" onClick={() => set({ ingredients: chosen.map((x) => x.itemId === n.id ? { ...x, qty: Math.min(qtyOf(state, n.id), x.qty + 1) } : x) })} className="h-4 w-5 grid place-items-center text-stone-400 hover:text-stone-100"><Plus className="h-3 w-3" /></button><button type="button" onClick={() => set({ ingredients: chosen.map((x) => x.itemId === n.id ? { ...x, qty: Math.max(1, x.qty - 1) } : x) })} className="h-4 w-5 grid place-items-center text-stone-400 hover:text-stone-100"><Minus className="h-3 w-3" /></button></span>}
              </span>
            );
          })}
        </ChoiceRow>
      )}
      {playing && (recipe || s.experiment) && (
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" disabled={s.experiment ? !chosen.length : !ready} onClick={() => start({ stage: "brew", step: 0, scores: [], log: [], steps: [], st: {}, result: undefined })}
              className="h-9 px-4 rounded-md bg-amber-600 hover:bg-amber-500 text-white text-sm font-medium inline-flex items-center gap-1.5 disabled:opacity-40" data-testid="alchemy-start">
              <Play className="h-4 w-4" /> {s.experiment ? "Start experimenting" : "Start brewing"}
            </button>
            {recipe && !s.experiment && <QuickCraftButton kind="alchemy" characterId={characterId} busy={busy} disabled={!ready} onClick={quick} />}
          </div>
          <Needs items={recipe && !s.experiment ? recipe.config.ingredients.filter((i) => have(i) < i.qty).map((i) => `Needs ${i.qty}× ${i.name} (you have ${have(i)})`) : s.experiment && !chosen.length ? ["Pick something to put in"] : []} />
        </div>
      )}
    </div>
  );
}

const stepText = (st: AlchemyStep) => {
  switch (st.type) {
    case "mix": return `Mix for ${st.amount ?? 8}s`;
    case "dice": return `Dice ${st.ingredient ?? "it"} into ${(st.amount ?? 3) + 1} pieces`;
    case "heat": return `Heat to ${st.amount ?? 60}°`;
    case "add": return `Add ${st.ingredient ?? "the ingredient"} at the right moment`;
    case "grind": return `Grind ${st.ingredient ?? ""} — ${st.amount ?? 5} strokes`.replace("  ", " ");
    case "strain": return "Strain it";
    case "rest": return `Let it rest ${st.amount ?? 6}s`;
  }
};

// --------------------------------------------------------------------------- brewing
function Brewing({ characterId, recipe, s, set, playing, stationId }: { characterId: string; recipe: KnownDef<AlchemyConfig> | null; s: CraftState; set: Props["set"]; playing: boolean; stationId?: string }) {
  const { request, state, openNote } = useAg();
  const { toast } = useToast();
  const steps = recipe?.config.steps ?? [];
  const idx = Number(s.step ?? 0);
  const step: AlchemyStep | undefined = s.experiment ? (s.free ? { id: "free", type: s.free.type, amount: s.free.amount, ingredient: s.free.ingredient } : undefined) : steps[idx];
  const scores: number[] = s.scores ?? [];
  const done = !s.experiment && idx >= steps.length;
  const accuracy = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
  const [busy, setBusy] = useState(false);
  const hue = step ? STEP_HUE[step.type] : done ? 48 : 160;
  const finishStep = (score: number, detail: string) => {
    const sc = Math.max(0, Math.min(100, Math.round(score)));
    if (s.experiment) set({ free: undefined, st: {}, log: [...(s.log ?? []), detail], steps: [...(s.steps ?? []), step!.type] });
    else set({ step: idx + 1, scores: [...scores, sc], st: {}, log: [...(s.log ?? []), `${detail} — ${sc}%`] });
  };
  const bottle = async () => {
    setBusy(true);
    try {
      let res: CraftOutcome;
      if (s.experiment) res = await request({ op: "craft.experiment", characterId, stationId, ingredients: s.ingredients ?? [], log: s.log ?? [], steps: s.steps ?? [] });
      else res = await request({ op: "craft.brew", characterId, stationId, recipeId: recipe!.id, mode: "game", accuracy });
      set({ stage: "plan", result: res, ingredients: [] });
    } catch (e: any) { toast({ title: "Couldn't finish the brew", description: e.message, variant: "destructive" }); }
    finally { setBusy(false); }
  };
  const ingredientNames = s.experiment ? (s.ingredients ?? []).map((x: any) => state.notes.get(x.itemId)?.name).filter(Boolean) as string[] : (recipe?.config.ingredients ?? []).map((i) => i.name);
  return (
    <div className="space-y-2" data-testid="alchemy-brew">
      <div className="flex flex-wrap items-center gap-2">
        {playing && <button type="button" onClick={() => set({ stage: "plan" })} className="h-8 px-2 rounded-md border border-stone-700 text-xs text-stone-300 inline-flex items-center gap-1 hover:border-stone-500"><ArrowLeft className="h-3.5 w-3.5" /> Back</button>}
        <span className="text-sm font-bold text-emerald-200">{s.experiment ? "Experiment" : recipe?.name}</span>
        {!s.experiment && <div className="flex gap-1">{steps.map((st, k) => <span key={st.id} title={stepText(st)} className="h-2.5 w-6 rounded-full border" style={{ borderColor: k < idx ? TIER_COLOR[accuracyTier(scores[k] ?? 0)] : k === idx ? "#34d399" : "#44403c", background: k < idx ? TIER_COLOR[accuracyTier(scores[k] ?? 0)] : "transparent", boxShadow: k === idx ? "0 0 8px #34d399" : undefined }} />)}</div>}
        {!playing && <span className="text-[10px] px-2 py-0.5 rounded-full bg-black/60 text-emerald-200 border border-emerald-700/50">Watching live</span>}
      </div>
      <Cauldron hue={hue} heat={Number(s.st?.temp ?? (step?.type === "heat" ? 20 : 35)) / 100} stir={Number(s.st?.angle ?? 0)} calm={step?.type === "rest"} sparkle={done} />
      {step && <div className="text-[11px] text-stone-300 italic">{STEP_HINT[step.type]}</div>}
      {step?.type === "mix" && <MixStep key={`${idx}-${s.free?.k}`} step={step} s={s} set={set} playing={playing} onDone={(sc) => finishStep(sc, `Mixed for ${step.amount ?? 8}s`)} />}
      {step?.type === "dice" && <DiceStep key={`${idx}-${s.free?.k}`} step={step} s={s} set={set} playing={playing} onDone={(sc, n) => finishStep(sc, `Diced ${step.ingredient ?? "it"} into ${n + 1} pieces`)} />}
      {step?.type === "heat" && <HeatStep key={`${idx}-${s.free?.k}`} step={step} s={s} set={set} playing={playing} onDone={(sc, t) => finishStep(sc, `Heated to ${t}°`)} />}
      {step?.type === "add" && <AddStep key={`${idx}-${s.free?.k}`} step={step} s={s} set={set} playing={playing} onDone={(sc, at) => finishStep(sc, `Added ${step.ingredient ?? "an ingredient"} at ${at}%`)} />}
      {step?.type === "grind" && <GrindStep key={`${idx}-${s.free?.k}`} step={step} s={s} set={set} playing={playing} onDone={(sc, n) => finishStep(sc, `Ground ${step.ingredient ?? ""} ${n} strokes`.replace("  ", " "))} />}
      {step?.type === "strain" && <StrainStep key={`${idx}-${s.free?.k}`} s={s} set={set} playing={playing} onDone={(sc) => finishStep(sc, "Strained it")} />}
      {step?.type === "rest" && <RestStep key={`${idx}-${s.free?.k}`} step={step} s={s} set={set} playing={playing} onDone={(sc, sec) => finishStep(sc, `Let it rest ${sec}s`)} />}
      {s.experiment && !step && playing && (
        <Panel title="What do you do?">
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(ALCHEMY_STEP_LABEL) as AlchemyStepType[]).map((t) => (
              <button key={t} type="button" onClick={() => set({ free: { type: t, k: Date.now(), amount: t === "heat" ? 60 : t === "mix" ? 6 : t === "rest" ? 5 : t === "dice" ? 3 : t === "grind" ? 5 : 50, ingredient: ingredientNames[0] }, st: {} })}
                className="h-8 px-3 rounded-lg border text-xs font-semibold" style={{ borderColor: `hsl(${STEP_HUE[t]} 70% 45%)`, color: `hsl(${STEP_HUE[t]} 80% 75%)`, background: `hsl(${STEP_HUE[t]} 60% 12%)` }} data-testid={`alchemy-free-${t}`}>{ALCHEMY_STEP_LABEL[t]}</button>
            ))}
          </div>
        </Panel>
      )}
      <Panel title={s.experiment ? "What you've done" : "Brew log"} right={!s.experiment && scores.length > 0 && <span className="text-xs font-mono" style={{ color: TIER_COLOR[accuracyTier(accuracy)] }}>{accuracy}% · {TIER_LABEL[accuracyTier(accuracy)]}</span>}>
        <ol className="text-[11px] text-stone-300 space-y-0.5 max-h-28 overflow-y-auto">{(s.log ?? []).map((l: string, k: number) => <li key={k}><span className="text-stone-500 font-mono">{k + 1}.</span> {l}</li>)}{!(s.log ?? []).length && <li className="text-stone-500">Nothing yet.</li>}</ol>
      </Panel>
      {playing && (done || (s.experiment && !step && (s.log ?? []).length > 0)) && (
        <button type="button" disabled={busy} onClick={bottle} className="h-10 px-4 rounded-md bg-amber-600 hover:bg-amber-500 text-white text-sm font-medium inline-flex items-center gap-2" data-testid="alchemy-bottle">
          <FlaskRound className="h-4 w-4" /> {s.experiment ? "Bottle it and see" : "Bottle it"}
        </button>
      )}
      <ResultBanner result={s.result} onOpen={openNote} />
    </div>
  );
}

/** The cauldron: a pot over flames, the brew bubbling in the step's colour, steam rising. */
function Cauldron({ hue, heat, stir, calm, sparkle }: { hue: number; heat: number; stir: number; calm?: boolean; sparkle?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const props = useRef({ hue, heat, stir, calm, sparkle });
  props.current = { hue, heat, stir, calm, sparkle };
  useEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (!ctx) return;
    const W = 640, H = 260;
    const ps: Particle[] = [];
    const bubbles: Array<{ x: number; r: number; life: number }> = [];
    let raf = 0, last = performance.now(), t = 0, shownHue = hue;
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now; t += dt;
      const P = props.current;
      shownHue += (P.hue - shownHue) * Math.min(1, dt * 1.5);
      ctx.clearRect(0, 0, W, H);
      const bg = ctx.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, "#0b0f10"); bg.addColorStop(1, "#050606"); ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
      const glow = ctx.createRadialGradient(W / 2, 150, 10, W / 2, 150, 260); glow.addColorStop(0, `hsla(${shownHue},90%,55%,${0.18 + P.heat * 0.2})`); glow.addColorStop(1, "transparent"); ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);
      // Flames under the pot.
      for (let k = 0; k < 9; k++) {
        const fx = W / 2 - 110 + k * 27, fh = (18 + P.heat * 46) * (0.7 + 0.3 * Math.sin(t * 9 + k * 1.7));
        const fg = ctx.createLinearGradient(0, 252, 0, 252 - fh); fg.addColorStop(0, "rgba(255,90,20,0.95)"); fg.addColorStop(0.6, "rgba(255,190,60,0.7)"); fg.addColorStop(1, "rgba(255,240,180,0)");
        ctx.fillStyle = fg; ctx.beginPath(); ctx.moveTo(fx - 12, 252); ctx.quadraticCurveTo(fx, 252 - fh * 1.3, fx + 12, 252); ctx.fill();
      }
      // The pot.
      ctx.fillStyle = "#1b1c1f"; ctx.beginPath(); ctx.ellipse(W / 2, 150, 150, 92, 0, 0, Math.PI); ctx.fill();
      ctx.strokeStyle = "#3a3d44"; ctx.lineWidth = 3; ctx.stroke();
      // The brew's surface, rippling and bubbling.
      const rip = P.calm ? 0.3 : 1;
      const lg = ctx.createRadialGradient(W / 2, 145, 10, W / 2, 150, 150); lg.addColorStop(0, `hsl(${shownHue},85%,${55 + 8 * Math.sin(t * 2)}%)`); lg.addColorStop(1, `hsl(${shownHue},70%,22%)`);
      ctx.save(); ctx.shadowColor = `hsl(${shownHue},90%,55%)`; ctx.shadowBlur = 24; ctx.fillStyle = lg;
      ctx.beginPath(); ctx.ellipse(W / 2, 150, 140, 26 + 2 * Math.sin(t * 3) * rip, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      // A swirl showing the spoon's stirring.
      ctx.save(); ctx.strokeStyle = `hsla(${shownHue},90%,80%,0.45)`; ctx.lineWidth = 2;
      for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.ellipse(W / 2, 150, 40 + k * 32, 7 + k * 6, 0, P.stir + k, P.stir + k + 2.2); ctx.stroke(); }
      const sx = W / 2 + Math.cos(P.stir) * 90, sy = 150 + Math.sin(P.stir) * 16;
      ctx.strokeStyle = "#8b6b46"; ctx.lineWidth = 7; ctx.lineCap = "round"; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + 30, sy - 120); ctx.stroke(); ctx.restore();
      ctx.strokeStyle = "#4b4f57"; ctx.lineWidth = 6; ctx.beginPath(); ctx.ellipse(W / 2, 150, 150, 30, 0, 0, Math.PI * 2); ctx.stroke();
      if (Math.random() < (P.calm ? 0.05 : 0.2 + P.heat * 0.6)) bubbles.push({ x: W / 2 + (Math.random() - 0.5) * 220, r: 3 + Math.random() * 7, life: 0.6 + Math.random() * 0.6 });
      for (let k = bubbles.length - 1; k >= 0; k--) {
        const bb = bubbles[k]; bb.life -= dt; if (bb.life <= 0) { bubbles.splice(k, 1); if (Math.random() < 0.5) ps.push({ x: bb.x, y: 140, vx: (Math.random() - 0.5) * 20, vy: -30 - Math.random() * 30, life: 2.2, max: 2.2, color: `hsla(${shownHue},40%,85%,0.35)`, size: 7 + Math.random() * 8 }); continue; }
        ctx.strokeStyle = `hsla(${shownHue},90%,85%,${bb.life})`; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(bb.x, 150 - (1 - bb.life) * 6, bb.r * (1.2 - bb.life * 0.4), 0, Math.PI * 2); ctx.stroke();
      }
      if (P.sparkle && Math.random() < 0.6) ps.push({ x: W / 2 + (Math.random() - 0.5) * 240, y: 150, vx: 0, vy: -50 - Math.random() * 60, life: 1.2, max: 1.2, color: "#fde68a", size: 2 });
      stepParticles(ctx, ps, dt, -8);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return <canvas ref={ref} width={640} height={260} className="w-full block rounded-xl border border-emerald-900/60" data-testid="alchemy-cauldron" />;
}

interface StepProps { step: AlchemyStep; s: CraftState; set: Props["set"]; playing: boolean }
const Bar = ({ children }: { children: React.ReactNode }) => <div className="rounded-xl border border-stone-700 bg-stone-950/80 p-3 space-y-2">{children}</div>;

/** Stir: angular speed round the pot, kept in the band, for the time asked. */
function MixStep({ step, s, set, playing, onDone }: StepProps & { onDone: (score: number) => void }) {
  const need = Math.max(2, step.amount ?? 8);
  const st = s.st ?? {};
  const pad = useRef<HTMLDivElement>(null);
  const live = useRef({ a: 0, lastA: null as number | null, lastT: 0, speed: 0, good: Number(st.good ?? 0), total: Number(st.total ?? 0), sync: 0 });
  const move = (e: React.PointerEvent) => {
    if (!playing || !pad.current || e.buttons === 0 && e.pointerType === "mouse") return;
    const r = pad.current.getBoundingClientRect();
    const a = Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2));
    const L = live.current, now = performance.now();
    if (L.lastA !== null && now - L.lastT < 200) {
      let d = a - L.lastA; if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI;
      const dt = (now - L.lastT) / 1000;
      L.speed = L.speed * 0.8 + (Math.abs(d) / Math.max(0.001, dt)) * 0.2;
      L.total += dt;
      if (L.speed >= 3 && L.speed <= 7.5) L.good += dt;
      L.a += d;
    }
    L.lastA = a; L.lastT = now;
    if (now - L.sync > 120) { L.sync = now; set({ st: { good: L.good, total: L.total, speed: L.speed, angle: L.a } }); }
    if (L.good >= need) onDone((100 * L.good) / Math.max(L.total, L.good));
  };
  const speed = Number(st.speed ?? 0), good = Number(st.good ?? 0);
  const pos = Math.min(1, speed / 10);
  return (
    <Bar>
      <div ref={pad} onPointerMove={move} onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture?.(e.pointerId); }} className={`relative h-36 rounded-full border-2 border-dashed border-emerald-700/60 mx-auto aspect-square touch-none grid place-items-center ${playing ? "cursor-grab" : ""}`} data-testid="alchemy-mix-pad">
        <span className="text-[11px] text-emerald-300/80 text-center px-6">{playing ? "Drag in circles" : "Stirring…"}</span>
      </div>
      <div className="relative h-3 rounded-full bg-stone-800 overflow-hidden"><div className="absolute inset-y-0 bg-emerald-600/50" style={{ left: "30%", width: "45%" }} /><div className="absolute top-0 bottom-0 w-1.5 bg-white rounded-full" style={{ left: `${pos * 100}%` }} /></div>
      <Progress v={good / need} label={`${Math.min(need, Math.round(good))} / ${need}s at the right pace`} />
    </Bar>
  );
}

/** Dice: cut on the guide lines. */
function DiceStep({ step, s, set, playing, onDone }: StepProps & { onDone: (score: number, cuts: number) => void }) {
  const n = Math.max(1, Math.min(8, Math.round(step.amount ?? 3)));
  const guides = Array.from({ length: n }, (_, k) => (k + 1) / (n + 1));
  const cuts: number[] = s.st?.cuts ?? [];
  const cut = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!playing || cuts.length >= n) return;
    const r = e.currentTarget.getBoundingClientRect();
    const next = [...cuts, Math.max(0, Math.min(1, (e.clientX - r.left) / r.width))];
    set({ st: { cuts: next } });
    if (next.length === n) {
      const sorted = [...next].sort((a, b) => a - b);
      const score = sorted.reduce((acc, c, k) => acc + Math.max(0, 100 - Math.abs(c - guides[k]) * 900), 0) / n;
      setTimeout(() => onDone(score, n), 450);
    }
  };
  return (
    <Bar>
      <div onPointerDown={cut} className={`relative h-16 rounded-xl overflow-hidden touch-none ${playing ? "cursor-crosshair" : ""}`} style={{ background: "linear-gradient(180deg,#86a34a,#4d6b1f)", boxShadow: "inset 0 -6px 12px rgba(0,0,0,0.35), 0 0 18px rgba(132,204,22,0.25)" }} data-testid="alchemy-dice-bar">
        {guides.map((g, k) => <div key={k} className="absolute top-0 bottom-0 w-0 border-l-2 border-dashed border-white/70" style={{ left: `${g * 100}%` }} />)}
        {cuts.map((c, k) => <div key={k} className="absolute -top-1 -bottom-1 w-1 bg-stone-950 animate-in zoom-in duration-200" style={{ left: `calc(${c * 100}% - 2px)` }} />)}
        <span className="absolute left-2 top-1 text-[10px] text-lime-950 font-semibold">{step.ingredient ?? "Ingredient"}</span>
      </div>
      <Progress v={cuts.length / n} label={`${cuts.length} / ${n} cuts`} />
    </Bar>
  );
}

/** Heat: the flame sets where the temperature heads; hold it on the mark. */
function HeatStep({ step, s, set, playing, onDone }: StepProps & { onDone: (score: number, temp: number) => void }) {
  const target = Math.max(10, Math.min(95, step.amount ?? 60));
  const live = useRef({ temp: Number(s.st?.temp ?? 20), flame: Number(s.st?.flame ?? 0), hold: 0, over: 0, elapsed: 0, done: false });
  const [, tick] = useState(0);
  useEffect(() => {
    if (!playing) return;
    const iv = setInterval(() => {
      const L = live.current; if (L.done) return;
      L.temp += (L.flame - L.temp) * 0.07; L.elapsed += 0.1;
      if (Math.abs(L.temp - target) <= 4) L.hold += 0.1; else L.hold = Math.max(0, L.hold - 0.05);
      L.over = Math.max(L.over, L.temp - target);
      set({ st: { temp: Math.round(L.temp * 10) / 10, flame: L.flame, hold: L.hold } });
      tick((x) => x + 1);
      if (L.hold >= 3) { L.done = true; onDone(100 - Math.max(0, L.over - 4) * 4 - Math.max(0, L.elapsed - 12) * 2, Math.round(L.temp)); }
    }, 100);
    return () => clearInterval(iv);
  }, [playing]); // eslint-disable-line react-hooks/exhaustive-deps
  const temp = playing ? live.current.temp : Number(s.st?.temp ?? 20);
  const flame = playing ? live.current.flame : Number(s.st?.flame ?? 0);
  return (
    <Bar>
      <div className="relative h-5 rounded-full overflow-hidden" style={{ background: "linear-gradient(90deg,#1e3a8a,#15803d 40%,#ca8a04 70%,#dc2626)" }}>
        <div className="absolute top-0 bottom-0 border-x-2 border-white/90 bg-white/15" style={{ left: `${target - 4}%`, width: "8%" }} />
        <div className="absolute -top-0.5 -bottom-0.5 w-1.5 rounded bg-white" style={{ left: `${temp}%` }} />
      </div>
      <div className="flex items-center gap-2 text-xs">
        <span className="text-orange-300 w-12">Flame</span>
        <input type="range" min={0} max={100} value={flame} disabled={!playing} onChange={(e) => { live.current.flame = Number(e.target.value); tick((x) => x + 1); }} className="flex-1 accent-orange-500" data-testid="alchemy-heat-flame" />
        <span className="font-mono text-stone-200 w-16 text-right">{Math.round(temp)}° / {target}°</span>
      </div>
      <Progress v={Number(s.st?.hold ?? 0) / 3} label="Hold it on the mark" />
    </Bar>
  );
}

/** Add: a light sweeps across; press as it crosses the mark. */
function AddStep({ step, s, set, playing, onDone }: StepProps & { onDone: (score: number, at: number) => void }) {
  const mark = Math.max(8, Math.min(92, step.amount ?? 50));
  const start = useRef(Number(s.st?.start ?? Date.now()));
  const [pos, setPos] = useState(0);
  useEffect(() => {
    if (playing && !s.st?.start) set({ st: { start: start.current } });
    let raf = 0;
    const f = () => { const t = ((Date.now() - Number(s.st?.start ?? start.current)) / 2600) % 2; setPos((t < 1 ? t : 2 - t) * 100); raf = requestAnimationFrame(f); };
    raf = requestAnimationFrame(f);
    return () => cancelAnimationFrame(raf);
  }, [s.st?.start]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Bar>
      <div className="relative h-8 rounded-full bg-stone-900 border border-stone-700 overflow-hidden">
        <div className="absolute top-0 bottom-0 bg-fuchsia-500/30 border-x border-fuchsia-300" style={{ left: `${mark - 5}%`, width: "10%" }} />
        <div className="absolute top-1 bottom-1 w-3 rounded-full bg-fuchsia-200" style={{ left: `calc(${pos}% - 6px)` }} />
      </div>
      <button type="button" disabled={!playing} onClick={() => onDone(100 - Math.abs(pos - mark) * 4.5, Math.round(pos))} className="h-10 w-full rounded-md bg-amber-600 hover:bg-amber-500 text-white text-sm font-medium inline-flex items-center justify-center gap-2 disabled:opacity-50" data-testid="alchemy-add">
        <Beaker className="h-4 w-4" /> Add {step.ingredient ?? "it"}
      </button>
    </Bar>
  );
}

/** Grind: press on the beat. */
function GrindStep({ step, s, set, playing, onDone }: StepProps & { onDone: (score: number, n: number) => void }) {
  const need = Math.max(2, Math.min(12, Math.round(step.amount ?? 5)));
  const hits: number[] = s.st?.hits ?? [];
  const t0 = useRef(Number(s.st?.t0 ?? Date.now()));
  const [phase, setPhase] = useState(0);
  useEffect(() => { let raf = 0; const f = () => { setPhase(((Date.now() - t0.current) % 900) / 900); raf = requestAnimationFrame(f); }; raf = requestAnimationFrame(f); return () => cancelAnimationFrame(raf); }, []);
  const ring = Math.sin(phase * Math.PI);
  const press = () => {
    if (!playing) return;
    const sc = Math.max(0, 100 - Math.abs(phase - 0.5) * 260);
    const next = [...hits, Math.round(sc)];
    set({ st: { hits: next, t0: t0.current } });
    if (next.length >= need) setTimeout(() => onDone(next.reduce((a, b) => a + b, 0) / next.length, need), 250);
  };
  return (
    <Bar>
      <div className="flex items-center gap-4">
        <button type="button" disabled={!playing} onPointerDown={press} className="relative h-24 w-24 rounded-full grid place-items-center bg-stone-800 border-2 border-amber-700 touch-none select-none disabled:opacity-60" data-testid="alchemy-grind">
          <span className="absolute inset-0 rounded-full border-4 border-amber-300" style={{ transform: `scale(${0.55 + ring * 0.45})`, opacity: 0.25 + ring * 0.75, boxShadow: `0 0 ${ring * 24}px #fcd34d` }} />
          <span className="text-xs text-amber-100 font-semibold">Grind</span>
        </button>
        <div className="flex-1 space-y-1"><div className="flex gap-1">{Array.from({ length: need }, (_, k) => <span key={k} className="h-3 flex-1 rounded-sm" style={{ background: k < hits.length ? `hsl(${hits[k] * 1.2} 80% 50%)` : "#292524" }} />)}</div><div className="text-[10px] text-stone-400">{hits.length} / {need} strokes</div></div>
      </div>
    </Bar>
  );
}

/** Strain: hold to pour; too fast and it spills. */
function StrainStep({ s, set, playing, onDone }: Omit<StepProps, "step"> & { onDone: (score: number) => void }) {
  const live = useRef({ pour: false, rate: 0, done: Number(s.st?.done ?? 0), spill: Number(s.st?.spill ?? 0), finished: false });
  const [, tick] = useState(0);
  useEffect(() => {
    if (!playing) return;
    const iv = setInterval(() => {
      const L = live.current; if (L.finished) return;
      L.rate = L.pour ? Math.min(1, L.rate + 0.045) : Math.max(0, L.rate - 0.12);
      L.done = Math.min(100, L.done + L.rate * 2.2);
      if (L.rate > 0.72) L.spill += (L.rate - 0.72) * 6;
      set({ st: { rate: L.rate, done: L.done, spill: L.spill } }); tick((x) => x + 1);
      if (L.done >= 100) { L.finished = true; onDone(100 - L.spill * 2.5); }
    }, 100);
    return () => clearInterval(iv);
  }, [playing]); // eslint-disable-line react-hooks/exhaustive-deps
  const rate = Number(s.st?.rate ?? 0), done = Number(s.st?.done ?? 0);
  return (
    <Bar>
      <div className="flex items-center gap-3">
        <div className="relative h-24 w-6 rounded-full bg-stone-900 border border-stone-700 overflow-hidden"><div className="absolute bottom-0 inset-x-0 bg-sky-400" style={{ height: `${rate * 100}%` }} /><div className="absolute inset-x-0 border-t-2 border-red-400" style={{ bottom: "72%" }} /></div>
        <button type="button" disabled={!playing} onPointerDown={() => { live.current.pour = true; }} onPointerUp={() => { live.current.pour = false; }} onPointerLeave={() => { live.current.pour = false; }}
          className="flex-1 h-12 rounded-md bg-amber-600 hover:bg-amber-500 text-white text-sm font-medium select-none touch-none disabled:opacity-50" data-testid="alchemy-strain">Hold to pour</button>
      </div>
      <Progress v={done / 100} label={`Strained ${Math.round(done)}%${Number(s.st?.spill ?? 0) > 0.5 ? ` · spilled ${Math.round(Number(s.st?.spill))}` : ""}`} />
    </Bar>
  );
}

/** Rest: wait until it settles. */
function RestStep({ step, s, set, playing, onDone }: StepProps & { onDone: (score: number, sec: number) => void }) {
  const need = Math.max(2, step.amount ?? 6);
  const start = useRef(Number(s.st?.start ?? Date.now()));
  const [, tick] = useState(0);
  useEffect(() => { if (playing && !s.st?.start) set({ st: { start: start.current } }); const iv = setInterval(() => tick((x) => x + 1), 200); return () => clearInterval(iv); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const el = (Date.now() - Number(s.st?.start ?? start.current)) / 1000;
  return (
    <Bar>
      <Progress v={el / need} label={`${Math.min(need, Math.floor(el))} / ${need}s`} />
      <button type="button" disabled={!playing} onClick={() => onDone(Math.min(100, (100 * el) / need), Math.round(el))} className="h-9 w-full rounded-lg border border-indigo-500 bg-indigo-950/50 text-indigo-100 text-sm font-semibold disabled:opacity-50" data-testid="alchemy-rest">{el >= need ? "It's settled — carry on" : "Carry on (too soon costs accuracy)"}</button>
    </Bar>
  );
}

function Progress({ v, label }: { v: number; label: string }) {
  const p = Math.max(0, Math.min(1, v));
  return (
    <div className="space-y-0.5">
      <div className="h-2 rounded-full bg-stone-800 overflow-hidden"><div className="h-full bg-amber-500 transition-[width] duration-150" style={{ width: `${p * 100}%` }} /></div>
      <div className="text-[10px] text-stone-400">{label}</div>
    </div>
  );
}
