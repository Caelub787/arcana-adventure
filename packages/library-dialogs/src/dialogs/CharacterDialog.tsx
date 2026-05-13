/**
 * <CharacterDialog> + <CharacterTemplateDialog>
 *
 * Full create/edit dialog for the `characters` table — both player
 * characters (`kind="character"`) and admin character templates
 * (`kind="character-template"`, `isTemplate=true`).
 *
 * Renders every flat column on `characters` (identity, pools, new + legacy
 * attributes, every `skill_*` column, vision, exhaustion, biography,
 * gmNotes, level-up bonus tracking) and mounts embedded editors for the
 * eight child collections that the server's `replaceCharacterChildren`
 * understands: items, spells, hotbars, customSkills, traits, feats,
 * classes, classSkills.
 *
 * Save bundles the character row + all eight child arrays into a single
 * sync upsert. The server's children-aware handler deletes
 * existing children and re-inserts the new set, performing FK ID remaps
 * on items+spells so hotbars referencing brand-new child rows resolve
 * correctly.
 */
import * as React from "react";
import {
  Button, Input, Textarea, Label, Checkbox, Select, SelectItem,
  Stack, Row, Grid2, Grid3, Section,
} from "../ui/primitives";
import { HostModal, SaveCancelFooter } from "../ui/DefaultModal";
import { optionalNum } from "../lib/utils";
import {
  CharacterItemsEditor, CharacterSpellsEditor, CharacterHotbarsEditor,
  CharacterCustomSkillsEditor, CharacterTraitsEditor, CharacterFeatsEditor,
  CharacterClassesEditor, CharacterClassSkillsEditor,
  type CharItemDraft, type CharSpellDraft, type CharHotbarDraft,
  type CharCustomSkillDraft, type CharTraitDraft, type CharFeatRefDraft,
  type CharClassDraft, type CharClassSkillDraft,
} from "../components/CharacterChildrenEditors";
import type { DialogProps } from "../types";

const VISION_TYPES = ["normal", "darkvision", "blindsight", "truesight", "tremorsense"] as const;
const SIZES = ["Tiny", "Small", "Medium", "Large", "Huge"] as const;

export interface CharacterDraft {
  id?: string;
  externalId?: string;
  externalUpdatedAt?: string;

  // Scope
  campaignId?: string | null;
  userId?: string | null;
  ownerUserId?: string | null;
  isTemplate?: boolean;
  folderId?: string | null;

  // Identity
  name: string;
  nickname?: string | null;
  portrait?: string | null;
  class?: string;
  level: number;
  race: string;
  size: string;
  sizeBonus: number;
  speed: number;
  flySpeed: number;
  lifespan: number;
  featTree?: string;

  // Pools
  hp: number;
  maxHp: number;
  energy: number;
  maxEnergy: number;
  mana: number;
  maxMana: number;
  naturalArmor: number;
  showHpBar: boolean;
  showEnergyBar: boolean;
  showManaBar: boolean;
  bonusHpFromLevelUps: number;
  lastLevelUpRolled: number;
  bonusEnergyFromLevelUps: number;
  lastEnergyLevelUpRolled: number;
  classSkillPoints: number;

  // Attributes (new)
  might: number;
  finesse: number;
  wit: number;
  presence: number;
  will: number;
  craft: number;

  // Attributes (legacy)
  agility: number;
  charisma: number;
  strength: number;
  wisdom: number;
  arcana: number;
  concentration: number;

  // Skills
  skillAgility: number;
  skillArcana: number;
  skillCharisma: number;
  skillConcentration: number;
  skillDeception: number;
  skillHistory: number;
  skillIntimidation: number;
  skillInvestigation: number;
  skillMedicine: number;
  skillPerception: number;
  skillSleightOfHand: number;
  skillStealth: number;
  skillStrength: number;
  skillWisdom: number;
  skillCulture: number;
  skillSurvival: number;
  skillBeastHandling: number;

  // Cancellations & exhaustion
  cancelledAttrPoints: number;
  cancelledSkillPoints: number;
  exhaustion: number;

  // Vision
  visionType: string;
  dayVisionDistance: number;
  nightVisionDistance: number;
  specialVisionNotes?: string | null;

  // Story
  hasMotivation?: boolean;
  biography?: string | null;
  gmNotes?: string | null;
  inventory?: string[];

  system?: string;

  // Children
  items?: CharItemDraft[];
  spells?: CharSpellDraft[];
  hotbars?: CharHotbarDraft[];
  customSkills?: CharCustomSkillDraft[];
  traits?: CharTraitDraft[];
  feats?: CharFeatRefDraft[];
  classes?: CharClassDraft[];
  classSkills?: CharClassSkillDraft[];
}

