// The Agnostic guide: how the system fits together and how to use every part
// of it, with a deep dive on components. Opens from the campaign panel, the
// libraries, every sheet and the components panel (each at the relevant topic).
import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  BookOpen, Minus, Rocket, Backpack, Package, FileText, Hash, Paintbrush, Puzzle, Copy, Dices, Link2, EyeOff, LayoutPanelTop, Library, Sigma, Search, X, Lightbulb, Check, Loader2, HelpCircle,
} from "lucide-react";
import type { AgLayout } from "@shared/agnostic/types";
import { FloatingPanel, bringFloatingPanelToFront, isFloatingPanelOnTop, usePhoneScreen } from "@/components/ui/floating-panel";
import { useToast } from "@/hooks/use-toast";
import { useAgMaybe } from "./hooks";

export type GuideTopic =
  | "start" | "sheets" | "values" | "look" | "components" | "templates" | "buttons" | "connections" | "inventory" | "kits" | "privacy" | "tracker" | "libraries" | "formulas";

// --------------------------------------------------------------------------- open from anywhere
// One guide panel for the page, opened from any GuideButton. It's a floating,
// non-blocking panel, so the GM can keep working while following it.
let guide = { open: false, topic: "start" as GuideTopic, nonce: 0 };
const guideListeners = new Set<() => void>();
// Every place that can draw the panel registers; the page-level host (AgRoot /
// library) wins over the fallback inside each GuideButton, so the panel never
// lives inside something that might close (a popover, a dialog).
let hostSeq = 0;
const hosts: Array<{ id: number; primary: boolean }> = [];
const activeHostId = () => (hosts.find((h) => h.primary) ?? hosts[0])?.id;
function setGuide(next: Partial<typeof guide>) {
  guide = { ...guide, ...next };
  guideListeners.forEach((l) => l());
}
export function openGuide(topic?: GuideTopic) { setGuide({ open: true, topic: topic ?? guide.topic, nonce: guide.nonce + 1 }); }
export function closeGuide() { setGuide({ open: false }); }
function useGuideState() {
  const [, force] = useState(0);
  useEffect(() => { const l = () => force((n) => n + 1); guideListeners.add(l); return () => { guideListeners.delete(l); }; }, []);
  return guide;
}
// Links inside the guide jump to another chapter.
const openGuideFn = (t?: GuideTopic) => openGuide(t);

/** A "Guide" / "?" button that opens the guide at a topic. */
export function GuideButton({ topic = "start", label, className = "", compact }: { topic?: GuideTopic; label?: string; className?: string; compact?: boolean }) {
  return (
    <>
      <button
        type="button"
        onClick={() => openGuide(topic)}
        className={compact
          ? `h-7 w-7 grid place-items-center rounded text-stone-400 hover:text-amber-200 hover:bg-stone-800 shrink-0 ${className}`
          : `h-9 rounded bg-stone-800 hover:bg-stone-700 text-xs text-amber-100 inline-flex items-center justify-center gap-1.5 px-3 ${className}`}
        title="How Agnostic works"
        data-testid={`ag-guide-open-${topic}`}
      >
        {compact ? <HelpCircle className="h-4 w-4" /> : <><BookOpen className="h-3.5 w-3.5" /> {label ?? "Guide: how Agnostic works"}</>}
      </button>
      <AgGuideHost primary={false} />
    </>
  );
}

// --------------------------------------------------------------------------- building blocks
const P = ({ children }: { children: React.ReactNode }) => <p className="text-sm text-stone-300 leading-relaxed">{children}</p>;
const H = ({ children }: { children: React.ReactNode }) => <h3 className="text-[13px] font-semibold text-amber-200 pt-3">{children}</h3>;
const Ui = ({ children }: { children: React.ReactNode }) => <span className="inline-block rounded bg-stone-800 border border-stone-700 px-1.5 py-px text-[12px] text-amber-100 whitespace-nowrap">{children}</span>;
const Code = ({ children }: { children: React.ReactNode }) => <code className="rounded bg-stone-950 border border-stone-800 px-1 py-px text-[12px] font-mono text-sky-300">{children}</code>;
const Steps = ({ children }: { children: React.ReactNode }) => <ol className="list-decimal pl-5 space-y-1.5 text-sm text-stone-300 leading-relaxed marker:text-amber-500">{children}</ol>;
const Bullets = ({ children }: { children: React.ReactNode }) => <ul className="list-disc pl-5 space-y-1 text-sm text-stone-300 leading-relaxed marker:text-stone-600">{children}</ul>;
const Tip = ({ children }: { children: React.ReactNode }) => (
  <div className="flex gap-2 rounded-md border border-amber-900/60 bg-amber-950/30 px-2.5 py-2 text-[13px] text-amber-100/90 leading-relaxed"><Lightbulb className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" /><div>{children}</div></div>
);
function Table({ rows, head }: { rows: Array<[React.ReactNode, React.ReactNode]>; head?: [string, string] }) {
  return (
    <div className="overflow-x-auto rounded border border-stone-800">
      <table className="w-full text-[13px]">
        {head && <thead className="bg-stone-800/70 text-stone-300"><tr><th className="text-left px-2 py-1 font-medium">{head[0]}</th><th className="text-left px-2 py-1 font-medium">{head[1]}</th></tr></thead>}
        <tbody>{rows.map(([a, b], i) => <tr key={i} className="border-t border-stone-800 align-top"><td className="px-2 py-1.5 text-stone-200 whitespace-nowrap">{a}</td><td className="px-2 py-1.5 text-stone-400">{b}</td></tr>)}</tbody>
      </table>
    </div>
  );
}
function Go({ to, children }: { to: GuideTopic; children: React.ReactNode }) {
  return <button type="button" onClick={() => openGuideFn?.(to)} className="text-amber-300 underline underline-offset-2 hover:text-amber-200">{children}</button>;
}

// --------------------------------------------------------------------------- example components
const EXAMPLES: Array<{ name: string; params: string[]; layout: AgLayout; what: string }> = [
  {
    name: "Stat block", params: ["str", "dex", "con", "int", "wis", "cha"], what: "six scores side by side",
    layout: { width: 300, height: 56, background: "rgba(28,25,23,0.6)", radius: 8, items: ["str", "dex", "con", "int", "wis", "cha"].map((k, i) => ({
      id: k, x: 4 + i * 49, y: 3, w: 47, h: 50,
      widget: { kind: "field" as const, ref: `$${k}`, display: "value" as const, label: k.toUpperCase(), showLabel: true, align: "center" as const, look: { labelPos: "above" as const, fontSize: 18, bold: true } },
    })) },
  },
  {
    name: "Mana bar", params: ["mp", "mp_max"], what: "a blue bar for any resource",
    layout: { width: 160, height: 18, items: [
      { id: "bar", x: 0, y: 0, w: 160, h: 18, widget: { kind: "field", ref: "$mp", maxRef: "$mp_max", display: "bar", label: "MP", showLabel: true, look: { color: "#2563eb", labelPos: "inside", numbers: "fraction", barStyle: "gradient", radius: 4, track: "#1c1917" } } },
    ] },
  },
  {
    name: "Name plate", params: ["hp", "hp_max"], what: "portrait, name and HP together",
    layout: { width: 260, height: 64, background: "rgba(28,25,23,0.92)", border: "#78350f", radius: 10, items: [
      { id: "p", x: 4, y: 4, w: 56, h: 56, widget: { kind: "portrait", radius: 8 } },
      { id: "n", x: 68, y: 6, w: 186, h: 22, widget: { kind: "name", fontSize: 16, color: "#fde68a" } },
      { id: "b", x: 68, y: 36, w: 186, h: 18, widget: { kind: "field", ref: "$hp", maxRef: "$hp_max", display: "bar", label: "HP", showLabel: true, look: { color: "#16a34a", labelPos: "inside", numbers: "fraction", radius: 4 } } },
    ] },
  },
];

