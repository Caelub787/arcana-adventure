export type PropertyType = 'number' | 'text' | 'boolean' | 'resource' | 'list' | 'textarea' | 'pfp' | 'label';

export type SandboxPropertyType = PropertyType;

export type TemplateType = 'character' | 'item' | 'vehicle' | 'beast' | 'custom';

export type LayoutNodeType = 'panel' | 'tab' | 'section' | 'group';

export type LayoutMode = 'grid' | 'freeform' | 'stack';

export type TabPosition = 'top' | 'bottom' | 'left' | 'right';

export type StackDirection = 'vertical' | 'horizontal';

export interface PositionConfig {
  x: number;
  y: number;
  anchor?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center';
  zIndex?: number;
}

export interface SizeConfig {
  width: number;
  height: number;
  minWidth?: number;
  minHeight?: number;
}

export interface StyleConfig {
  backgroundColor?: string;
  backgroundGradient?: { enabled: boolean; type: string; stops: string };
  textColor?: string;
  labelColor?: string;
  valueColor?: string;
  border?: { enabled: boolean; color: string; width: number; radius: number; style: string };
  fontWeight?: string;
  fontFamily?: string;
  opacity?: number;
  padding?: number;
  visibility?: 'visible' | 'hidden';
}

export type PropertyStyle = StyleConfig;

export interface GridConfig {
  columns: number;
  rows: number;
  gap: number;
  cellWidth?: number;
  cellHeight?: number;
}

export interface StackConfig {
  direction: StackDirection;
  gap: number;
  align?: 'start' | 'center' | 'end' | 'stretch';
}

export interface TabBehaviorConfig {
  tabPosition: TabPosition;
  activeTabId?: string;
  tabButtonStyle?: StyleConfig;
  activeTabButtonStyle?: StyleConfig;
  tabLayout?: 'top' | 'left' | 'right';
  tabIcons?: Record<string, { type: 'icon' | 'image'; value: string; showName?: boolean }>;
  tabButtonSize?: 'small' | 'medium' | 'large';
}

export interface PanelBehaviorConfig {
  collapsible?: boolean;
  defaultCollapsed?: boolean;
}

export interface BehaviorConfig {
  tabConfig?: TabBehaviorConfig;
  panelConfig?: PanelBehaviorConfig;
}

export interface LayoutNode {
  id: string;
  type: LayoutNodeType;
  name: string;
  parentId: string | null;
  childrenIds: string[];
  positionConfig: PositionConfig;
  sizeConfig: SizeConfig;
  layoutMode: LayoutMode;
  gridConfig?: GridConfig;
  stackConfig?: StackConfig;
  styleConfig?: StyleConfig;
  behaviorConfig?: BehaviorConfig;
  order: number;
}

export interface SheetCanvas {
  id: string;
  width: number;
  height: number;
  backgroundConfig?: StyleConfig;
}

export interface UIConfig {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  gridColumn?: number;
  gridRow?: number;
  gridColumnSpan?: number;
  gridRowSpan?: number;
  labelFontSize?: number;
  valueFontSize?: number;
  labelPosition?: 'top' | 'left' | 'hidden';
}

export interface PropertyMetadata {
  label: string;
  description?: string;
  tooltip?: string;
  uiConfig: UIConfig;
  style?: StyleConfig;
  permissions?: {
    editable?: boolean;
    visible?: boolean;
    gmOnly?: boolean;
  };
  renderComponent?: string;
  labelVisibility?: boolean;
  conditionalVisibilityExpression?: string;
  calculationExpression?: string;
  visibilityExpression?: string;
  options?: string[];
  resourceConfig?: {
    showMax?: boolean;
    showBar?: boolean;
    barColor?: string;
    allowOverMax?: boolean;
    colorThresholds?: Array<{ percent: number; color: string }>;
    useGradient?: boolean;
  };
}

export interface PropertyDefinition {
  id: string;
  key: string;
  type: PropertyType;
  parentId: string | null;
  defaultValue?: any;
  metadata: PropertyMetadata;
}

