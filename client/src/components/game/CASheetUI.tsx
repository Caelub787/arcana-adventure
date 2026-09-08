/**
 * The C.A. character sheet's design language, in one place.
 *
 * Every C.A. tab is built from these, so the sheet reads as one thing rather
 * than four tabs that grew separately: the same card, the same label-above-
 * value field, the same label-left/value-right stat row, and the same way in
 * to editing anything - double-click on a desktop, long-press on touch.
 *
 * There is no edit mode anywhere in C.A. Nothing has a pencil button and
 * nothing has Save/Cancel for a whole tab; each value opens its own editor
 * and writes only itself.
 */
import React, { useEffect, useRef, useState } from "react";
import { Check, X, Info, Flame } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

/** A section of the sheet. Optional title row with an icon and an action. */
export function CaCard({
  title,
  icon,
  accentClass = "text-stone-300",
  action,
  children,
  className = "",
  testId,
}: {
  title?: React.ReactNode;
  icon?: React.ReactNode;
  /** Text colour for the title, which is how the tabs tell themselves apart. */
  accentClass?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  testId?: string;
}) {
  return (
    <Card className={`bg-stone-800 border-stone-700 ${className}`} data-testid={testId}>
      <CardContent className={title ? "pt-4 space-y-3" : "pt-6 space-y-4"}>
        {title && (
          <div className="flex items-center justify-between gap-2">
            <h3 className={`text-sm font-medium flex items-center gap-2 ${accentClass}`}>
              {icon}
              {title}
            </h3>
            {action}
          </div>
        )}
        {children}
      </CardContent>
    </Card>
  );
}

/** The two-column field grid the Overview's fundamentals use. */
export function CaFieldGrid({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`grid grid-cols-2 gap-x-3 gap-y-2 ${className}`}>{children}</div>;
}

/** Label above value. `wide` spans both columns. */
export function CaField({
  label,
  children,
  wide = false,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={wide ? "col-span-2" : undefined}>
      <span className="text-xs text-stone-400 block">{label}</span>
      {children}
    </div>
  );
}

/** Label on the left, value on the right — Rank, Physique, Energy Pool. */
export function CaStatRow({
  label,
  value,
  hint,
  children,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  /** A line of smaller text under the row, e.g. the derived Usable Energy. */
  hint?: React.ReactNode;
  /** Anything that belongs below the row, like the overload effect editor. */
  children?: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between items-center gap-2">
        <span className="text-xs text-stone-300">{label}</span>
        {value}
      </div>
      {hint && <p className="text-[10px] text-stone-500">{hint}</p>}
      {children}
    </div>
  );
}

/** The plain value text, styled the same wherever it appears. */
export function CaValue({
  children,
  className = "",
  editable = false,
  ...rest
}: React.HTMLAttributes<HTMLParagraphElement> & { editable?: boolean }) {
  return (
    <p
      className={`text-stone-200 text-sm ${editable ? "cursor-pointer select-none" : ""} ${className}`}
      {...rest}
    >
      {children}
    </p>
  );
}

// ---------------------------------------------------------------------------
// Inline editing
// ---------------------------------------------------------------------------

export type CaInlineTransform = (draft: any) => any;

/**
 * One value open for editing at a time, opened by double-click or long-press.
 *
 * `write` is what actually persists — the caller supplies it because the
 * Overview writes through `onUpdate` while the Skills tab writes through a
 * mutation, and neither should have to care which the other uses.
 */
