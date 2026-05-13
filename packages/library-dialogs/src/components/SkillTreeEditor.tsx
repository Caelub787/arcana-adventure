/**
 * <SkillTreeEditor> + <ClassSkillsPanel>
 *
 * Standalone, controlled editors for an AAv2 class's skill tree.
 *
 *   * <SkillTreeEditor> — drag-to-place + click-to-connect graph editor for
 *     `class_skill_nodes` + `class_skill_connections`. Per-node inline editor
 *     for name, description, icon/image, tier (level gate), cost, and the
 *     effects jsonb array (matches Arcana's class node form exactly).
 *
 *   * <ClassSkillsPanel> — flat list view of the same `class_skill_nodes`
 *     records. Convenient when partners want a list-style admin without the
 *     graph metaphor; both editors share the same controlled `skillNodes`
 *     array, so changes in either propagate.
 *
 * Schema note: in the Arcana data model "class skills" and "skill tree
 * nodes" are the same record (`class_skill_nodes`). The flat list and the
 * graph are two views of one underlying array.
 *
 * Both components are exported standalone so partner apps can drop them
 * into their own multi-pane editors without pulling in `<ClassDialog>`.
 */
import * as React from "react";
import {
  Button, Input, Textarea, Label, Select, SelectItem,
  Stack, Row, Grid2, Grid3, Section, Panel, Badge,
} from "../ui/primitives";
import { uid } from "../lib/utils";

const CELL_SIZE = 100;
const NODE_RADIUS = 36;

export interface SkillNodeEffectDraft {
  type: string;
  value?: number;
  target?: string;
  subtype?: string;
}

export interface SkillNodeDraft {
  id?: string;
  /** Stable client-side id used to wire connections before the server assigns real ids. */
  _localId?: string;
  name: string;
  description?: string | null;
  icon?: string | null;
  image?: string | null;
  gridX: number;
  gridY: number;
  /** Class level required to unlock this node (also doubles as the visual tier in Arcana). */
  tier: number;
  /** Skill points required to unlock this node. */
  cost: number;
  effects?: SkillNodeEffectDraft[];
}

export interface SkillConnectionDraft {
  id?: string;
  _localId?: string;
  fromNodeId: string;
  toNodeId: string;
}

export interface SkillTreeValue {
  skillNodes: SkillNodeDraft[];
  skillConnections: SkillConnectionDraft[];
}

export interface SkillTreeEditorProps {
  value: SkillTreeValue;
  onChange: (value: SkillTreeValue) => void;
  gridWidth?: number;
  gridHeight?: number;
  /** Effect type vocabulary. Defaults to the Arcana class-node stock set. */
  effectTypes?: string[];
}

const DEFAULT_EFFECT_TYPES = [
  "hp_bonus", "energy_bonus", "mana_bonus", "dc_bonus",
  "skill_bonus", "attribute_bonus",
  "spell_grant", "item_grant", "skill_grant", "trait_grant",
  "mana_increase",
];

function ensureLocalIds(value: SkillTreeValue): SkillTreeValue {
  const skillNodes = value.skillNodes.map(n => ({ ...n, _localId: n._localId || n.id || uid("node") }));
  const skillConnections = value.skillConnections.map(c => ({ ...c, _localId: c._localId || c.id || uid("conn") }));
  return { skillNodes, skillConnections };
}

function keyForNode(n: SkillNodeDraft): string {
  return n._localId || n.id || "";
}

