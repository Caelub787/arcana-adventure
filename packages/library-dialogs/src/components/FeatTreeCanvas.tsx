/**
 * <FeatTreeCanvas>
 *
 * Standalone, controlled drag-to-place + click-to-connect grid editor for
 * a feat tree. Operates entirely on local state (`feats[]` + `connections[]`)
 * so consumers can bundle its output into one sync upsert. Each connection
 * has a per-edge `isOptional` toggle; each feat has an inline effects
 * editor matching Arcana's `Feat.effects` jsonb shape.
 *
 * Exported standalone (not just embedded in FeatTreeDialog) so partner
 * apps can drop it into their own multi-pane editors.
 */
import * as React from "react";
import {
  Button, Input, Textarea, Label, Checkbox, Select, SelectItem,
  Stack, Row, Grid2, Grid3, Section, Panel, Badge,
} from "../ui/primitives";
import { uid } from "../lib/utils";
import { NumberInput } from "./NumberInput";

const CELL_SIZE = 100;
const NODE_RADIUS = 36;

export interface FeatEffectDraft {
  type: string;
  value?: number;
  target?: string;
  subtype?: string;
}

export interface FeatDraft {
  id?: string;
  /** Stable client-side id used to wire connections before server assigns real ids. */
  _localId?: string;
  name: string;
  description?: string | null;
  icon?: string | null;
  image?: string | null;
  gridX: number;
  gridY: number;
  tier: number;
  cost: number;
  effects?: FeatEffectDraft[];
}

export interface FeatConnectionDraft {
  id?: string;
  _localId?: string;
  fromFeatId: string;
  toFeatId: string;
  /** UI-only flag for required vs optional prerequisite. The server's
   *  `replaceFeatTreeChildren` passes through extra fields, so partners
   *  whose schema has the column will persist this; others will silently
   *  drop it. */
  isOptional?: boolean;
}

export interface FeatTreeCanvasValue {
  feats: FeatDraft[];
  connections: FeatConnectionDraft[];
}

export interface FeatTreeCanvasProps {
  value: FeatTreeCanvasValue;
  onChange: (value: FeatTreeCanvasValue) => void;
  gridWidth?: number;
  gridHeight?: number;
  /** Effect type vocabulary. Defaults to Arcana's stock set. */
  effectTypes?: string[];
}

const DEFAULT_EFFECT_TYPES = [
  "hp_bonus", "energy_bonus", "dc_bonus", "skill_bonus",
  "attribute_bonus", "spell_grant", "item_grant", "skill_grant",
  "trait_grant", "mana_increase",
];

function ensureLocalIds(value: FeatTreeCanvasValue): FeatTreeCanvasValue {
  const feats = value.feats.map(f => ({ ...f, _localId: f._localId || f.id || uid("feat") }));
  const connections = value.connections.map(c => ({ ...c, _localId: c._localId || c.id || uid("conn") }));
  return { feats, connections };
}

function keyForFeat(f: FeatDraft): string {
  return f._localId || f.id || "";
}

