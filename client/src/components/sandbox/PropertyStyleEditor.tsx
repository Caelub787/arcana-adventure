import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { ChevronRight, ChevronDown, Plus, Trash2, X } from "lucide-react";

export interface GradientStop {
  color: string;
  position: number;
}

export interface PropertyGradient {
  enabled: boolean;
  type: "linear" | "radial";
  angle: number;
  stops: GradientStop[];
}

export interface PropertyBorder {
  enabled: boolean;
  color: string;
  width: number;
  radius: number;
  style: "solid" | "dashed" | "dotted" | "double";
}

export interface PropertyStyle {
  textColor?: string;
  labelColor?: string;
  valueColor?: string;
  backgroundColor?: string;
  backgroundGradient?: PropertyGradient;
  border?: PropertyBorder;
  fontWeight?: "normal" | "bold" | "light";
  fontFamily?: string;
  opacity?: number;
  padding?: number;
}

export interface TabDefinition {
  id: string;
  label: string;
  icon?: string;
}

export type SandboxPropertyType =
  | "text"
  | "number"
  | "checkbox"
  | "textarea"
  | "select"
  | "panel"
  | "tab";

export interface SandboxProperty {
  id: string;
  key: string;
  label: string;
  type: SandboxPropertyType;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  labelFontSize?: number;
  valueFontSize?: number;
  labelPosition?: "top" | "left" | "hidden";
  options?: string[];
  defaultValue?: string;
  style?: PropertyStyle;
  parentId?: string | null;
  tabId?: string | null;
  tabs?: TabDefinition[];
  tabLayout?: 'top' | 'left';
  tooltip?: string;
}

function buildGradientString(gradient: PropertyGradient): string {
  const sortedStops = [...gradient.stops].sort((a, b) => a.position - b.position);
  const stopsStr = sortedStops
    .map((s) => `${s.color} ${s.position}%`)
    .join(", ");
  if (gradient.type === "radial") {
    return `radial-gradient(circle, ${stopsStr})`;
  }
  return `linear-gradient(${gradient.angle}deg, ${stopsStr})`;
}

export function getPropertyCssStyle(
  style: PropertyStyle | undefined
): React.CSSProperties {
  if (!style) return {};

  const css: React.CSSProperties = {};

  if (style.textColor) {
    css.color = style.textColor;
  }

  if (
    style.backgroundGradient?.enabled &&
    style.backgroundGradient.stops.length >= 2
  ) {
    css.background = buildGradientString(style.backgroundGradient);
  } else if (style.backgroundColor) {
    css.backgroundColor = style.backgroundColor;
  }

  if (style.border?.enabled) {
    css.borderWidth = `${style.border.width}px`;
    css.borderStyle = style.border.style;
    css.borderColor = style.border.color;
    css.borderRadius = `${style.border.radius}px`;
  }

  if (style.fontWeight) {
    const weightMap: Record<string, number> = {
      light: 300,
      normal: 400,
      bold: 700,
    };
    css.fontWeight = weightMap[style.fontWeight] ?? 400;
  }

  if (style.fontFamily) {
    const familyMap: Record<string, string> = {
      serif: "Georgia, 'Times New Roman', serif",
      "sans-serif": "'Helvetica Neue', Arial, sans-serif",
      monospace: "'Courier New', Courier, monospace",
      fantasy: "Fantasy",
      cursive: "Cursive",
    };
    css.fontFamily = familyMap[style.fontFamily] ?? undefined;
  }

  if (style.opacity !== undefined) {
    css.opacity = style.opacity;
  }

  if (style.padding !== undefined) {
    css.padding = `${style.padding}px`;
  }

  return css;
}

interface PropertyStyleEditorProps {
  style: PropertyStyle;
  onChange: (style: PropertyStyle) => void;
  propertyType: SandboxPropertyType;
}

function CollapsibleSection({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-stone-700 last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 w-full py-1.5 px-1 text-xs font-semibold text-amber-300 hover:text-amber-200 transition-colors"
        data-testid={`section-toggle-${title.toLowerCase().replace(/\s+/g, "-")}`}
      >
        {open ? (
          <ChevronDown className="h-3.5 w-3.5" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5" />
        )}
        {title}
      </button>
      {open && <div className="pb-2 px-1 space-y-2">{children}</div>}
    </div>
  );
}

