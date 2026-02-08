import crypto from "crypto";

function uid(): string {
  return crypto.randomUUID();
}

const SECTION_STYLE = {
  backgroundColor: '#292524',
  border: { enabled: true, color: '#44403c', width: 1, radius: 8, style: 'solid' },
  padding: 8,
};

const LABEL_COLOR = '#a8a29e';
const VALUE_COLOR = '#e7e5e4';
const HEADER_COLOR = '#d97706';

function makeSection(name: string, parentId: string, order: number, childrenIds: string[]): any {
  const id = uid();
  return {
    id,
    node: {
      id,
      type: 'section',
      name,
      parentId,
      childrenIds,
      positionConfig: { x: 0, y: 0 },
      sizeConfig: { width: 480, height: 0 },
      layoutMode: 'stack' as const,
      stackConfig: { direction: 'vertical' as const, gap: 4 },
      styleConfig: { ...SECTION_STYLE },
      order,
    },
  };
}

function makeNumberProp(key: string, label: string, parentId: string, opts: any = {}): any {
  const id = uid();
  return {
    id,
    prop: {
      id,
      key,
      type: 'number',
      parentId,
      defaultValue: opts.defaultValue ?? 0,
      metadata: {
        label,
        tooltip: opts.tooltip,
        uiConfig: { width: opts.width ?? 80, height: 40, labelFontSize: 10, valueFontSize: 14, labelPosition: 'top' as const },
        style: { labelColor: LABEL_COLOR, valueColor: VALUE_COLOR, fontWeight: opts.bold ? 'bold' : undefined },
        calculationExpression: opts.calculationExpression,
        labelVisibility: true,
      },
    },
  };
}

function makeTextProp(key: string, label: string, parentId: string, opts: any = {}): any {
  const id = uid();
  return {
    id,
    prop: {
      id,
      key,
      type: 'text',
      parentId,
      defaultValue: opts.defaultValue ?? '',
      metadata: {
        label,
        uiConfig: {
          width: opts.width ?? 120,
          height: opts.height ?? 40,
          labelFontSize: opts.labelFontSize ?? 10,
          valueFontSize: opts.valueFontSize ?? 14,
          labelPosition: opts.labelPosition ?? ('top' as const),
        },
        style: { labelColor: LABEL_COLOR, valueColor: VALUE_COLOR },
        labelVisibility: true,
      },
    },
  };
}

function makeRollButton(key: string, label: string, parentId: string, formula: string, color: string, opts: any = {}): any {
  const id = uid();
  return {
    id,
    prop: {
      id,
      key,
      type: 'button',
      parentId,
      metadata: {
        label,
        uiConfig: { width: opts.width ?? 100, height: opts.height ?? 32, labelPosition: 'hidden' as const },
        buttonConfig: {
          rollFormula: formula,
          label,
          color,
          ...(opts.resourceCost ? { resourceCost: opts.resourceCost } : {}),
        },
      },
    },
  };
}