export const FeatTreeCanvas: React.FC<FeatTreeCanvasProps> = ({
  value, onChange, gridWidth = 7, gridHeight = 10, effectTypes = DEFAULT_EFFECT_TYPES,
}) => {
  const normalized = React.useMemo(() => ensureLocalIds(value), [value]);
  const { feats, connections } = normalized;

  const [selectedKey, setSelectedKey] = React.useState<string | null>(null);
  const [connectMode, setConnectMode] = React.useState(false);
  const [connectingFromKey, setConnectingFromKey] = React.useState<string | null>(null);
  const dragRef = React.useRef<{ key: string; startX: number; startY: number; origX: number; origY: number; moved: boolean } | null>(null);
  const svgRef = React.useRef<SVGSVGElement | null>(null);

  const widthPx = gridWidth * CELL_SIZE;
  const heightPx = gridHeight * CELL_SIZE;

  const featByKey = React.useMemo(() => {
    const m = new Map<string, FeatDraft>();
    feats.forEach(f => m.set(keyForFeat(f), f));
    return m;
  }, [feats]);

  const updateFeat = (key: string, patch: Partial<FeatDraft>) => {
    onChange({
      ...normalized,
      feats: feats.map(f => keyForFeat(f) === key ? { ...f, ...patch } : f),
    });
  };

  const addFeat = () => {
    const id = uid("feat");
    const cx = Math.floor(gridWidth / 2);
    const cy = Math.floor(gridHeight / 2);
    onChange({
      ...normalized,
      feats: [
        ...feats,
        { _localId: id, name: "New Feat", gridX: cx, gridY: cy, tier: 1, cost: 1, effects: [] },
      ],
    });
    setSelectedKey(id);
  };

  const deleteFeat = (key: string) => {
    const feat = featByKey.get(key);
    const featRefId = feat?.id || feat?._localId;
    onChange({
      feats: feats.filter(f => keyForFeat(f) !== key),
      connections: connections.filter(c => c.fromFeatId !== featRefId && c.toFeatId !== featRefId),
    });
    if (selectedKey === key) setSelectedKey(null);
  };

  const handleNodeClick = (key: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (dragRef.current?.moved) return;
    if (connectMode) {
      if (!connectingFromKey) {
        setConnectingFromKey(key);
      } else if (connectingFromKey !== key) {
        const fromFeat = featByKey.get(connectingFromKey);
        const toFeat = featByKey.get(key);
        const fromId = fromFeat?.id || fromFeat?._localId;
        const toId = toFeat?.id || toFeat?._localId;
        if (fromId && toId) {
          const exists = connections.some(c => c.fromFeatId === fromId && c.toFeatId === toId);
          if (!exists) {
            onChange({
              ...normalized,
              connections: [
                ...connections,
                { _localId: uid("conn"), fromFeatId: fromId, toFeatId: toId, isOptional: false },
              ],
            });
          }
        }
        setConnectingFromKey(null);
      }
    } else {
      setSelectedKey(key);
    }
  };

  const handleNodePointerDown = (key: string, e: React.PointerEvent) => {
    if (connectMode) return;
    const feat = featByKey.get(key);
    if (!feat) return;
    e.preventDefault();
    e.stopPropagation();
    try { (e.currentTarget as Element).setPointerCapture(e.pointerId); } catch { /* noop */ }
    dragRef.current = {
      key,
      startX: e.clientX,
      startY: e.clientY,
      origX: feat.gridX * CELL_SIZE,
      origY: feat.gridY * CELL_SIZE,
      moved: false,
    };
  };

  const handleNodePointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) d.moved = true;
    if (!d.moved) return;
    const newX = d.origX + dx;
    const newY = d.origY + dy;
    const cellX = Math.max(0, Math.min(gridWidth - 1, Math.round(newX / CELL_SIZE)));
    const cellY = Math.max(0, Math.min(gridHeight - 1, Math.round(newY / CELL_SIZE)));
    updateFeat(d.key, { gridX: cellX, gridY: cellY });
  };

  const handleNodePointerUp = (e: React.PointerEvent) => {
    try { (e.currentTarget as Element).releasePointerCapture(e.pointerId); } catch { /* noop */ }
    setTimeout(() => { dragRef.current = null; }, 0);
  };

  const handleCanvasClick = () => {
    if (connectMode) setConnectingFromKey(null);
    setSelectedKey(null);
  };

  const featForId = (id: string): FeatDraft | undefined => {
    return feats.find(f => f.id === id || f._localId === id);
  };

  const selectedFeat = selectedKey ? featByKey.get(selectedKey) : undefined;

  return (
    <Stack gap="sm" data-ld-root>
      <Row>
        <Button size="sm" variant="primary" onClick={addFeat} data-testid="button-feattree-add-feat">+ Add Feat</Button>
        <Button
          size="sm"
          variant={connectMode ? "primary" : "outline"}
          onClick={() => { setConnectMode(m => !m); setConnectingFromKey(null); }}
          data-testid="button-feattree-toggle-connect"
        >
          {connectMode ? (connectingFromKey ? "Pick target node…" : "Connecting (click cancel)") : "Connect Mode"}
        </Button>
        <Badge tone="muted">
          {feats.length} feat{feats.length === 1 ? "" : "s"} · {connections.length} connection{connections.length === 1 ? "" : "s"}
        </Badge>
      </Row>

      <Panel style={{ padding: 0, overflow: "auto", maxHeight: 480 }}>
        <svg
          ref={svgRef}
          width={widthPx}
          height={heightPx}
          viewBox={`0 0 ${widthPx} ${heightPx}`}
          onClick={handleCanvasClick}
          style={{ display: "block", background: "var(--ld-surface-2)", cursor: connectMode ? "crosshair" : "default" }}
          data-testid="svg-feattree-canvas"
        >
          <defs>
            <pattern id="ld-feat-grid" width={CELL_SIZE} height={CELL_SIZE} patternUnits="userSpaceOnUse">
              <path
                d={`M ${CELL_SIZE} 0 L 0 0 0 ${CELL_SIZE}`}
                fill="none"
                stroke="var(--ld-border)"
                strokeWidth="1"
              />
            </pattern>
          </defs>
          <rect width={widthPx} height={heightPx} fill="url(#ld-feat-grid)" />

          {connections.map(conn => {
            const from = featForId(conn.fromFeatId);
            const to = featForId(conn.toFeatId);
            if (!from || !to) return null;
            const x1 = from.gridX * CELL_SIZE + CELL_SIZE / 2;
            const y1 = from.gridY * CELL_SIZE + CELL_SIZE / 2;
            const x2 = to.gridX * CELL_SIZE + CELL_SIZE / 2;
            const y2 = to.gridY * CELL_SIZE + CELL_SIZE / 2;
            return (
              <line
                key={conn._localId}
                x1={x1} y1={y1} x2={x2} y2={y2}
                stroke={conn.isOptional ? "var(--ld-text-subtle)" : "var(--ld-accent)"}
                strokeWidth={3}
                strokeDasharray={conn.isOptional ? "6 4" : undefined}
                style={{ cursor: "pointer" }}
                onClick={(e) => {
                  e.stopPropagation();
                  onChange({
                    ...normalized,
                    connections: connections.map(c =>
                      c._localId === conn._localId ? { ...c, isOptional: !c.isOptional } : c
                    ),
                  });
                }}
                data-testid={`line-feattree-conn-${conn._localId}`}
              >
                <title>Click to toggle required/optional. {conn.isOptional ? "Optional" : "Required"}.</title>
              </line>
            );
          })}

          {feats.map(feat => {
            const key = keyForFeat(feat);
            const cx = feat.gridX * CELL_SIZE + CELL_SIZE / 2;
            const cy = feat.gridY * CELL_SIZE + CELL_SIZE / 2;
            const isSelected = selectedKey === key;
            const isConnSrc = connectingFromKey === key;
            return (
              <g
                key={key}
                onClick={(e) => handleNodeClick(key, e)}
                onPointerDown={(e) => handleNodePointerDown(key, e)}
                onPointerMove={handleNodePointerMove}
                onPointerUp={handleNodePointerUp}
                onPointerCancel={handleNodePointerUp}
                style={{ cursor: connectMode ? "crosshair" : "grab", touchAction: "none" }}
                data-testid={`node-feattree-${key}`}
              >
                <circle
                  cx={cx} cy={cy} r={NODE_RADIUS}
                  fill={isConnSrc ? "var(--ld-accent)" : "var(--ld-surface-3)"}
                  stroke={isSelected ? "var(--ld-accent)" : "var(--ld-border-strong)"}
                  strokeWidth={isSelected ? 3 : 2}
                />
                {feat.image ? (
                  <image
                    href={feat.image}
                    x={cx - NODE_RADIUS + 4}
                    y={cy - NODE_RADIUS + 4}
                    width={NODE_RADIUS * 2 - 8}
                    height={NODE_RADIUS * 2 - 8}
                    clipPath={`circle(${NODE_RADIUS - 4}px at ${NODE_RADIUS - 4}px ${NODE_RADIUS - 4}px)`}
                    preserveAspectRatio="xMidYMid slice"
                  />
                ) : null}
                <text
                  x={cx} y={cy + NODE_RADIUS + 14}
                  textAnchor="middle"
                  fill="var(--ld-text)"
                  fontSize={12}
                  style={{ pointerEvents: "none", userSelect: "none" }}
                >
                  {feat.name || "Unnamed"}
                </text>
                <text
                  x={cx} y={cy + 4}
                  textAnchor="middle"
                  fill="var(--ld-text)"
                  fontSize={11}
                  fontWeight={600}
                  style={{ pointerEvents: "none", userSelect: "none" }}
                >
                  T{feat.tier}·{feat.cost}p
                </text>
              </g>
            );
          })}
        </svg>
      </Panel>

      {selectedFeat && (
        <FeatEditorPanel
          feat={selectedFeat}
          onChange={(patch) => updateFeat(selectedKey!, patch)}
          onDelete={() => deleteFeat(selectedKey!)}
          effectTypes={effectTypes}
        />
      )}
    </Stack>
  );
};