/**
 * Server GET/upsert shape. Children come back as the loose row arrays the
 * server enriches in `serializeCharacter` (see server/sync/children.ts);
 * we normalize them to our typed drafts on hydrate and serialize them
 * back without any structural transform on save.
 */
interface CharacterApiPayload extends Omit<CharacterDraft,
  "items" | "spells" | "hotbars" | "customSkills" | "traits" |
  "feats" | "classes" | "classSkills"> {
  items?: CharItemDraft[];
  spells?: CharSpellDraft[];
  hotbars?: CharHotbarDraft[];
  customSkills?: CharCustomSkillDraft[];
  traits?: CharTraitDraft[];
  feats?: CharFeatRefDraft[];
  classes?: CharClassDraft[];
  classSkills?: CharClassSkillDraft[];
}

const FRESH: CharacterDraft = {
  name: "",
  level: 1,
  race: "Human",
  size: "Medium",
  sizeBonus: 0,
  speed: 30,
  flySpeed: 0,
  lifespan: 100,
  featTree: "",
  hp: 10, maxHp: 10,
  energy: 5, maxEnergy: 5,
  mana: 0, maxMana: 0,
  naturalArmor: 5,
  showHpBar: true, showEnergyBar: true, showManaBar: true,
  bonusHpFromLevelUps: 0, lastLevelUpRolled: 1,
  bonusEnergyFromLevelUps: 0, lastEnergyLevelUpRolled: 1,
  classSkillPoints: 0,
  might: 0, finesse: 0, wit: 0, presence: 0, will: 0, craft: 0,
  agility: 0, charisma: 0, strength: 0, wisdom: 0, arcana: 0, concentration: 0,
  skillAgility: 0, skillArcana: 0, skillCharisma: 0, skillConcentration: 0,
  skillDeception: 0, skillHistory: 0, skillIntimidation: 0, skillInvestigation: 0,
  skillMedicine: 0, skillPerception: 0, skillSleightOfHand: 0, skillStealth: 0,
  skillStrength: 0, skillWisdom: 0, skillCulture: 0, skillSurvival: 0, skillBeastHandling: 0,
  cancelledAttrPoints: 0, cancelledSkillPoints: 0,
  exhaustion: 0,
  visionType: "normal",
  dayVisionDistance: 60,
  nightVisionDistance: 30,
  hasMotivation: false,
  inventory: [],
  isTemplate: false,
  system: "aa-v2",
  items: [], spells: [], hotbars: [],
  customSkills: [], traits: [], feats: [], classes: [], classSkills: [],
};

interface CharacterDialogInternalProps extends DialogProps<CharacterDraft> {
  /** "character" (player char) or "character-template" (admin template). */
  kind?: "character" | "character-template";
  /** When true, hides campaignId / userId scope fields (template variant). */
  hideScopeFields?: boolean;
}