export function useCaInlineEdit(write: (updates: Record<string, any>) => void, canEdit: boolean) {
  const [field, setField] = useState<string | null>(null);
  const [draft, setDraft] = useState<any>(null);
  const pressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (pressTimerRef.current) clearTimeout(pressTimerRef.current);
  }, []);

  const open = (name: string, current: any) => {
    if (!canEdit) return;
    setDraft(current);
    setField(name);
  };
  const close = () => {
    setField(null);
    setDraft(null);
  };
  const save = (name: string, transform?: CaInlineTransform) => {
    write({ [name]: transform ? transform(draft) : draft });
    close();
  };

  /** Spread onto the value's display element. */
  const pressHandlers = (name: string, current: any) => {
    if (!canEdit) return {};
    const cancel = () => {
      if (pressTimerRef.current) {
        clearTimeout(pressTimerRef.current);
        pressTimerRef.current = null;
      }
    };
    return {
      onDoubleClick: (e: React.MouseEvent) => { e.stopPropagation(); open(name, current); },
      onTouchStart: () => {
        cancel();
        pressTimerRef.current = setTimeout(() => open(name, current), 500);
      },
      onTouchEnd: cancel,
      onTouchMove: cancel,
      onTouchCancel: cancel,
      title: "Double-click (PC) or long-press (mobile) to edit",
    };
  };

  const keyHandlers = (name: string, transform?: CaInlineTransform) => ({
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === "Enter") { e.preventDefault(); save(name, transform); }
      if (e.key === "Escape") { e.preventDefault(); close(); }
    },
  });

  return { field, draft, setDraft, open, close, save, pressHandlers, keyHandlers, canEdit };
}

export type CaInlineEdit = ReturnType<typeof useCaInlineEdit>;

/** The tick and the cross every inline editor ends with. */
export function CaInlineActions({
  edit,
  field,
  transform,
  saveLabel = "Save",
}: {
  edit: CaInlineEdit;
  field: string;
  transform?: CaInlineTransform;
  saveLabel?: string;
}) {
  return (
    <>
      <Button
        size="sm"
        className="h-7 w-7 p-0 bg-emerald-700 hover:bg-emerald-600 text-white shrink-0"
        onClick={(e) => { e.stopPropagation(); edit.save(field, transform); }}
        aria-label={saveLabel}
        data-testid={`button-ca-save-${field}`}
      >
        <Check className="h-3.5 w-3.5" />
      </Button>
      <Button
        size="sm"
        variant="outline"
        className="h-7 w-7 p-0 border-stone-700 text-stone-300 shrink-0"
        onClick={(e) => { e.stopPropagation(); edit.close(); }}
        aria-label="Cancel"
        data-testid={`button-ca-cancel-${field}`}
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    </>
  );
}

const wholeNumber: CaInlineTransform = (d) => Math.max(0, Math.floor(Number(d) || 0));
const trimmedOrNull: CaInlineTransform = (d) => String(d ?? "").trim() || null;

/** A number field, open for editing. */
export function CaInlineNumber({
  edit,
  field,
  testId,
  className = "bg-stone-900 border-stone-700 text-stone-200 h-8 text-sm min-w-0",
  min = 0,
  max,
}: {
  edit: CaInlineEdit;
  field: string;
  testId: string;
  className?: string;
  min?: number;
  /** Used where a value is spent from a budget and can't exceed what's left. */
  max?: number;
}) {
  const transform: CaInlineTransform = (d) => {
    const n = Math.floor(Number(d) || 0);
    return Math.min(max ?? Number.POSITIVE_INFINITY, Math.max(min, n));
  };
  return (
    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
      <NumberInput
        min={min}
        max={max}
        value={edit.draft}
        onChange={(v) => edit.setDraft(v ?? min)}
        className={className}
        data-testid={`input-ca-edit-${testId}`}
        {...edit.keyHandlers(field, transform)}
      />
      <CaInlineActions edit={edit} field={field} transform={transform} />
    </div>
  );
}

/** A text field, open for editing. Empty saves as null, not "". */
export function CaInlineText({
  edit,
  field,
  testId,
  placeholder,
}: {
  edit: CaInlineEdit;
  field: string;
  testId: string;
  placeholder?: string;
}) {
  return (
    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
      <Input
        autoFocus
        value={edit.draft ?? ""}
        onChange={(e) => edit.setDraft(e.target.value)}
        placeholder={placeholder}
        className="bg-stone-900 border-stone-700 text-stone-200 h-8 text-sm min-w-0"
        data-testid={`input-ca-edit-${testId}`}
        {...edit.keyHandlers(field, trimmedOrNull)}
      />
      <CaInlineActions edit={edit} field={field} transform={trimmedOrNull} />
    </div>
  );
}

export { wholeNumber as caWholeNumber, trimmedOrNull as caTrimmedOrNull };

/**
 * Hold a value inside the range it is allowed to take. Used where a number is
 * spent from a shared budget: the editor for one value is bounded by what is
 * left, so the totals can't go over rather than being checked afterwards.
 */
