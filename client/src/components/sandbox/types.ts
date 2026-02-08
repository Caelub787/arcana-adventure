export type PropertyType = 'number' | 'text' | 'boolean' | 'resource' | 'list' | 'formula' | 'pfp';

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
}

export interface BehaviorConfig {
  tabConfig?: TabBehaviorConfig;
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
  formulaExpression?: string;
  options?: string[];
  resourceConfig?: {
    showMax?: boolean;
    showBar?: boolean;
    barColor?: string;
  };
}

export interface PropertyDefinition {
  id: string;
  key: string;
  type: PropertyType;
  sectionNodeId: string;
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
  const sectionId = crypto.randomUUID();

  return {
    version: 2,
    type: 'character',
    canvas: {
      id: canvasId,
      width: 450,
      height: 550,
      backgroundConfig: {
        backgroundColor: '#1c1917',
      },
    },
    layoutNodes: {
      [sectionId]: {
        id: sectionId,
        type: 'section',
        name: 'Main',
        parentId: null,
        childrenIds: [],
        positionConfig: { x: 0, y: 0 },
        sizeConfig: { width: 450, height: 550 },
        layoutMode: 'freeform',
        styleConfig: {
          backgroundColor: '#1c1917',
          border: { enabled: false, color: '#44403c', width: 0, radius: 0, style: 'solid' },
        },
        order: 0,
      },
    },
    properties: {
      pfp: {
        id: crypto.randomUUID(),
        key: 'pfp',
        type: 'pfp',
        sectionNodeId: sectionId,
        metadata: {
          label: 'Profile Picture',
          uiConfig: { x: 10, y: 10, width: 100, height: 100, labelPosition: 'hidden' },
          style: {
            border: { enabled: true, color: '#44403c', width: 2, radius: 8, style: 'solid' },
            backgroundColor: '#292524',
          },
        },
      },
      name: {
        id: crypto.randomUUID(),
        key: 'name',
        type: 'text',
        sectionNodeId: sectionId,
        metadata: {
          label: 'Name',
          uiConfig: { x: 120, y: 10, width: 310, height: 40, labelFontSize: 10, valueFontSize: 18, labelPosition: 'top' },
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

export function getPropertiesForNode(data: TemplateData, nodeId: string): PropertyDefinition[] {
  return Object.values(data.properties).filter(p => p.sectionNodeId === nodeId);
}

export function getChildNodes(data: TemplateData, parentId: string | null): LayoutNode[] {
  return Object.values(data.layoutNodes)
    .filter(n => n.parentId === parentId)
    .sort((a, b) => a.order - b.order);
}

export function getRootNodes(data: TemplateData): LayoutNode[] {
  return getChildNodes(data, null);
}

export function isNodeVisible(data: TemplateData, nodeId: string): boolean {
  const node = data.layoutNodes[nodeId];
  if (!node) return false;
  if (node.styleConfig?.visibility === 'hidden') return false;

  if (node.parentId) {
    const parent = data.layoutNodes[node.parentId];
    if (parent?.type === 'tab' && parent.behaviorConfig?.tabConfig) {
      const activeChildId = parent.behaviorConfig.tabConfig.activeTabId;
      if (activeChildId && activeChildId !== nodeId) return false;
    }
    return isNodeVisible(data, node.parentId);
  }

  return true;
}

export function getAllVisibleSectionIds(data: TemplateData): string[] {
  return Object.values(data.layoutNodes)
    .filter(n => n.type === 'section' && isNodeVisible(data, n.id))
    .map(n => n.id);
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
    case 'pfp': return '';
    case 'formula': return 0;
  }
}

export function migrateTemplateData(raw: any): TemplateData {
  if (raw.version === 2 && raw.canvas && raw.layoutNodes) {
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
  const sectionIdMap: Record<string, string> = {};

  if (raw.sections && Array.isArray(raw.sections)) {
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
  }

  if (Object.keys(layoutNodes).length === 0) {
    const sectionId = crypto.randomUUID();
    layoutNodes[sectionId] = {
      id: sectionId,
      type: 'section',
      name: 'Main',
      parentId: null,
      childrenIds: [],
      positionConfig: { x: 0, y: 0 },
      sizeConfig: { width: canvas.width, height: canvas.height },
      layoutMode: 'freeform',
      styleConfig: { backgroundColor: '#1c1917' },
      order: 0,
    };
    sectionIdMap['default'] = sectionId;
  }

  const firstSectionNodeId = Object.keys(layoutNodes)[0];

  if (raw.properties && typeof raw.properties === 'object' && !Array.isArray(raw.properties)) {
    for (const [key, prop] of Object.entries(raw.properties as Record<string, any>)) {
      const oldSectionId = prop.sectionId;
      const newSectionNodeId = sectionIdMap[oldSectionId] || firstSectionNodeId;
      newProperties[key] = {
        ...prop,
        sectionNodeId: newSectionNodeId,
      };
      if ('sectionId' in newProperties[key]) {
        delete (newProperties[key] as any).sectionId;
      }
    }
  } else if (Array.isArray(raw.properties)) {
    const headerNodeId = Object.values(layoutNodes).find(n => n.name === 'Header')?.id || firstSectionNodeId;
    const bodyNodeId = Object.values(layoutNodes).find(n => n.name === 'Body')?.id || firstSectionNodeId;

    for (const p of raw.properties) {
      if (p.type === 'panel' || p.type === 'tab') continue;
      let targetNodeId = bodyNodeId;
      if (p.parentId) {
        const parent = raw.properties.find((pp: any) => pp.id === p.parentId);
        if (parent?.key === 'header' || parent?.location === 'header') {
          targetNodeId = headerNodeId;
        }
      }
      const propType = p.type === 'checkbox' ? 'boolean' : p.type === 'select' ? 'list' : p.type === 'textarea' ? 'text' : p.type;
      newProperties[p.key] = {
        id: p.id,
        key: p.key,
        type: propType,
        sectionNodeId: targetNodeId,
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

  return {
    version: 2,
    type: raw.type || 'character',
    canvas,
    layoutNodes,
    properties: newProperties,
    settings: raw.settings || { defaultWidth: 450, defaultHeight: 550 },
  };
}