export function buildCharacterTemplateData(): any {
  const canvasId = uid();

  const layoutNodes: Record<string, any> = {};
  const properties: Record<string, any> = {};

  const rootTabId = uid();
  const statsTabId = uid();
  const skillsTabId = uid();
  const combatTabId = uid();
  const notesTabId = uid();

  const identitySectionId = uid();
  const vitalsSectionId = uid();
  const attributesSectionId = uid();

  const mightSkillsSectionId = uid();
  const finesseSkillsSectionId = uid();
  const witSkillsSectionId = uid();
  const presenceSkillsSectionId = uid();
  const willSkillsSectionId = uid();
  const craftSkillsSectionId = uid();

  const combatSectionId = uid();
  const notesSectionId = uid();

  layoutNodes[rootTabId] = {
    id: rootTabId,
    type: 'tab',
    name: 'Main Tabs',
    parentId: null,
    childrenIds: [statsTabId, skillsTabId, combatTabId, notesTabId],
    positionConfig: { x: 0, y: 0 },
    sizeConfig: { width: 500, height: 700 },
    layoutMode: 'stack',
    stackConfig: { direction: 'vertical', gap: 0 },
    behaviorConfig: {
      tabConfig: {
        tabPosition: 'top',
        activeTabId: statsTabId,
        tabButtonStyle: { backgroundColor: '#1c1917', textColor: '#a8a29e' },
        activeTabButtonStyle: { backgroundColor: '#292524', textColor: '#d97706' },
      },
    },
    order: 0,
  };

  layoutNodes[statsTabId] = {
    id: statsTabId,
    type: 'section',
    name: 'Stats',
    parentId: rootTabId,
    childrenIds: [identitySectionId, vitalsSectionId, attributesSectionId],
    positionConfig: { x: 0, y: 0 },
    sizeConfig: { width: 500, height: 600 },
    layoutMode: 'stack',
    stackConfig: { direction: 'vertical', gap: 8 },
    styleConfig: { padding: 8 },
    order: 0,
  };

  layoutNodes[skillsTabId] = {
    id: skillsTabId,
    type: 'section',
    name: 'Skills',
    parentId: rootTabId,
    childrenIds: [mightSkillsSectionId, finesseSkillsSectionId, witSkillsSectionId, presenceSkillsSectionId, willSkillsSectionId, craftSkillsSectionId],
    positionConfig: { x: 0, y: 0 },
    sizeConfig: { width: 500, height: 600 },
    layoutMode: 'stack',
    stackConfig: { direction: 'vertical', gap: 8 },
    styleConfig: { padding: 8 },
    order: 1,
  };

  layoutNodes[combatTabId] = {
    id: combatTabId,
    type: 'section',
    name: 'Combat',
    parentId: rootTabId,
    childrenIds: [combatSectionId],
    positionConfig: { x: 0, y: 0 },
    sizeConfig: { width: 500, height: 600 },
    layoutMode: 'stack',
    stackConfig: { direction: 'vertical', gap: 8 },
    styleConfig: { padding: 8 },
    order: 2,
  };

  layoutNodes[notesTabId] = {
    id: notesTabId,
    type: 'section',
    name: 'Notes',
    parentId: rootTabId,
    childrenIds: [notesSectionId],
    positionConfig: { x: 0, y: 0 },
    sizeConfig: { width: 500, height: 600 },
    layoutMode: 'stack',
    stackConfig: { direction: 'vertical', gap: 8 },
    styleConfig: { padding: 8 },
    order: 3,
  };

  // Identity Section
  layoutNodes[identitySectionId] = {
    id: identitySectionId,
    type: 'section',
    name: 'Identity',
    parentId: statsTabId,
    childrenIds: [],
    positionConfig: { x: 0, y: 0 },
    sizeConfig: { width: 480, height: 0 },
    layoutMode: 'grid',
    gridConfig: { columns: 4, rows: 2, gap: 6 },
    styleConfig: { ...SECTION_STYLE },
    order: 0,
  };

  const pfpProp = {
    id: uid(), key: 'pfp', type: 'pfp', parentId: identitySectionId,
    metadata: {
      label: 'Profile Picture',
      uiConfig: { width: 100, height: 100, labelPosition: 'hidden' as const, gridColumn: 1, gridRow: 1, gridRowSpan: 2 },
      style: { border: { enabled: true, color: '#44403c', width: 2, radius: 8, style: 'solid' }, backgroundColor: '#1c1917' },
    },
  };
  properties['pfp'] = pfpProp;

  const nameProp = makeTextProp('name', 'Character Name', identitySectionId, { width: 200, height: 40, valueFontSize: 18, labelFontSize: 10 });
  properties['name'] = nameProp.prop;

  const raceProp = makeTextProp('race', 'Race / Species', identitySectionId, { width: 120 });
  properties['race'] = raceProp.prop;

  const levelProp = makeNumberProp('level', 'Level', identitySectionId, { defaultValue: 1, width: 60 });
  properties['level'] = levelProp.prop;

  // Vitals Section
  layoutNodes[vitalsSectionId] = {
    id: vitalsSectionId,
    type: 'section',
    name: 'Vitals',
    parentId: statsTabId,
    childrenIds: [],
    positionConfig: { x: 0, y: 0 },
    sizeConfig: { width: 480, height: 0 },
    layoutMode: 'grid',
    gridConfig: { columns: 3, rows: 4, gap: 6 },
    styleConfig: { ...SECTION_STYLE },
    order: 1,
  };

  const hpId = uid();
  properties['hp'] = {
    id: hpId, key: 'hp', type: 'resource', parentId: vitalsSectionId,
    defaultValue: '{"current":20,"max":20}',
    metadata: {
      label: 'Hit Points',
      uiConfig: { width: 200, height: 50, labelFontSize: 10, valueFontSize: 14, labelPosition: 'top', gridColumn: 1, gridColumnSpan: 2 },
      style: { labelColor: LABEL_COLOR, valueColor: VALUE_COLOR },
      resourceConfig: {
        showMax: true, showBar: true, useGradient: true,
        colorThresholds: [
          { percent: 100, color: '#22c55e' },
          { percent: 50, color: '#eab308' },
          { percent: 25, color: '#ef4444' },
        ],
      },
      labelVisibility: true,
    },
  };

  const energyId = uid();
  properties['energy'] = {
    id: energyId, key: 'energy', type: 'resource', parentId: vitalsSectionId,
    defaultValue: '{"current":10,"max":10}',
    metadata: {
      label: 'Energy',
      uiConfig: { width: 200, height: 50, labelFontSize: 10, valueFontSize: 14, labelPosition: 'top', gridColumn: 1, gridColumnSpan: 2 },
      style: { labelColor: LABEL_COLOR, valueColor: VALUE_COLOR },
      resourceConfig: { showMax: true, showBar: true, barColor: '#3b82f6' },
      labelVisibility: true,
    },
  };

  const exhaustion = makeNumberProp('exhaustion', 'Exhaustion', vitalsSectionId, {
    defaultValue: 0,
    tooltip: 'Exhaustion level (0-7). Each level imposes increasing penalties.',
    width: 70,
  });
  properties['exhaustion'] = exhaustion.prop;

  const naturalArmor = makeNumberProp('naturalArmor', 'Natural Armor', vitalsSectionId, { defaultValue: 5, width: 80 });
  properties['naturalArmor'] = naturalArmor.prop;

  const speed = makeNumberProp('speed', 'Speed', vitalsSectionId, { defaultValue: 30, width: 70 });
  properties['speed'] = speed.prop;

  const flySpeed = makeNumberProp('flySpeed', 'Fly Speed', vitalsSectionId, { defaultValue: 0, width: 70 });
  properties['flySpeed'] = flySpeed.prop;

  const sizeProp = makeTextProp('size', 'Size', vitalsSectionId, { defaultValue: 'Medium', width: 80 });
  properties['size'] = sizeProp.prop;

  const sizeBonus = makeNumberProp('sizeBonus', 'Size Bonus', vitalsSectionId, { defaultValue: 0, width: 70 });
  properties['sizeBonus'] = sizeBonus.prop;

  const dc = makeNumberProp('dc', 'Defense Class', vitalsSectionId, {
    defaultValue: 5,
    calculationExpression: 'naturalArmor + sizeBonus',
    width: 80,
    bold: true,
  });
  properties['dc'] = dc.prop;

  // Attributes Section
  layoutNodes[attributesSectionId] = {
    id: attributesSectionId,
    type: 'section',
    name: 'Attributes',
    parentId: statsTabId,
    childrenIds: [],
    positionConfig: { x: 0, y: 0 },
    sizeConfig: { width: 480, height: 0 },
    layoutMode: 'grid',
    gridConfig: { columns: 3, rows: 4, gap: 6 },
    styleConfig: { ...SECTION_STYLE },
    order: 2,
  };

  const attrLabel = {
    id: uid(), key: '_attrHeader', type: 'label', parentId: attributesSectionId,
    metadata: {
      label: 'Attributes',
      uiConfig: { width: 460, height: 24, labelFontSize: 14, labelPosition: 'hidden', gridColumn: 1, gridColumnSpan: 3 },
      style: { textColor: HEADER_COLOR, fontWeight: 'bold' },
    },
  };
  properties['_attrHeader'] = attrLabel;

  const attrs = [
    { key: 'might', label: 'Might', color: '#dc2626', rollKey: 'mightRoll', rollLabel: 'Roll Might' },
    { key: 'finesse', label: 'Finesse', color: '#16a34a', rollKey: 'finesseRoll', rollLabel: 'Roll Finesse' },
    { key: 'wit', label: 'Wit', color: '#2563eb', rollKey: 'witRoll', rollLabel: 'Roll Wit' },
    { key: 'presence', label: 'Presence', color: '#9333ea', rollKey: 'presenceRoll', rollLabel: 'Roll Presence' },
    { key: 'will', label: 'Will', color: '#ca8a04', rollKey: 'willRoll', rollLabel: 'Roll Will' },
    { key: 'craft', label: 'Craft', color: '#0891b2', rollKey: 'craftRoll', rollLabel: 'Roll Craft' },
  ];

  for (const attr of attrs) {
    const np = makeNumberProp(attr.key, attr.label, attributesSectionId, { defaultValue: 0, bold: true, width: 70 });
    properties[attr.key] = np.prop;

    const rb = makeRollButton(attr.rollKey, attr.rollLabel, attributesSectionId, `1d30 + {{${attr.key}}}`, attr.color, { width: 90, height: 30 });
    properties[attr.rollKey] = rb.prop;
  }

  // Skills Sections
  const skillGroups = [
    {
      sectionId: mightSkillsSectionId, name: 'Might Skills', parentId: skillsTabId, order: 0, parentAttr: 'might', color: '#dc2626',
      skills: [
        { key: 'skillStrength', label: 'Strength', rollKey: 'strengthRoll', rollLabel: 'Roll Strength' },
        { key: 'skillIntimidation', label: 'Intimidation', rollKey: 'intimidationRoll', rollLabel: 'Roll Intimidation' },
      ],
    },
    {
      sectionId: finesseSkillsSectionId, name: 'Finesse Skills', parentId: skillsTabId, order: 1, parentAttr: 'finesse', color: '#16a34a',
      skills: [
        { key: 'skillAgility', label: 'Agility', rollKey: 'agilityRoll', rollLabel: 'Roll Agility' },
        { key: 'skillStealth', label: 'Stealth', rollKey: 'stealthRoll', rollLabel: 'Roll Stealth' },
        { key: 'skillSleightOfHand', label: 'Sleight of Hand', rollKey: 'sleightRoll', rollLabel: 'Roll Sleight of Hand' },
      ],
    },
    {
      sectionId: witSkillsSectionId, name: 'Wit Skills', parentId: skillsTabId, order: 2, parentAttr: 'wit', color: '#2563eb',
      skills: [
        { key: 'skillArcana', label: 'Arcana', rollKey: 'arcanaRoll', rollLabel: 'Roll Arcana' },
        { key: 'skillInvestigation', label: 'Investigation', rollKey: 'investigationRoll', rollLabel: 'Roll Investigation' },
        { key: 'skillHistory', label: 'History', rollKey: 'historyRoll', rollLabel: 'Roll History' },
        { key: 'skillMedicine', label: 'Medicine', rollKey: 'medicineRoll', rollLabel: 'Roll Medicine' },
        { key: 'skillCulture', label: 'Culture', rollKey: 'cultureRoll', rollLabel: 'Roll Culture' },
      ],
    },
    {
      sectionId: presenceSkillsSectionId, name: 'Presence Skills', parentId: skillsTabId, order: 3, parentAttr: 'presence', color: '#9333ea',
      skills: [
        { key: 'skillCharisma', label: 'Charisma', rollKey: 'charismaRoll', rollLabel: 'Roll Charisma' },
        { key: 'skillDeception', label: 'Deception', rollKey: 'deceptionRoll', rollLabel: 'Roll Deception' },
      ],
    },
    {
      sectionId: willSkillsSectionId, name: 'Will Skills', parentId: skillsTabId, order: 4, parentAttr: 'will', color: '#ca8a04',
      skills: [
        { key: 'skillWisdom', label: 'Wisdom', rollKey: 'wisdomRoll', rollLabel: 'Roll Wisdom' },
        { key: 'skillPerception', label: 'Perception', rollKey: 'perceptionRoll', rollLabel: 'Roll Perception' },
        { key: 'skillConcentration', label: 'Concentration', rollKey: 'concentrationRoll', rollLabel: 'Roll Concentration' },
        { key: 'skillSurvival', label: 'Survival', rollKey: 'survivalRoll', rollLabel: 'Roll Survival' },
      ],
    },
    {
      sectionId: craftSkillsSectionId, name: 'Craft Skills', parentId: skillsTabId, order: 5, parentAttr: 'craft', color: '#0891b2',
      skills: [
        { key: 'skillBeastHandling', label: 'Beast Handling', rollKey: 'beastHandlingRoll', rollLabel: 'Roll Beast Handling' },
      ],
    },
  ];

  for (const group of skillGroups) {
    layoutNodes[group.sectionId] = {
      id: group.sectionId,
      type: 'section',
      name: group.name,
      parentId: group.parentId,
      childrenIds: [],
      positionConfig: { x: 0, y: 0 },
      sizeConfig: { width: 480, height: 0 },
      layoutMode: 'grid',
      gridConfig: { columns: 3, rows: Math.ceil((group.skills.length * 2 + 1) / 3), gap: 4 },
      styleConfig: { ...SECTION_STYLE },
      order: group.order,
    };

    const headerKey = `_${group.parentAttr}SkillsHeader`;
    properties[headerKey] = {
      id: uid(), key: headerKey, type: 'label', parentId: group.sectionId,
      metadata: {
        label: group.name,
        uiConfig: { width: 460, height: 22, labelFontSize: 12, labelPosition: 'hidden', gridColumn: 1, gridColumnSpan: 3 },
        style: { textColor: HEADER_COLOR, fontWeight: 'bold' },
      },
    };

    for (const skill of group.skills) {
      const sp = makeNumberProp(skill.key, skill.label, group.sectionId, { defaultValue: 0, width: 70 });
      properties[skill.key] = sp.prop;

      const formula = `1d30 + {{${group.parentAttr}}} + {{${skill.key}}}`;
      const rb = makeRollButton(skill.rollKey, skill.rollLabel, group.sectionId, formula, group.color, { width: 100, height: 28 });
      properties[skill.rollKey] = rb.prop;
    }
  }

  // Combat Section
  layoutNodes[combatSectionId] = {
    id: combatSectionId,
    type: 'section',
    name: 'Combat',
    parentId: combatTabId,
    childrenIds: [],
    positionConfig: { x: 0, y: 0 },
    sizeConfig: { width: 480, height: 0 },
    layoutMode: 'stack',
    stackConfig: { direction: 'vertical', gap: 8 },
    styleConfig: { ...SECTION_STYLE },
    order: 0,
  };

  const combatHeader = {
    id: uid(), key: '_combatHeader', type: 'label', parentId: combatSectionId,
    metadata: {
      label: 'Combat',
      uiConfig: { width: 460, height: 24, labelFontSize: 14, labelPosition: 'hidden' },
      style: { textColor: HEADER_COLOR, fontWeight: 'bold' },
    },
  };
  properties['_combatHeader'] = combatHeader;

  const initRoll = makeRollButton('initiativeRoll', 'Roll Initiative', combatSectionId, '1d30 + {{finesse}}', '#f59e0b', { width: 160, height: 36 });
  properties['initiativeRoll'] = initRoll.prop;

  const dcDisplay = makeNumberProp('_dcDisplay', 'Defense Class (DC)', combatSectionId, {
    calculationExpression: 'naturalArmor + sizeBonus',
    bold: true,
    width: 120,
  });
  properties['_dcDisplay'] = dcDisplay.prop;

  // Notes Section
  layoutNodes[notesSectionId] = {
    id: notesSectionId,
    type: 'section',
    name: 'Notes',
    parentId: notesTabId,
    childrenIds: [],
    positionConfig: { x: 0, y: 0 },
    sizeConfig: { width: 480, height: 0 },
    layoutMode: 'stack',
    stackConfig: { direction: 'vertical', gap: 8 },
    styleConfig: { ...SECTION_STYLE },
    order: 0,
  };

  const bioId = uid();
  properties['biography'] = {
    id: bioId, key: 'biography', type: 'textarea', parentId: notesSectionId,
    defaultValue: '',
    metadata: {
      label: 'Biography',
      uiConfig: { width: 460, height: 150, labelFontSize: 11, valueFontSize: 13, labelPosition: 'top' },
      style: { labelColor: LABEL_COLOR, valueColor: VALUE_COLOR, backgroundColor: '#1c1917', border: { enabled: true, color: '#44403c', width: 1, radius: 6, style: 'solid' } },
      labelVisibility: true,
    },
  };

  const gmNotesId = uid();
  properties['gmNotes'] = {
    id: gmNotesId, key: 'gmNotes', type: 'textarea', parentId: notesSectionId,
    defaultValue: '',
    metadata: {
      label: 'GM Notes',
      uiConfig: { width: 460, height: 150, labelFontSize: 11, valueFontSize: 13, labelPosition: 'top' },
      style: { labelColor: '#ef4444', valueColor: VALUE_COLOR, backgroundColor: '#1c1917', border: { enabled: true, color: '#7f1d1d', width: 1, radius: 6, style: 'solid' } },
      permissions: { gmOnly: true },
      labelVisibility: true,
    },
  };

  return {
    version: 3,
    type: 'character',
    canvas: {
      id: canvasId,
      width: 500,
      height: 700,
      backgroundConfig: { backgroundColor: '#1c1917' },
    },
    layoutNodes,
    properties,
    settings: {
      defaultWidth: 500,
      defaultHeight: 700,
      allowResize: true,
    },
  };
}