export function clampToBounds(draft: any, bounds: { min: number; max: number }): number {
  const n = Math.floor(Number(draft) || 0);
  return Math.min(bounds.max, Math.max(bounds.min, n));
}

// ---------------------------------------------------------------------------
// Chrome
//
// The ornate half of the sheet: the gilt frame, the chips, the section
// headers with their medallions, the flourish between sections.
//
// The gilding is its own token (`--ca-gilt*`, defined in index.css) rather
// than `amber-*`. Amber is remapped per theme — it is blue in the default one
// — so building the ornament from it turned the frame, the medallions and the
// rules blue along with everything else. The surfaces underneath still use
// `stone-*` and follow the theme; only the metal is fixed.
// ---------------------------------------------------------------------------

/** The corner flourishes on the frame — two hairlines and a dot. */
function CaCorner({ at }: { at: "tl" | "tr" | "bl" | "br" }) {
  const pos = {
    tl: "top-1.5 left-1.5 border-t border-l rounded-tl",
    tr: "top-1.5 right-1.5 border-t border-r rounded-tr",
    bl: "bottom-1.5 left-1.5 border-b border-l rounded-bl",
    br: "bottom-1.5 right-1.5 border-b border-r rounded-br",
  }[at];
  return (
    <span
      aria-hidden
      className={`pointer-events-none absolute w-4 h-4 ${pos}`}
      style={{ borderColor: "var(--ca-gilt-line)" }}
    />
  );
}

/**
 * The gilt frame around the whole sheet. A gradient hairline rather than a
 * flat border, so the edge catches light down its length the way a tooled
 * cover does, with the four corners picked out.
 */
export function CaSheetFrame({
  children,
  className = "",
  auraColor,
}: {
  children: React.ReactNode;
  className?: string;
  /** C.A. characters tint their own frame with their aura. */
  auraColor?: string | null;
}) {
  return (
    <div
      className={`relative rounded-xl p-[1.5px] ${className}`}
      style={{
        background:
          "linear-gradient(135deg, var(--ca-gilt) 0%, var(--ca-gilt-dim) 38%, var(--ca-gilt-bright) 62%, var(--ca-gilt-dim) 100%)",
        ...(auraColor ? { boxShadow: `0 0 0 1px ${auraColor}55, 0 0 18px -6px ${auraColor}` } : {}),
      }}
      data-testid="ca-sheet-frame"
    >
      <div className="relative rounded-[10px] bg-stone-900/95 h-full overflow-hidden">
        <CaCorner at="tl" />
        <CaCorner at="tr" />
        <CaCorner at="bl" />
        <CaCorner at="br" />
        {children}
      </div>
    </div>
  );
}

/** A hairline with a turned square in the middle, between sections. */
export function CaDivider() {
  return (
    <div className="flex items-center gap-2 py-0.5" aria-hidden data-testid="ca-divider">
      <span className="h-px flex-1" style={{ background: "linear-gradient(to right, transparent, var(--ca-gilt-line))" }} />
      <span className="w-1.5 h-1.5 rotate-45 border" style={{ borderColor: "var(--ca-gilt)" }} />
      <span className="h-px flex-1" style={{ background: "linear-gradient(to left, transparent, var(--ca-gilt-line))" }} />
    </div>
  );
}

/**
 * One fact, boxed: an icon, the value, and the field's name beneath it in
 * small caps. This is the sheet's unit of information — the fundamentals and
 * the bio are both rows of these.
 */
export function CaChip({
  icon,
  label,
  children,
  className = "",
  editable = false,
  testId,
  ...rest
}: {
  icon?: React.ReactNode;
  label: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  editable?: boolean;
  testId?: string;
} & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`flex items-center gap-2 rounded-lg border bg-stone-800/60 px-2.5 py-1.5 min-w-0 ${
        editable ? "cursor-pointer select-none transition-colors" : ""
      } ${className}`}
      style={{ borderColor: "var(--ca-gilt-line-soft)" }}
      data-testid={testId}
      {...rest}
    >
      {icon && <span className="shrink-0" style={{ color: "var(--ca-gilt)" }}>{icon}</span>}
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold text-stone-100 truncate leading-tight">{children}</span>
        <span className="block text-[9px] uppercase tracking-[0.14em] text-stone-500 leading-tight">{label}</span>
      </span>
    </div>
  );
}