function ExampleComponentsButton() {
  const ag = useAgMaybe();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  if (!ag || !ag.viewer.isGM) return null;
  const have = new Set(Array.from(ag.state.components.values()).map((c) => c.name.toLowerCase()));
  const missing = EXAMPLES.filter((e) => !have.has(e.name.toLowerCase()));
  if (!missing.length || done) return <div className="text-[12px] text-emerald-300 inline-flex items-center gap-1"><Check className="h-3.5 w-3.5" /> The examples are in your components.</div>;
  return (
    <button type="button" disabled={busy} onClick={async () => {
      setBusy(true);
      try {
        for (const e of missing) await ag.request({ op: "component.upsert", component: { name: e.name, params: e.params, layout: e.layout } });
        setDone(true);
        toast({ title: "Examples added", description: `${missing.map((e) => e.name).join(", ")} — open Components at the top of Sheets to see how they're built.` });
      } catch (err: any) { toast({ title: "Couldn't add them", description: err.message, variant: "destructive" }); }
      finally { setBusy(false); }
    }} className="h-9 px-3 rounded bg-amber-600 hover:bg-amber-500 text-white text-xs inline-flex items-center gap-1.5 disabled:opacity-60" data-testid="ag-guide-examples">
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Puzzle className="h-3.5 w-3.5" />} Add example components here ({missing.map((e) => e.name).join(", ")})
    </button>
  );
}

// --------------------------------------------------------------------------- the topics
interface Topic { id: GuideTopic; title: string; icon: React.ReactNode; words: string; body: React.ReactNode }

