// Alchemy: follow a recipe step by step over a bubbling cauldron — stir, dice,
// heat, add at the right moment, grind to the beat, strain, rest — each step
// scored; or experiment freely and let the GM decide what comes of it.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { FlaskConical, Play, ArrowLeft, Plus, Minus, FlaskRound, Wand2 } from "lucide-react";
import type { AgNote } from "@shared/agnostic/types";
import { ALCHEMY_STEP_LABEL, TIER_COLOR, TIER_LABEL, accuracyTier, itemMatches, type AlchemyConfig, type AlchemyStep, type AlchemyStepType } from "@shared/agnostic/crafting";
import { useAg } from "../hooks";
import { useToast } from "@/hooks/use-toast";
import { qtyOf, hasValue, inventoryOf, valueOn, type CraftState } from "./session";
import { ItemTile, ResultBanner, QuickCraftButton, Panel, ChoiceRow, DefStrip, DefCard, useDefs, NotHere, stationNameOf, announceRoll, Needs, NoneKnown, SKILL_KEY, type CraftOutcome, type KnownDef } from "./common";
import { stepParticles, heatColor, type Particle } from "./render";
import { MixGame, DiceGame, HeatGame, AddGame, GrindGame, StrainGame, RestGame } from "./brew";

interface Props { characterId: string; state: CraftState; set: (p: CraftState) => void; playing: boolean; /** Begin crafting (whoever does is the one at the controls). */ start: (p: CraftState) => void; /** The station item it's worked at. */ stationId?: string }


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
            art={<FlaskConical className="h-8 w-8 text-amber-300/80" />} name={d.name.replace(/\s*recipe\s*$/i, "") || d.name} testId={`alchemy-recipe-${d.name}`}
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
            <button type="button" disabled={s.experiment ? !chosen.length : !ready} onClick={() => start({ stage: "brew", step: 0, scores: [], log: [], steps: [], st: {}, free: undefined, result: undefined })}
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
  const skill = Math.max(0, Math.min(4, Math.floor(Number(valueOn(state, characterId, SKILL_KEY.alchemy) ?? 0) || 0)));
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
        {playing && <button type="button" onClick={() => set({ stage: "plan", free: undefined, st: {} })} className="h-8 px-2 rounded-md border border-stone-700 text-xs text-stone-300 inline-flex items-center gap-1 hover:border-stone-500" data-testid="alchemy-back"><ArrowLeft className="h-3.5 w-3.5" /> Back</button>}
        <div className="min-w-0">
          <div className="text-sm font-semibold text-stone-100 truncate">{s.experiment ? "Experiment" : recipe?.name}{step ? ` — ${stepText(step)}` : done ? " — ready to bottle" : ""}</div>
          {!s.experiment && <div className="flex gap-1 mt-0.5">{steps.map((st, k) => <span key={st.id} title={stepText(st)} className="h-1.5 w-6 rounded-sm" style={{ background: k < idx ? TIER_COLOR[accuracyTier(scores[k] ?? 0)] : k === idx ? "#d97706" : "#292524" }} />)}</div>}
        </div>
        {!playing && <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full bg-stone-900 text-stone-300 border border-stone-700">Watching live</span>}
      </div>
      {!step && <Cauldron heat={0.35} stir={0} sparkle={done} />}
      {step && (() => {
        const k = `${idx}-${s.free?.k ?? ""}`;
        const props = { step, s, set, playing, skill, onDone: (sc: number, detail: string) => finishStep(sc, detail) };
        switch (step.type) {
          case "mix": return <MixGame key={k} {...props} />;
          case "dice": return <DiceGame key={k} {...props} />;
          case "heat": return <HeatGame key={k} {...props} />;
          case "add": return <AddGame key={k} {...props} />;
          case "grind": return <GrindGame key={k} {...props} />;
          case "strain": return <StrainGame key={k} {...props} />;
          case "rest": return <RestGame key={k} {...props} />;
        }
      })()}
      {s.experiment && !step && playing && (
        <Panel title="What do you do?">
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(ALCHEMY_STEP_LABEL) as AlchemyStepType[]).map((t) => (
              <button key={t} type="button" onClick={() => set({ free: { type: t, k: Date.now(), amount: t === "heat" ? 60 : t === "mix" ? 6 : t === "rest" ? 5 : t === "dice" ? 3 : t === "grind" ? 5 : 50, ingredient: ingredientNames[0] }, st: {} })}
                className="h-8 px-3 rounded-md border border-stone-700 bg-stone-900 text-xs text-stone-200 hover:border-amber-600" data-testid={`alchemy-free-${t}`}>{ALCHEMY_STEP_LABEL[t]}</button>
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

/** The pot between steps: iron over the coals in the dark workshop, the brew simmering, as at the forge. */
function Cauldron({ heat, stir, calm, sparkle }: { heat: number; stir: number; calm?: boolean; sparkle?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const props = useRef({ heat, stir, calm, sparkle });
  props.current = { heat, stir, calm, sparkle };
  useEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (!ctx) return;
    const W = 640, H = 240;
    const ps: Particle[] = [];
    let raf = 0, last = performance.now(), t = 0;
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now; t += dt;
      const P = props.current;
      const bg = ctx.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, "#1a1614"); bg.addColorStop(1, "#0a0807"); ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
      const flick = 0.8 + 0.2 * Math.sin(t * 7) * Math.sin(t * 3.3);
      const glow = ctx.createRadialGradient(W / 2, H + 40, 10, W / 2, H + 40, 380 * flick); glow.addColorStop(0, `rgba(255,140,40,${0.3 * flick})`); glow.addColorStop(1, "rgba(0,0,0,0)"); ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);
      for (let j = 0; j < 14; j++) { ctx.fillStyle = heatColor(Math.min(1, 0.45 + P.heat * 0.5 * (0.75 + 0.25 * Math.sin(t * 5 + j))), "#3f3a36"); ctx.fillRect(170 + j * 22, 212 + (j % 3) * 4, 18, 10); }
      // The pot, side on, and the brew's surface in it.
      const px = W / 2, py = 136;
      ctx.fillStyle = "#1b1c1f"; ctx.beginPath(); ctx.moveTo(px - 140, py - 40); ctx.lineTo(px + 140, py - 40); ctx.quadraticCurveTo(px + 150, py + 70, px, py + 72); ctx.quadraticCurveTo(px - 150, py + 70, px - 140, py - 40); ctx.fill();
      ctx.strokeStyle = "#3a3d44"; ctx.lineWidth = 3; ctx.stroke();
      ctx.fillStyle = "#557a52"; ctx.beginPath(); ctx.ellipse(px, py - 40, 132, 14, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#2a2c30"; ctx.fillRect(px - 150, py - 48, 300, 8);
      if (Math.random() < (P.calm ? 0.05 : 0.25 + P.heat * 0.5)) ps.push({ x: px + (Math.random() - 0.5) * 220, y: py - 44, vx: (Math.random() - 0.5) * 10, vy: -25 - Math.random() * 20, life: 1.6, max: 1.6, color: "rgba(214,211,209,0.22)", size: 6 + Math.random() * 6 });
      if (Math.random() < 0.3) ps.push({ x: 170 + Math.random() * 300, y: 210, vx: (Math.random() - 0.5) * 20, vy: -60 - Math.random() * 40, life: 0.7, max: 0.7, color: "#ff8a3d", size: 1.6 });
      if (P.sparkle && Math.random() < 0.5) ps.push({ x: px + (Math.random() - 0.5) * 220, y: py - 44, vx: 0, vy: -40 - Math.random() * 40, life: 1.2, max: 1.2, color: "#facc15", size: 2 });
      stepParticles(ctx, ps, dt, -8);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return <canvas ref={ref} width={640} height={240} className="w-full block rounded-lg border border-stone-700" data-testid="alchemy-cauldron" />;
}