/** A row of chips that share one bordered box, split by hairlines. */
/**
 * A row of chips sharing one box, split by hairlines.
 *
 * Four cells across is fine on a sheet and far too tight on a phone - "Langua…"
 * truncated to nothing was the giveaway - so a four-cell group wraps to two by
 * two below `sm`.
 *
 * The columns are Tailwind classes rather than an inline
 * `grid-template-columns`, because an inline style cannot carry a breakpoint.
 * That is also why `cols` is a lookup rather than an interpolation: Tailwind
 * only emits classes it can see written out.
 */
const CHIP_GROUP_COLS: Record<number, string> = {
  2: "grid-cols-2",
  3: "grid-cols-3",
  // Two rows of two on a phone, one row of four from sm up.
  4: "grid-cols-2 sm:grid-cols-4",
};

export function CaChipGroup({ children, cols = 4 }: { children: React.ReactNode; cols?: number }) {
  return (
    <div
      className={[
        "grid rounded-lg border bg-stone-800/40 overflow-hidden",
        CHIP_GROUP_COLS[cols] ?? "grid-cols-2",
        // Hairlines have to follow the wrap: while the group is two wide the
        // second row needs a rule above it, and only the right-hand cell needs
        // one to its left. Once it is a single row that flips to "every cell
        // but the first".
        "[&>*]:border-[color:var(--ca-gilt-line-soft)]",
        "[&>*:nth-child(even)]:border-l [&>*:nth-child(n+3)]:border-t",
        "sm:[&>*]:border-t-0 sm:[&>*:not(:first-child)]:border-l",
      ].join(" ")}
      style={{ borderColor: "var(--ca-gilt-line-soft)" }}
    >
      {children}
    </div>
  );
}

/** A cell inside a CaChipGroup — same shape as a chip, without its own box. */
export function CaChipCell({
  icon,
  label,
  children,
  editable = false,
  testId,
  ...rest
}: {
  icon?: React.ReactNode;
  label: React.ReactNode;
  children: React.ReactNode;
  editable?: boolean;
  testId?: string;
} & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`px-2.5 py-1.5 min-w-0 ${editable ? "cursor-pointer select-none hover:bg-stone-800/60 transition-colors" : ""}`}
      data-testid={testId}
      {...rest}
    >
      <span className="flex items-center gap-1.5 text-[9px] uppercase tracking-[0.14em] text-stone-500 leading-tight">
        {icon && <span className="shrink-0" style={{ color: "var(--ca-gilt)" }}>{icon}</span>}
        <span className="truncate">{label}</span>
      </span>
      <span className="block text-sm font-bold text-stone-100 truncate leading-tight mt-0.5">{children}</span>
    </div>
  );
}

/** The medallion an ornate section header wears. */
export function CaMedallion({ children }: { children: React.ReactNode }) {
  return (
    <span
      aria-hidden
      className="shrink-0 w-7 h-7 rounded-full border bg-stone-800 flex items-center justify-center shadow-[inset_0_0_8px_-4px_rgba(0,0,0,0.9)]"
      style={{ borderColor: "var(--ca-gilt-line)", color: "var(--ca-gilt)" }}
    >
      {children}
    </span>
  );
}

/** Medallion, name in display type, and the value hard right. */
export function CaSectionHeader({
  icon,
  title,
  value,
  testId,
}: {
  icon?: React.ReactNode;
  title: React.ReactNode;
  value?: React.ReactNode;
  testId?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2" data-testid={testId}>
      <span className="flex items-center gap-2 min-w-0">
        {icon && <CaMedallion>{icon}</CaMedallion>}
        <span className="font-display text-base font-bold text-stone-100 truncate">{title}</span>
      </span>
      {value}
    </div>
  );
}

/** A section: framed, with its header and a body. */
export function CaSection({
  icon,
  title,
  value,
  children,
  testId,
}: {
  icon?: React.ReactNode;
  title: React.ReactNode;
  value?: React.ReactNode;
  children?: React.ReactNode;
  testId?: string;
}) {
  return (
    <div
      className="rounded-lg border bg-stone-800/40 px-3 py-2 space-y-2"
      style={{ borderColor: "var(--ca-gilt-line-soft)" }}
      data-testid={testId}
    >
      <CaSectionHeader icon={icon} title={title} value={value} />
      {children}
    </div>
  );
}