export const CharacterDialog: React.FC<CharacterDialogInternalProps> = ({
  open, onOpenChange, initialValue, onSaved, onCancel, host, campaignSystem, mode,
  kind = "character", hideScopeFields = false,
}) => {
  const [draft, setDraft] = React.useState<CharacterDraft>(FRESH);
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const editing = mode ? mode === "edit" : !!initialValue?.id;
  const isTemplateKind = kind === "character-template";

  React.useEffect(() => {
    if (!open) return;
    if (!initialValue?.id) {
      setDraft({ ...FRESH, ...(initialValue ?? {}), isTemplate: isTemplateKind });
      return;
    }
    setLoading(true);
    host.transport.get<CharacterApiPayload>(kind, initialValue.id)
      .then(env => {
        const data = env.data;
        setDraft({
          ...FRESH,
          ...data,
          isTemplate: isTemplateKind,
          items: data.items ?? [],
          spells: data.spells ?? [],
          hotbars: data.hotbars ?? [],
          customSkills: data.customSkills ?? [],
          traits: data.traits ?? [],
          feats: data.feats ?? [],
          classes: data.classes ?? [],
          classSkills: data.classSkills ?? [],
        });
      })
      .catch(e => host.notify("error", `Failed to load character: ${e instanceof Error ? e.message : String(e)}`))
      .finally(() => setLoading(false));
  }, [open, initialValue?.id, host, kind, isTemplateKind]);

  const set = (patch: Partial<CharacterDraft>) => setDraft(d => ({ ...d, ...patch }));
  const setNum = (field: keyof CharacterDraft, fallback = 0) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      set({ [field]: optionalNum(e.target.value) ?? fallback } as Partial<CharacterDraft>);

  const handleSave = async () => {
    if (!draft.name.trim()) { host.notify("warning", "Character name is required."); return; }
    setSaving(true);
    try {
      const { items, spells, hotbars, customSkills, traits, feats, classes, classSkills, ...parent } = draft;
      const payload: CharacterApiPayload = {
        ...parent,
        isTemplate: isTemplateKind,
        items: items ?? [], spells: spells ?? [], hotbars: hotbars ?? [],
        customSkills: customSkills ?? [], traits: traits ?? [],
        feats: feats ?? [], classes: classes ?? [], classSkills: classSkills ?? [],
      };
      const env = editing
        ? await host.transport.patch<CharacterApiPayload>(kind, draft.id!, payload)
        : await host.transport.upsert<CharacterApiPayload>(kind, payload);
      const saved: CharacterDraft & { id: string; externalId?: string | null } = {
        ...env.data,
        id: env.id,
        externalId: env.externalId ?? undefined,
      };
      host.notify("success", editing ? "Character updated." : "Character created.");
      onSaved?.(saved);
      onOpenChange(false);
    } catch (e: unknown) {
      host.notify("error", `Save failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSaving(false);
    }
  };

  const title = isTemplateKind
    ? (editing ? "Edit Character Template" : "Create Character Template")
    : (editing ? "Edit Character" : "Create Character");

  return (
    <HostModal
      component={host.modal}
      open={open}
      onOpenChange={(o) => { if (!o) onCancel?.(); onOpenChange(o); }}
      title={title}
      description={isTemplateKind
        ? "Admin character template (isTemplate=true). Becomes a starter for new characters."
        : "Player or NPC character. Bundled with all child rows in a single sync upsert."}
      footer={<SaveCancelFooter onCancel={() => { onCancel?.(); onOpenChange(false); }} onSave={handleSave} saving={saving} />}
    >
      {loading ? <div className="ld-subtle">Loading…</div> : (
        <Stack data-ld-root>
          <Section title="Identity">
            <Stack gap="sm">
              <Grid3>
                <div><Label required>Name</Label>
                  <Input value={draft.name} onChange={e => set({ name: e.target.value })} data-testid="input-character-name" />
                </div>
                <div><Label>Nickname (token label)</Label>
                  <Input value={draft.nickname ?? ""} onChange={e => set({ nickname: e.target.value || null })} />
                </div>
                <div><Label>Portrait URL</Label>
                  <Row>
                    <Input value={draft.portrait ?? ""} onChange={e => set({ portrait: e.target.value || null })} data-testid="input-character-portrait" />
                    {host.imagePicker && (
                      <Button size="sm" onClick={async () => {
                        const r = await host.imagePicker!({ title: "Pick portrait", initialUrl: draft.portrait ?? undefined });
                        if (r) set({ portrait: r.url });
                      }}>Pick…</Button>
                    )}
                  </Row>
                </div>
              </Grid3>
              <Grid3>
                <div><Label>Race</Label>
                  <Input value={draft.race} onChange={e => set({ race: e.target.value })} />
                </div>
                <div><Label>Size</Label>
                  <Select value={draft.size} onValueChange={v => set({ size: v })}>
                    {SIZES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </Select>
                </div>
                <div><Label>Size bonus</Label>
                  <Input type="number" value={draft.sizeBonus} onChange={setNum("sizeBonus")} />
                </div>
                <div><Label>Level</Label>
                  <Input type="number" value={draft.level} onChange={setNum("level", 1)} />
                </div>
                <div><Label>Class (legacy text)</Label>
                  <Input value={draft.class ?? ""} onChange={e => set({ class: e.target.value })} />
                </div>
                <div><Label>Feat tree id</Label>
                  <Input value={draft.featTree ?? ""} onChange={e => set({ featTree: e.target.value })} />
                </div>
                <div><Label>Speed</Label>
                  <Input type="number" value={draft.speed} onChange={setNum("speed", 30)} />
                </div>
                <div><Label>Fly speed</Label>
                  <Input type="number" value={draft.flySpeed} onChange={setNum("flySpeed")} />
                </div>
                <div><Label>Lifespan</Label>
                  <Input type="number" value={draft.lifespan} onChange={setNum("lifespan", 100)} />
                </div>
              </Grid3>
              {!hideScopeFields && (
                <Grid3>
                  <div><Label>Campaign id</Label>
                    <Input value={draft.campaignId ?? ""} onChange={e => set({ campaignId: e.target.value || null })} />
                  </div>
                  <div><Label>User id (player)</Label>
                    <Input value={draft.userId ?? ""} onChange={e => set({ userId: e.target.value || null })} />
                  </div>
                  <div><Label>Owner user id</Label>
                    <Input value={draft.ownerUserId ?? ""} onChange={e => set({ ownerUserId: e.target.value || null })} data-testid="input-character-owner" />
                  </div>
                  <div><Label>Folder id</Label>
                    <Input value={draft.folderId ?? ""} onChange={e => set({ folderId: e.target.value || null })} />
                  </div>
                  <div style={{ gridColumn: "span 2" }}><Label>Legacy inventory (comma-separated)</Label>
                    <Input
                      value={(draft.inventory ?? []).join(", ")}
                      onChange={e => set({
                        inventory: e.target.value.split(",").map(s => s.trim()).filter(Boolean),
                      })}
                      data-testid="input-character-legacy-inventory"
                    />
                  </div>
                </Grid3>
              )}
            </Stack>
          </Section>

          <Section title="Pools">
            <Grid3>
              <div><Label>HP</Label>
                <Input type="number" value={draft.hp} onChange={setNum("hp", 10)} />
              </div>
              <div><Label>Max HP</Label>
                <Input type="number" value={draft.maxHp} onChange={setNum("maxHp", 10)} />
              </div>
              <div><Label>Natural armor (DC)</Label>
                <Input type="number" value={draft.naturalArmor} onChange={setNum("naturalArmor", 5)} />
              </div>
              <div><Label>Energy</Label>
                <Input type="number" value={draft.energy} onChange={setNum("energy", 5)} />
              </div>
              <div><Label>Max Energy</Label>
                <Input type="number" value={draft.maxEnergy} onChange={setNum("maxEnergy", 5)} />
              </div>
              <div><Label>Class skill points</Label>
                <Input type="number" value={draft.classSkillPoints} onChange={setNum("classSkillPoints")} />
              </div>
              <div><Label>Mana</Label>
                <Input type="number" value={draft.mana} onChange={setNum("mana")} />
              </div>
              <div><Label>Max Mana</Label>
                <Input type="number" value={draft.maxMana} onChange={setNum("maxMana")} />
              </div>
              <div />
              <Row><Checkbox checked={draft.showHpBar} onCheckedChange={v => set({ showHpBar: v })} /><Label>Show HP bar</Label></Row>
              <Row><Checkbox checked={draft.showEnergyBar} onCheckedChange={v => set({ showEnergyBar: v })} /><Label>Show energy bar</Label></Row>
              <Row><Checkbox checked={draft.showManaBar} onCheckedChange={v => set({ showManaBar: v })} /><Label>Show mana bar</Label></Row>
              <div><Label>Bonus HP from level-ups</Label>
                <Input type="number" value={draft.bonusHpFromLevelUps} onChange={setNum("bonusHpFromLevelUps")} />
              </div>
              <div><Label>Last level HP rolled at</Label>
                <Input type="number" value={draft.lastLevelUpRolled} onChange={setNum("lastLevelUpRolled", 1)} />
              </div>
              <div />
              <div><Label>Bonus energy from level-ups</Label>
                <Input type="number" value={draft.bonusEnergyFromLevelUps} onChange={setNum("bonusEnergyFromLevelUps")} />
              </div>
              <div><Label>Last level energy rolled at</Label>
                <Input type="number" value={draft.lastEnergyLevelUpRolled} onChange={setNum("lastEnergyLevelUpRolled", 1)} />
              </div>
              <div />
            </Grid3>
          </Section>

          <Section title="Attributes (new — range -2 to 5)">
            <Grid3>
              {(["might", "finesse", "wit", "presence", "will", "craft"] as const).map(a => (
                <div key={a}><Label>{a}</Label>
                  <Input type="number" min={-2} max={5} value={draft[a] as number}
                    onChange={setNum(a)} data-testid={`input-attr-${a}`} />
                </div>
              ))}
            </Grid3>
          </Section>

          <Section title="Attributes (legacy)">
            <Grid3>
              {(["agility", "charisma", "strength", "wisdom", "arcana", "concentration"] as const).map(a => (
                <div key={a}><Label>{a}</Label>
                  <Input type="number" value={draft[a] as number} onChange={setNum(a)} />
                </div>
              ))}
            </Grid3>
          </Section>

          <Section title="Skills">
            <Grid3>
              {([
                ["skillAgility", "Agility"], ["skillArcana", "Arcana"], ["skillCharisma", "Charisma"],
                ["skillConcentration", "Concentration"], ["skillDeception", "Deception"], ["skillHistory", "History"],
                ["skillIntimidation", "Intimidation"], ["skillInvestigation", "Investigation"], ["skillMedicine", "Medicine"],
                ["skillPerception", "Perception"], ["skillSleightOfHand", "Sleight of Hand"], ["skillStealth", "Stealth"],
                ["skillStrength", "Strength"], ["skillWisdom", "Wisdom"], ["skillCulture", "Culture"],
                ["skillSurvival", "Survival"], ["skillBeastHandling", "Beast Handling"],
              ] as Array<[keyof CharacterDraft, string]>).map(([key, label]) => (
                <div key={key as string}><Label>{label}</Label>
                  <Input type="number" value={draft[key] as number} onChange={setNum(key)} />
                </div>
              ))}
            </Grid3>
            <Grid2 style={{ marginTop: 8 }}>
              <div><Label>Cancelled attribute points</Label>
                <Input type="number" min={0} max={2} value={draft.cancelledAttrPoints} onChange={setNum("cancelledAttrPoints")} />
              </div>
              <div><Label>Cancelled skill points</Label>
                <Input type="number" min={0} max={2} value={draft.cancelledSkillPoints} onChange={setNum("cancelledSkillPoints")} />
              </div>
            </Grid2>
          </Section>

          <Section title="Vision & exhaustion">
            <Grid3>
              <div><Label>Vision type</Label>
                <Select value={draft.visionType} onValueChange={v => set({ visionType: v })}>
                  {VISION_TYPES.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                </Select>
              </div>
              <div><Label>Day vision (ft)</Label>
                <Input type="number" value={draft.dayVisionDistance} onChange={setNum("dayVisionDistance", 60)} />
              </div>
              <div><Label>Night vision (ft)</Label>
                <Input type="number" value={draft.nightVisionDistance} onChange={setNum("nightVisionDistance", 30)} />
              </div>
              <div><Label>Exhaustion (0–7)</Label>
                <Input type="number" min={0} max={7} value={draft.exhaustion} onChange={setNum("exhaustion")} />
              </div>
              <div style={{ gridColumn: "span 2" }}><Label>Special vision notes</Label>
                <Input value={draft.specialVisionNotes ?? ""} onChange={e => set({ specialVisionNotes: e.target.value || null })} />
              </div>
            </Grid3>
          </Section>

          <Section title="Story">
            <Stack gap="sm">
              <Row><Checkbox checked={!!draft.hasMotivation} onCheckedChange={v => set({ hasMotivation: v })} /><Label>Has motivation</Label></Row>
              <div><Label>Biography</Label>
                <Textarea value={draft.biography ?? ""} onChange={e => set({ biography: e.target.value || null })} />
              </div>
              <div><Label>GM notes (private)</Label>
                <Textarea value={draft.gmNotes ?? ""} onChange={e => set({ gmNotes: e.target.value || null })} />
              </div>
            </Stack>
          </Section>

          <Section title="Inventory items">
            <CharacterItemsEditor
              value={draft.items ?? []}
              onChange={v => set({ items: v })}
              host={host}
              campaignSystem={campaignSystem}
            />
          </Section>
          <Section title="Known spells">
            <CharacterSpellsEditor
              value={draft.spells ?? []}
              onChange={v => set({ spells: v })}
              host={host}
              campaignSystem={campaignSystem}
            />
          </Section>
          <Section title="Hotbars">
            <CharacterHotbarsEditor
              value={draft.hotbars ?? []}
              items={draft.items ?? []}
              spells={draft.spells ?? []}
              traits={draft.traits ?? []}
              onChange={v => set({ hotbars: v })}
            />
          </Section>
          <Section title="Custom skills"><CharacterCustomSkillsEditor value={draft.customSkills ?? []} onChange={v => set({ customSkills: v })} /></Section>
          <Section title="Traits"><CharacterTraitsEditor value={draft.traits ?? []} onChange={v => set({ traits: v })} /></Section>
          <Section title="Feat refs"><CharacterFeatsEditor value={draft.feats ?? []} onChange={v => set({ feats: v })} /></Section>
          <Section title="Classes"><CharacterClassesEditor value={draft.classes ?? []} onChange={v => set({ classes: v })} /></Section>
          <Section title="Class skill nodes"><CharacterClassSkillsEditor value={draft.classSkills ?? []} onChange={v => set({ classSkills: v })} /></Section>
        </Stack>
      )}
    </HostModal>
  );
};

/**
 * Thin wrapper for admin character templates. Pins `kind="character-template"`,
 * forces `isTemplate=true`, and hides campaign/user scope fields (templates
 * live in the global admin library, not in any campaign).
 */
export const CharacterTemplateDialog: React.FC<DialogProps<CharacterDraft>> = (props) => (
  <CharacterDialog {...props} kind="character-template" hideScopeFields />
);
