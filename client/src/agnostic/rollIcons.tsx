// Icons for roll buttons: drawn dice (d4 … d100, a coin), themed Font Awesome
// icons, or any Font Awesome icon pasted in (`<i class="fa-solid fa-dragon"></i>`).
// Stored on the button as a string: "die:d20", "fa-solid fa-fire", or an icon name ("Dices").
import React, { useState } from "react";
import { AgIcon, IconGrid } from "./icons";
import { AgPanel } from "./float";

const DIE_SHAPES: Record<string, { shape: React.ReactNode; label: string }> = {
  d4: { shape: <polygon points="12,2.5 21.5,20.5 2.5,20.5" />, label: "4" },
  d6: { shape: <rect x="3.5" y="3.5" width="17" height="17" rx="3" />, label: "6" },
  d8: { shape: <polygon points="12,1.5 22.5,12 12,22.5 1.5,12" />, label: "8" },
  d10: { shape: <polygon points="12,1.5 22,10 12,22.5 2,10" />, label: "10" },
  d12: { shape: <polygon points="12,1.5 22.5,9 18.5,21.5 5.5,21.5 1.5,9" />, label: "12" },
  d20: { shape: <polygon points="12,1.5 21.5,6.75 21.5,17.25 12,22.5 2.5,17.25 2.5,6.75" />, label: "20" },
  d100: { shape: <circle cx="12" cy="12" r="10" />, label: "%" },
  coin: { shape: <><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6.5" /></>, label: "" },
};
export const DIE_ICON_KEYS = Object.keys(DIE_SHAPES);

/** Themed icons from Font Awesome's free set (the one this site loads). */
export const THEME_ICONS: Array<[string, string]> = [
  ["Fist", "fa-solid fa-hand-fist"], ["Khanda", "fa-solid fa-khanda"], ["Shield", "fa-solid fa-shield-halved"], ["Crosshairs", "fa-solid fa-crosshairs"],
  ["Bolt", "fa-solid fa-bolt"], ["Fire", "fa-solid fa-fire"], ["Burst", "fa-solid fa-burst"], ["Meteor", "fa-solid fa-meteor"],
  ["Snow", "fa-solid fa-snowflake"], ["Wind", "fa-solid fa-wind"], ["Water", "fa-solid fa-water"], ["Mountain", "fa-solid fa-mountain"],
  ["Sun", "fa-solid fa-sun"], ["Moon", "fa-solid fa-moon"], ["Star", "fa-solid fa-star"], ["Sparkles", "fa-solid fa-wand-sparkles"],
  ["Hand magic", "fa-solid fa-hand-sparkles"], ["Wizard", "fa-solid fa-hat-wizard"], ["Scroll", "fa-solid fa-scroll"], ["Spellbook", "fa-solid fa-book-skull"],
  ["Potion", "fa-solid fa-flask"], ["Gem", "fa-solid fa-gem"], ["Heart", "fa-solid fa-heart"], ["Pulse", "fa-solid fa-heart-pulse"],
  ["Healing", "fa-solid fa-hand-holding-heart"], ["Brain", "fa-solid fa-brain"], ["Eye", "fa-solid fa-eye"], ["Feather", "fa-solid fa-feather"],
  ["Running", "fa-solid fa-person-running"], ["Skull", "fa-solid fa-skull"], ["Crossbones", "fa-solid fa-skull-crossbones"], ["Ghost", "fa-solid fa-ghost"],
  ["Dragon", "fa-solid fa-dragon"], ["Spider", "fa-solid fa-spider"], ["Paw", "fa-solid fa-paw"], ["Crow", "fa-solid fa-crow"],
  ["Leaf", "fa-solid fa-leaf"], ["Hammer", "fa-solid fa-hammer"], ["Gavel", "fa-solid fa-gavel"], ["Knight", "fa-solid fa-chess-knight"],
  ["Dungeon", "fa-solid fa-dungeon"], ["Coins", "fa-solid fa-coins"], ["Dice", "fa-solid fa-dice"], ["Hourglass", "fa-solid fa-hourglass-half"],
];

/**
 * Turn what someone pasted into Font Awesome classes: the whole `<i class="…">`
 * tag, just its classes, or a bare icon name ("fa-dragon"). Null if there's no icon in it.
 */
export function parseIconInput(text: string): string | null {
  const m = /class\s*=\s*["']([^"']+)["']/i.exec(text);
  const tokens = (m ? m[1] : text).trim().split(/\s+/).filter((t) => /^fa[a-z0-9-]*$/.test(t));
  const style = /^fa-(solid|regular|light|thin|duotone|brands|sharp|sharp-solid|sharp-regular)$|^fa[srlbtd]$/;
  const names = tokens.filter((t) => t.startsWith("fa-") && !style.test(t));
  if (!names.length) return null;
  const styles = tokens.filter((t) => style.test(t));
  return [...(styles.length ? styles : ["fa-solid"]), ...names].slice(0, 6).join(" ");
}

const isFa = (icon: string) => /(^|\s)fa-/.test(icon);

/** A button icon in any of the stored forms. */
export function RollIcon({ icon, size = 14, color, className = "" }: { icon: string | null | undefined; size?: number; color?: string; className?: string }) {
  if (!icon) return null;
  if (icon.startsWith("die:")) {
    const d = DIE_SHAPES[icon.slice(4)];
    if (!d) return null;
    return (
      <svg viewBox="0 0 24 24" width={size} height={size} className={`shrink-0 ${className}`} style={{ color }} aria-hidden>
        <g fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">{d.shape}</g>
        {d.label && <text x="12" y="12.5" textAnchor="middle" dominantBaseline="middle" fontSize={d.label.length > 1 ? 7 : 8.5} fontWeight="700" fill="currentColor" fontFamily="ui-sans-serif, system-ui">{d.label}</text>}
      </svg>
    );
  }
  if (isFa(icon)) return <i className={`${icon} shrink-0 ${className}`} style={{ fontSize: size * 0.95, width: size, textAlign: "center", color }} aria-hidden />;
  return <AgIcon name={icon} size={size} color={color} className={`shrink-0 ${className}`} />;
}

/** Pick a button icon: dice, themed icons, the built-in icon set, or paste any Font Awesome icon. */
export function IconChooser({ value, onPick, onClose }: { value: string | null | undefined; onPick: (icon: string | null) => void; onClose: () => void }) {
  const [paste, setPaste] = useState("");
  const parsed = paste.trim() ? parseIconInput(paste) : null;
  const cell = (icon: string, title: string) => (
    <button key={icon} type="button" title={title} onClick={() => onPick(icon)}
      className={`h-10 grid place-items-center rounded border ${value === icon ? "border-amber-500 bg-amber-900/30 text-amber-200" : "border-stone-800 bg-stone-800 text-stone-200 hover:border-amber-700"}`} data-testid={`ag-rollicon-${icon}`}>
      <RollIcon icon={icon} size={20} />
    </button>
  );
  return (
    <AgPanel title="Button icon" onClose={onClose} width={400} height={600} testId="ag-rollicon-panel">
      <div className="space-y-3">
        <div>
          <div className="text-[11px] text-stone-400 mb-1">Dice</div>
          <div className="grid grid-cols-8 gap-1">{DIE_ICON_KEYS.map((k) => cell(`die:${k}`, k === "coin" ? "Coin flip" : k))}</div>
        </div>
        <div>
          <div className="text-[11px] text-stone-400 mb-1">Themed</div>
          <div className="grid grid-cols-8 gap-1">{THEME_ICONS.map(([t, c]) => cell(c, t))}</div>
        </div>
        <div>
          <div className="text-[11px] text-stone-400 mb-1">Any Font Awesome icon</div>
          <div className="flex items-center gap-1.5">
            <input value={paste} onChange={(e) => setPaste(e.target.value)} placeholder='<i class="fa-solid fa-dragon"></i>' className="h-8 flex-1 min-w-0 bg-stone-950 border border-stone-700 rounded px-2 text-xs font-mono" data-testid="ag-rollicon-paste" />
            <span className="h-8 w-8 grid place-items-center rounded bg-stone-800 text-stone-200">{parsed ? <RollIcon icon={parsed} size={18} /> : null}</span>
            <button type="button" disabled={!parsed} onClick={() => parsed && onPick(parsed)} className="h-8 px-3 rounded bg-amber-600 hover:bg-amber-500 text-white text-xs disabled:opacity-40" data-testid="ag-rollicon-use">Use</button>
          </div>
          <div className="text-[10px] text-stone-500 mt-1">Copy an icon's HTML from fontawesome.com and paste it here. Free icons show; Pro-only ones (some dice, like d12) show blank — use the drawn dice above for those.</div>
        </div>
        <div>
          <div className="text-[11px] text-stone-400 mb-1">More icons</div>
          <IconGrid value={value && !value.startsWith("die:") && !isFa(value) ? value : null} onPick={(n) => onPick(n)} />
        </div>
        <button type="button" onClick={() => onPick(null)} className="h-8 px-3 rounded bg-stone-800 text-xs text-stone-300 hover:bg-stone-700">No icon</button>
      </div>
    </AgPanel>
  );
}
