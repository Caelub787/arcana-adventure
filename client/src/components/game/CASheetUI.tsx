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
