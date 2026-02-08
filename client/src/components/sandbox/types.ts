// Property types supported by the system
export type PropertyType = 'number' | 'text' | 'boolean' | 'resource' | 'list' | 'formula' | 'pfp';

// Template types - what kind of sheet this template creates
export type TemplateType = 'character' | 'item' | 'vehicle' | 'beast' | 'custom';

// Section locations on the sheet
export type SectionLocation = 'header' | 'body' | 'footer' | 'left' | 'right';

// Layout modes for sections
export type LayoutMode = 'grid' | 'freeform';

// Tab positions on the sheet edge
export type TabPosition = 'top' | 'bottom' | 'left' | 'right';

// Style configuration for visual customization
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
}

// Grid configuration for grid layout mode
export interface GridConfig {
  columns: number;
  rows: number;
  gap: number;
  cellWidth?: number;
  cellHeight?: number;
}

// UI configuration for property positioning
export interface UIConfig {
  // Freeform positioning
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  // Grid positioning
  gridColumn?: number;
  gridRow?: number;
  gridColumnSpan?: number;
  gridRowSpan?: number;
  // Font sizes
  labelFontSize?: number;
  valueFontSize?: number;
  // Label position
  labelPosition?: 'top' | 'left' | 'hidden';
}

// Property metadata
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
  // For formula type
  formulaExpression?: string;
  // For list/select type  
  options?: string[];
  // For resource type
  resourceConfig?: {
    showMax?: boolean;
    showBar?: boolean;
    barColor?: string;
  };
}

// Property Definition (lives in template)
export interface PropertyDefinition {
  id: string;
  key: string;
  type: PropertyType;
  sectionId: string;
  defaultValue?: any;
  metadata: PropertyMetadata;
}

// Section (layout container in template)
export interface Section {
  id: string;
  name: string;
  location: SectionLocation;
  layoutMode: LayoutMode;
  gridConfig?: GridConfig;
  styleConfig?: StyleConfig;
  tabId?: string;
  order: number;
}

// Tab definition
export interface Tab {
  id: string;
  name: string;
  position: TabPosition;
  sectionIds: string[];
  visible: boolean;
  icon?: string;
  order: number;
}

// Full template data structure (stored in data JSON column)
export interface TemplateData {
  version: number;
  type: TemplateType;
  sections: Section[];
  tabs: Tab[];
  properties: Record<string, PropertyDefinition>;
  settings: {
    defaultWidth: number;
    defaultHeight: number;
    allowResize?: boolean;
  };
}

// Actor values (stored in actor data JSON column)
// Values are keyed by property.key
// For resource type: { current: number, max: number }
// For list type: string[]
// For everything else: string | number | boolean
export type ActorValue = string | number | boolean | { current: number; max: number } | string[];
export type ActorValues = Record<string, ActorValue>;

// Helper to create a default template data structure
export function createDefaultTemplateData(): TemplateData {
  const headerId = crypto.randomUUID();
  const bodyId = crypto.randomUUID();
  
  return {
    version: 1,
    type: 'character',
    sections: [
      {
        id: headerId,
        name: 'Header',
        location: 'header',
        layoutMode: 'freeform',
        styleConfig: {
          backgroundColor: '#1c1917',
          border: { enabled: true, color: '#44403c', width: 1, radius: 4, style: 'solid' },
        },
        order: 0,
      },
      {
        id: bodyId,
        name: 'Body',
        location: 'body',
        layoutMode: 'freeform',
        styleConfig: {
          backgroundColor: '#1c1917',
          border: { enabled: true, color: '#44403c', width: 1, radius: 4, style: 'solid' },
        },
        order: 1,
      },
    ],
    tabs: [],
    properties: {
      pfp: {
        id: crypto.randomUUID(),
        key: 'pfp',
        type: 'pfp',
        sectionId: headerId,
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
        sectionId: headerId,
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

// Helper: get properties for a given section
export function getPropertiesForSection(data: TemplateData, sectionId: string): PropertyDefinition[] {
  return Object.values(data.properties).filter(p => p.sectionId === sectionId);
}

// Helper: get sections for a given tab
export function getSectionsForTab(data: TemplateData, tabId: string): Section[] {
  return data.sections.filter(s => s.tabId === tabId).sort((a, b) => a.order - b.order);
}

// Helper: get sections not assigned to any tab, by location
export function getUntabbedSections(data: TemplateData, location: SectionLocation): Section[] {
  return data.sections.filter(s => s.location === location && !s.tabId).sort((a, b) => a.order - b.order);
}

// Helper: resolve actor value for a property
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
