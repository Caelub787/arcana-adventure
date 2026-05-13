/**
 * @arcana/library-dialogs
 *
 * Drop-in React dialogs for Arcana Adventure-compatible apps.
 *
 * Foundation slice (this package version): Item + Roll-Template dialogs
 * with their nested editors. Subsequent versions add Spell, Character,
 * Character-Template, Species, Class, Feat-Tree.
 *
 * Theming: import "@arcana/library-dialogs/theme.css" once, then
 * override `--ld-*` CSS variables on any ancestor with [data-ld-root]
 * to re-skin globally.
 */
export type {
  HostAdapter, NotifyLevel, ImagePickerOpts, HostModalProps,
  HostModalComponent, DialogProps,
} from "./types";

export { minimalHostAdapter } from "./host/minimal";
export type { MinimalHostOptions } from "./host/minimal";
export { arcanaHostAdapter } from "./host/arcana";
export type { ArcanaHostOptions } from "./host/arcana";

// Dialogs
export { ItemDialog } from "./dialogs/ItemDialog";
export type { ItemDraft } from "./dialogs/ItemDialog";
export { RollTemplateDialog } from "./dialogs/RollTemplateDialog";
export type { RollTemplateDraft } from "./dialogs/RollTemplateDialog";
export { SpellDialog } from "./dialogs/SpellDialog";
export type { SpellDraft } from "./dialogs/SpellDialog";
export { CharacterDialog, CharacterTemplateDialog } from "./dialogs/CharacterDialog";
export type { CharacterDraft } from "./dialogs/CharacterDialog";
export { SpeciesDialog } from "./dialogs/SpeciesDialog";
export type { SpeciesDraft } from "./dialogs/SpeciesDialog";
export { FeatTreeDialog } from "./dialogs/FeatTreeDialog";
export type { FeatTreeDraft } from "./dialogs/FeatTreeDialog";
export { FeatTreeCanvas, stripLocalIds as stripFeatTreeLocalIds } from "./components/FeatTreeCanvas";
export type {
  FeatDraft, FeatConnectionDraft, FeatEffectDraft,
  FeatTreeCanvasValue, FeatTreeCanvasProps,
} from "./components/FeatTreeCanvas";
export { ClassDialog } from "./dialogs/ClassDialog";
export type { ClassDraft } from "./dialogs/ClassDialog";
export {
  SkillTreeEditor, ClassSkillsPanel,
  stripLocalIds as stripSkillTreeLocalIds,
} from "./components/SkillTreeEditor";
export type {
  SkillNodeDraft, SkillConnectionDraft, SkillNodeEffectDraft,
  SkillTreeValue, SkillTreeEditorProps, ClassSkillsPanelProps,
} from "./components/SkillTreeEditor";

// Reusable nested editors
export { RollEntriesEditor } from "./components/RollEntriesEditor";
export type { RollEntryDraft, RollEntriesEditorProps } from "./components/RollEntriesEditor";
export { CraftRecipesEditor } from "./components/CraftRecipesEditor";
export type { CraftRecipeDraft, CraftRecipeIngredientDraft, CraftRecipesEditorProps } from "./components/CraftRecipesEditor";
export { ItemTemplateLinksPanel } from "./components/ItemTemplateLinksPanel";
export type { ItemTemplateLinksPanelProps } from "./components/ItemTemplateLinksPanel";
export {
  CharacterItemsEditor, CharacterSpellsEditor, CharacterHotbarsEditor,
  CharacterCustomSkillsEditor, CharacterTraitsEditor, CharacterFeatsEditor,
  CharacterClassesEditor, CharacterClassSkillsEditor,
} from "./components/CharacterChildrenEditors";
export type {
  CharItemDraft, CharSpellDraft, CharHotbarDraft,
  CharCustomSkillDraft, CharTraitDraft, CharFeatRefDraft,
  CharClassDraft, CharClassSkillDraft,
} from "./components/CharacterChildrenEditors";

// Default modal — exported so partners can opt-in or wrap it.
export { DefaultModal, HostModal, SaveCancelFooter } from "./ui/DefaultModal";

// Lightweight UI primitives (occasionally useful when partners build
// custom dialogs alongside ours and want visual consistency).
export {
  Button, Input, Textarea, Label, Checkbox, Select, SelectItem,
  Stack, Row, Grid2, Grid3, Section, Panel, Badge,
} from "./ui/primitives";

// Helper utilities for re-implementations and tests
export { sortRollsForDisplay, collectFolderNames } from "./lib/rollSort";
export { AAV2_EFFECT_TYPES, LEGACY_DAMAGE_TYPES, isAAv2 } from "./lib/effectTypes";