function ColorPickerRow({
  label,
  value,
  onChange,
  onReset,
  testId,
}: {
  label: string;
  value: string;
  onChange: (val: string) => void;
  onReset: () => void;
  testId: string;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-stone-400 text-xs">{label}</Label>
      <div className="flex items-center gap-1.5">
        <input
          type="color"
          value={value || "#000000"}
          onChange={(e) => onChange(e.target.value)}
          className="w-7 h-7 rounded border border-stone-700 bg-stone-800 cursor-pointer shrink-0 p-0"
          data-testid={`${testId}-color`}
        />
        <Input
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder="#000000"
          className="h-7 text-xs bg-stone-800 border-stone-700 text-stone-200 flex-1"
          data-testid={`${testId}-hex`}
        />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onReset}
          className="h-7 w-7 p-0 text-stone-500 hover:text-stone-300 shrink-0"
          data-testid={`${testId}-reset`}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

function GradientEditor({
  gradient,
  onChange,
  testIdPrefix,
}: {
  gradient: PropertyGradient;
  onChange: (g: PropertyGradient) => void;
  testIdPrefix: string;
}) {
  const addStop = () => {
    const newStops = [
      ...gradient.stops,
      { color: "#ffffff", position: 100 },
    ];
    onChange({ ...gradient, stops: newStops });
  };

  const removeStop = (index: number) => {
    if (gradient.stops.length <= 2) return;
    const newStops = gradient.stops.filter((_, i) => i !== index);
    onChange({ ...gradient, stops: newStops });
  };

  const updateStop = (index: number, updates: Partial<GradientStop>) => {
    const newStops = gradient.stops.map((s, i) =>
      i === index ? { ...s, ...updates } : s
    );
    onChange({ ...gradient, stops: newStops });
  };

  const previewGradient =
    gradient.stops.length >= 2 ? buildGradientString(gradient) : "transparent";

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Label className="text-stone-400 text-xs shrink-0">Type</Label>
        <div className="flex gap-1">
          <Button
            type="button"
            variant={gradient.type === "linear" ? "default" : "outline"}
            size="sm"
            onClick={() => onChange({ ...gradient, type: "linear" })}
            className="h-6 text-xs px-2"
            data-testid={`${testIdPrefix}-type-linear`}
          >
            Linear
          </Button>
          <Button
            type="button"
            variant={gradient.type === "radial" ? "default" : "outline"}
            size="sm"
            onClick={() => onChange({ ...gradient, type: "radial" })}
            className="h-6 text-xs px-2"
            data-testid={`${testIdPrefix}-type-radial`}
          >
            Radial
          </Button>
        </div>
      </div>

      {gradient.type === "linear" && (
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <Label className="text-stone-400 text-xs">Angle</Label>
            <span className="text-xs text-stone-500">{gradient.angle}°</span>
          </div>
          <input
            type="range"
            min="0"
            max="360"
            value={gradient.angle}
            onChange={(e) =>
              onChange({ ...gradient, angle: parseInt(e.target.value) })
            }
            className="w-full accent-amber-500 h-1.5"
            data-testid={`${testIdPrefix}-angle`}
          />
        </div>
      )}

      <div className="space-y-1.5">
        <Label className="text-stone-400 text-xs">Stops</Label>
        {gradient.stops.map((stop, index) => (
          <div key={index} className="flex items-center gap-1">
            <input
              type="color"
              value={stop.color}
              onChange={(e) => updateStop(index, { color: e.target.value })}
              className="w-6 h-6 rounded border border-stone-700 bg-stone-800 cursor-pointer shrink-0 p-0"
              data-testid={`${testIdPrefix}-stop-${index}-color`}
            />
            <input
              type="range"
              min="0"
              max="100"
              value={stop.position}
              onChange={(e) =>
                updateStop(index, { position: parseInt(e.target.value) })
              }
              className="flex-1 accent-amber-500 h-1.5"
              data-testid={`${testIdPrefix}-stop-${index}-position`}
            />
            <span className="text-xs text-stone-500 w-8 text-right shrink-0">
              {stop.position}%
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => removeStop(index)}
              disabled={gradient.stops.length <= 2}
              className="h-6 w-6 p-0 text-stone-500 hover:text-red-400 shrink-0"
              data-testid={`${testIdPrefix}-stop-${index}-delete`}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addStop}
          className="h-6 text-xs w-full border-stone-700 text-stone-400 hover:text-stone-200"
          data-testid={`${testIdPrefix}-add-stop`}
        >
          <Plus className="h-3 w-3 mr-1" />
          Add Stop
        </Button>
      </div>

      <div className="space-y-1">
        <Label className="text-stone-400 text-xs">Preview</Label>
        <div
          className="h-4 w-full rounded border border-stone-700"
          style={{ background: previewGradient }}
          data-testid={`${testIdPrefix}-preview`}
        />
      </div>
    </div>
  );
}

export function PropertyStyleEditor({
  style,
  onChange,
  propertyType,
}: PropertyStyleEditorProps) {
  const [bgMode, setBgMode] = useState<"solid" | "gradient">(
    style.backgroundGradient?.enabled ? "gradient" : "solid"
  );

  const update = (updates: Partial<PropertyStyle>) => {
    onChange({ ...style, ...updates });
  };

  const defaultGradient: PropertyGradient = {
    enabled: true,
    type: "linear",
    angle: 90,
    stops: [
      { color: "#6b21a8", position: 0 },
      { color: "#2563eb", position: 100 },
    ],
  };

  const showFontSection = propertyType !== "panel" && propertyType !== "tab";

  return (
    <div
      className="space-y-0 bg-stone-900 rounded border border-stone-700 divide-y divide-stone-700"
      data-testid="property-style-editor"
    >
      <CollapsibleSection title="Colors" defaultOpen={true}>
        <ColorPickerRow
          label="Text Color"
          value={style.textColor || ""}
          onChange={(val) => update({ textColor: val })}
          onReset={() => update({ textColor: undefined })}
          testId="text-color"
        />
        <ColorPickerRow
          label="Label Color"
          value={style.labelColor || ""}
          onChange={(val) => update({ labelColor: val })}
          onReset={() => update({ labelColor: undefined })}
          testId="label-color"
        />
        <ColorPickerRow
          label="Value Color"
          value={style.valueColor || ""}
          onChange={(val) => update({ valueColor: val })}
          onReset={() => update({ valueColor: undefined })}
          testId="value-color"
        />

        <div className="space-y-1.5 pt-1">
          <Label className="text-stone-400 text-xs">Background</Label>
          <div className="flex gap-1">
            <Button
              type="button"
              variant={bgMode === "solid" ? "default" : "outline"}
              size="sm"
              onClick={() => {
                setBgMode("solid");
                if (style.backgroundGradient) {
                  update({
                    backgroundGradient: {
                      ...style.backgroundGradient,
                      enabled: false,
                    },
                  });
                }
              }}
              className="h-6 text-xs px-3 flex-1"
              data-testid="bg-mode-solid"
            >
              Solid
            </Button>
            <Button
              type="button"
              variant={bgMode === "gradient" ? "default" : "outline"}
              size="sm"
              onClick={() => {
                setBgMode("gradient");
                const grad = style.backgroundGradient || defaultGradient;
                update({ backgroundGradient: { ...grad, enabled: true } });
              }}
              className="h-6 text-xs px-3 flex-1"
              data-testid="bg-mode-gradient"
            >
              Gradient
            </Button>
          </div>

          {bgMode === "solid" && (
            <ColorPickerRow
              label="Background Color"
              value={style.backgroundColor || ""}
              onChange={(val) => update({ backgroundColor: val })}
              onReset={() => update({ backgroundColor: undefined })}
              testId="bg-color"
            />
          )}

          {bgMode === "gradient" && (
            <GradientEditor
              gradient={style.backgroundGradient || defaultGradient}
              onChange={(g) => update({ backgroundGradient: g })}
              testIdPrefix="bg-gradient"
            />
          )}
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Border" defaultOpen={false}>
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={style.border?.enabled ?? false}
            onChange={(e) => {
              const current = style.border || {
                enabled: false,
                color: "#a8a29e",
                width: 1,
                radius: 4,
                style: "solid" as const,
              };
              update({ border: { ...current, enabled: e.target.checked } });
            }}
            className="h-4 w-4 rounded border-stone-600 accent-amber-500"
            data-testid="border-enable"
          />
          <Label className="text-stone-400 text-xs">Enable Border</Label>
        </div>

        {style.border?.enabled && (
          <div className="space-y-2 pt-1">
            <ColorPickerRow
              label="Border Color"
              value={style.border.color}
              onChange={(val) =>
                update({ border: { ...style.border!, color: val } })
              }
              onReset={() =>
                update({ border: { ...style.border!, color: "#a8a29e" } })
              }
              testId="border-color"
            />

            <div className="space-y-1">
              <Label className="text-stone-400 text-xs">Width (px)</Label>
              <NumberInput
                min={1} max={10} value={style.border.width} fallback={1}
                onChange={(v) =>
                  update({
                    border: {
                      ...style.border!,
                      width: Math.min(10, Math.max(1, v ?? 1)),
                    },
                  })
                }
                className="h-7 text-xs bg-stone-800 border-stone-700 text-stone-200"
                data-testid="border-width"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-stone-400 text-xs">Radius (px)</Label>
              <NumberInput
                min={0} max={50} value={style.border.radius} fallback={0}
                onChange={(v) =>
                  update({
                    border: {
                      ...style.border!,
                      radius: Math.min(50, Math.max(0, v ?? 0)),
                    },
                  })
                }
                className="h-7 text-xs bg-stone-800 border-stone-700 text-stone-200"
                data-testid="border-radius"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-stone-400 text-xs">Style</Label>
              <Select
                value={style.border.style}
                onValueChange={(val) =>
                  update({
                    border: {
                      ...style.border!,
                      style: val as PropertyBorder["style"],
                    },
                  })
                }
              >
                <SelectTrigger
                  className="h-7 text-xs bg-stone-800 border-stone-700 text-stone-200"
                  data-testid="border-style"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="solid">Solid</SelectItem>
                  <SelectItem value="dashed">Dashed</SelectItem>
                  <SelectItem value="dotted">Dotted</SelectItem>
                  <SelectItem value="double">Double</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
      </CollapsibleSection>

      {showFontSection && (
        <CollapsibleSection title="Font" defaultOpen={false}>
          <div className="space-y-1">
            <Label className="text-stone-400 text-xs">Font Weight</Label>
            <Select
              value={style.fontWeight || "normal"}
              onValueChange={(val) =>
                update({
                  fontWeight: val as PropertyStyle["fontWeight"],
                })
              }
            >
              <SelectTrigger
                className="h-7 text-xs bg-stone-800 border-stone-700 text-stone-200"
                data-testid="font-weight"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="light">Light</SelectItem>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="bold">Bold</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-stone-400 text-xs">Font Family</Label>
            <Select
              value={style.fontFamily || "default"}
              onValueChange={(val) =>
                update({
                  fontFamily: val === "default" ? undefined : val,
                })
              }
            >
              <SelectTrigger
                className="h-7 text-xs bg-stone-800 border-stone-700 text-stone-200"
                data-testid="font-family"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="default">Default</SelectItem>
                <SelectItem value="serif">Serif</SelectItem>
                <SelectItem value="sans-serif">Sans-serif</SelectItem>
                <SelectItem value="monospace">Monospace</SelectItem>
                <SelectItem value="fantasy">Fantasy</SelectItem>
                <SelectItem value="cursive">Cursive</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CollapsibleSection>
      )}

      <CollapsibleSection title="Layout" defaultOpen={false}>
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <Label className="text-stone-400 text-xs">Opacity</Label>
            <span className="text-xs text-stone-500">
              {Math.round((style.opacity ?? 1) * 100)}%
            </span>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            value={Math.round((style.opacity ?? 1) * 100)}
            onChange={(e) =>
              update({ opacity: parseInt(e.target.value) / 100 })
            }
            className="w-full accent-amber-500 h-1.5"
            data-testid="opacity-slider"
          />
        </div>

        <div className="space-y-1">
          <Label className="text-stone-400 text-xs">Padding (px)</Label>
          <NumberInput
            min={0} max={20} value={style.padding ?? 0} fallback={0}
            onChange={(v) =>
              update({
                padding: Math.min(20, Math.max(0, v ?? 0)),
              })
            }
            className="h-7 text-xs bg-stone-800 border-stone-700 text-stone-200"
            data-testid="padding-input"
          />
        </div>
      </CollapsibleSection>
    </div>
  );
}