export interface TemplateData {
  version: number;
  type: TemplateType;
  canvas: SheetCanvas;
  layoutNodes: Record<string, LayoutNode>;
  properties: Record<string, PropertyDefinition>;
  settings: {
    defaultWidth: number;
    defaultHeight: number;
    allowResize?: boolean;
  };
}

export type ActorValue = string | number | boolean | { current: number; max: number } | string[];
export type ActorValues = Record<string, ActorValue>;

export function createDefaultTemplateData(): TemplateData {
  const canvasId = crypto.randomUUID();

  return {
    version: 3,
    type: 'character',
    canvas: {
      id: canvasId,
      width: 450,
      height: 550,
      backgroundConfig: {
        backgroundColor: '#1c1917',
      },
    },
    layoutNodes: {},
    properties: {
      name: {
        id: crypto.randomUUID(),
        key: 'name',
        type: 'text',
        parentId: null,
        metadata: {
          label: 'Name',
          uiConfig: { x: 10, y: 10, width: 310, height: 40, labelFontSize: 10, valueFontSize: 18, labelPosition: 'top' },
          style: { labelColor: '#a8a29e', valueColor: '#e7e5e4' },
        },
      },
    },
    settings: {
      defaultWidth: 450,
      defaultHeight: 550,
    },
  };
}

export function getPropertiesForNode(data: TemplateData, nodeId: string | null): PropertyDefinition[] {
  return Object.values(data.properties).filter(p => p.parentId === nodeId);
}

export function getChildNodes(data: TemplateData, parentId: string | null): LayoutNode[] {
  return Object.values(data.layoutNodes)
    .filter(n => n.parentId === parentId)
    .sort((a, b) => a.order - b.order);
}

export function getRootNodes(data: TemplateData): LayoutNode[] {
  return getChildNodes(data, null);
}

export function isNodeVisible(data: TemplateData, nodeId: string, activeTabState?: Record<string, string>): boolean {
  const node = data.layoutNodes[nodeId];
  if (!node) return false;
  if (node.styleConfig?.visibility === 'hidden') return false;

  if (node.parentId) {
    const parent = data.layoutNodes[node.parentId];
    if (parent?.type === 'tab') {
      const siblings = Object.values(data.layoutNodes)
        .filter(n => n.parentId === parent.id)
        .sort((a, b) => a.order - b.order);
      const activeChildId = activeTabState?.[parent.id] || parent.behaviorConfig?.tabConfig?.activeTabId || siblings[0]?.id;
      if (activeChildId && activeChildId !== nodeId) return false;
    }
    return isNodeVisible(data, node.parentId, activeTabState);
  }

  return true;
}

export function getAllVisibleProperties(data: TemplateData, activeTabState?: Record<string, string>): PropertyDefinition[] {
  return Object.values(data.properties).filter(p => {
    if (!p.parentId) return true;
    return isNodeVisible(data, p.parentId, activeTabState);
  });
}

export function resolveValue(property: PropertyDefinition, actorValues: ActorValues): ActorValue {
  if (property.key in actorValues) return actorValues[property.key];
  if (property.defaultValue !== undefined) return property.defaultValue;
  switch (property.type) {
    case 'number': return 0;
    case 'boolean': return false;
    case 'resource': return { current: 0, max: 0 };
    case 'list': return [];
    case 'text': return '';
    case 'textarea': return '';
    case 'pfp': return '';
    case 'label': return '';
  }
}