export const SkillTreeEditor: React.FC<SkillTreeEditorProps> = ({
  value, onChange, gridWidth = 7, gridHeight = 10, effectTypes = DEFAULT_EFFECT_TYPES,
}) => {
  const normalized = React.useMemo(() => ensureLocalIds(value), [value]);
  const { skillNodes, skillConnections } = normalized;

  const [selectedKey, setSelectedKey] = React.useState<string | null>(null);
  const [connectMode, setConnectMode] = React.useState(false);
  const [connectingFromKey, setConnectingFromKey] = React.useState<string | null>(null);
  const dragRef = React.useRef<{ key: string; startX: number; startY: number; origX: number; origY: number; moved: boolean } | null>(null);
  const svgRef = React.useRef<SVGSVGElement | null>(null);

  const widthPx = gridWidth * CELL_SIZE;
  const heightPx = gridHeight * CELL_SIZE;

  const nodeByKey = React.useMemo(() => {
    const m = new Map<string, SkillNodeDraft>();
    skillNodes.forEach(n => m.set(keyForNode(n), n));
    return m;
  }, [skillNodes]);

  const updateNode = (key: string, patch: Partial<SkillNodeDraft>) => {
    onChange({
      ...normalized,
      skillNodes: skillNodes.map(n => keyForNode(n) === key ? { ...n, ...patch } : n),
    });
  };

  const addNode = () => {
    const id = uid("node");
    const cx = Math.floor(gridWidth / 2);
    const cy = Math.floor(gridHeight / 2);
    onChange({
      ...normalized,
      skillNodes: [
        ...skillNodes,
        { _localId: id, name: "New Skill", gridX: cx, gridY: cy, tier: 1, cost: 1, effects: [] },
      ],
    });
    setSelectedKey(id);
  };

  const deleteNode = (key: string) => {
    const node = nodeByKey.get(key);
    const refId = node?.id || node?._localId;
    onChange({
      skillNodes: skillNodes.filter(n => keyForNode(n) !== key),
      skillConnections: skillConnections.filter(c => c.fromNodeId !== refId && c.toNodeId !== refId),
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
        const fromNode = nodeByKey.get(connectingFromKey);
        const toNode = nodeByKey.get(key);
        const fromId = fromNode?.id || fromNode?._localId;
        const toId = toNode?.id || toNode?._localId;
        if (fromId && toId) {
          const exists = skillConnections.some(c => c.fromNodeId === fromId && c.toNodeId === toId);
          if (!exists) {
            onChange({
              ...normalized,
              skillConnections: [
                ...skillConnections,
                { _localId: uid("conn"), fromNodeId: fromId, toNodeId: toId },
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
    const node = nodeByKey.get(key);
    if (!node) return;
    e.preventDefault();
    e.stopPropagation();
    try { (e.currentTarget as Element).setPointerCapture(e.pointerId); } catch { /* noop */ }
    dragRef.current = {
      key,
      startX: e.clientX,
      startY: e.clientY,
      origX: node.gridX * CELL_SIZE,
      origY: node.gridY * CELL_SIZE,
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
    updateNode(d.key, { gridX: cellX, gridY: cellY });
  };

  const handleNodePointerUp = (e: React.PointerEvent) => {
    try { (e.currentTarget as Element).releasePointerCapture(e.pointerId); } catch { /* noop */ }
    setTimeout(() => { dragRef.current = null; }, 0);
  };

  const handleCanvasClick = () => {
    if (connectMode) setConnectingFromKey(null);
    setSelectedKey(null);
  };

  const nodeForId = (id: string): SkillNodeDraft | undefined => {
    return skillNodes.find(n => n.id === id || n._localId === id);
  };

  const selectedNode = selectedKey ? nodeByKey.get(selectedKey) : undefined;

  return (
    <Stack gap="sm" data-ld-root>
      <Row>
        <Button size="sm" variant="primary" onClick={addNode} data-testid="button-skilltree-add-node">+ Add Skill Node</Button>
        <Button
          size="sm"
          variant={connectMode ? "primary" : "outline"}
          onClick={() => { setConnectMode(m => !m); setConnectingFromKey(null); }}
          data-testid="button-skilltree-toggle-connect"
        >
          {connectMode ? (connectingFromKey ? "Pick target node…" : "Connecting (click cancel)") : "Connect Mode"}
        </Button>
        <Badge tone="muted">
          {skillNodes.length} node{skillNodes.length === 1 ? "" : "s"} · {skillConnections.length} connection{skillConnections.length === 1 ? "" : "s"}
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
          data-testid="svg-skilltree-canvas"
        >
          <defs>
            <pattern id="ld-skill-grid" width={CELL_SIZE} height={CELL_SIZE} patternUnits="userSpaceOnUse">
              <path
                d={`M ${CELL_SIZE} 0 L 0 0 0 ${CELL_SIZE}`}
                fill="none"
                stroke="var(--ld-border)"
                strokeWidth="1"
              />
            </pattern>
          </defs>
          <rect width={widthPx} height={heightPx} fill="url(#ld-skill-grid)" />

          {skillConnections.map(conn => {
            const from = nodeForId(conn.fromNodeId);
            const to = nodeForId(conn.toNodeId);
            if (!from || !to) return null;
            const x1 = from.gridX * CELL_SIZE + CELL_SIZE / 2;
            const y1 = from.gridY * CELL_SIZE + CELL_SIZE / 2;
            const x2 = to.gridX * CELL_SIZE + CELL_SIZE / 2;
            const y2 = to.gridY * CELL_SIZE + CELL_SIZE / 2;
            return (
              <line
                key={conn._localId}
                x1={x1} y1={y1} x2={x2} y2={y2}
                stroke="var(--ld-accent)"
                strokeWidth={3}
                style={{ cursor: "pointer" }}
                onClick={(e) => {
                  e.stopPropagation();
                  onChange({
                    ...normalized,
                    skillConnections: skillConnections.filter(c => c._localId !== conn._localId),
                  });
                }}
                data-testid={`line-skilltree-conn-${conn._localId}`}
              >
                <title>Click to delete connection.</title>
              </line>
            );
          })}

          {skillNodes.map(node => {
            const key = keyForNode(node);
            const cx = node.gridX * CELL_SIZE + CELL_SIZE / 2;
            const cy = node.gridY * CELL_SIZE + CELL_SIZE / 2;
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
                data-testid={`node-skilltree-${key}`}
              >
                <circle
                  cx={cx} cy={cy} r={NODE_RADIUS}
                  fill={isConnSrc ? "var(--ld-accent)" : "var(--ld-surface-3)"}
                  stroke={isSelected ? "var(--ld-accent)" : "var(--ld-border-strong)"}
                  strokeWidth={isSelected ? 3 : 2}
                />
                {node.image ? (
                  <image
                    href={node.image}
                    x={cx - NODE_RADIUS + 4}
                    y={cy - NODE_RADIUS + 4}
                    width={NODE_RADIUS * 2 - 8}
                    height={NODE_RADIUS * 2 - 8}
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
                  {node.name || "Unnamed"}
                </text>
                <text
                  x={cx} y={cy + 4}
                  textAnchor="middle"
                  fill="var(--ld-text)"
                  fontSize={11}
                  fontWeight={600}
                  style={{ pointerEvents: "none", userSelect: "none" }}
                >
                  L{node.tier}·{node.cost}p
                </text>
              </g>
            );
          })}
        </svg>
      </Panel>

      {selectedNode && (
        <SkillNodeEditorPanel
          node={selectedNode}
          onChange={(patch) => updateNode(selectedKey!, patch)}
          onDelete={() => deleteNode(selectedKey!)}
          effectTypes={effectTypes}
        />
      )}
    </Stack>
  );
};

interface SkillNodeEditorPanelProps {
  node: SkillNodeDraft;
  onChange: (patch: Partial<SkillNodeDraft>) => void;
  onDelete: () => void;
  effectTypes: string[];
}

const SkillNodeEditorPanel: React.FC<SkillNodeEditorPanelProps> = ({ node, onChange, onDelete, effectTypes }) => {
  const effects = node.effects ?? [];
  const numChange = (field: keyof SkillNodeDraft, value: string, fallback = 0) => {
    if (value === "") return onChange({ [field]: fallback } as Partial<SkillNodeDraft>);
    const n = parseInt(value, 10);
    onChange({ [field]: Number.isFinite(n) ? n : fallback } as Partial<SkillNodeDraft>);
  };
  const setEffect = (idx: number, patch: Partial<SkillNodeEffectDraft>) => {
    onChange({ effects: effects.map((e, i) => i === idx ? { ...e, ...patch } : e) });
  };
  const removeEffect = (idx: number) => {
    onChange({ effects: effects.filter((_, i) => i !== idx) });
  };
  const addEffect = () => {
    onChange({ effects: [...effects, { type: effectTypes[0] || "hp_bonus", value: 0, target: "", subtype: "flat" }] });
  };

  return (
    <Section title={`Editing: ${node.name || "Unnamed Skill Node"}`}>
      <Stack gap="sm">
        <Grid2>
          <div>
            <Label>Name</Label>
            <Input value={node.name} onChange={e => onChange({ name: e.target.value })} data-testid="input-skillnode-name" />
          </div>
          <div>
            <Label>Icon (emoji or text)</Label>
            <Input value={node.icon ?? ""} onChange={e => onChange({ icon: e.target.value })} data-testid="input-skillnode-icon" />
          </div>
        </Grid2>
        <div>
          <Label>Description</Label>
          <Textarea
            value={node.description ?? ""}
            onChange={e => onChange({ description: e.target.value })}
            rows={2}
            data-testid="textarea-skillnode-description"
          />
        </div>
        <div>
          <Label>Image URL</Label>
          <Input value={node.image ?? ""} onChange={e => onChange({ image: e.target.value })} data-testid="input-skillnode-image" />
        </div>
        <Grid3>
          <div>
            <Label>Class Level Gate</Label>
            <Input type="number" min={1} value={node.tier} onChange={e => numChange("tier", e.target.value, 1)} data-testid="input-skillnode-tier" />
          </div>
          <div>
            <Label>Cost (skill points)</Label>
            <Input type="number" min={0} value={node.cost} onChange={e => numChange("cost", e.target.value, 1)} data-testid="input-skillnode-cost" />
          </div>
          <div>
            <Label>Position (x, y)</Label>
            <Row>
              <Input type="number" value={node.gridX} onChange={e => numChange("gridX", e.target.value, 0)} data-testid="input-skillnode-gridx" />
              <Input type="number" value={node.gridY} onChange={e => numChange("gridY", e.target.value, 0)} data-testid="input-skillnode-gridy" />
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
                    <Select value={eff.type} onValueChange={v => setEffect(idx, { type: v })} data-testid={`select-skillnode-effect-type-${idx}`}>
                      {effectTypes.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    </Select>
                  </div>
                  <div>
                    <Label>Value</Label>
                    <Input
                      type="number"
                      value={eff.value ?? 0}
                      onChange={e => setEffect(idx, { value: parseInt(e.target.value, 10) || 0 })}
                      data-testid={`input-skillnode-effect-value-${idx}`}
                    />
                  </div>
                  <div>
                    <Label>Target / Subtype</Label>
                    <Input
                      value={eff.target ?? ""}
                      onChange={e => setEffect(idx, { target: e.target.value })}
                      placeholder="attribute, skill id, spell id…"
                      data-testid={`input-skillnode-effect-target-${idx}`}
                    />
                  </div>
                </Grid3>
                <Row style={{ marginTop: 6 }}>
                  <Button size="sm" variant="danger" onClick={() => removeEffect(idx)} data-testid={`button-skillnode-effect-remove-${idx}`}>
                    Remove
                  </Button>
                </Row>
              </Panel>
            ))}
            <Row>
              <Button size="sm" onClick={addEffect} data-testid="button-skillnode-effect-add">+ Add Effect</Button>
            </Row>
          </Stack>
        </Section>

        <Row>
          <Button variant="danger" size="sm" onClick={onDelete} data-testid="button-skillnode-delete">Delete Node</Button>
          <span className="ld-subtle">Drag the node on the canvas to reposition. Toggle Connect Mode to wire prerequisites.</span>
        </Row>
      </Stack>
    </Section>
  );
};

/* -------- Flat-list view -------- */

export interface ClassSkillsPanelProps {
  /** Full skill-tree value — both arrays are read so deletes can scrub orphan connections. */
  value: SkillTreeValue;
  onChange: (value: SkillTreeValue) => void;
  /** Effect type vocabulary forwarded to the inline node editor. */
  effectTypes?: string[];
}

/**
 * Flat list of class skill nodes. Edits the same `skillNodes` array the
 * graphical editor uses; deleting a row also scrubs any connections that
 * reference it. Convenient when a partner UI prefers a list-style admin
 * pane alongside (or instead of) the graph.
 */
export const ClassSkillsPanel: React.FC<ClassSkillsPanelProps> = ({
  value, onChange, effectTypes = DEFAULT_EFFECT_TYPES,
}) => {
  const normalized = React.useMemo(() => ensureLocalIds(value), [value]);
  const { skillNodes, skillConnections } = normalized;
  const [expandedKey, setExpandedKey] = React.useState<string | null>(null);

  const addNode = () => {
    const id = uid("node");
    onChange({
      ...normalized,
      skillNodes: [
        ...skillNodes,
        { _localId: id, name: "New Skill", gridX: 0, gridY: 0, tier: 1, cost: 1, effects: [] },
      ],
    });
    setExpandedKey(id);
  };

  const updateNode = (key: string, patch: Partial<SkillNodeDraft>) => {
    onChange({
      ...normalized,
      skillNodes: skillNodes.map(n => keyForNode(n) === key ? { ...n, ...patch } : n),
    });
  };

  const deleteNode = (key: string) => {
    const node = skillNodes.find(n => keyForNode(n) === key);
    const refId = node?.id || node?._localId;
    onChange({
      skillNodes: skillNodes.filter(n => keyForNode(n) !== key),
      skillConnections: skillConnections.filter(c => c.fromNodeId !== refId && c.toNodeId !== refId),
    });
    if (expandedKey === key) setExpandedKey(null);
  };

  return (
    <Stack gap="sm" data-ld-root>
      <Row>
        <Button size="sm" variant="primary" onClick={addNode} data-testid="button-classskills-add">+ Add Skill</Button>
        <Badge tone="muted">{skillNodes.length} skill{skillNodes.length === 1 ? "" : "s"}</Badge>
      </Row>
      {skillNodes.length === 0 && (
        <div className="ld-subtle">No class skills yet. Add one or use the tree canvas.</div>
      )}
      <Stack gap="sm">
        {skillNodes.map(node => {
          const key = keyForNode(node);
          const isOpen = expandedKey === key;
          return (
            <Panel key={key} style={{ padding: 8 }} data-testid={`row-classskill-${key}`}>
              <Row>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setExpandedKey(isOpen ? null : key)}
                  data-testid={`button-classskill-toggle-${key}`}
                >
                  {isOpen ? "▾" : "▸"}
                </Button>
                <strong style={{ flex: 1 }}>{node.name || "Unnamed"}</strong>
                <Badge tone="muted">L{node.tier}</Badge>
                <Badge tone="muted">{node.cost}p</Badge>
                <Button size="sm" variant="danger" onClick={() => deleteNode(key)} data-testid={`button-classskill-delete-${key}`}>
                  Delete
                </Button>
              </Row>
              {isOpen && (
                <div style={{ marginTop: 8 }}>
                  <SkillNodeEditorPanel
                    node={node}
                    onChange={(patch) => updateNode(key, patch)}
                    onDelete={() => deleteNode(key)}
                    effectTypes={effectTypes}
                  />
                </div>
              )}
            </Panel>
          );
        })}
      </Stack>
    </Stack>
  );
};

/**
 * Prepare the skill-tree value for a bundled `class` upsert.
 *
 * Server-side `replaceClassChildren` builds its `nodeIdRemap` keyed on
 * each incoming node's `id`, then rewrites every connection's
 * `fromNodeId` / `toNodeId` through that map. To make brand-new
 * connections that reference brand-new nodes resolve correctly, we
 * promote the canvas's stable `_localId` into `id` for any new node
 * (and strip the surrogate field afterwards). Connections already
 * carry `fromNodeId` / `toNodeId` set to the same surrogate ids when
 * they were created in the canvas, so the remap on the server lines
 * up exactly.
 */
export function stripLocalIds(value: SkillTreeValue): SkillTreeValue {
  return {
    skillNodes: value.skillNodes.map(n => {
      const { _localId, ...rest } = n;
      const id = rest.id || _localId;
      return id ? { ...rest, id } : rest;
    }),
    skillConnections: value.skillConnections.map(c => {
      const { _localId, ...rest } = c;
      void _localId;
      return rest;
    }),
  };
}