export function buildWeaponTemplateData(): any {
  const canvasId = uid();
  const layoutNodes: Record<string, any> = {};
  const properties: Record<string, any> = {};

  const mainSectionId = uid();
  layoutNodes[mainSectionId] = {
    id: mainSectionId,
    type: 'section',
    name: 'Weapon Info',
    parentId: null,
    childrenIds: [],
    positionConfig: { x: 0, y: 0 },
    sizeConfig: { width: 350, height: 0 },
    layoutMode: 'stack',
    stackConfig: { direction: 'vertical', gap: 6 },
    styleConfig: { ...SECTION_STYLE },
    order: 0,
  };

  const nameProp = makeTextProp('name', 'Weapon Name', mainSectionId, { width: 300, valueFontSize: 16 });
  properties['name'] = nameProp.prop;

  const damageProp = makeTextProp('damage', 'Damage', mainSectionId, { width: 100, defaultValue: '1d8' });
  properties['damage'] = damageProp.prop;

  const damageTypeProp = makeTextProp('damageType', 'Damage Type', mainSectionId, { width: 120, defaultValue: 'Slashing' });
  properties['damageType'] = damageTypeProp.prop;

  const attributeProp = makeTextProp('attribute', 'Attribute', mainSectionId, { width: 100, defaultValue: 'might' });
  properties['attribute'] = attributeProp.prop;

  const rangeProp = makeNumberProp('range', 'Range (ft)', mainSectionId, { defaultValue: 5, width: 80 });
  properties['range'] = rangeProp.prop;

  const weightProp = makeNumberProp('weight', 'Weight', mainSectionId, { defaultValue: 3, width: 70 });
  properties['weight'] = weightProp.prop;

  const descId = uid();
  properties['description'] = {
    id: descId, key: 'description', type: 'textarea', parentId: mainSectionId,
    defaultValue: '',
    metadata: {
      label: 'Description',
      uiConfig: { width: 320, height: 80, labelFontSize: 10, valueFontSize: 12, labelPosition: 'top' },
      style: { labelColor: LABEL_COLOR, valueColor: VALUE_COLOR, backgroundColor: '#1c1917', border: { enabled: true, color: '#44403c', width: 1, radius: 6, style: 'solid' } },
      labelVisibility: true,
    },
  };

  const attackRoll = makeRollButton('attackRoll', 'Attack Roll', mainSectionId, '1d30 + {{attribute}}', '#dc2626', { width: 120, height: 34 });
  properties['attackRoll'] = attackRoll.prop;

  const damageRoll = makeRollButton('damageRoll', 'Damage Roll', mainSectionId, '{{damage}}', '#f59e0b', { width: 120, height: 34 });
  properties['damageRoll'] = damageRoll.prop;

  return {
    version: 3,
    type: 'item',
    canvas: {
      id: canvasId,
      width: 380,
      height: 450,
      backgroundConfig: { backgroundColor: '#1c1917' },
    },
    layoutNodes,
    properties,
    settings: {
      defaultWidth: 380,
      defaultHeight: 450,
      allowResize: true,
    },
  };
}