interface FeatEditorPanelProps {
  feat: FeatDraft;
  onChange: (patch: Partial<FeatDraft>) => void;
  onDelete: () => void;
  effectTypes: string[];
}

const FeatEditorPanel: React.FC<FeatEditorPanelProps> = ({ feat, onChange, onDelete, effectTypes }) => {
  const effects = feat.effects ?? [];
  const numChange = (field: keyof FeatDraft, value: string, fallback = 0) => {
    if (value === "") return onChange({ [field]: fallback } as Partial<FeatDraft>);
    const n = parseInt(value, 10);
    onChange({ [field]: Number.isFinite(n) ? n : fallback } as Partial<FeatDraft>);
  };
  const setEffect = (idx: number, patch: Partial<FeatEffectDraft>) => {
    onChange({ effects: effects.map((e, i) => i === idx ? { ...e, ...patch } : e) });
  };
  const removeEffect = (idx: number) => {
    onChange({ effects: effects.filter((_, i) => i !== idx) });
  };
  const addEffect = () => {
    onChange({ effects: [...effects, { type: effectTypes[0] || "hp_bonus", value: 0, target: "", subtype: "flat" }] });
  };

  return (
    <Section title={`Editing: ${feat.name || "Unnamed Feat"}`}>
      <Stack gap="sm">
        <Grid2>
          <div>
            <Label>Name</Label>
            <Input value={feat.name} onChange={e => onChange({ name: e.target.value })} data-testid="input-feat-name" />
          </div>
          <div>
            <Label>Icon (emoji or text)</Label>
            <Input value={feat.icon ?? ""} onChange={e => onChange({ icon: e.target.value })} data-testid="input-feat-icon" />
          </div>
        </Grid2>
        <div>
          <Label>Description</Label>
          <Textarea
            value={feat.description ?? ""}
            onChange={e => onChange({ description: e.target.value })}
            rows={2}
            data-testid="textarea-feat-description"
          />
        </div>
        <div>
          <Label>Image URL</Label>
          <Input value={feat.image ?? ""} onChange={e => onChange({ image: e.target.value })} data-testid="input-feat-image" />
        </div>
        <Grid3>
          <div>
            <Label>Tier</Label>
            <NumberInput min={1} value={feat.tier} fallback={1} onChange={(v) => onChange({ tier: v ?? 1 })} data-testid="input-feat-tier" />
          </div>
          <div>
            <Label>Cost (points)</Label>
            <NumberInput min={0} value={feat.cost} fallback={1} onChange={(v) => onChange({ cost: v ?? 1 })} data-testid="input-feat-cost" />
          </div>
          <div>
            <Label>Position (x, y)</Label>
            <Row>
              <NumberInput value={feat.gridX} onChange={(v) => onChange({ gridX: v ?? 0 })} data-testid="input-feat-gridx" />
              <NumberInput value={feat.gridY} onChange={(v) => onChange({ gridY: v ?? 0 })} data-testid="input-feat-gridy" />
            </Row>
          </div>
        </Grid3>

        <Section title="Effects">
          <Stack gap="sm">
            {effects.length === 0 && <div className="ld-subtle">No effects yet.</div>}
            {effects.map((eff, idx) => (
              <Panel key={idx} style={{ padding: 8 }}>
                <Grid3>
                  <div>
                    <Label>Type</Label>
                    <Select value={eff.type} onValueChange={v => setEffect(idx, { type: v })} data-testid={`select-feat-effect-type-${idx}`}>
                      {effectTypes.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    </Select>
                  </div>
                  <div>
                    <Label>Value</Label>
                    <NumberInput
                      value={eff.value ?? 0}
                      onChange={(v) => setEffect(idx, { value: v ?? 0 })}
                      data-testid={`input-feat-effect-value-${idx}`}
                    />
                  </div>
                  <div>
                    <Label>Target / Subtype</Label>
                    <Input
                      value={eff.target ?? ""}
                      onChange={e => setEffect(idx, { target: e.target.value })}
                      placeholder="attribute, skill id, spell id…"
                      data-testid={`input-feat-effect-target-${idx}`}
                    />
                  </div>
                </Grid3>
                <Row style={{ marginTop: 6 }}>
                  <Button size="sm" variant="danger" onClick={() => removeEffect(idx)} data-testid={`button-feat-effect-remove-${idx}`}>
                    Remove
                  </Button>
                </Row>
              </Panel>
            ))}
            <Row>
              <Button size="sm" onClick={addEffect} data-testid="button-feat-effect-add">+ Add Effect</Button>
            </Row>
          </Stack>
        </Section>

        <Row>
          <Button variant="danger" size="sm" onClick={onDelete} data-testid="button-feat-delete">Delete Feat</Button>
          <span className="ld-subtle">Drag the node on the canvas to reposition. Toggle Connect Mode to wire prerequisites.</span>
        </Row>
      </Stack>
    </Section>
  );
};

/**
 * Prepare the canvas value for a bundled `feat-tree` upsert.
 *
 * Server-side `replaceFeatTreeChildren` builds its `featIdRemap` keyed
 * on each incoming feat's `id`, then rewrites every connection's
 * `fromFeatId` / `toFeatId` through that map. To make brand-new
 * connections that reference brand-new feats resolve correctly, we
 * promote the canvas's stable `_localId` into `id` for any new feat
 * (and strip the surrogate field afterwards). Connections already
 * carry `fromFeatId` / `toFeatId` set to the same surrogate ids when
 * they were created in the canvas, so the remap on the server lines
 * up exactly.
 */
export function stripLocalIds(value: FeatTreeCanvasValue): FeatTreeCanvasValue {
  return {
    feats: value.feats.map(f => {
      const { _localId, ...rest } = f;
      const id = rest.id || _localId;
      return id ? { ...rest, id } : rest;
    }),
    connections: value.connections.map(c => {
      const { _localId, ...rest } = c;
      void _localId;
      return rest;
    }),
  };
}