const TOPICS: Topic[] = [
  {
    id: "start", title: "Start here", icon: <Rocket className="h-4 w-4" />, words: "begin quick start overview first steps how",
    body: (
      <>
        <P>Agnostic is a game system you build yourself. Nothing is fixed: you decide what a character, monster or item has, what it looks like and what its buttons do. Everything you build belongs to this campaign only.</P>
        <H>The five ideas</H>
        <Table rows={[
          [<b>Sheets</b>, "A page for anything: a character, an NPC, an item, a place, a note. Every sheet has a portrait, a name and a free page underneath."],
          [<b>Values</b>, "The numbers and text a sheet holds: HP, Strength, Gold, Class… They live in the sheet's Values tab and can be shown anywhere."],
          [<b>Inserts</b>, "What you put on the page to show values: resource bars, numbers, pips, dials, buttons, charts, tables, images, columns, canvases. Every insert can be resized and restyled."],
          [<b>Templates</b>, "A blueprint sheet. New sheets made from it start with its values, layout and buttons. Update the template and you can push the changes to every sheet."],
          [<b>Components</b>, "A small design you make once (an HP bar, a stat block, an attack row) and place on many sheets, player tracker cards and other components. Change it once, it changes everywhere."],
        ]} />
        <H>Build your first character in 10 steps</H>
        <Steps>
          <li>In the campaign panel open <Ui>Characters</Ui> → <Ui>New</Ui>, tick <Ui>Make this a template</Ui>, pick <Ui>Character</Ui> and call it “Hero”.</li>
          <li>On the template, open the <Ui>Values</Ui> tab. It already has <Code>hp</Code> and <Code>hp_max</Code>. Press <Ui>Add value</Ui> to add more: “Strength” (Number), “Class” (Text)…</li>
          <li>Go back to the <Ui>Sheet</Ui> tab. Press <Ui>+ Insert</Ui> → <Ui>Component</Ui> → <Ui>HP bar</Ui> → <Ui>Insert</Ui>. Leave its parameters empty — it shows the sheet's own HP.</li>
          <li>Hover the bar and drag its right edge to make it wider, or its bottom edge to make it thicker. Press ⚙ → <Ui>Look & size</Ui> for colours, text and style.</li>
          <li><Ui>+ Insert</Ui> → <Ui>Value block</Ui> → pick <Ui>Strength</Ui>. Type text around it like any document — headings, lists, tables.</li>
          <li><Ui>+ Insert</Ui> → <Ui>Button / roll</Ui> → <Ui>New action…</Ui>: add a <Ui>Roll</Ui> step with <Code>1d20 + str</Code>, call it “Attack”, save, insert.</li>
          <li>Back in the campaign panel, <Ui>Characters</Ui> → <Ui>New</Ui>, leave the template box unticked, choose the <Ui>Hero</Ui> template, pick the player as owner.</li>
          <li>Right-click the new sheet in the list (or press its <Ui>⋮</Ui>) → <Ui>Add to player tracker</Ui>. Its card already has the HP bar.</li>
          <li>Same menu → <Ui>Place on battlemap</Ui> (or drag the sheet onto the map) to make it a token with a live HP bar. Double-click the token to open the sheet.</li>
          <li>Use the <Ui>View as</Ui> picker at the top of a sheet to check exactly what the player sees.</li>
        </Steps>
        <Tip>Everything is live. When anyone changes HP (on the sheet, the player tracker card or the token) every screen updates at once.</Tip>
        <H>GM view and Player view</H>
        <P>The button under Search on the left of the map — or <Ui>Ctrl+K</Ui> (<Ui>⌘K</Ui> on a Mac) — switches between them (just for you, in this campaign).</P>
        <Bullets>
          <li><b>GM view</b> (hammer): build. Edit the pages, insert and resize things, and use Values, Links, Settings, Templates and Components. GMs start here.</li>
          <li><b>Player view</b> (controller): play. Pages are locked and the building tools are hidden, but values, bars, buttons, items and wounds still work. Players start here; a player who owns a sheet can switch to edit its layout if the GM allows it.</li>
          <li>To see exactly what one player can see (hidden things removed), use <Ui>View as …</Ui> instead. See <Go to="privacy">Who sees what</Go>.</li>
        </Bullets>
        <H>Where things are</H>
        <Bullets>
          <li><b>Campaign panel</b>: the <Ui>Characters</Ui>, <Ui>Items</Ui>, <Ui>Beasts</Ui> and <Ui>Notes</Ui> tabs with your folders in them, the <Ui>Components</Ui> and import/export buttons, <Ui>Bring in from My Library / Admin</Ui> and <Ui>Design the player tracker</Ui>.</li>
          <li><b>Folders</b>: the folder button next to <Ui>Search</Ui> makes one. Drag sheets onto a folder to file them, and folders onto each other to nest them — a folder of weapons with a folder of weapon templates inside it, say. Drop a sheet on the empty space below the list to take it out again.</li>
          <li><b>A sheet</b>: the <Ui>Sheet</Ui> page, the <Ui>Values</Ui> tab and, for the GM, <Ui>Links</Ui> (connections) and <Ui>Settings</Ui> (who sees it, owners, token bars, buttons, template, history).</li>
          <li><b>Admin → Agnostic</b> and <b>My Library → Agnostic</b>: your own Characters, Items and Species, kept apart from every other system.</li>
        </Bullets>
      </>
    ),
  },
  {
    id: "sheets", title: "Sheets & the page editor", icon: <FileText className="h-4 w-4" />, words: "editor document insert toolbar text heading table image columns canvas undo",
    body: (
      <>
        <P>The <Ui>Sheet</Ui> tab is a document, like a word processor that several people can edit at once. Write normally, and use the toolbar for headings, bold, lists, checklists, quotes, colours and alignment.</P>
        <H>The Insert menu</H>
        <Table head={["Insert", "What it does"]} rows={[
          ["Value (in text)", "A live value inside a sentence: “Gold: 120”. Can be editable, plain or a badge."],
          ["Value block", "A value on its own line, editable by whoever's allowed."],
          ["Resource bar", "Current/max as a bar (HP, mana, ammo…). Click it to change the value."],
          ["Button / roll", "Runs an action: rolls dice, changes values, posts a message. See Buttons & rolls."],
          ["Hidden section", "A block with its own who-can-see / who-can-edit."],
          ["Secret words", "Hidden words inside a sentence (select text first)."],
          ["2 / 3 columns", "Side-by-side columns. Use + / − on the columns' toolbar for up to 4."],
          ["Tabs", "Splits the page into tabs (Overview, Skills, Inventory…). ⚙ on the tabs renames them, gives them icons and reorders them."],
          ["Icon", "A small picture inside the text: heart, sword, coins, star…"],
          ["Inventory", <>Item cards with search, filters, quantity, equip and an <Ui>Add</Ui> button. See <Go to="inventory">Inventory & lists</Go>.</>],
          ["Free canvas", "A drag-and-drop area: put anything anywhere, at any size, layered."],
          ["Image", "Upload or pick from the image library; drag its sides to resize."],
          ["Table", "A normal table; drag column borders to resize."],
          ["Chart", "Radar, bar, line or pie chart of several values (e.g. stats)."],
          ["Connections table", "Lists every connected sheet (e.g. items) with chosen value columns."],
          ["Link to a sheet", "A clickable chip that opens another sheet."],
          ["Component", "One of your reusable components. See Components."],
          ["Divider", "A horizontal line."],
        ]} />
        <H>Moving and editing inserts</H>
        <Bullets>
          <li>Hover an insert (on phones it's always shown) to see its little toolbar: <b>⠿</b> drag to move, <b>⚙</b> settings & look, <b>🗑</b> remove.</li>
          <li>Drag its edges to resize it. <Go to="look">Resizing & styling</Go> explains every option.</li>
          <li>Canvases: press the grid button (or double-click) to arrange items; press ✓ when done.</li>
          <li><b>Double-click a value</b> on the page to change it right there (if you're allowed to). Values changed by something else (a wound, equipped gear) show a small <Code>= 5</Code> tag with what they really come to.</li>
        </Bullets>
        <H>Undo</H>
        <P><Ui>Ctrl+Z</Ui> / <Ui>Ctrl+Shift+Z</Ui> undo and redo in the page. Outside the text (value changes, template switches) <Ui>Ctrl+Z</Ui> or the ↶ button at the top of the sheet undoes the last change.</P>
      </>
    ),
  },
  {
    id: "values", title: "Values", icon: <Hash className="h-4 w-4" />, words: "fields values number text formula dice select checkbox image key resource min max step",
    body: (
      <>
        <P>Values are the data. The page only <i>shows</i> them, so the same HP can appear on the sheet, a player tracker card and a token and is always the same number.</P>
        <H>Adding values</H>
        <Steps>
          <li>Open a sheet's (or template's) <Ui>Values</Ui> tab.</li>
          <li><Ui>Add value</Ui>: give it a name (“Strength”) and a type. Its <b>key</b> (<Code>strength</Code>) is how formulas and components refer to it.</li>
          <li><Ui>Add resource (current + max)</Ui> makes a pair like <Code>mana</Code> + <Code>mana_max</Code>, ready for a resource bar.</li>
        </Steps>
        <Table head={["Type", "Use it for"]} rows={[
          ["Number", "Scores, HP, gold. Can have min / max / step."],
          ["Text", "Class, notes, anything written."],
          ["Yes / No", "A tickbox: Equipped, Stunned, Inspired."],
          ["Choice", "One of a list of options you write. Each option can have its own colour (Common grey, Rare blue…) which badges and card edges use."],
          ["Calculated", <>Worked out from other values: <Code>10 + con * 2</Code>, <Code>floor((str - 10) / 2)</Code>. Updates by itself.</>],
          ["Dice", <>A dice expression stored on the sheet, e.g. <Code>1d8 + str</Code>, for buttons to roll.</>],
          ["Image", "A picture that's part of the data (a weapon's art, a map)."],
        ]} />
        <P><b>Double-click any value on the page</b> to change it right there — even an empty one, which shows a faint dash. Click a value in the Values tab to change its settings and <b>who can see / change it</b>. That permission protects the value everywhere it appears.</P>
        <Tip>New Character and NPC sheets start with <Code>hp</Code> and <Code>hp_max</Code>, which is what the built-in <b>HP bar</b>, <b>HP</b> and <b>Max HP</b> components and the default token bar use. Rename or delete them if your game doesn't use HP.</Tip>
        <P>Formulas are explained in <Go to="formulas">Formula cheat sheet</Go>.</P>
      </>
    ),
  },
  {
    id: "look", title: "Resizing & styling (Look)", icon: <Paintbrush className="h-4 w-4" />, words: "resize size scale width height colour color style font bar thickness drag look align label numbers segments striped pips shape dial",
    body: (
      <>
        <P>Every insert can be resized and restyled without touching the data underneath. There are three ways to do it.</P>
        <H>1. Drag</H>
        <Bullets>
          <li><b>Side edge</b> (amber pill on the right of a block): drag to set its width, from 10% to 100% of the line.</li>
          <li><b>Bottom edge</b>: drag to make a bar thicker, pips or a dial bigger, or a chart or table taller.</li>
          <li><b>Corner square</b>: both at once. A label shows the size while you drag.</li>
          <li><b>Images</b>: drag their sides or bottom corners. The toolbar also shows S / M / L / Full and alignment when an image is selected.</li>
          <li><b>Canvas, player tracker card and component items</b>: drag the 8 handles around the selected item; arrow keys nudge it.</li>
        </Bullets>
        <H>2. ⚙ → Look & size</H>
        <Table head={["Option", "What it changes"]} rows={[
          ["Width / Align", "How much of the line it takes and whether it sits left, centre or right."],
          ["Thickness / size / height", "Bar thickness, pip size, dial size, chart or table height, button height."],
          ["Colours", "Fill, the empty part of bars, text, label, border, and a background and outline around the whole block."],
          ["Text", "Size (6–72px), bold, italic."],
          ["Label", "Above, left, right, below, inside the bar, or hidden."],
          ["Numbers", "Current / max, current only, percent, or none."],
          ["Bar style", "Solid, shaded, striped, segments (one notch per point), glowing."],
          ["Fills", "Left → right, right → left, or bottom → top for a tall vertical bar."],
          ["Pip shape", "Circles, squares, diamonds, hearts or stars."],
          ["Corners / padding", "Rounded corners and space inside the block."],
          ["Columns", "Gap between columns and their widths (Equal, Wide left, or your own like 2:1:1)."],
          ["Buttons", "Colour, text colour, size, minimum width, corners, dice icon on/off."],
        ]} />
        <P><Ui>Reset look</Ui> puts everything back to the defaults.</P>
        <H>Tooltips (the “?”)</H>
        <P>Every insert's <Ui>Look & size</Ui> has a <Ui>Tooltip</Ui> box, and every value has one in the Values tab (a value's tooltip follows it everywhere it's shown). Fill one in and a <b>?</b> appears: hover it, or tap it on a phone, for a pop-up that scrolls when it's long.</P>
        <Bullets>
          <li><Code>**bold**</Code>, a line starting <Code>## </Code> is a heading (add <Code> · </Code> parts for small notes on its right), <Code>- </Code> makes a bullet.</li>
          <li>Lines with <Code>|</Code> between cells become a table; the first line is the header. A row whose first cell matches the value (e.g. your rank) is highlighted.</li>
        </Bullets>
        <H>3. When inserting</H>
        <P>The insert window shows a live preview and has the same <Ui>Look & size</Ui> panel, so you can style something before it goes on the page.</P>
        <H>Player tracker cards, components and tokens</H>
        <Bullets>
          <li>In the layout editor (canvas, player tracker card, component), select an item and open <Ui>Look — colours, text, label, style</Ui>. The item's box sets its size.</li>
          <li>Token bars: in <Ui>Design the player tracker</Ui> (defaults per kind) or a sheet's <Ui>Settings → Bars on the battlemap</Ui>, press the 🖌 next to a bar for thickness, width, colours, style and numbers.</li>
        </Bullets>
        <Tip>Want the same look in many places? Make it a <Go to="components">component</Go>, style it once, and every copy follows.</Tip>
      </>
    ),
  },
  {
    id: "components", title: "Components: the full guide", icon: <Puzzle className="h-4 w-4" />, words: "component reusable parameter param bind connect hp bar stat block design once everywhere",
    body: (
      <>
        <P>A <b>component</b> is a small design you make once and reuse anywhere: an HP bar, a stat block, an attack row with a button, a name plate. Every placed copy is live. <b>Edit the component and every copy, on every sheet, player tracker card and other component, changes instantly.</b></P>
        <H>Built-in components</H>
        <Table rows={[
          [<b>HP bar</b>, <>A bar of <Code>$hp</Code> out of <Code>$hp_max</Code>. The default player tracker card uses it.</>],
          [<b>HP</b>, <>An editable <Code>$hp</Code> number with a label.</>],
          [<b>Max HP</b>, <>An editable <Code>$hp_max</Code> number with a label.</>],
        ]} />
        <P>They're ordinary components. Open <Ui>Components</Ui> in the campaign panel and click one to restyle it, rename it, change what it shows, or delete it. Restyle <b>HP bar</b> and the player tracker changes with it.</P>

        <H>Parameters: the one idea to understand</H>
        <P>A component doesn't hold values; it has <b>parameters</b>: named slots written with a <Code>$</Code>, like <Code>$hp</Code>. Where you place the component, each parameter is connected to a real value.</P>
        <Bullets>
          <li><b>Leave a parameter empty</b> and it uses the sheet's own value with the same key. <Code>$hp</Code> → the sheet's <Code>hp</Code>. That's why the HP bar just works on any sheet with HP.</li>
          <li><b>Connect it</b> to something else to reuse the design for other values. Put the HP bar on a sheet, set <Code>$hp</Code> → <Code>mana</Code> and <Code>$hp_max</Code> → <Code>mana_max</Code>, and it becomes a mana bar.</li>
          <li>Parameters can point through connections or at another sheet: <Code>@owner.hp</Code> (the owner's HP, on an item or familiar) or a value picked from any sheet.</li>
        </Bullets>

        <H>Make your own, step by step</H>
        <Steps>
          <li>Campaign panel → <Ui>Components</Ui> → <Ui>New component</Ui>. You get a label and a bar to start from.</li>
          <li>Name it (e.g. “Stamina bar”).</li>
          <li>Type the <b>Parameters</b> it needs, separated by commas: <Code>stamina, stamina_max</Code>. Naming them after the values your sheets use means they connect themselves.</li>
          <li>Pick a sheet in <Ui>Preview with</Ui> to see real numbers while you design.</li>
          <li><Ui>+ Add</Ui> items: values, editable values, bars, pips, dials, badges, labels, portrait, name, images, buttons, charts, connection tables, shapes, even other components.</li>
          <li>Select an item to set what it shows. In the value picker choose a <span className="text-sky-300">$parameter</span> (listed first) so it stays reusable, and set Show as, Label and <Ui>Look</Ui>.</li>
          <li>Drag items to move them, drag the handles to resize, and set the component's overall W / H and background in the bar at the top.</li>
          <li>It saves as you go. Press ← to go back to the list.</li>
        </Steps>

        <H>Where you can use a component</H>
        <Table head={["Place", "How"]} rows={[
          ["On a sheet or template page", <><Ui>+ Insert</Ui> → <Ui>Component</Ui>. Choose it, connect parameters (or leave them empty), then resize it like any block.</>],
          ["Inside a free canvas", <>Arrange the canvas → <Ui>+ Add</Ui> → <Ui>Component</Ui>, then select it to connect parameters. Its box sets its size.</>],
          ["On player tracker cards", <><Ui>Design the player tracker</Ui> → a card → <Ui>+ Add</Ui> → <Ui>Component</Ui>. One card design then works for every pinned sheet.</>],
          ["Inside another component", <>Build a big “Character card” out of smaller ones like “HP bar” and “Stat block”. Change the small one and the big one updates.</>],
          ["In other campaigns", <>Export it (import/export button) and import it elsewhere, or copy a sheet that uses it from My Library and the component comes along.</>],
        ]} />

        <H>Ideas</H>
        <Bullets>
          <li><b>Stat block</b>: six values (<Code>$str $dex $con $int $wis $cha</Code>) shown big with small labels above.</li>
          <li><b>Attack row</b>: weapon name, damage dice and an Attack button, connected per weapon.</li>
          <li><b>Resource bar</b>: one bar design reused for HP, mana, stamina and ammo with different connections.</li>
          <li><b>Name plate</b>: portrait + name + HP bar for player tracker cards and NPC sheets.</li>
          <li><b>Condition pips</b>: pips with heart or star shapes for exhaustion, death saves or luck.</li>
        </Bullets>
        <ExampleComponentsButton />

        <H>Good to know</H>
        <Bullets>
          <li>Players see a component only as far as each value's permissions allow; a hidden value stays hidden inside a component too.</li>
          <li>A design is drawn to fit the space it's given, so it looks the same on a phone, just smaller.</li>
          <li>Deleting a component leaves “[component removed]” wherever it was used.</li>
          <li>Components belong to this campaign (or to your library). Changing one never affects another campaign.</li>
        </Bullets>
      </>
    ),
  },
  {
    id: "templates", title: "Templates & versions", icon: <Copy className="h-4 w-4" />, words: "template blueprint version history restore switch lock apply update existing sheets",
    body: (
      <>
        <P>A template is a sheet used as a blueprint. Design it like a normal sheet (values, page, buttons) and every new sheet made from it starts as a copy.</P>
        <Steps>
          <li>Any tab → <Ui>New</Ui> → tick <Ui>Make this a template</Ui> (or <Ui>Add blank templates</Ui> for a tab that has none yet).</li>
          <li>Design it. The values' starting numbers become each new sheet's starting numbers.</li>
          <li><Ui>Sheets</Ui> → <Ui>New</Ui> → choose the template. It's locked to that sheet from then on.</li>
        </Steps>
        <H>Updating sheets that already exist</H>
        <P>On the template, open <Ui>Settings</Ui>. In the <Ui>Template · vN</Ui> section press <Ui>Save as new version</Ui>, then apply it to the sheets that use it in one of two ways.</P>
        <Bullets>
          <li><b>Values, formulas & buttons only</b>: each sheet keeps its own page and text.</li>
          <li><b>Everything, including the layout</b>: the page is replaced, but text players wrote in template sections is kept.</li>
        </Bullets>
        <P>Either way, values players have entered are kept, and every sheet is snapshotted first so it can be restored. Tick <Ui>Remove values the template no longer has</Ui> to tidy up old ones.</P>
        <H>Switching a sheet's template</H>
        <P><b>Window size:</b> resize a template's window and that size is saved — every sheet made from it (already made, or made later) opens at that size, for everyone.</P>
        <P><Ui>Settings → Template → Change template…</Ui> asks first, clears the sheet and rebuilds it from the new template. You can undo it (the ↶ button or <Ui>Ctrl+Z</Ui>) or restore from <Ui>Version history</Ui>.</P>
        <H>Version history</H>
        <P>Every sheet keeps its past versions (template switches, template updates, restores, and any you make with <Ui>Save a version now</Ui>). Open <Ui>Settings → Version history</Ui> to restore one.</P>
      </>
    ),
  },
  {
    id: "buttons", title: "Buttons, rolls & actions", icon: <Dices className="h-4 w-4" />, words: "button action roll dice damage heal message target adventure log",
    body: (
      <>
        <P>A button runs an <b>action</b>: a short list of steps, no code needed. Rolls appear in the Adventure Log like any other roll.</P>
        <Table head={["Step", "Does"]} rows={[
          ["Roll", <>Rolls a formula with dice, e.g. <Code>1d20 + str</Code>, <Code>2d6 + @owner.str</Code>, <Code>4d6kh3</Code>. The result is saved as <Code>$r</Code> (rename it) for later steps.</>],
          ["Change a value", <>Add to, subtract from or set a value: subtract <Code>$dmg</Code> from <Code>@target.hp</Code>, add 1 to <Code>uses</Code>.</>],
          ["Message", <>Posts text; anything in {"{ }"} is worked out: <Code>{"{name} hits for {$dmg}!"}</Code></>],
          ["Choose a sheet", <>Asks whoever pressed it to pick one of a list of sheets, e.g. one of <Code>@owner.wounds</Code>. A filter narrows the list (<Code>severity_rank &lt;= @source.heal_rank</Code>). The pick is <Code>$pick</Code> for later steps.</>],
          ["Remove a sheet", <>Deletes a sheet: <Code>self</Code> (a used-up potion, a treated wound) or one that was chosen (<Code>$pick</Code>).</>],
        ]} />
        <P>Every step has <Ui>+ Only if…</Ui>: the step is skipped unless its condition is true, e.g. <Code>qty &lt;= 0</Code> before “Remove self”.</P>
        <H>Inside a step</H>
        <Bullets>
          <li><Code>@owner.hp</Code>, <Code>@items</Code>… reach through connections, just like formulas.</li>
          <li><Code>@source</Code> is the sheet the button is on (handy inside a filter, which runs on each choice).</li>
          <li><Code>roll(1, might_die)</Code> rolls a die whose size comes from a value. Rolling a Dice value (<Code>damage</Code>) rolls what's written in it.</li>
        </Bullets>
        <Steps>
          <li><Ui>+ Insert</Ui> → <Ui>Button / roll</Ui> → <Ui>Choose what it does…</Ui> → <Ui>New action…</Ui> (or a sheet's <Ui>Settings → Buttons</Ui>).</li>
          <li>Name it, add steps, choose its colour and who can see and press it.</li>
          <li>Save and insert. Buttons also go on canvases, player tracker cards and components.</li>
        </Steps>
        <P><b>The hotbar</b> (bottom of the screen) holds sheets and buttons: press an empty slot to pick any sheet you can see (press it: open the sheet) or any of its rolls and buttons (press it: use it). The GM can also make a <Ui>New function…</Ui> right there — a button with steps, kept on a GM-only “Hotbar functions” sheet or on any sheet. Players make their own with <Ui>New function…</Ui> too: a roll for one of their own sheets — its dice (or one of their attribute dice), a value of theirs it adds, a bonus, and what it spends — which only they (and the GM) can change; the pencil beside it changes it later. Hold or right-click a slot for roll options or to remove it; the number keys 1–0 press slots, H + a number switches loadouts.</P>
        <P><b>Hold a roll</b> (or right-click it) for <Ui>Advantage</Ui> (roll twice, keep the higher), <Ui>Disadvantage</Ui> (keep the lower) or a temporary modifier for that one roll, then <Ui>Roll</Ui>. Every roll button works this way. A roll with <b>Damage Die</b> ticked (in its boxes) asks first how many dice to roll: each extra die costs a set step more than the last (paid from the value you choose, e.g. Energy). A roll that <b>uses up an item</b> (ammunition) needs a matching one in the roller's inventory — same value as this sheet's (Ammo: Arrow), and equipped if the roll says so — and takes one off each roll; the last one leaves the inventory. <Ui>Join initiative</Ui> rolls and puts the sheet (or the character it belongs to) into the campaign's initiative order. The <Ui>Rolls</Ui> insert builds rolls from boxes instead of steps — dice, die, an added value, a bonus, costs, an icon (dice, themed icons, or any Font Awesome icon pasted in) — and chooses which show on the character sheet.</P>
        <P><Ui>Stop here</Ui> ends the button early — give it an <Ui>Only if</Ui> (after a message saying why), e.g. stop when <Code>@holder.energy &lt; energy_cost</Code>. A roll's “Shown as” can use <Code>{"{name}"}</Code> and other values. A roll made from an item or ability counts as its character's roll (it shows on their player tracker card).</P>
        <Tip><Code>@target</Code> means the token(s) currently targeted on the battlemap, so one “Attack” button can roll and take HP off whatever is targeted.</Tip>
      </>
    ),
  },
  {
    id: "connections", title: "Connections & modifiers", icon: <Link2 className="h-4 w-4" />, words: "connect link owner items inventory modifier equipped bonus relation",
    body: (
      <>
        <P>Connections tie sheets together: a sword to its owner, a familiar to its master, members to a party. Each side gets a name: the sword calls the character <Code>owner</Code>; the character calls its swords <Code>items</Code>.</P>
        <Steps>
          <li>Open a sheet's <Ui>Links</Ui> tab, choose a kind (Owned by, Owns, Is at, Ally of, Species, Part of, or <Ui>Custom…</Ui>) and pick the other sheet.</li>
          <li>Formulas can now reach through: <Code>@owner.str</Code>, <Code>sum(@items.weight)</Code>, <Code>count(@items)</Code>.</li>
          <li><Ui>+ Insert</Ui> → <Ui>Connections table</Ui> (or <Ui>Inventory</Ui>) lists connected sheets with value columns (e.g. weight, qty). See <Go to="inventory">Inventory & lists</Go>.</li>
        </Steps>
        <H>Modifiers</H>
        <P>Also in the Links tab: a sheet can change values on what it's connected to. E.g. a sword adds <Code>2</Code> to its owner's <Code>str</Code>, only while <Code>equipped</Code>. Remove the connection or untick equipped and the bonus goes away by itself.</P>
      </>
    ),
  },
  {
    id: "inventory", title: "Inventory & lists", icon: <Backpack className="h-4 w-4" />, words: "inventory items list cards table equip qty quantity add remove filter search sort wounds traits",
    body: (
      <>
        <P>A connections table shows every sheet connected to this one: items it owns, wounds it carries, party members. Set it up as an inventory and it works like a game's inventory screen.</P>
        <Steps>
          <li><Ui>+ Insert</Ui> → <Ui>Inventory</Ui> (or <Ui>Connections table</Ui>) and choose the connection, e.g. <Code>items</Code>.</li>
          <li>Add <b>columns</b>: any value of the connected sheets, each shown as a value, an editable number (Qty with − / +), a bar (durability), a coloured badge (type, rarity) or a toggle (Equip).</li>
          <li>Choose <b>Cards</b> (a row per item with its badges) or <b>Table</b>.</li>
          <li>Turn on <b>Search</b>, <b>Sort by</b>, <b>Filter by</b> a choice value (shows chips like Weapon · Armor · Consumable) and <b>Colour edges by</b> one (rarity).</li>
          <li><b>Add button</b>: which templates it offers (e.g. only <Code>item</Code> sheets), what the new sheet calls this one (<Code>owner</Code>) and whether existing sheets can be picked too.</li>
          <li><b>Remove</b>: disconnect only, delete the sheet, or no remove button.</li>
        </Steps>
        <H>Through other sheets</H>
        <Bullets>
          <li>A connection can be a <b>path</b>: <Code>abilities.aspects</Code> lists every aspect of every ability this sheet has. Its <Ui>Add</Ui> asks which ability first; remove takes a row off the sheet it hangs from.</li>
          <li>A column shown as <Ui>Sheets it's connected to (tags)</Ui> names a connection of each row (e.g. <Code>ability</Code>) and shows those sheets as tags — click one to open it. Filter chips and edge colours can use it too.</li>
          <li>Tags are coloured by the connected sheet's colour value: a text value with <Ui>It's a colour</Ui> ticked in Values (edited with a colour picker).</li>
          <li><Code>*</Code> after a connection follows it as far as it goes: <Code>ability.holder*</Code> is its ability's holder — and if that's another ability, its holder, up to the character. <Code>+</Code> takes every sheet along the way: <Code>abilities+.aspects</Code> is the aspects of a character's abilities and of the abilities inside them.</li>
          <li>Paths work everywhere a connection goes: a Rolls block's <Ui>Who rolls</Ui> (<Code>ability.holder</Code> on an aspect), an Effects block, and formulas (<Code>@ability.holder.anemos_die</Code>).</li>
        </Bullets>
        <Tip>Drag a sheet from the sidebar onto an open sheet to put it in that sheet's list for its kind — an item into the inventory, a trait into the traits. It's connected the way that list's <Ui>Add</Ui> would. Drag a card from one sheet's list onto another sheet to move it there (off the first).</Tip>
        <Tip>A list's <Ui>Add</Ui> → <Ui>Give this sheet its own copy</Ui>: an original added there (picked or dragged) becomes this sheet's own copy, kept in the folder you name, and the original stays as it is. A copy added somewhere else moves; taken off, it stays in that folder. Whoever owns the sheet sees its copies and uses their buttons (they're its <b>users</b>); only a copy's owners can change it.</Tip>
        <Tip>Players only see <Ui>Add</Ui> templates that have <Ui>Settings → Players can add this</Ui> ticked. Everything else stays GM-only.</Tip>
        <H>Totals and bonuses</H>
        <Bullets>
          <li>Weight carried: <Code>sum(@items.total_weight)</Code> where each item has <Code>total_weight = weight * qty</Code>.</li>
          <li>Equipped gear changes the owner through <Go to="connections">modifiers</Go> with the condition <Code>equipped</Code>.</li>
          <li>Click an item card to open the item: its own buttons (Use, Attack, Damage) are there.</li>
        </Bullets>
      </>
    ),
  },
  {
    id: "kits", title: "Starter kits (C.A.)", icon: <Package className="h-4 w-4" />, words: "starter kit cultivator adventure ca rank wounds items potion rune backpack example",
    body: (
      <>
        <P><b>CA Agnostic</b> is also a system of its own: choose it when creating a campaign and the campaign starts with all of these templates. It has its own Admin and My Library (pick “CA Agnostic” there), separate from plain Agnostic. The CA Agnostic <b>admin library</b> is the system's master copy: change a template there and campaigns made afterwards start with your version.</P>
        <P>A starter kit drops a complete, ready-to-play game into the campaign, built from ordinary Agnostic pieces, so every part of it can be opened, changed or copied. Find kits at the bottom of the <Ui>Characters</Ui> tab (GM only).</P>
        <H>Cultivator's Adventure</H>
        <Table rows={[
          [<b>CA Character</b>, "Tabs for Overview, Skills, Ability, Inventory and Traits. Rank, Max HP, Focus and Lifespan come from the Energy Pool by themselves; attributes set each skill's die; attribute and skill points are counted for you."],
          [<b>CA items</b>, "Weapon (Attack, Damage), Ranged Weapon (Attack uses up one equipped ammo of its type, Damage), Armor (adds to DC while equipped), Consumable (Heal HP, Heal a wound), Rune, Container (adds carry weight), Currency, Ammunition, Miscellaneous."],
          [<b>Wound</b>, "Severity, location and effects. Its effects are modifiers on the bearer (−2 Athletics…) that end when it's treated or healed."],
          [<b>Trait</b>, "A named trait with a summary."],
        ]} />
        <H>How it's built (copy these ideas)</H>
        <Bullets>
          <li>Rank: <Code>tier(energy_pool, 0, 10, 20, …)</Code> finds the Pillar on the ladder (nine ranks, Mortal to Paragon, of nine Pillars); <Code>choose(floor(rank_index / 9), 50, 100, …)</Code> reads Max HP off a list, one per rank.</li>
          <li>Skill rolls: <Code>roll(1, might_die) + athletics</Code>.</li>
          <li>Points spent use <Code>base(athletics)</Code>, so a wound's −2 doesn't give points back.</li>
          <li><b>Abilities</b> (<b>CA Ability</b>) are sets — gravity control, ember arts — each with a tag colour; their single uses are <b>Ability Aspects</b> (<b>CA Ability Aspect</b>). Open an ability to see its aspects and <Ui>Add</Ui> new ones. The character's Ability tab lists the abilities, then every aspect of every ability, tagged with (and filterable by) its ability. Each aspect has <b>Rolls</b>: as many as you like (an attack and its damage, two with different costs…), each with its own name, dice, die (fixed or the character's attribute die), a value it adds (a skill), a bonus and an Energy / Focus cost. Pressing one spends the cost first — or says why it can't. Tick <Ui>Button on the character sheet</Ui> for the ones that show on the Ability tab. The character who has its ability rolls and pays (<Code>ability.holder</Code>). Items have the same Rolls (a weapon starts with Attack and Damage). There are two aspect templates: <b>CA Ability Aspect</b> for a normal use (one <b>Use</b> roll, 1d20) and <b>CA Attack Aspect</b> for one that deals damage (an <b>Attack</b> roll, 1d20, and a <b>Damage</b> roll with a Damage Die: spend Energy on it to roll more dice).</li>
          <li>Usable Energy is <Code>choose(rank_index, …)</Code> — the floor of the Pillar you're on, so it only rises on a breakthrough. Each rank up adds 1 Max Focus, 1 Skill Point and 1 Attribute Point; within a rank, Max Focus rises on Pillars 3, 5, 7 and 9 and Skill Points on Pillars 2, 4, 6 and 8 (<Code>focus_max</Code>, <Code>skill_budget</Code>, <Code>attr_budget</Code>).</li>
          <li><b>Ranged weapons</b> (<b>CA Ranged Weapon</b>): their <Ui>Attack</Ui> uses up one <b>CA Ammunition</b> the owner has <b>equipped</b>, of the weapon's Ammo category (Arrow, Bolt, Dart, Pistol Round, Rifle Round) — none of that category equipped, no attack.</li>
          <li><b>Damage Die</b>: a weapon's Damage roll (and any roll you tick it on) lets the wielder spend Energy to roll more of its die — the 1st extra die costs the step (d6 20, d8 25, d10 30, d12 35), the 2nd twice that, the 3rd three times… Daggers d6, Short Swords d8, Longswords d10, Warhammers d12; Bows d8, Longbows d10, Warbows d12.</li>
          <li>Items' <b>Rank</b> is their rarity — Unranked, or a rank name (Mortal … Paragon), never a Pillar. It colours the item's card. Anything crafted takes the rank of what its recipe makes. Rank has nothing to do with runes: what limits those is the room left on the item.</li>
          <li><b>CA Training Item</b> (manuals, pills, elixirs): pick what it <b>Raises</b> and by how much, and/or the points it grants. <Ui>Use</Ui> raises that value for good on its owner (with a matching bonus point, so earned points aren't used up), adds granted points to <Code>bonus_attr_points</Code> / <Code>bonus_skill_points</Code>, and uses one up. Its “Change a value” step targets <Code>@owner.{"{raise_key}"}</Code> — a target worked out from the sheet, which any button can use.</li>
          <li>HP, Energy and Focus <b>go up with</b> their maximum (a value setting): a rank up adds its extra HP to your current HP instead of refilling it. HP's <b>temporary points</b> are Temp HP — taken first, shown in green on the bar (and on the token).</li>
          <li><b>Abilities inside abilities.</b> An ability's page has <Ui>Abilities within</Ui>: add (or drag) abilities into it — a trapped creature's powers inside "Soul Prison". Their aspects show on the character's Ability Aspects list and are rolled and paid by the character. Unlink one and all its aspects go with it.</li>
          <li><b>Each character's own copies.</b> An item, ability or trait given to a character (picked with <Ui>Add</Ui>, or dragged from the sidebar onto their sheet) is their own copy — its own notes, its own wear — kept in the <b>Player Owned Copies</b> folder; the original stays as it is, to give again. Whoever has the character sees what's on it and uses its buttons and rolls — but can't change it unless you make them its owner (the sheet's Settings → Owners). Drag a copy (from the sidebar, or its card on one sheet) onto another character to move it there. The remove button puts it away (still in Player Owned Copies, notes and all) to give again later. An ability's copy brings its aspects.</li>
          <li>Wounds, traits, items and abilities have an <b>Effects</b> box: pick a value of the sheet they're on (Athletics, Speed…) and how much — it really changes it, shown as the red / green number beside it. Items' effects count while equipped.</li>
          <li><Ui>Roll initiative</Ui> on the Overview rolls <Code>1d20 + finesse</Code> and puts the character into the Initiative list (the <Ui>Join initiative</Ui> step).</li>
          <li>New sheets start hidden from players — use <Ui>Share</Ui> (on the sheet, or right-click it in the list) to give them out.</li>
          <li>Heal a wound: <Ui>Choose a sheet</Ui> from <Code>@owner.wounds</Code> filtered by severity, then <Ui>Remove a sheet</Ui> <Code>$wound</Code> (the pick), then take one off <Code>qty</Code> and remove the potion when it's at 0.</li>
        </Bullets>
        <H>Adding more ranks later</H>
        <Steps>
          <li>Open the <b>CA Character</b> template → <Ui>Values</Ui>.</li>
          <li><Code>rank_index</Code> and <Code>usable_energy</Code>: add the new rank's nine Pillars' Energy Pool to the end of their lists (<Code>tier(energy_pool, 0, 10, …)</Code>, <Code>choose(rank_index, 0, 10, …)</Code>).</li>
          <li><Code>rank</Code>: add the new rank's name to the end of its <Code>choose(…, "Mortal", …, "Paragon")</Code> list.</li>
          <li><Code>to_next_rank</Code>: add the same nine numbers to its list. <Code>hp_max</Code>, <Code>lifespan</Code> and <Code>absorption_limit</Code>: one number per new rank.</li>
          <li>Rank's <Ui>Tooltip</Ui> (same row): add a <Code>## Name · Health … · Lifespan … · Absorbs …</Code> heading and a table line per Pillar, like the ones above it. Items' <Code>rank_tag</Code>: add the name to its choices.</li>
          <li><Ui>Settings → Save as new version</Ui>, then apply it to the sheets that use the template. Rank, Max HP, Focus and Lifespan follow on every sheet.</li>
        </Steps>
        <Tip>The example character, “Example Cultivator”, shows everything working: open it, its abilities, trait and wounds. Items, blueprints and recipes start empty — make them from the templates (CA Weapon, CA Ranged Weapon, CA Ammunition, CA Forge, CA Blueprint…).</Tip>
      </>
    ),
  },
  {
    id: "privacy", title: "Who sees what", icon: <EyeOff className="h-4 w-4" />, words: "permission hidden secret gm only owners players visibility preview view as",
    body: (
      <>
        <P>Hidden things are never sent to players who aren't allowed to see them. It isn't just hidden on screen.</P>
        <Table head={["Level", "Where"]} rows={[
          ["Whole sheet", <><Ui>Settings → Who can see this sheet</Ui>: name & portrait, and the rest of the sheet, separately.</>],
          ["Owners", <><Ui>Settings → Owners</Ui>: players who own the sheet (they can edit what owners may edit).</>],
          ["A section", <><Ui>+ Insert</Ui> → <Ui>Hidden section</Ui>, then ⚙ to choose who can see and edit it.</>],
          ["Words in a sentence", <>Select words → <Ui>+ Insert</Ui> → <Ui>Secret words</Ui>, then 🔒.</>],
          ["A single value", <>The <Ui>Values</Ui> tab → the value → <Ui>Who can see / change this value</Ui>.</>],
          ["A button", "Who sees it / who can press it, in the action editor."],
          ["A canvas / card item", <><Ui>Shown to</Ui> in the item's settings.</>],
        ]} />
        <P>Audiences are <b>Everyone</b>, <b>Owners + GM</b>, <b>GM only</b>, or <b>specific people</b>.</P>
        <Tip>Use <Ui>View as …</Ui> at the top of a sheet (or <Ui>Preview as …</Ui> in the campaign panel) to see the sheets, tracker and tokens exactly as a player does.</Tip>
      </>
    ),
  },
  {
    id: "tracker", title: "Player tracker & tokens", icon: <LayoutPanelTop className="h-4 w-4" />, words: "player tracker card pin token battlemap map bars place drag",
    body: (
      <>
        <H>The player tracker</H>
        <Steps>
          <li>Right-click a sheet in the list (or its <Ui>⋮</Ui>) → <Ui>Add to player tracker</Ui>.</li>
          <li><Ui>Design the player tracker</Ui> (or the ⚙ at the end of the player tracker): choose where it sits (top, left, right, bottom) and its size.</li>
          <li>Edit the card design with the layout editor: portrait, name, bars, values, buttons, last roll, components. Make several cards and choose which kind of sheet (or which sheet) uses which.</li>
        </Steps>
        <P>Clicking a card opens the sheet; bars and buttons on the card work directly.</P>
        <P><b>It's the dice tray.</b> Every roll made as that sheet — its buttons, its items' and abilities' buttons, its owner's own rolls — slides out from its card, tumbles, settles on the total and tucks away. Hover the card to see the last roll again; click the roll for the recent ones. Each roll's working (the dice, what was added, the total) is in chat and in the roll history (click the roll; in CA Agnostic also the tracker card's <Ui>Roll history</Ui> button). Turn the tray off in <Ui>Design the player tracker</Ui> → <Ui>Dice tray</Ui>.</P>
        <H>Tokens</H>
        <Bullets>
          <li>Drag a sheet from the list onto the map, or right-click it → <Ui>Place on battlemap</Ui>. Any sheet can be a token; double-click a token to open its sheet.</li>
          <li>Tokens show the sheet's portrait and live bars. Set the default bars per kind in the player tracker designer, or per sheet in <Ui>Settings → Bars on the battlemap</Ui>. Use 🖌 to style them.</li>
          <li>Click a token's bar to change the value. The sheet and tracker follow.</li>
        </Bullets>
      </>
    ),
  },
  {
    id: "libraries", title: "Libraries, copies & sharing", icon: <Library className="h-4 w-4" />, words: "library admin my library import export copy share campaign separate",
    body: (
      <>
        <Bullets>
          <li><b>My Library → Agnostic</b>: your own Characters, Items and Species to reuse in any of your Agnostic campaigns. <b>Admin → Agnostic</b> is the site-wide one.</li>
          <li>In a campaign, <Ui>Bring in from My Library / Admin</Ui> copies a sheet or template in, along with the components it uses. The copy is independent: editing it never changes the library or other campaigns.</li>
          <li>The import/export button (⬇ next to the tabs) shares templates, components and player tracker cards as a file between campaigns or with friends.</li>
          <li>Agnostic content is completely separate from the other systems, and everything the GM edits stays in the campaign it was made in.</li>
        </Bullets>
      </>
    ),
  },
  {
    id: "formulas", title: "Formula cheat sheet", icon: <Sigma className="h-4 w-4" />, words: "formula math function reference dice syntax if sum min max floor",
    body: (
      <>
        <P>You rarely need to type these, because the formula builder inserts values for you, but here is everything it understands.</P>
        <Table head={["Write", "Means"]} rows={[
          [<Code>str</Code>, "The value with key str on this sheet (also @str)."],
          [<Code>@owner.str</Code>, "str on the sheet connected as owner."],
          [<Code>sum(@items.weight)</Code>, "All connected items' weights, added."],
          [<Code>$dmg</Code>, "A result from an earlier action step (or a component parameter)."],
          [<Code>1d20 + 5</Code>, "Dice (buttons only): 2d6, d%, 4d6kh3 (keep highest 3), 2d20kl1 (keep lowest)."],
          [<Code>+ - * / % ^</Code>, "Maths; ( ) for grouping."],
          [<Code>{"== != < <= > >="}</Code>, "Comparisons; && || ! for and / or / not."],
          [<Code>a ? b : c</Code>, "If a then b else c."],
        ]} />
        <H>Functions</H>
        <Table rows={[
          [<Code>floor ceil round(x, d) abs</Code>, "Rounding and absolute value."],
          [<Code>min max clamp(x, lo, hi)</Code>, "Limits."],
          [<Code>sum count avg</Code>, "Lists (several connected sheets)."],
          [<Code>sqrt pow</Code>, "Roots and powers."],
          [<Code>if(cond, yes, no)</Code>, "Choice."],
          [<Code>concat(a, b, …)</Code>, "Join text."],
          [<Code>choose(i, a, b, c…)</Code>, "The i-th option, counting from 0 (past the end → the last)."],
          [<Code>tier(x, t0, t1, …)</Code>, "How far up a ladder x is: 0 below t1, 1 from t1, 2 from t2…"],
          [<Code>roll(n, sides)</Code>, "Dice whose size is a value (buttons only): roll(1, might_die)."],
          [<Code>base(x)</Code>, "x as written on the sheet, before modifiers from connected sheets."],
        ]} />
        <P>Examples: <Code>floor((str - 10) / 2)</Code> (a modifier), <Code>10 + con * 2</Code> (max HP), <Code>{'if(hp <= 0, "Down", "Up")'}</Code>.</P>
      </>
    ),
  },
];

// --------------------------------------------------------------------------- panel
/** Renders the guide panel when it's open. Mount once per Agnostic page (inside its scope). */
export function AgGuideHost({ primary = true }: { primary?: boolean }) {
  const g = useGuideState();
  const [id] = useState(() => ++hostSeq);
  const phone = usePhoneScreen();
  useEffect(() => {
    hosts.push({ id, primary });
    setGuide({});
    return () => { hosts.splice(hosts.findIndex((h) => h.id === id), 1); setGuide({}); };
  }, [id, primary]);
  if (!g.open || activeHostId() !== id) return null;
  return phone ? <PhoneGuide /> : (
    <FloatingPanel
      open
      onClose={closeGuide}
      title={<span className="inline-flex items-center gap-1.5"><BookOpen className="h-4 w-4 text-amber-400" />Agnostic guide</span>}
      panelKey="ag-guide"
      defaultSize={{ width: Math.min(560, window.innerWidth - 32), height: Math.min(680, window.innerHeight - 120) }}
      defaultPosition={{ x: 72, y: 72 }}
      minWidth={300}
      minHeight={220}
    >
      <GuideContent />
    </FloatingPanel>
  );
}

/** Phones: opens full-screen; drag its top edge down to follow along beneath it, or shrink it to a tab. */
function PhoneGuide() {
  const [h, setH] = useState(() => window.innerHeight);
  const [small, setSmall] = useState(false);
  const [z, setZ] = useState(() => bringFloatingPanelToFront("ag-guide", 10650, true));
  // Sheets open full-screen on phones: keep the drawer above them so it can be followed along.
  useEffect(() => {
    const t = window.setInterval(() => { if (!isFloatingPanelOnTop("ag-guide")) setZ(bringFloatingPanelToFront("ag-guide")); }, 400);
    return () => window.clearInterval(t);
  }, []);
  const drag = (e: React.PointerEvent) => {
    e.preventDefault();
    const sy = e.clientY, sh = h;
    const move = (ev: PointerEvent) => setH(Math.max(140, Math.min(window.innerHeight, sh - (ev.clientY - sy))));
    const up = () => { window.removeEventListener("pointermove", move, true); window.removeEventListener("pointerup", up, true); window.removeEventListener("pointercancel", up, true); };
    window.addEventListener("pointermove", move, true);
    window.addEventListener("pointerup", up, true);
    window.addEventListener("pointercancel", up, true);
  };
  if (small) {
    return createPortal(
      <button type="button" onClick={() => setSmall(false)} className="fixed right-3 bottom-24 h-10 px-3 rounded-full bg-amber-600 text-white text-sm shadow-lg inline-flex items-center gap-1.5" style={{ zIndex: z }} data-testid="ag-guide-restore">
        <BookOpen className="h-4 w-4" /> Guide
      </button>, document.body);
  }
  return createPortal(
    <div className={`fixed inset-x-0 bottom-0 flex flex-col bg-stone-900 shadow-[0_-8px_30px_rgba(0,0,0,.5)] ${h >= window.innerHeight ? "" : "rounded-t-xl border-t border-x border-stone-700"}`} style={{ height: Math.min(h, window.innerHeight), zIndex: z, paddingTop: h >= window.innerHeight ? "env(safe-area-inset-top)" : undefined, paddingBottom: "env(safe-area-inset-bottom)" }} data-testid="ag-guide-drawer">
      <div className="relative shrink-0 flex items-center gap-1 pl-3 pr-1 h-11 border-b border-stone-800">
        <div className="absolute left-1/2 -translate-x-1/2 top-0 h-5 w-24 grid place-items-center touch-none cursor-ns-resize" onPointerDown={drag} title="Drag to resize" data-testid="ag-guide-drawer-handle"><span className="h-1 w-10 rounded-full bg-stone-600" /></div>
        <BookOpen className="h-4 w-4 text-amber-400" /><span className="text-sm text-stone-100 font-medium">Agnostic guide</span>
        <button type="button" onClick={() => setSmall(true)} className="ml-auto h-9 w-9 grid place-items-center rounded text-stone-400 hover:bg-stone-800" title="Shrink to a button"><Minus className="h-4 w-4" /></button>
        <button type="button" onClick={closeGuide} className="h-9 w-9 grid place-items-center rounded text-stone-400 hover:bg-stone-800" title="Close" data-testid="ag-guide-close"><X className="h-4 w-4" /></button>
      </div>
      <div className="flex-1 min-h-0"><GuideContent /></div>
    </div>, document.body);
}

/** Chapters list + the open chapter; lays itself out for the panel's width. */
function GuideContent() {
  const g = useGuideState();
  const [topic, setTopic] = useState<GuideTopic>(g.topic);
  const [q, setQ] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const articleRef = useRef<HTMLElement>(null);
  const [wide, setWide] = useState(false);
  // A guide button (or a link inside the guide) asked for a chapter.
  useEffect(() => { setTopic(g.topic); setQ(""); }, [g.nonce]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { guide.topic = topic; articleRef.current?.scrollTo({ top: 0 }); }, [topic]);
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWide(el.clientWidth >= 620));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? TOPICS.filter((t) => `${t.title} ${t.words}`.toLowerCase().includes(s)) : TOPICS;
  }, [q]);
  const current = TOPICS.find((t) => t.id === topic) ?? TOPICS[0];
  const idx = TOPICS.indexOf(current);
  return (
    <div ref={rootRef} className="h-full flex flex-col bg-stone-900 text-stone-200 select-text" onKeyDown={(e) => e.stopPropagation()} data-testid="ag-guide">
      <div className="shrink-0 flex items-center gap-1.5 px-2 py-1.5 border-b border-stone-800">
        {!wide && (
          <select value={current.id} onChange={(e) => setTopic(e.target.value as GuideTopic)} className="h-8 flex-1 min-w-0 bg-stone-950 border border-stone-700 rounded px-1.5 text-sm text-stone-100" data-testid="ag-guide-chapter">
            {TOPICS.map((t, i) => <option key={t.id} value={t.id}>{i + 1}. {t.title}</option>)}
          </select>
        )}
        <div className={`relative ${wide ? "flex-1" : "w-32"}`}>
          <Search className="h-3.5 w-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-stone-500" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" className="w-full h-8 pl-7 pr-6 rounded bg-stone-950 border border-stone-700 text-sm text-stone-100" data-testid="ag-guide-search" />
          {q && <button type="button" onClick={() => setQ("")} className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6 grid place-items-center text-stone-500"><X className="h-3 w-3" /></button>}
        </div>
      </div>
      <div className={`flex-1 min-h-0 flex ${wide ? "flex-row" : "flex-col"}`}>
        {(wide || q) && (
          <nav className={`shrink-0 flex gap-0.5 p-1.5 no-scrollbar ${wide ? "w-52 flex-col border-r border-stone-800 overflow-y-auto" : "flex-col border-b border-stone-800 max-h-48 overflow-y-auto"}`}>
            {shown.map((t) => (
              <button key={t.id} type="button" onClick={() => { setTopic(t.id); if (!wide) setQ(""); }} className={`shrink-0 h-9 px-2.5 rounded text-left text-[13px] inline-flex items-center gap-2 ${t.id === topic ? "bg-amber-600/25 text-amber-100" : "text-stone-300 hover:bg-stone-800"}`} data-testid={`ag-guide-topic-${t.id}`}>
                <span className={t.id === topic ? "text-amber-400" : "text-stone-500"}>{t.icon}</span><span className="truncate">{t.title}</span>
              </button>
            ))}
            {!shown.length && <div className="text-xs text-stone-500 p-2">Nothing matches.</div>}
          </nav>
        )}
        <article ref={articleRef} className="flex-1 min-h-0 overflow-y-auto px-3.5 py-3 space-y-2.5" key={current.id} data-testid={`ag-guide-body-${current.id}`}>
          <h2 className="text-lg font-semibold text-stone-100 flex items-center gap-2"><span className="text-amber-400">{current.icon}</span>{current.title}</h2>
          {current.body}
          <div className="flex justify-between gap-2 pt-4 pb-2 border-t border-stone-800 mt-4">
            {idx > 0 ? <button type="button" onClick={() => setTopic(TOPICS[idx - 1].id)} className="text-xs text-stone-400 hover:text-stone-100 text-left">← {TOPICS[idx - 1].title}</button> : <span />}
            {idx < TOPICS.length - 1 && <button type="button" onClick={() => setTopic(TOPICS[idx + 1].id)} className="text-xs text-amber-300 hover:text-amber-200 text-right" data-testid="ag-guide-next">{TOPICS[idx + 1].title} →</button>}
          </div>
        </article>
      </div>
    </div>
  );
}