/** A darker well inside a section — the overload editor, the wound diagram. */
export function CaInset({
  children,
  className = "",
  testId,
}: {
  children: React.ReactNode;
  className?: string;
  testId?: string;
}) {
  return (
    <div
      className={`rounded-lg border bg-stone-900/70 p-2 ${className}`}
      style={{ borderColor: "var(--ca-gilt-line-soft)" }}
      data-testid={testId}
    >
      {children}
    </div>
  );
}


/**
 * A footnote folded up behind an icon.
 *
 * Rules text like how attribute values map to dice is worth having, and worth
 * having once - it is read the first session and skipped every session after,
 * and a paragraph of it above a tab pushes the actual numbers down the page.
 * The icon is bare rather than a Button: every variant carries a frame, and a
 * boxed `i` reads as a control you were meant to press.
 */
export function CaInfoHint({
  children,
  label = "More about this",
  align = "start",
  testId = "button-ca-info-hint",
}: {
  children: React.ReactNode;
  label?: string;
  align?: "start" | "center" | "end";
  testId?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center justify-center transition-colors"
          style={{ color: "var(--ca-gilt)" }}
          onMouseEnter={(e) => { e.currentTarget.style.color = "var(--ca-gilt-bright)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = "var(--ca-gilt)"; }}
          aria-label={label}
          data-testid={testId}
        >
          <Info className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align={align}
        className="w-64 text-xs leading-relaxed text-stone-300"
        data-testid="panel-ca-info-hint"
      >
        {children}
      </PopoverContent>
    </Popover>
  );
}

/**
 * A whole labelled field that edits itself in place.
 *
 * The Overview wires each of its values by hand, which is right there because
 * most of them are a different shape. A library sheet is thirty ordinary
 * fields in a row, and writing all thirty out by hand is how a sheet ends up
 * with three different ways to edit a number. This is the ordinary case:
 * label above, value below, double-click or long-press to change it, and it
 * writes only itself.
 */
export function CaInlineField({
  edit,
  field,
  label,
  value,
  kind = "text",
  options,
  placeholder,
  suffix,
  min,
  max,
  wide = false,
  empty = "—",
  testId,
}: {
  edit: CaInlineEdit;
  field: string;
  label: React.ReactNode;
  value: any;
  kind?: "text" | "number" | "textarea" | "select";
  /** For `select`: the values on offer, in order. */
  options?: Array<{ value: string; label: string }>;
  placeholder?: string;
  /** Trailing unit shown after the value, e.g. "lb". */
  suffix?: React.ReactNode;
  min?: number;
  max?: number;
  wide?: boolean;
  /** What to show when the value is unset. */
  empty?: string;
  testId?: string;
}) {
  const open = edit.field === field;
  const id = testId ?? `ca-inline-${field}`;
  const shown =
    kind === "select"
      ? options?.find((o) => o.value === String(value ?? ""))?.label ?? (value ? String(value) : "")
      : value === null || value === undefined || value === "" ? "" : String(value);

  if (open) {
    return (
      <CaField label={label} wide={wide}>
        <div className="flex items-center gap-1">
          {kind === "number" ? (
            <CaInlineNumber edit={edit} field={field} min={min} max={max} testId={id} />
          ) : kind === "select" ? (
            <select
              autoFocus
              value={String(edit.draft ?? "")}
              onChange={(e) => edit.setDraft(e.target.value)}
              className="h-7 flex-1 min-w-0 rounded border border-stone-700 bg-stone-900 text-stone-200 text-xs px-1.5"
              data-testid={id}
            >
              {options?.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          ) : kind === "textarea" ? (
            <textarea
              autoFocus
              rows={4}
              value={String(edit.draft ?? "")}
              onChange={(e) => edit.setDraft(e.target.value)}
              placeholder={placeholder}
              className="flex-1 min-w-0 rounded border border-stone-700 bg-stone-900 text-stone-200 text-xs p-1.5 resize-y"
              data-testid={id}
            />
          ) : (
            <CaInlineText edit={edit} field={field} placeholder={placeholder} testId={id} />
          )}
          {/* CaInlineText and CaInlineNumber each bring their own tick and
              cross; the plain select and textarea do not, so only they get a
              set here. Adding one unconditionally gave text fields two. */}
          {(kind === "select" || kind === "textarea") && (
            <CaInlineActions edit={edit} field={field} />
          )}
        </div>
      </CaField>
    );
  }

  return (
    <CaField label={label} wide={wide}>
      <CaValue
        editable={edit.canEdit}
        className={`${shown ? "" : "text-stone-600 italic"} ${kind === "textarea" ? "whitespace-pre-wrap" : "truncate"}`}
        data-testid={`${id}-value`}
        {...edit.pressHandlers(field, value ?? (kind === "number" ? 0 : ""))}
      >
        {shown || empty}
        {shown && suffix ? <span className="text-stone-500 text-xs ml-1">{suffix}</span> : null}
      </CaValue>
    </CaField>
  );
}

/**
 * The head of the C.A. Ability tab: the ability's own name as the heading,
 * and one line under it saying what it is.
 *
 * The name is the heading rather than a field called "Ability name" under a
 * section called "Ability" on a tab called Ability - that said the word three
 * times and the thing's actual name nowhere. The GM double-clicks either part
 * to change it; a player reads both.
 *
 * The name's editor opens as a field beneath the heading rather than inside
 * it: the heading row is a flex line with a truncate on it, and an input
 * dropped in there has no width to resolve against.
 */
export function CaAbilityHeader({
  character,
  edit,
  canEdit,
}: {
  character: { caAbilityName?: string | null; caAbilityDescription?: string | null } | null | undefined;
  edit: CaInlineEdit;
  canEdit: boolean;
}) {
  const name = String(character?.caAbilityName || "").trim();
  const description = String(character?.caAbilityDescription || "").trim();
  return (
    <CaSection
      icon={<Flame className="h-3.5 w-3.5" />}
      title={
        <span
          className={`${name ? "" : "text-stone-500 italic font-normal text-sm"} ${canEdit ? "cursor-pointer" : ""}`}
          data-testid="ca-ability-name-value"
          {...edit.pressHandlers("caAbilityName", character?.caAbilityName ?? "")}
        >
          {name || (canEdit ? "Double-click to name this ability" : "Unnamed ability")}
        </span>
      }
      value={
        <CaInfoHint label="How Abilities work" align="end" testId="button-ca-ability-info">
          <p>Every character has one Ability. The GM double-clicks the heading to name it, and the line under it to describe it in a sentence.</p>
          <p className="mt-2">What it does at length is written in its own note: press <span style={{ color: "var(--ca-gilt)" }}>Notes</span> at the top of the sheet while this tab is open and the ability's note opens instead of the character's. GM and player can both write in it.</p>
          <p className="mt-2">The rolls below are built the same way an item's are, and roll the same way. Any of them can go on your hotbar.</p>
        </CaInfoHint>
      }
      testId="card-ca-ability"
    >
      {edit.field === "caAbilityName" && (
        <CaField label="Ability name" wide>
          <CaInlineText edit={edit} field="caAbilityName" placeholder="Name the ability" testId="ca-ability-name" />
        </CaField>
      )}
      {edit.field === "caAbilityDescription" ? (
        <div className="flex items-start gap-1">
          <textarea
            autoFocus
            rows={2}
            value={String(edit.draft ?? "")}
            onChange={(e) => edit.setDraft(e.target.value)}
            placeholder="What this ability is, in a sentence."
            className="flex-1 min-w-0 rounded border border-stone-700 bg-stone-900 text-stone-200 text-xs p-1.5 resize-y"
            data-testid="ca-ability-description"
          />
          <CaInlineActions edit={edit} field="caAbilityDescription" />
        </div>
      ) : (
        <p
          className={`text-xs leading-relaxed whitespace-pre-wrap ${description ? "text-stone-300" : "text-stone-600 italic"} ${canEdit ? "cursor-pointer" : ""}`}
          data-testid="ca-ability-description-value"
          {...edit.pressHandlers("caAbilityDescription", character?.caAbilityDescription ?? "")}
        >
          {description || (canEdit ? "Double-click to add a short description." : "No description yet.")}
        </p>
      )}
    </CaSection>
  );
}