export function migrateTemplateData(raw: any): TemplateData {
  if (raw.version === 3 && raw.canvas && raw.layoutNodes !== undefined) {
    return raw as TemplateData;
  }

  const canvasId = crypto.randomUUID();
  const canvas: SheetCanvas = {
    id: canvasId,
    width: raw.settings?.defaultWidth || 450,
    height: raw.settings?.defaultHeight || 550,
    backgroundConfig: { backgroundColor: '#1c1917' },
  };

  const layoutNodes: Record<string, LayoutNode> = {};
  const newProperties: Record<string, PropertyDefinition> = {};

  if (raw.version === 2 && raw.layoutNodes) {
    for (const [nodeId, node] of Object.entries(raw.layoutNodes as Record<string, any>)) {
      layoutNodes[nodeId] = node;
    }
    if (raw.canvas) {
      canvas.id = raw.canvas.id || canvasId;
      canvas.width = raw.canvas.width || 450;
      canvas.height = raw.canvas.height || 550;
      canvas.backgroundConfig = raw.canvas.backgroundConfig || { backgroundColor: '#1c1917' };
    }

    if (raw.properties && typeof raw.properties === 'object') {
      for (const [key, prop] of Object.entries(raw.properties as Record<string, any>)) {
        const sectionNodeId = prop.sectionNodeId;
        newProperties[key] = {
          ...prop,
          parentId: sectionNodeId || null,
        };
        if ('sectionNodeId' in newProperties[key]) {
          delete (newProperties[key] as any).sectionNodeId;
        }
      }
    }
  } else if (raw.sections && Array.isArray(raw.sections)) {
    const sectionIdMap: Record<string, string> = {};
    for (const section of raw.sections) {
      const nodeId = section.id || crypto.randomUUID();
      sectionIdMap[section.id] = nodeId;
      layoutNodes[nodeId] = {
        id: nodeId,
        type: 'section',
        name: section.name || 'Section',
        parentId: null,
        childrenIds: [],
        positionConfig: { x: 0, y: 0 },
        sizeConfig: { width: canvas.width, height: 200 },
        layoutMode: section.layoutMode || 'freeform',
        gridConfig: section.gridConfig,
        styleConfig: section.styleConfig,
        order: section.order ?? 0,
      };
    }

    const firstNodeId = Object.keys(layoutNodes)[0] || null;

    if (raw.properties && typeof raw.properties === 'object' && !Array.isArray(raw.properties)) {
      for (const [key, prop] of Object.entries(raw.properties as Record<string, any>)) {
        const oldSectionId = prop.sectionId || prop.sectionNodeId;
        const mappedParentId = oldSectionId ? (sectionIdMap[oldSectionId] || null) : null;
        newProperties[key] = {
          ...prop,
          parentId: mappedParentId,
        };
        if ('sectionId' in newProperties[key]) delete (newProperties[key] as any).sectionId;
        if ('sectionNodeId' in newProperties[key]) delete (newProperties[key] as any).sectionNodeId;
      }
    } else if (Array.isArray(raw.properties)) {
      for (const p of raw.properties) {
        if (p.type === 'panel' || p.type === 'tab') continue;
        const propType = p.type === 'checkbox' ? 'boolean' : p.type === 'select' ? 'list' : p.type === 'textarea' ? 'textarea' : p.type;
        newProperties[p.key] = {
          id: p.id,
          key: p.key,
          type: propType,
          parentId: firstNodeId,
          defaultValue: p.defaultValue,
          metadata: {
            label: p.label || p.key,
            tooltip: p.tooltip,
            uiConfig: {
              x: p.x ?? 10,
              y: p.y ?? 10,
              width: p.width ?? 200,
              height: p.height ?? 40,
              labelFontSize: p.labelFontSize ?? 11,
              valueFontSize: p.valueFontSize ?? 13,
              labelPosition: p.labelPosition ?? 'top',
            },
            style: p.style,
            options: p.options,
          },
        };
      }
    }
  } else {
    if (raw.properties && typeof raw.properties === 'object') {
      for (const [key, prop] of Object.entries(raw.properties as Record<string, any>)) {
        newProperties[key] = {
          ...prop,
          parentId: prop.parentId ?? prop.sectionNodeId ?? prop.sectionId ?? null,
        };
        if ('sectionId' in newProperties[key]) delete (newProperties[key] as any).sectionId;
        if ('sectionNodeId' in newProperties[key]) delete (newProperties[key] as any).sectionNodeId;
      }
    }
  }

  return {
    version: 3,
    type: raw.type || 'character',
    canvas,
    layoutNodes,
    properties: newProperties,
    settings: raw.settings || { defaultWidth: 450, defaultHeight: 550 },
  };
}