export function buildSpellTemplateData(): any {
  const canvasId = uid();
  const layoutNodes: Record<string, any> = {};
  const properties: Record<string, any> = {};

  const mainSectionId = uid();
  layoutNodes[mainSectionId] = {
    id: mainSectionId,
    type: 'section',
    name: 'Spell Info',
    parentId: null,
    childrenIds: [],
    positionConfig: { x: 0, y: 0 },
    sizeConfig: { width: 350, height: 0 },
    layoutMode: 'stack',
    stackConfig: { direction: 'vertical', gap: 6 },
    styleConfig: { ...SECTION_STYLE },
    order: 0,
  };

  const nameProp = makeTextProp('name', 'Spell Name', mainSectionId, { width: 300, valueFontSize: 16 });
  properties['name'] = nameProp.prop;

  const spellLevelProp = makeNumberProp('spellLevel', 'Spell Level', mainSectionId, { defaultValue: 1, width: 80 });
  properties['spellLevel'] = spellLevelProp.prop;

  const damageProp = makeTextProp('damage', 'Damage', mainSectionId, { width: 100, defaultValue: '1d6' });
  properties['damage'] = damageProp.prop;

  const damageTypeProp = makeTextProp('damageType', 'Damage Type', mainSectionId, { width: 120, defaultValue: 'Fire' });
  properties['damageType'] = damageTypeProp.prop;

  const spellRangeProp = makeNumberProp('spellRange', 'Range (ft)', mainSectionId, { defaultValue: 60, width: 80 });
  properties['spellRange'] = spellRangeProp.prop;

  const attributeProp = makeTextProp('attribute', 'Casting Attribute', mainSectionId, { width: 120, defaultValue: 'wit' });
  properties['attribute'] = attributeProp.prop;

  const energyCostProp = makeNumberProp('energyCost', 'Energy Cost', mainSectionId, { defaultValue: 1, width: 80 });
  properties['energyCost'] = energyCostProp.prop;

  const descId = uid();
  properties['description'] = {
    id: descId, key: 'description', type: 'textarea', parentId: mainSectionId,
    defaultValue: '',
    metadata: {
      label: 'Description',
      uiConfig: { width: 320, height: 80, labelFontSize: 10, valueFontSize: 12, labelPosition: 'top' },
      style: { labelColor: LABEL_COLOR, valueColor: VALUE_COLOR, backgroundColor: '#1c1917', border: { enabled: true, color: '#44403c', width: 1, radius: 6, style: 'solid' } },
      labelVisibility: true,
    },
  };

  const castRoll = makeRollButton('castRoll', 'Cast Spell', mainSectionId, '1d30 + {{attribute}}', '#9333ea', {
    width: 120, height: 34,
    resourceCost: { propertyKey: 'energy', amount: 1 },
  });
  properties['castRoll'] = castRoll.prop;

  const damageRoll = makeRollButton('damageRoll', 'Damage Roll', mainSectionId, '{{damage}}', '#f59e0b', { width: 120, height: 34 });
  properties['damageRoll'] = damageRoll.prop;

  return {
    version: 3,
    type: 'item',
    canvas: {
      id: canvasId,
      width: 380,
      height: 500,
      backgroundConfig: { backgroundColor: '#1c1917' },
    },
    layoutNodes,
    properties,
    settings: {
      defaultWidth: 380,
      defaultHeight: 500,
      allowResize: true,
    },
  };
}
