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
import { Check, X } from "lucide-react";
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
export function CaChipGroup({ children, cols = 4 }: { children: React.ReactNode; cols?: number }) {
  return (
    <div
      className="grid rounded-lg border bg-stone-800/40 overflow-hidden [&>*+*]:border-l [&>*+*]:border-[color:var(--ca-gilt-line-soft)]"
      style={{
        gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
        borderColor: "var(--ca-gilt-line-soft)",
      }}
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
