import { 
  type User, type InsertUser,
  type Campaign, type InsertCampaign,
  type CampaignMember, type InsertCampaignMember,
  type CampaignBan,
  type Character, type InsertCharacter,
  type Token, type InsertToken,
  type ChatMessage, type InsertChatMessage,
  type PasswordResetToken, type InsertPasswordResetToken,
  type Scene, type InsertScene,
  type Hotbar, type InsertHotbar,
  type Item, type InsertItem,
  type Spell, type InsertSpell,
  type CharacterPermission, type InsertCharacterPermission,
  type InitiativeEntry, type InsertInitiativeEntry,
  type SystemSpecies, type InsertSystemSpecies,
  type CampaignSpecies, type InsertCampaignSpecies,
  type FeatTemplate, type InsertFeatTemplate,
  type FeatTree, type InsertFeatTree,
  type Feat, type InsertFeat,
  type FeatConnection, type InsertFeatConnection,
  type CharacterFeat, type InsertCharacterFeat,
  type SystemSpell, type InsertSystemSpell,
  type SystemSkill, type InsertSystemSkill,
  type CharacterCustomSkill, type InsertCharacterCustomSkill,
  type SystemTrait, type InsertSystemTrait,
  type CharacterTrait, type InsertCharacterTrait,
  type CharacterFolder, type InsertCharacterFolder,
  type CharacterTemplateFolder, type InsertCharacterTemplateFolder,
  type SceneFolder, type InsertSceneFolder,
  type FriendRequest, type InsertFriendRequest,
  type Friendship, type InsertFriendship,
  type NoteFolder, type InsertNoteFolder,
  type Note, type InsertNote,
  type NoteReference, type InsertNoteReference,
  type NoteShare, type InsertNoteShare,
  type TokenEffect, type InsertTokenEffect,
  type SpellEffect, type InsertSpellEffect,
  type ItemEffect, type InsertItemEffect,
  type TokenActiveEffect, type InsertTokenActiveEffect,
  type ThrownItem, type InsertThrownItem,
  type AdminNotification, type InsertAdminNotification,
  type UserNotification, type InsertUserNotification,
  type TermsAndConditions, type InsertTermsAndConditions,
  type UserTermsAcceptance, type InsertUserTermsAcceptance,
  type SandboxTemplate, type InsertSandboxTemplate,
  type SandboxActor, type InsertSandboxActor,
  type SandboxFolder, type InsertSandboxFolder,
  type RollEntry, type InsertRollEntry,
  type SceneWall, type InsertSceneWall,
  type SceneDoor, type InsertSceneDoor,
  type SceneWindow, type InsertSceneWindow,
  type SceneLight, type InsertSceneLight,
  type SceneVisionZone, type InsertSceneVisionZone,
  type Entity, type InsertEntity,
  type EntityLink, type InsertEntityLink,
  type WorldShareLink, type InsertWorldShareLink,
  type SpectatorToken, type InsertSpectatorToken,
  type WorldMap, type InsertWorldMap,
  type WorldMapPin, type InsertWorldMapPin,
  type WorldCalendar, type InsertWorldCalendar,
  type WorldTimelineEvent, type InsertWorldTimelineEvent,
  type WorldTimeline, type InsertWorldTimeline,
  type World, type InsertWorld,
  type WorldCalendarSync, type InsertWorldCalendarSync,
  type CampaignMapPin, type InsertCampaignMapPin,
  type ShopItem, type InsertShopItem,
  type ShopHaggleRoll, type InsertShopHaggleRoll,
  type GameClass, type InsertClass,
  type ClassSkillNode, type InsertClassSkillNode,
  type ClassSkillConnection, type InsertClassSkillConnection,
  type CharacterClass, type InsertCharacterClass,
  type CharacterClassSkill, type InsertCharacterClassSkill,
  type WorldCollaborator, type InsertWorldCollaborator,
  type WorldCanvasNode, type InsertWorldCanvasNode,
  type EntityAccess, type InsertEntityAccess,
  type CraftRecipe, type InsertCraftRecipe,
  type CraftRecipeIngredient, type InsertCraftRecipeIngredient,
  type CraftRecipeOutcome, type InsertCraftRecipeOutcome,
  type V3Spell, type InsertV3Spell, v3Spells,
  type V3ElementRequirement, type InsertV3ElementRequirement, v3ElementRequirements,
  type V3Technique, type InsertV3Technique, v3Techniques,
  type V3TechniqueGroup, type InsertV3TechniqueGroup, v3TechniqueGroups,
  type V3TechniqueGroupMember, v3TechniqueGroupMembers,
  type V3ActionTokenType, type InsertV3ActionTokenType, v3ActionTokenTypes,
  type AdvancedItemType, type InsertAdvancedItemType, advancedItemTypes,
  type CharacterActionToken, characterActionTokens,
  craftRecipes, craftRecipeIngredients, craftRecipeOutcomes,
  crafterRecipeTemplates, crafterTemplateLinks,
  type CrafterRecipeTemplate, type InsertCrafterRecipeTemplate,
  spectatorTokens, users, campaigns, campaignMembers, campaignBans, characters, tokens, chatMessages, passwordResetTokens, scenes, hotbars, items, itemTemplateLinks, spells, spellTemplateLinks, characterPermissions, initiativeEntries, systemSpecies, campaignSpecies, featTemplates, featTrees, feats, featConnections, characterFeats, systemSpells, systemSkills, characterCustomSkills, systemTraits, characterTraits, characterFolders, characterTemplateFolders, sceneFolders, friendRequests, friendships, noteFolders, notes, noteReferences, noteShares, tokenEffects, spellEffects, itemEffects, tokenActiveEffects, thrownItems, adminNotifications, userNotifications, termsAndConditions, userTermsAcceptance, sandboxFolders, sandboxTemplates, sandboxActors, rollEntries, sceneWalls, sceneDoors, sceneWindows, sceneLights, sceneVisionZones, entities, entityLinks, worldShareLinks, worldMaps, worldMapPins, worldCalendars, worldTimelineEvents, worldTimelines, worlds, worldCalendarSyncs, campaignMapPins, shopItems, shopHaggleRolls, classes, classSkillNodes, classSkillConnections, characterClasses, characterClassSkills, worldCollaborators, worldCanvasNodes, entityAccess
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc, sql, inArray, or, isNull, ne } from "drizzle-orm";

export interface SearchableEntity {
  id: string;
  type: 'spell' | 'trait' | 'skill' | 'item' | 'species' | 'character';
  name: string;
  description?: string;
  icon?: string;
}

export interface DuplicateCampaignItemCleanupReport {
  applied: boolean;
  scanned: number;
  duplicatesFound: number;
  deleted: Array<{ id: string; name: string; campaignId: string | null; systemItemId: string }>;
  kept: Array<{ id: string; name: string; campaignId: string | null; systemItemId: string; reason: 'has-character-copies' | 'campaign-specific-changes' }>;
}

export interface IStorage {
  // Entity search for notes reference picker
  searchEntities(query: string, type?: string, userId?: string): Promise<SearchableEntity[]>;

  // User operations
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  // Campaign operations
  getCampaign(id: string): Promise<Campaign | undefined>;
  getCampaignByInviteCode(code: string): Promise<Campaign | undefined>;
  createCampaign(campaign: InsertCampaign): Promise<Campaign>;
  updateCampaign(id: string, data: Partial<Campaign>): Promise<Campaign | undefined>;
  deleteCampaign(id: string): Promise<void>;
  getUserCampaigns(userId: string): Promise<{ created: Campaign[], joined: Campaign[] }>;
  duplicateCampaign(campaignId: string, newGmUserId: string): Promise<Campaign>;

  // Campaign Member operations
  addCampaignMember(member: InsertCampaignMember): Promise<CampaignMember>;
  getCampaignMembers(campaignId: string): Promise<CampaignMember[]>;
  getCampaignMembership(userId: string, campaignId: string): Promise<CampaignMember | null>;
  removeCampaignMember(campaignId: string, userId: string): Promise<void>;
  toggleFavorite(campaignId: string, userId: string): Promise<void>;
  setAssignedCharacter(campaignId: string, userId: string, characterId: string | null): Promise<void>;
  getAssignedCharacter(campaignId: string, userId: string): Promise<string | null>;
  getGmHotbar(campaignId: string, userId: string): Promise<(string | null)[]>;
  updateGmHotbar(campaignId: string, userId: string, hotbar: (string | null)[]): Promise<void>;
  isGM(userId: string, campaignId: string): Promise<boolean>;
  isOwner(userId: string, campaignId: string): Promise<boolean>;
  setMemberRole(campaignId: string, memberId: string, role: 'player' | 'assistant_gm'): Promise<CampaignMember | undefined>;
  setMemberTrustedPlayer(campaignId: string, memberId: string, trusted: boolean): Promise<CampaignMember | undefined>;
  updateMemberBeaconColor(campaignId: string, userId: string, beaconColor: string): Promise<CampaignMember | undefined>;

  // Character operations
  createCharacter(character: InsertCharacter): Promise<Character>;
  getCharacter(id: string): Promise<Character | undefined>;
  getCharactersByIds(ids: string[]): Promise<Character[]>;
  getCampaignCharacters(campaignId: string): Promise<Character[]>;
  updateCharacter(id: string, data: Partial<Character>): Promise<Character | undefined>;
  deleteCharacter(id: string): Promise<void>;
  deleteCharacterWithTokens(id: string): Promise<void>;
  
  // Character Template operations (admin-created character sheets)
  getCharacterTemplates(ownerScope?: string[], worldId?: string): Promise<Character[]>;
  getCharacterTemplate(id: string): Promise<Character | undefined>;
  createCharacterTemplate(data: Partial<InsertCharacter>): Promise<Character>;
  updateCharacterTemplate(id: string, data: Partial<Character>): Promise<Character | undefined>;
  deleteCharacterTemplate(id: string): Promise<void>;
  copyTemplateToCompany(templateId: string, campaignId: string, userId: string): Promise<Character>;
  importCharacterToCampaign(characterId: string, targetCampaignId: string, targetUserId: string | null): Promise<Character>;
  importWorldItemToCharacter(worldItemId: string, characterId: string, userId: string): Promise<Item>;
  importWorldSpellToCharacter(worldSpellId: string, characterId: string): Promise<Spell>;
  importWorldCharacterToCampaign(worldCharacterId: string, campaignId: string, userId: string): Promise<Character>;

  // Character Template Folder operations
  getCharacterTemplateFolders(): Promise<CharacterTemplateFolder[]>;
  getCharacterTemplateFolder(id: string): Promise<CharacterTemplateFolder | undefined>;
  createCharacterTemplateFolder(data: InsertCharacterTemplateFolder): Promise<CharacterTemplateFolder>;
  updateCharacterTemplateFolder(id: string, data: Partial<CharacterTemplateFolder>): Promise<CharacterTemplateFolder | undefined>;
  deleteCharacterTemplateFolder(id: string): Promise<void>;

  // Token operations
  createToken(token: InsertToken): Promise<Token>;
  getToken(id: string): Promise<Token | undefined>;
  getCampaignTokens(campaignId: string): Promise<Token[]>;
  getSceneTokens(sceneId: string): Promise<Token[]>;
  updateToken(id: string, data: Partial<Token>): Promise<Token | undefined>;
  deleteToken(id: string): Promise<void>;
  deleteTokensByCharacterId(characterId: string): Promise<void>;

  // Chat operations
  createChatMessage(message: InsertChatMessage): Promise<ChatMessage>;
  getCampaignMessages(campaignId: string, limit?: number): Promise<ChatMessage[]>;

  // Password Reset operations
  createPasswordResetToken(token: InsertPasswordResetToken): Promise<PasswordResetToken>;
  getPasswordResetToken(token: string): Promise<PasswordResetToken | undefined>;
  deletePasswordResetToken(token: string): Promise<void>;
  deleteUserPasswordResetTokens(userId: string): Promise<void>;
  updateUserPassword(userId: string, hashedPassword: string): Promise<void>;
  updateUserGoogleTokens(userId: string, data: { googleAccessToken: string | null; googleRefreshToken: string | null; googleTokenExpiry: Date | null; googleEmail: string | null }): Promise<void>;
  getUserGoogleTokens(userId: string): Promise<{ googleAccessToken: string | null; googleRefreshToken: string | null; googleTokenExpiry: Date | null; googleEmail: string | null } | undefined>;

  // Scene operations
  createScene(scene: InsertScene): Promise<Scene>;
  getScene(id: string): Promise<Scene | undefined>;
  getCampaignScenes(campaignId: string): Promise<Scene[]>;
  getActiveScene(campaignId: string): Promise<Scene | undefined>;
  updateScene(id: string, data: Partial<Scene>): Promise<Scene | undefined>;
  deleteScene(id: string): Promise<void>;
  setActiveScene(campaignId: string, sceneId: string): Promise<Campaign | undefined>;

  // Hotbar operations
  getHotbar(id: string): Promise<Hotbar | undefined>;
  getHotbarsByCharacter(characterId: string): Promise<Hotbar[]>;
  upsertHotbar(hotbar: InsertHotbar): Promise<Hotbar>;
  deleteHotbar(id: string): Promise<void>;

  // Item operations
  getItemsByCharacter(characterId: string): Promise<Item[]>;
  getSystemItems(system?: string, ownerScope?: string[], worldId?: string): Promise<Item[]>;
  getCampaignTemplateItems(campaignId: string, userId?: string): Promise<Item[]>;
  // Lightweight summaries for picker dialogs (faster loading)
  getSystemItemSummaries(system?: string): Promise<{ id: string; name: string; itemType: string; rarity: string; weight: number; price: number; currency: string }[]>;
  getCampaignItemSummaries(campaignId: string, userId?: string): Promise<{ id: string; name: string; itemType: string; rarity: string; weight: number; price: number; currency: string }[]>;
  createItem(item: InsertItem): Promise<Item>;
  updateItem(id: string, updates: Partial<InsertItem>): Promise<Item | undefined>;
  deleteItem(id: string): Promise<void>;
  damageItem(id: string, amount?: number): Promise<Item | undefined>;
  getItem(id: string): Promise<Item | undefined>;
  moveItemToContainer(itemId: string, containerId: string | null): Promise<Item | undefined>;
  getContainerItems(containerId: string): Promise<Item[]>;
  getArchivedSystemItems(system?: string): Promise<{ id: string; name: string; itemType: string; rarity: string }[]>;
  getArchivedSystemSpells(system?: string): Promise<SystemSpell[]>;
  archiveAllSystemItems(system?: string): Promise<void>;
  archiveAllSystemSpells(system?: string): Promise<void>;

  // Spell operations
  getSpellsByCharacter(characterId: string): Promise<Spell[]>;
  getSpell(id: string): Promise<Spell | undefined>;
  createSpell(spell: InsertSpell): Promise<Spell>;
  updateSpell(id: string, updates: Partial<InsertSpell>): Promise<Spell | undefined>;
  deleteSpell(id: string): Promise<void>;
  getCampaignTemplateSpells(campaignId: string): Promise<Spell[]>;
  getItemsLinkedToTemplate(templateItemId: string): Promise<Item[]>;
  cleanupDuplicateCampaignTemplateItems(opts?: { apply?: boolean; system?: string }): Promise<DuplicateCampaignItemCleanupReport>;
  getSystemItemTemplates(system?: string): Promise<Item[]>;
  getSpellsLinkedToTemplate(templateSpellId: string): Promise<Spell[]>;
  getSpellsLinkedToRollTemplate(rollTemplateId: string): Promise<{ id: string; system: string | null }[]>;
  getRollEntriesByTemplateRollId(fromTemplateRollId: string): Promise<RollEntry[]>;
  getItemTemplateLinks(itemId: string): Promise<string[]>;
  addItemTemplateLink(itemId: string, templateId: string): Promise<void>;
  removeItemTemplateLink(itemId: string, templateId: string): Promise<void>;
  getSpellTemplateLinks(spellId: string): Promise<string[]>;
  addSpellTemplateLink(spellId: string, templateId: string): Promise<void>;
  removeSpellTemplateLink(spellId: string, templateId: string): Promise<void>;

  // Crafter recipe operations
  getCraftRecipesByItem(parentItemId: string): Promise<Array<CraftRecipe & { ingredients: CraftRecipeIngredient[]; outcomes: CraftRecipeOutcome[] }>>;
  getCraftRecipesByTemplate(parentTemplateId: string): Promise<Array<CraftRecipe & { ingredients: CraftRecipeIngredient[]; outcomes: CraftRecipeOutcome[] }>>;
  getCraftRecipe(id: string): Promise<(CraftRecipe & { ingredients: CraftRecipeIngredient[]; outcomes: CraftRecipeOutcome[] }) | undefined>;
  createCraftRecipe(recipe: InsertCraftRecipe, ingredients: Omit<InsertCraftRecipeIngredient, 'recipeId'>[], outcomes: Omit<InsertCraftRecipeOutcome, 'recipeId'>[]): Promise<CraftRecipe & { ingredients: CraftRecipeIngredient[]; outcomes: CraftRecipeOutcome[] }>;
  updateCraftRecipe(id: string, recipe: Partial<InsertCraftRecipe>, ingredients?: Omit<InsertCraftRecipeIngredient, 'recipeId'>[], outcomes?: Omit<InsertCraftRecipeOutcome, 'recipeId'>[]): Promise<(CraftRecipe & { ingredients: CraftRecipeIngredient[]; outcomes: CraftRecipeOutcome[] }) | undefined>;
  deleteCraftRecipe(id: string): Promise<void>;
  getCraftRecipesByTemplateRecipeId(fromTemplateRecipeId: string): Promise<CraftRecipe[]>;
  getItemBuildRecipe(itemId: string): Promise<(CraftRecipe & { ingredients: CraftRecipeIngredient[] }) | undefined>;
  saveItemBuildRecipe(itemId: string, outputQuantity: number, ingredients: Omit<InsertCraftRecipeIngredient, 'recipeId'>[], itemName: string): Promise<CraftRecipe & { ingredients: CraftRecipeIngredient[] }>;
  deleteItemBuildRecipe(itemId: string): Promise<void>;
  getItemsWithBuildRecipes(system: string, ownerScope?: string[]): Promise<Array<{ id: string; name: string; image: string | null; price: number; currency: string; itemType: string }>>;

  // Crafter Recipe Templates
  listCrafterRecipeTemplates(opts: { system?: string; ownerScope?: string[] | null }): Promise<CrafterRecipeTemplate[]>;
  getCrafterRecipeTemplate(id: string): Promise<CrafterRecipeTemplate | undefined>;
  createCrafterRecipeTemplate(data: InsertCrafterRecipeTemplate): Promise<CrafterRecipeTemplate>;
  updateCrafterRecipeTemplate(id: string, patch: Partial<InsertCrafterRecipeTemplate>): Promise<CrafterRecipeTemplate | undefined>;
  deleteCrafterRecipeTemplate(id: string): Promise<void>;
  getCrafterTemplateLinks(itemId: string): Promise<string[]>;
  getItemsLinkedToCrafterTemplate(templateId: string): Promise<string[]>;
  addCrafterTemplateLink(itemId: string, templateId: string): Promise<void>;
  removeCrafterTemplateLink(itemId: string, templateId: string): Promise<void>;

  // Roll Entry operations
  getRollEntries(ownerType: string, ownerId: string): Promise<RollEntry[]>;
  createRollEntry(entry: InsertRollEntry): Promise<RollEntry>;
  updateRollEntry(id: string, data: Partial<InsertRollEntry>): Promise<RollEntry | undefined>;
  deleteRollEntry(id: string): Promise<void>;
  deleteRollEntriesByOwner(ownerType: string, ownerId: string): Promise<void>;

  // Scene Wall operations
  getSceneWalls(sceneId: string): Promise<SceneWall[]>;
  createSceneWall(wall: InsertSceneWall): Promise<SceneWall>;
  createSceneWallsBatch(walls: InsertSceneWall[]): Promise<SceneWall[]>;
  updateSceneWall(id: string, data: Partial<InsertSceneWall>): Promise<SceneWall | undefined>;
  deleteSceneWall(id: string): Promise<void>;
  deleteSceneWalls(sceneId: string): Promise<void>;

  // Scene Door operations
  getSceneDoor(doorId: string): Promise<SceneDoor | undefined>;
  getSceneDoors(sceneId: string): Promise<SceneDoor[]>;
  createSceneDoor(door: InsertSceneDoor): Promise<SceneDoor>;
  updateSceneDoor(id: string, data: Partial<InsertSceneDoor>): Promise<SceneDoor | undefined>;
  deleteSceneDoor(id: string): Promise<void>;
  deleteSceneDoors(sceneId: string): Promise<void>;

  // Scene Window operations
  getSceneWindows(sceneId: string): Promise<SceneWindow[]>;
  createSceneWindow(win: InsertSceneWindow): Promise<SceneWindow>;
  updateSceneWindow(id: string, data: Partial<InsertSceneWindow>): Promise<SceneWindow | undefined>;
  deleteSceneWindow(id: string): Promise<void>;
  deleteSceneWindows(sceneId: string): Promise<void>;

  // Scene Light operations
  getSceneLights(sceneId: string): Promise<SceneLight[]>;
  createSceneLight(light: InsertSceneLight): Promise<SceneLight>;
  updateSceneLight(id: string, data: Partial<InsertSceneLight>): Promise<SceneLight | undefined>;
  deleteSceneLight(id: string): Promise<void>;
  deleteSceneLights(sceneId: string): Promise<void>;

  // Scene Vision Zone operations
  getSceneVisionZones(sceneId: string): Promise<SceneVisionZone[]>;
  createSceneVisionZone(zone: InsertSceneVisionZone): Promise<SceneVisionZone>;
  updateVisionZone(id: string, updates: Record<string, any>): Promise<SceneVisionZone | undefined>;
  deleteSceneVisionZone(zoneId: string): Promise<void>;
  deleteAllSceneVisionZones(sceneId: string): Promise<void>;

  // Character Permission operations
  getCharacterPermissions(characterId: string): Promise<CharacterPermission[]>;
  setCharacterPermission(characterId: string, userId: string, accessLevel: string): Promise<CharacterPermission>;
  getCharacterPermission(characterId: string, userId: string): Promise<CharacterPermission | undefined>;
  getUserPermissionsForCharacters(userId: string, characterIds: string[]): Promise<CharacterPermission[]>;
  getCharacterPermissionsForUsers(characterId: string, userIds: string[]): Promise<CharacterPermission[]>;
  getUserAccessibleCharacters(userId: string): Promise<Character[]>;

  // Campaign Membership Check
  isCampaignMember(campaignId: string, userId: string): Promise<boolean>;

  // Campaign Ban operations
  kickMember(campaignId: string, userId: string): Promise<void>;
  banMember(campaignId: string, userId: string, reason?: string): Promise<CampaignBan>;
  unbanMember(campaignId: string, userId: string): Promise<void>;
  getCampaignBans(campaignId: string): Promise<any[]>;
  isUserBanned(campaignId: string, userId: string): Promise<boolean>;

  // Initiative Tracking operations
  getCampaignInitiative(campaignId: string): Promise<InitiativeEntry[]>;
  createInitiativeEntry(entry: InsertInitiativeEntry): Promise<InitiativeEntry>;
  updateInitiativeEntry(id: string, data: Partial<InitiativeEntry>): Promise<InitiativeEntry | undefined>;
  deleteInitiativeEntry(id: string): Promise<void>;
  clearCampaignInitiative(campaignId: string): Promise<void>;
  getInitiativeEntryByCharacter(campaignId: string, characterId: string): Promise<InitiativeEntry | undefined>;

  // System Species operations
  getSystemSpecies(systemName?: string): Promise<SystemSpecies[]>;
  getSystemSpeciesById(id: string): Promise<SystemSpecies | undefined>;
  getSpeciesByName(name: string, systemName?: string): Promise<SystemSpecies | undefined>;
  createSystemSpecies(species: InsertSystemSpecies): Promise<SystemSpecies>;
  updateSystemSpecies(id: string, data: Partial<InsertSystemSpecies>): Promise<SystemSpecies | undefined>;
  deleteSystemSpecies(id: string): Promise<void>;

  // Campaign Species operations (campaign-local species created by GMs)
  getCampaignSpecies(campaignId: string): Promise<CampaignSpecies[]>;
  getCampaignSpeciesById(id: string): Promise<CampaignSpecies | undefined>;
  createCampaignSpecies(species: InsertCampaignSpecies): Promise<CampaignSpecies>;
  updateCampaignSpecies(id: string, data: Partial<InsertCampaignSpecies>): Promise<CampaignSpecies | undefined>;
  deleteCampaignSpecies(id: string): Promise<void>;

  // Feat Template operations (reusable feat definitions)
  getFeatTemplates(): Promise<FeatTemplate[]>;
  getFeatTemplate(id: string): Promise<FeatTemplate | undefined>;
  createFeatTemplate(template: InsertFeatTemplate): Promise<FeatTemplate>;
  updateFeatTemplate(id: string, data: Partial<InsertFeatTemplate>): Promise<FeatTemplate | undefined>;
  deleteFeatTemplate(id: string): Promise<void>;

  // Feat Tree operations
  getFeatTrees(system?: string): Promise<FeatTree[]>;
  getFeatTree(id: string): Promise<FeatTree | undefined>;
  getFeatTreeByName(name: string): Promise<FeatTree | undefined>;
  createFeatTree(tree: InsertFeatTree): Promise<FeatTree>;
  updateFeatTree(id: string, data: Partial<InsertFeatTree>): Promise<FeatTree | undefined>;
  deleteFeatTree(id: string): Promise<void>;

  // Feat operations
  getFeats(treeId: string): Promise<Feat[]>;
  getFeat(id: string): Promise<Feat | undefined>;
  createFeat(feat: InsertFeat): Promise<Feat>;
  updateFeat(id: string, data: Partial<InsertFeat>): Promise<Feat | undefined>;
  deleteFeat(id: string): Promise<void>;

  // Feat Connection operations
  getFeatConnections(treeId: string): Promise<FeatConnection[]>;
  createFeatConnection(connection: InsertFeatConnection): Promise<FeatConnection>;
  deleteFeatConnection(id: string): Promise<void>;
  deleteFeatConnectionsByFeat(featId: string): Promise<void>;

  // Character Feat operations
  getCharacterFeats(characterId: string): Promise<CharacterFeat[]>;
  unlockCharacterFeat(characterId: string, featId: string): Promise<CharacterFeat>;
  removeCharacterFeat(characterId: string, featId: string): Promise<void>;
  hasCharacterFeat(characterId: string, featId: string): Promise<boolean>;

  // System Spell operations (global spell definitions)
  getSystemSpells(system?: string, ownerScope?: string[], worldId?: string): Promise<SystemSpell[]>;
  getSystemSpellSummaries(system?: string): Promise<any[]>;
  getSystemSpell(id: string): Promise<SystemSpell | undefined>;
  createSystemSpell(spell: InsertSystemSpell): Promise<SystemSpell>;
  updateSystemSpell(id: string, data: Partial<InsertSystemSpell>): Promise<SystemSpell | undefined>;
  deleteSystemSpell(id: string): Promise<void>;

  // AA V3 crafted spell operations
  createV3Spell(spell: InsertV3Spell): Promise<V3Spell>;
  getV3Spell(id: string): Promise<V3Spell | undefined>;
  listV3Spells(status?: string): Promise<V3Spell[]>;
  getCanonicalV3SpellByHash(hash: string): Promise<V3Spell | undefined>;
  getV3SpellUsageByHash(hash: string): Promise<{ campaignCount: number; characterCount: number }>;
  getCampaignAuthoredV3SpellByHash(campaignId: string, hash: string): Promise<V3Spell | undefined>;
  getV3SpellRequestsForCampaign(campaignId: string): Promise<V3Spell[]>;
  getV3SpellsForCharacter(characterId: string): Promise<V3Spell[]>;
  getV3SpellsForCampaign(campaignId: string): Promise<V3Spell[]>;
  getV3SpellsForSpellbook(spellbookItemId: string): Promise<V3Spell[]>;
  updateV3Spell(id: string, data: Partial<InsertV3Spell>): Promise<V3Spell | undefined>;
  deleteV3Spell(id: string): Promise<void>;

  // AA V3 element craft requirement operations
  getV3ElementRequirements(): Promise<V3ElementRequirement[]>;
  getV3ElementRequirement(id: string): Promise<V3ElementRequirement | undefined>;
  createV3ElementRequirement(data: InsertV3ElementRequirement): Promise<V3ElementRequirement>;
  updateV3ElementRequirement(id: string, data: Partial<InsertV3ElementRequirement>): Promise<V3ElementRequirement | undefined>;
  deleteV3ElementRequirement(id: string): Promise<void>;

  // AA V3 action token types (admin-managed)
  getV3ActionTokenTypes(): Promise<V3ActionTokenType[]>;
  getV3ActionTokenType(id: string): Promise<V3ActionTokenType | undefined>;
  createV3ActionTokenType(data: InsertV3ActionTokenType): Promise<V3ActionTokenType>;
  updateV3ActionTokenType(id: string, data: Partial<InsertV3ActionTokenType>): Promise<V3ActionTokenType | undefined>;
  deleteV3ActionTokenType(id: string): Promise<void>;
  getAdvancedItemTypes(): Promise<AdvancedItemType[]>;
  getAdvancedItemType(id: string): Promise<AdvancedItemType | undefined>;
  createAdvancedItemType(data: InsertAdvancedItemType): Promise<AdvancedItemType>;
  updateAdvancedItemType(id: string, data: Partial<InsertAdvancedItemType>): Promise<AdvancedItemType | undefined>;
  deleteAdvancedItemType(id: string): Promise<void>;
  // Character action token assignments
  getCharacterActionTokens(characterId: string): Promise<CharacterActionToken[]>;
  addCharacterActionToken(characterId: string, tokenTypeId: string): Promise<CharacterActionToken>;
  removeCharacterActionToken(id: string): Promise<void>;

  // AA V3 weapon techniques (Task #180)
  getV3Techniques(): Promise<V3Technique[]>;
  getV3Technique(id: string): Promise<V3Technique | undefined>;
  createV3Technique(data: InsertV3Technique): Promise<V3Technique>;
  updateV3Technique(id: string, data: Partial<InsertV3Technique>): Promise<V3Technique | undefined>;
  deleteV3Technique(id: string): Promise<void>;
  getV3TechniqueGroups(): Promise<V3TechniqueGroup[]>;
  getV3TechniqueGroup(id: string): Promise<V3TechniqueGroup | undefined>;
  createV3TechniqueGroup(data: InsertV3TechniqueGroup): Promise<V3TechniqueGroup>;
  updateV3TechniqueGroup(id: string, data: Partial<InsertV3TechniqueGroup>): Promise<V3TechniqueGroup | undefined>;
  deleteV3TechniqueGroup(id: string): Promise<void>;
  getV3TechniqueGroupMembers(): Promise<V3TechniqueGroupMember[]>;
  addV3TechniqueGroupMember(groupId: string, techniqueId: string): Promise<V3TechniqueGroupMember>;
  removeV3TechniqueGroupMember(groupId: string, techniqueId: string): Promise<void>;

  // System Skill operations (admin-defined custom skills)
  getSystemSkills(system?: string): Promise<SystemSkill[]>;
  getSystemSkill(id: string): Promise<SystemSkill | undefined>;
  createSystemSkill(skill: InsertSystemSkill): Promise<SystemSkill>;
  updateSystemSkill(id: string, data: Partial<InsertSystemSkill>): Promise<SystemSkill | undefined>;
  deleteSystemSkill(id: string): Promise<void>;

  // Character Custom Skill operations
  getCharacterCustomSkills(characterId: string): Promise<CharacterCustomSkill[]>;
  getCharacterCustomSkill(id: string): Promise<CharacterCustomSkill | undefined>;
  addCharacterCustomSkill(skill: InsertCharacterCustomSkill): Promise<CharacterCustomSkill>;
  updateCharacterCustomSkill(id: string, data: Partial<InsertCharacterCustomSkill>): Promise<CharacterCustomSkill | undefined>;
  removeCharacterCustomSkill(id: string): Promise<void>;

  // System Trait operations (admin-defined traits)
  getSystemTraits(system?: string): Promise<SystemTrait[]>;
  getSystemTrait(id: string): Promise<SystemTrait | undefined>;
  createSystemTrait(trait: InsertSystemTrait): Promise<SystemTrait>;
  updateSystemTrait(id: string, data: Partial<InsertSystemTrait>): Promise<SystemTrait | undefined>;
  deleteSystemTrait(id: string): Promise<void>;

  // Character Trait operations
  getCharacterTraits(characterId: string): Promise<CharacterTrait[]>;
  getCharacterTrait(id: string): Promise<CharacterTrait | undefined>;
  addCharacterTrait(trait: InsertCharacterTrait): Promise<CharacterTrait>;
  updateCharacterTrait(id: string, data: Partial<InsertCharacterTrait>): Promise<CharacterTrait | undefined>;
  removeCharacterTrait(id: string): Promise<void>;
  resetCharacterTraitUses(characterId: string): Promise<void>;
  restoreShortRestTraitUses(characterId: string): Promise<void>;

  // Character Folder operations
  getCampaignFolders(campaignId: string): Promise<CharacterFolder[]>;
  getCharacterFolder(id: string): Promise<CharacterFolder | undefined>;
  createCharacterFolder(folder: InsertCharacterFolder): Promise<CharacterFolder>;
  updateCharacterFolder(id: string, data: Partial<InsertCharacterFolder>): Promise<CharacterFolder | undefined>;
  deleteCharacterFolder(id: string): Promise<void>;

  // Scene Folder operations
  getSceneFolders(campaignId: string): Promise<SceneFolder[]>;
  getSceneFolder(id: string): Promise<SceneFolder | undefined>;
  createSceneFolder(folder: InsertSceneFolder): Promise<SceneFolder>;
  updateSceneFolder(id: string, data: Partial<InsertSceneFolder>): Promise<SceneFolder | undefined>;
  deleteSceneFolder(id: string): Promise<void>;

  // Profile operations
  updateUserProfile(userId: string, data: { name?: string; avatarUrl?: string; bio?: string; username?: string }): Promise<User | undefined>;

  // Friend Request operations
  createFriendRequest(senderId: string, recipientId: string, message?: string): Promise<FriendRequest>;
  getFriendRequest(id: string): Promise<FriendRequest | undefined>;
  getPendingFriendRequests(userId: string): Promise<FriendRequest[]>;
  getSentFriendRequests(userId: string): Promise<FriendRequest[]>;
  respondToFriendRequest(requestId: string, accept: boolean): Promise<void>;
  deleteFriendRequest(id: string): Promise<void>;

  // Friendship operations
  getFriends(userId: string): Promise<User[]>;
  areFriends(userId1: string, userId2: string): Promise<boolean>;
  removeFriend(userId: string, friendId: string): Promise<void>;

  // Note Folder operations
  createNoteFolder(folder: InsertNoteFolder): Promise<NoteFolder>;
  getNoteFolder(id: string): Promise<NoteFolder | undefined>;
  getUserNoteFolders(userId: string, campaignId?: string, showHidden?: boolean): Promise<NoteFolder[]>;
  updateNoteFolder(id: string, data: Partial<NoteFolder>): Promise<NoteFolder | undefined>;
  deleteNoteFolder(id: string): Promise<void>;
  reorderNoteFolders(folderOrders: { id: string; sortOrder: number }[]): Promise<void>;

  // Note operations
  createNote(note: InsertNote): Promise<Note>;
  getNote(id: string): Promise<Note | undefined>;
  getUserNotes(userId: string, folderId?: string, campaignId?: string): Promise<Note[]>;
  getSharedNotes(userId: string): Promise<Note[]>;
  getCampaignNotesForUser(userId: string, campaignId: string, folderId?: string): Promise<Note[]>;
  updateNote(id: string, data: Partial<Note>): Promise<Note | undefined>;
  deleteNote(id: string): Promise<void>;
  searchNotes(userId: string, query: string): Promise<Note[]>;

  // Note Reference operations
  createNoteReference(ref: InsertNoteReference): Promise<NoteReference>;
  getNoteReferences(noteId: string): Promise<NoteReference[]>;
  getBacklinks(entityType: string, entityId: string): Promise<NoteReference[]>;
  deleteNoteReference(id: string): Promise<void>;
  deleteNoteReferences(noteId: string): Promise<void>;

  // Note Share operations
  createNoteShare(share: InsertNoteShare): Promise<NoteShare>;
  getNoteShares(noteId: string): Promise<NoteShare[]>;
  getFolderShares(folderId: string): Promise<NoteShare[]>;
  getSharedWithUser(userId: string): Promise<NoteShare[]>;
  updateNoteShare(id: string, permission: string): Promise<NoteShare | undefined>;
  deleteNoteShare(id: string): Promise<void>;
  canAccessNote(userId: string, noteId: string): Promise<{ canAccess: boolean; permission: string | null }>;

  // Token Effects CRUD operations
  getTokenEffects(): Promise<TokenEffect[]>;
  getTokenEffect(id: string): Promise<TokenEffect | undefined>;
  createTokenEffect(effect: InsertTokenEffect): Promise<TokenEffect>;
  updateTokenEffect(id: string, effect: Partial<InsertTokenEffect>): Promise<TokenEffect | undefined>;
  deleteTokenEffect(id: string): Promise<void>;

  // Spell Effects (junction table) operations
  getSpellEffects(spellId: string): Promise<(SpellEffect & { effect: TokenEffect })[]>;
  addSpellEffect(spellId: string, effectId: string, triggerCondition: string): Promise<SpellEffect>;
  removeSpellEffect(id: string): Promise<void>;

  // Item Effects (junction table) operations
  getItemEffects(itemId: string): Promise<(ItemEffect & { effect: TokenEffect })[]>;
  addItemEffect(itemId: string, effectId: string, triggerCondition: string): Promise<ItemEffect>;
  removeItemEffect(id: string): Promise<void>;

  // Token Active Effects operations
  getTokenActiveEffects(tokenId: string): Promise<(TokenActiveEffect & { effect: TokenEffect })[]>;
  getTokenActiveEffect(id: string): Promise<TokenActiveEffect | undefined>;
  addTokenActiveEffect(activeEffect: InsertTokenActiveEffect): Promise<TokenActiveEffect>;
  removeTokenActiveEffect(id: string): Promise<void>;
  clearTokenActiveEffects(tokenId: string): Promise<void>;

  // Thrown Items operations
  getThrownItems(sceneId: string): Promise<ThrownItem[]>;
  getThrownItemsByItemId(itemId: string): Promise<ThrownItem[]>;
  createThrownItem(data: InsertThrownItem): Promise<ThrownItem>;
  deleteThrownItem(id: string): Promise<void>;
  deleteThrownItemsByItemId(itemId: string): Promise<void>;
  deleteThrownItemsByScene(sceneId: string): Promise<void>;

  // Admin Notification operations
  createAdminNotification(data: InsertAdminNotification): Promise<AdminNotification>;
  getRecentNotifications(limit?: number): Promise<AdminNotification[]>;

  // Admin User Management operations
  getAllUsers(): Promise<User[]>;
  banUser(userId: string, reason?: string, expiresAt?: Date): Promise<User>;
  unbanUser(userId: string): Promise<User>;
  updateBan(userId: string, reason?: string, expiresAt?: Date): Promise<User>;
  setUserAdmin(userId: string, isAdmin: boolean): Promise<User>;
  deleteUser(userId: string): Promise<void>;
  getUserActivity(userId: string): Promise<{
    campaigns: Campaign[];
    characters: Character[];
    notes: Note[];
    memberships: CampaignMember[];
  }>;

  // User Notification operations
  getUserNotifications(userId: string): Promise<UserNotification[]>;
  getUnreadNotificationCount(userId: string): Promise<number>;
  createUserNotification(data: InsertUserNotification): Promise<UserNotification>;
  markNotificationRead(id: string): Promise<void>;
  markAllNotificationsRead(userId: string): Promise<void>;
  deleteNotification(id: string): Promise<void>;

  // Terms and Conditions operations
  getCurrentTerms(): Promise<TermsAndConditions | undefined>;
  updateTerms(content: string, updatedBy: string): Promise<TermsAndConditions>;
  hasUserAcceptedCurrentTerms(userId: string): Promise<boolean>;
  acceptTerms(userId: string, version: number): Promise<UserTermsAcceptance>;

  // Sandbox folder operations
  getSandboxFolders(campaignId: string): Promise<SandboxFolder[]>;
  createSandboxFolder(folder: InsertSandboxFolder): Promise<SandboxFolder>;
  updateSandboxFolder(id: string, data: Partial<InsertSandboxFolder>): Promise<SandboxFolder>;
  deleteSandboxFolder(id: string): Promise<void>;

  // Sandbox operations
  getSandboxTemplates(campaignId: string): Promise<SandboxTemplate[]>;
  createSandboxTemplate(data: InsertSandboxTemplate): Promise<SandboxTemplate>;
  updateSandboxTemplate(id: string, data: Partial<SandboxTemplate>): Promise<SandboxTemplate>;
  deleteSandboxTemplate(id: string): Promise<void>;
  getSandboxActors(campaignId: string): Promise<SandboxActor[]>;
  createSandboxActor(data: InsertSandboxActor): Promise<SandboxActor>;
  updateSandboxActor(id: string, data: Partial<SandboxActor>): Promise<SandboxActor>;
  deleteSandboxActor(id: string): Promise<void>;

  // Worldbuilding Entity operations
  getEntity(id: string): Promise<Entity | undefined>;
  getEntitiesByCampaign(campaignId: string, includeDeleted?: boolean): Promise<Entity[]>;
  searchEntitiesByCampaign(campaignId: string, query: string, entityType?: string): Promise<Entity[]>;
  createEntity(entity: InsertEntity): Promise<Entity>;
  updateEntity(id: string, data: Partial<Entity>): Promise<Entity | undefined>;
  softDeleteEntity(id: string): Promise<Entity | undefined>;
  restoreEntity(id: string): Promise<Entity | undefined>;
  getEntitiesBySheet(sheetId: string): Promise<Entity[]>;
  getEntitiesByNote(notePageId: string): Promise<Entity[]>;

  // Entity Link operations
  getEntityLink(id: string): Promise<EntityLink | undefined>;
  getEntityLinks(entityId: string): Promise<EntityLink[]>;
  getEntityLinksByCampaign(campaignId: string): Promise<EntityLink[]>;
  createEntityLink(link: InsertEntityLink): Promise<EntityLink>;
  updateEntityLink(id: string, data: Partial<EntityLink>): Promise<EntityLink | undefined>;
  deleteEntityLink(id: string): Promise<void>;
  getEntityReferences(entityId: string): Promise<{ links: EntityLink[]; noteReferences: any[]; }>;

  // Spectator token operations (public read-only campaign share)
  getSpectatorTokenByCampaign(campaignId: string): Promise<SpectatorToken | undefined>;
  getSpectatorTokenByToken(token: string): Promise<SpectatorToken | undefined>;
  upsertSpectatorToken(campaignId: string, token: string, createdBy: string, expiresAt?: Date | null): Promise<SpectatorToken>;
  deleteSpectatorToken(campaignId: string): Promise<void>;
  deleteExpiredSpectatorTokens(): Promise<number>;

  // World Share Link operations
  getWorldShareLink(campaignId: string): Promise<WorldShareLink | undefined>;
  getWorldShareLinkByToken(token: string): Promise<WorldShareLink | undefined>;
  createWorldShareLink(link: InsertWorldShareLink): Promise<WorldShareLink>;
  deleteWorldShareLink(id: string): Promise<void>;

  // World Map operations
  getWorldMaps(campaignId: string): Promise<WorldMap[]>;
  getWorldMap(id: string): Promise<WorldMap | undefined>;
  createWorldMap(map: InsertWorldMap): Promise<WorldMap>;
  updateWorldMap(id: string, data: Partial<WorldMap>): Promise<WorldMap | undefined>;
  deleteWorldMap(id: string): Promise<void>;

  // World Map Pin operations
  getWorldMapPins(mapId: string): Promise<WorldMapPin[]>;
  getWorldMapPin(id: string): Promise<WorldMapPin | undefined>;
  createWorldMapPin(pin: InsertWorldMapPin): Promise<WorldMapPin>;
  updateWorldMapPin(id: string, data: Partial<WorldMapPin>): Promise<WorldMapPin | undefined>;
  deleteWorldMapPin(id: string): Promise<void>;

  // World Calendar operations
  getWorldCalendars(campaignId: string): Promise<WorldCalendar[]>;
  getWorldCalendar(id: string): Promise<WorldCalendar | undefined>;
  createWorldCalendar(calendar: InsertWorldCalendar): Promise<WorldCalendar>;
  updateWorldCalendar(id: string, data: Partial<WorldCalendar>): Promise<WorldCalendar | undefined>;
  deleteWorldCalendar(id: string): Promise<void>;

  // World Timeline Event operations
  getWorldTimelineEvents(campaignId: string): Promise<WorldTimelineEvent[]>;
  getWorldTimelineEvent(id: string): Promise<WorldTimelineEvent | undefined>;
  createWorldTimelineEvent(event: InsertWorldTimelineEvent): Promise<WorldTimelineEvent>;
  updateWorldTimelineEvent(id: string, data: Partial<WorldTimelineEvent>): Promise<WorldTimelineEvent | undefined>;
  deleteWorldTimelineEvent(id: string): Promise<void>;

  // World operations
  getWorldsByUser(userId: string): Promise<World[]>;
  getWorldsByCampaign(campaignId: string): Promise<World[]>;
  getWorld(id: string): Promise<World | undefined>;
  createWorld(world: InsertWorld): Promise<World>;
  updateWorld(id: string, data: Partial<World>): Promise<World | undefined>;
  deleteWorld(id: string): Promise<void>;

  getWorldCanvasNodes(worldId: string): Promise<WorldCanvasNode[]>;
  upsertWorldCanvasNode(node: InsertWorldCanvasNode): Promise<WorldCanvasNode>;
  deleteWorldCanvasNode(worldId: string, refType: string, refId: string): Promise<void>;

  getWorldCollaborators(worldId: string): Promise<WorldCollaborator[]>;
  addWorldCollaborator(worldId: string, userId: string, role?: string): Promise<WorldCollaborator>;
  removeWorldCollaborator(worldId: string, userId: string): Promise<void>;
  isWorldCollaborator(worldId: string, userId: string): Promise<boolean>;
  getWorldsByCollaborator(userId: string): Promise<World[]>;

  getEntityAccessList(entityId: string): Promise<EntityAccess[]>;
  setEntityAccess(entityId: string, userId: string, accessLevel: string): Promise<EntityAccess>;
  removeEntityAccess(entityId: string, userId: string): Promise<void>;
  getUserEntityAccess(entityId: string, userId: string): Promise<EntityAccess | undefined>;

  // World-scoped query operations (query by worldId instead of campaignId)
  getEntitiesByWorld(worldId: string, includeDeleted?: boolean): Promise<Entity[]>;
  searchEntitiesByWorld(worldId: string, query: string, entityType?: string): Promise<Entity[]>;
  getEntityLinksByWorld(worldId: string): Promise<EntityLink[]>;
  getWorldShareLinkByWorld(worldId: string): Promise<WorldShareLink | undefined>;
  getWorldMapsByWorld(worldId: string): Promise<WorldMap[]>;
  getWorldCalendarsByWorld(worldId: string): Promise<WorldCalendar[]>;
  getWorldTimelineEventsByWorld(worldId: string): Promise<WorldTimelineEvent[]>;

  // World Calendar Sync operations
  getCalendarSyncsByWorld(worldId: string): Promise<WorldCalendarSync[]>;
  getCalendarSync(id: string): Promise<WorldCalendarSync | undefined>;
  createCalendarSync(sync: InsertWorldCalendarSync): Promise<WorldCalendarSync>;
  deleteCalendarSync(id: string): Promise<void>;

  // World Timeline operations
  getTimelinesByWorld(worldId: string): Promise<WorldTimeline[]>;
  getTimelinesByCampaign(campaignId: string): Promise<WorldTimeline[]>;
  getTimeline(id: string): Promise<WorldTimeline | undefined>;
  createTimeline(data: InsertWorldTimeline): Promise<WorldTimeline>;
  updateTimeline(id: string, data: Partial<WorldTimeline>): Promise<WorldTimeline | undefined>;
  deleteTimeline(id: string): Promise<void>;

  // Campaign Map Pin operations
  getCampaignMapPins(sceneId: string): Promise<CampaignMapPin[]>;
  getCampaignMapPin(id: string): Promise<CampaignMapPin | undefined>;
  createCampaignMapPin(pin: InsertCampaignMapPin): Promise<CampaignMapPin>;
  updateCampaignMapPin(id: string, data: Partial<InsertCampaignMapPin>): Promise<CampaignMapPin | undefined>;
  deleteCampaignMapPin(id: string): Promise<void>;

  // Shop Item operations
  getShopItems(pinId: string): Promise<ShopItem[]>;
  getShopItem(id: string): Promise<ShopItem | undefined>;
  createShopItem(item: InsertShopItem): Promise<ShopItem>;
  updateShopItem(id: string, data: Partial<InsertShopItem>): Promise<ShopItem | undefined>;
  deleteShopItem(id: string): Promise<void>;

  // Shop Haggle Roll operations
  getShopHaggleRolls(pinId: string): Promise<ShopHaggleRoll[]>;
  getShopHaggleRoll(pinId: string, characterId: string): Promise<ShopHaggleRoll | undefined>;
  upsertShopHaggleRoll(data: InsertShopHaggleRoll): Promise<ShopHaggleRoll>;
  deleteShopHaggleRoll(pinId: string, characterId: string): Promise<void>;

  // Class operations (AA V2)
  getClasses(systemName: string): Promise<GameClass[]>;
  getClass(id: string): Promise<GameClass | undefined>;
  createClass(data: InsertClass): Promise<GameClass>;
  updateClass(id: string, data: Partial<InsertClass>): Promise<GameClass | undefined>;
  deleteClass(id: string): Promise<void>;
  getUniversalClasses(systemName: string): Promise<GameClass[]>;
  getCharacterIdsByCampaignSystem(systemName: string): Promise<string[]>;

  // Class skill node operations
  getClassSkillNodes(classId: string): Promise<ClassSkillNode[]>;
  getClassSkillNode(id: string): Promise<ClassSkillNode | undefined>;
  createClassSkillNode(data: InsertClassSkillNode): Promise<ClassSkillNode>;
  updateClassSkillNode(id: string, data: Partial<InsertClassSkillNode>): Promise<ClassSkillNode | undefined>;
  deleteClassSkillNode(id: string): Promise<void>;

  // Class skill connection operations
  getClassSkillConnections(classId: string): Promise<ClassSkillConnection[]>;
  createClassSkillConnection(data: InsertClassSkillConnection): Promise<ClassSkillConnection>;
  deleteClassSkillConnection(id: string): Promise<void>;

  // Character class operations
  getCharacterClasses(characterId: string): Promise<CharacterClass[]>;
  createCharacterClass(data: InsertCharacterClass): Promise<CharacterClass>;
  updateCharacterClass(id: string, data: Partial<InsertCharacterClass>): Promise<CharacterClass | undefined>;
  deleteCharacterClass(id: string): Promise<void>;

  // Character class skill operations
  getCharacterClassSkills(characterId: string, classId: string): Promise<CharacterClassSkill[]>;
  createCharacterClassSkill(data: InsertCharacterClassSkill): Promise<CharacterClassSkill>;
  deleteCharacterClassSkill(id: string): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  // Helper to convert legacy multi-currency price fields to new price/currency format
  private convertLegacyItemPrice(item: Item): Item {
    // If item already has price set, return as-is
    if (item.price && item.price > 0) {
      return item;
    }
    
    // Convert from legacy fields (priceCopper, priceSilver, priceGold, pricePlatinum)
    const legacyItem = item as any;
    if (legacyItem.pricePlatinum && legacyItem.pricePlatinum > 0) {
      return { ...item, price: legacyItem.pricePlatinum, currency: 'platinum' };
    } else if (legacyItem.priceGold && legacyItem.priceGold > 0) {
      return { ...item, price: legacyItem.priceGold, currency: 'gold' };
    } else if (legacyItem.priceSilver && legacyItem.priceSilver > 0) {
      return { ...item, price: legacyItem.priceSilver, currency: 'silver' };
    } else if (legacyItem.priceCopper && legacyItem.priceCopper > 0) {
      return { ...item, price: legacyItem.priceCopper, currency: 'copper' };
    }
    
    return item;
  }

  // Entity search for notes reference picker
  async searchEntities(query: string, type?: string, userId?: string): Promise<SearchableEntity[]> {
    const results: SearchableEntity[] = [];
    const searchPattern = `%${query}%`;
    const limit = 20;

    // Search SystemSpells
    if (!type || type === 'all' || type === 'spell') {
      const spellResults = await db.select({
        id: systemSpells.id,
        name: systemSpells.name,
        description: systemSpells.description,
        icon: systemSpells.icon,
      })
        .from(systemSpells)
        .where(sql`${systemSpells.name} ILIKE ${searchPattern}`)
        .limit(limit);
      
      results.push(...spellResults.map(s => ({
        id: s.id,
        type: 'spell' as const,
        name: s.name,
        description: s.description ?? undefined,
        icon: s.icon ?? undefined,
      })));
    }

    // Search SystemTraits
    if (!type || type === 'all' || type === 'trait') {
      const traitResults = await db.select({
        id: systemTraits.id,
        name: systemTraits.name,
        description: systemTraits.description,
      })
        .from(systemTraits)
        .where(sql`${systemTraits.name} ILIKE ${searchPattern}`)
        .limit(limit);
      
      results.push(...traitResults.map(t => ({
        id: t.id,
        type: 'trait' as const,
        name: t.name,
        description: t.description ?? undefined,
      })));
    }

    // Search SystemSkills
    if (!type || type === 'all' || type === 'skill') {
      const skillResults = await db.select({
        id: systemSkills.id,
        name: systemSkills.name,
        description: systemSkills.description,
      })
        .from(systemSkills)
        .where(sql`${systemSkills.name} ILIKE ${searchPattern}`)
        .limit(limit);
      
      results.push(...skillResults.map(s => ({
        id: s.id,
        type: 'skill' as const,
        name: s.name,
        description: s.description ?? undefined,
      })));
    }

    // Search System Items (items with isTemplate = true and no characterId)
    if (!type || type === 'all' || type === 'item') {
      const itemResults = await db.select({
        id: items.id,
        name: items.name,
        description: items.description,
        image: items.image,
      })
        .from(items)
        .where(and(
          sql`${items.name} ILIKE ${searchPattern}`,
          eq(items.isTemplate, true)
        ))
        .limit(limit);
      
      results.push(...itemResults.map(i => ({
        id: i.id,
        type: 'item' as const,
        name: i.name,
        description: i.description ?? undefined,
        icon: i.image ?? undefined,
      })));
    }

    // Search SystemSpecies
    if (!type || type === 'all' || type === 'species') {
      const speciesResults = await db.select({
        id: systemSpecies.id,
        name: systemSpecies.name,
        description: systemSpecies.description,
        defaultImage: systemSpecies.defaultImage,
      })
        .from(systemSpecies)
        .where(sql`${systemSpecies.name} ILIKE ${searchPattern}`)
        .limit(limit);
      
      results.push(...speciesResults.map(s => ({
        id: s.id,
        type: 'species' as const,
        name: s.name,
        description: s.description ?? undefined,
        icon: s.defaultImage ?? undefined,
      })));
    }

    // Search Characters with permission filtering
    if ((!type || type === 'all' || type === 'character') && userId) {
      // Get campaigns where user is GM
      const gmCampaigns = await db.select({ id: campaigns.id })
        .from(campaigns)
        .where(eq(campaigns.gmUserId, userId));
      
      const gmCampaignIds = gmCampaigns.map(c => c.id);
      
      // Find characters: either owned by user OR in campaigns where user is GM
      const characterResults = await db.select({
        id: characters.id,
        name: characters.name,
        portrait: characters.portrait,
        race: characters.race,
        userId: characters.userId,
        campaignId: characters.campaignId,
      })
        .from(characters)
        .where(and(
          sql`${characters.name} ILIKE ${searchPattern}`,
          or(
            eq(characters.userId, userId),
            gmCampaignIds.length > 0 ? inArray(characters.campaignId, gmCampaignIds) : sql`false`
          )
        ))
        .limit(limit);
      
      results.push(...characterResults.map(c => ({
        id: c.id,
        type: 'character' as const,
        name: c.name,
        description: `${c.race}`,
        icon: c.portrait ?? undefined,
      })));
    }

    // Sort by name and limit total results
    return results.sort((a, b) => a.name.localeCompare(b.name)).slice(0, 50);
  }

  // User operations
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username)).limit(1);
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  // Campaign operations
  async getCampaign(id: string): Promise<Campaign | undefined> {
    const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, id)).limit(1);
    return campaign;
  }

  async getCampaignByInviteCode(code: string): Promise<Campaign | undefined> {
    const [campaign] = await db.select().from(campaigns).where(eq(campaigns.inviteCode, code)).limit(1);
    return campaign;
  }

  async createCampaign(insertCampaign: InsertCampaign): Promise<Campaign> {
    const [campaign] = await db.insert(campaigns).values(insertCampaign).returning();
    return campaign;
  }

  async updateCampaign(id: string, data: Partial<Campaign>): Promise<Campaign | undefined> {
    const [campaign] = await db.update(campaigns)
      .set({ ...data, lastPlayed: new Date() })
      .where(eq(campaigns.id, id))
      .returning();
    return campaign;
  }

  async deleteCampaign(id: string): Promise<void> {
    // Database CASCADE constraints will automatically delete related records
    await db.delete(campaigns).where(eq(campaigns.id, id));
  }

  async getUserCampaigns(userId: string): Promise<{ created: any[], joined: any[] }> {
    // Get campaigns where user is GM (owner) with favorite status
    const createdCampaignsData = await db.select()
      .from(campaigns)
      .leftJoin(campaignMembers, and(
        eq(campaignMembers.campaignId, campaigns.id),
        eq(campaignMembers.userId, userId)
      ))
      .where(eq(campaigns.gmUserId, userId))
      .orderBy(desc(campaigns.lastPlayed));

    const createdCampaigns = createdCampaignsData.map((row: any) => ({
      ...row.campaigns,
      favorite: row.campaign_members?.favorite ?? false,
      userRole: 'gm' // Owner always has gm role
    }));

    // Get campaigns where user is assistant_gm (not owner but has GM privileges)
    const assistantGmCampaignsData = await db.select()
      .from(campaignMembers)
      .innerJoin(campaigns, eq(campaignMembers.campaignId, campaigns.id))
      .where(and(
        eq(campaignMembers.userId, userId),
        eq(campaignMembers.role, "assistant_gm")
      ))
      .orderBy(desc(campaigns.lastPlayed));

    const assistantGmCampaigns = assistantGmCampaignsData.map((row: any) => ({
      ...row.campaigns,
      favorite: row.campaign_members?.favorite ?? false,
      userRole: 'gm' // Assistant GM also gets gm role for UI purposes
    }));

    // Get campaigns where user is a regular player member (but not GM/assistant_gm)
    const joinedCampaignsData = await db.select()
      .from(campaignMembers)
      .innerJoin(campaigns, eq(campaignMembers.campaignId, campaigns.id))
      .where(and(
        eq(campaignMembers.userId, userId),
        eq(campaignMembers.role, "player")
      ))
      .orderBy(desc(campaigns.lastPlayed));

    const joinedCampaigns = joinedCampaignsData.map((row: any) => ({
      ...row.campaigns,
      favorite: row.campaign_members?.favorite ?? false,
      userRole: 'player'
    }));

    return {
      // Include both owners and assistant GMs in 'created' since they have GM privileges
      created: [...createdCampaigns, ...assistantGmCampaigns],
      joined: joinedCampaigns
    };
  }

  async duplicateCampaign(campaignId: string, newGmUserId: string): Promise<Campaign> {
    // Get the original campaign
    const originalCampaign = await this.getCampaign(campaignId);
    if (!originalCampaign) {
      throw new Error("Campaign not found");
    }

    // Generate a new unique invite code
    const inviteCode = "ARCANA-" + Math.floor(1000 + Math.random() * 9000);

    // Create the new campaign with copied properties
    const [newCampaign] = await db.insert(campaigns).values({
      name: originalCampaign.name + " (Copy)",
      inviteCode,
      gmUserId: newGmUserId,
      gridSize: originalCampaign.gridSize,
      hotbarSlots: originalCampaign.hotbarSlots,
    }).returning();

    // Get and copy scene folders first (so we can map old folder IDs to new folder IDs)
    const originalSceneFolders = await this.getSceneFolders(campaignId);
    const folderIdMap = new Map<string, string>(); // old folderId -> new folderId

    for (const folder of originalSceneFolders) {
      const [newFolder] = await db.insert(sceneFolders).values({
        campaignId: newCampaign.id,
        name: folder.name,
        sortOrder: folder.sortOrder,
      }).returning();
      folderIdMap.set(folder.id, newFolder.id);
    }

    // Get and copy scenes
    const originalScenes = await this.getCampaignScenes(campaignId);
    const sceneIdMap = new Map<string, string>(); // old sceneId -> new sceneId

    for (const scene of originalScenes) {
      const newFolderId = scene.folderId ? folderIdMap.get(scene.folderId) : null;
      const [newScene] = await db.insert(scenes).values({
        campaignId: newCampaign.id,
        folderId: newFolderId || null,
        name: scene.name,
        backgroundImage: scene.backgroundImage,
        gridEnabled: scene.gridEnabled,
        gridType: scene.gridType,
        gridSize: scene.gridSize,
        gridColor: scene.gridColor,
        gridThickness: scene.gridThickness,
        gridOpacity: scene.gridOpacity,
        defaultViewX: scene.defaultViewX,
        defaultViewY: scene.defaultViewY,
        defaultViewZoom: scene.defaultViewZoom,
        defaultViewVersion: scene.defaultViewVersion,
        inCombat: false, // Reset combat state
        currentTurnCharacterId: null,
      }).returning();
      sceneIdMap.set(scene.id, newScene.id);
    }

    // If the original campaign had an active scene, set the corresponding new scene as active
    if (originalCampaign.activeSceneId && sceneIdMap.has(originalCampaign.activeSceneId)) {
      await this.updateCampaign(newCampaign.id, {
        activeSceneId: sceneIdMap.get(originalCampaign.activeSceneId),
      });
    }

    return newCampaign;
  }

  // Campaign Member operations
  async addCampaignMember(member: InsertCampaignMember): Promise<CampaignMember> {
    const [campaignMember] = await db.insert(campaignMembers).values(member).returning();
    return campaignMember;
  }

  async getCampaignMembers(campaignId: string): Promise<any[]> {
    const membersData = await db.select()
      .from(campaignMembers)
      .innerJoin(users, eq(campaignMembers.userId, users.id))
      .where(eq(campaignMembers.campaignId, campaignId));

    return membersData.map((row: any) => ({
      id: row.campaign_members.id,
      campaignId: row.campaign_members.campaignId,
      userId: row.campaign_members.userId,
      role: row.campaign_members.role,
      favorite: row.campaign_members.favorite,
      assignedCharacterId: row.campaign_members.assignedCharacterId,
      joinedAt: row.campaign_members.joinedAt,
      beaconColor: row.campaign_members.beaconColor,
      trustedPlayer: row.campaign_members.trustedPlayer,
      username: row.users.username,
      avatarUrl: row.users.avatarUrl
    }));
  }

  async getCampaignMembership(userId: string, campaignId: string): Promise<CampaignMember | null> {
    const [membership] = await db
      .select()
      .from(campaignMembers)
      .where(
        and(
          eq(campaignMembers.userId, userId),
          eq(campaignMembers.campaignId, campaignId)
        )
      )
      .limit(1);
    
    return membership || null;
  }

  async removeCampaignMember(campaignId: string, userId: string): Promise<void> {
    await db.delete(campaignMembers)
      .where(and(
        eq(campaignMembers.campaignId, campaignId),
        eq(campaignMembers.userId, userId)
      ));
  }

  async toggleFavorite(campaignId: string, userId: string): Promise<void> {
    const campaign = await this.getCampaign(campaignId);
    if (!campaign) {
      throw new Error("Campaign not found");
    }

    const [member] = await db.select()
      .from(campaignMembers)
      .where(and(
        eq(campaignMembers.campaignId, campaignId),
        eq(campaignMembers.userId, userId)
      ))
      .limit(1);

    if (!member) {
      if (campaign.gmUserId === userId) {
        await db.insert(campaignMembers).values({
          campaignId,
          userId,
          role: "gm",
          favorite: true
        });
      } else {
        throw new Error("Only campaign members can favorite a campaign");
      }
    } else {
      await db.update(campaignMembers)
        .set({ favorite: !member.favorite })
        .where(eq(campaignMembers.id, member.id));
    }
  }

  async setAssignedCharacter(campaignId: string, userId: string, characterId: string | null): Promise<void> {
    const [member] = await db.select()
      .from(campaignMembers)
      .where(and(
        eq(campaignMembers.campaignId, campaignId),
        eq(campaignMembers.userId, userId)
      ))
      .limit(1);

    if (member) {
      await db.update(campaignMembers)
        .set({ assignedCharacterId: characterId })
        .where(eq(campaignMembers.id, member.id));
    } else {
      // Create a member record if one doesn't exist (e.g., for GM who created campaign)
      const campaign = await this.getCampaign(campaignId);
      if (campaign) {
        const role = campaign.gmUserId === userId ? 'gm' : 'player';
        await db.insert(campaignMembers).values({
          campaignId,
          userId,
          role,
          assignedCharacterId: characterId,
        });
      }
    }
  }

  async getAssignedCharacter(campaignId: string, userId: string): Promise<string | null> {
    const [member] = await db.select()
      .from(campaignMembers)
      .where(and(
        eq(campaignMembers.campaignId, campaignId),
        eq(campaignMembers.userId, userId)
      ))
      .limit(1);

    return member?.assignedCharacterId || null;
  }

  async getGmHotbar(campaignId: string, userId: string): Promise<(string | null)[]> {
    const [member] = await db.select()
      .from(campaignMembers)
      .where(and(
        eq(campaignMembers.campaignId, campaignId),
        eq(campaignMembers.userId, userId)
      ))
      .limit(1);

    // Return stored hotbar or default 5-slot empty array
    return member?.gmHotbar || [null, null, null, null, null];
  }

  async updateGmHotbar(campaignId: string, userId: string, hotbar: (string | null)[]): Promise<void> {
    const [member] = await db.select()
      .from(campaignMembers)
      .where(and(
        eq(campaignMembers.campaignId, campaignId),
        eq(campaignMembers.userId, userId)
      ))
      .limit(1);

    const filteredHotbar = hotbar.filter((id): id is string => id !== null);
    if (member) {
      await db.update(campaignMembers)
        .set({ gmHotbar: filteredHotbar })
        .where(eq(campaignMembers.id, member.id));
    } else {
      // Create a member record if one doesn't exist (e.g., for GM who created campaign)
      const campaign = await this.getCampaign(campaignId);
      if (campaign) {
        const role = campaign.gmUserId === userId ? 'gm' : 'player';
        await db.insert(campaignMembers).values({
          campaignId,
          userId,
          role,
          gmHotbar: filteredHotbar,
        });
      }
    }
  }

  async isGM(userId: string, campaignId: string): Promise<boolean> {
    const campaign = await this.getCampaign(campaignId);
    if (!campaign) {
      return false;
    }

    // Check if user is the GM (owner) of the campaign
    if (campaign.gmUserId === userId) {
      return true;
    }

    // Also check campaign members table - both 'gm' and 'assistant_gm' have GM permissions
    const [member] = await db.select()
      .from(campaignMembers)
      .where(and(
        eq(campaignMembers.userId, userId),
        eq(campaignMembers.campaignId, campaignId)
      ))
      .limit(1);

    return member?.role === 'gm' || member?.role === 'assistant_gm';
  }

  async isOwner(userId: string, campaignId: string): Promise<boolean> {
    const campaign = await this.getCampaign(campaignId);
    if (!campaign) {
      return false;
    }
    return campaign.gmUserId === userId;
  }

  async setMemberRole(campaignId: string, memberId: string, role: 'player' | 'assistant_gm'): Promise<CampaignMember | undefined> {
    const [member] = await db.update(campaignMembers)
      .set({ role })
      .where(and(
        eq(campaignMembers.id, memberId),
        eq(campaignMembers.campaignId, campaignId)
      ))
      .returning();
    return member;
  }

  async setMemberTrustedPlayer(campaignId: string, memberId: string, trusted: boolean): Promise<CampaignMember | undefined> {
    const [member] = await db.update(campaignMembers)
      .set({ trustedPlayer: trusted })
      .where(and(
        eq(campaignMembers.id, memberId),
        eq(campaignMembers.campaignId, campaignId)
      ))
      .returning();
    return member;
  }

  async updateMemberBeaconColor(campaignId: string, userId: string, beaconColor: string): Promise<CampaignMember | undefined> {
    const [member] = await db.update(campaignMembers)
      .set({ beaconColor })
      .where(and(
        eq(campaignMembers.campaignId, campaignId),
        eq(campaignMembers.userId, userId)
      ))
      .returning();
    return member;
  }

  // Character operations
  async createCharacter(character: InsertCharacter): Promise<Character> {
    const [char] = await db.insert(characters).values(character).returning();
    return char;
  }

  async getCharacter(id: string): Promise<Character | undefined> {
    const [character] = await db.select().from(characters).where(eq(characters.id, id)).limit(1);
    return character;
  }

  async getCharactersByIds(ids: string[]): Promise<Character[]> {
    if (ids.length === 0) return [];
    return await db.select().from(characters).where(inArray(characters.id, ids));
  }

  async getCampaignCharacters(campaignId: string): Promise<Character[]> {
    return await db.select()
      .from(characters)
      .where(eq(characters.campaignId, campaignId));
  }

  async updateCharacter(id: string, data: Partial<Character>): Promise<Character | undefined> {
    const coerced: any = { ...data };
    const zeroDefaultKeys = new Set(['tempHp', 'tempEnergy', 'tempMana', 'bonusMaxHp', 'bonusMaxEnergy', 'bonusMaxMana']);
    for (const k of ['hp', 'maxHp', 'energy', 'maxEnergy', 'mana', 'maxMana', 'tempHp', 'tempEnergy', 'tempMana', 'bonusMaxHp', 'bonusMaxEnergy', 'bonusMaxMana'] as const) {
      if (k in coerced) {
        const v = (coerced as any)[k];
        if (v === null || v === undefined || v === '' || (typeof v === 'number' && Number.isNaN(v))) {
          if (zeroDefaultKeys.has(k)) {
            (coerced as any)[k] = 0;
          } else {
            delete (coerced as any)[k];
          }
        } else if (typeof v === 'string') {
          const n = parseInt(v, 10);
          if (!Number.isNaN(n)) (coerced as any)[k] = n;
          else if (zeroDefaultKeys.has(k)) (coerced as any)[k] = 0;
          else delete (coerced as any)[k];
        }
      }
    }
    const [character] = await db.update(characters)
      .set(coerced)
      .where(eq(characters.id, id))
      .returning();
    return character;
  }

  async deleteCharacter(id: string): Promise<void> {
    await db.delete(characters).where(eq(characters.id, id));
  }

  async deleteCharacterWithTokens(id: string): Promise<void> {
    await db.delete(tokens).where(eq(tokens.characterId, id));
    await db.delete(items).where(eq(items.characterId, id));
    await db.delete(hotbars).where(eq(hotbars.characterId, id));
    await db.delete(spells).where(eq(spells.characterId, id));
    await db.delete(characterPermissions).where(eq(characterPermissions.characterId, id));
    await db.delete(initiativeEntries).where(eq(initiativeEntries.characterId, id));
    await db.delete(characters).where(eq(characters.id, id));
  }

  // Character Template operations (admin-created character sheets)
  async getCharacterTemplates(ownerScope?: string[], worldId?: string): Promise<Character[]> {
    const conditions: any[] = [eq(characters.isTemplate, true)];
    // World-scoping (Task #120): see getSystemItems for the worldId semantics.
    if (worldId) {
      conditions.push(eq(characters.worldId, worldId));
    } else {
      conditions.push(sql`${characters.worldId} IS NULL`);
      if (ownerScope) {
        conditions.push(
          ownerScope.length > 0
            ? or(sql`${characters.ownerUserId} IS NULL`, inArray(characters.ownerUserId, ownerScope))!
            : sql`${characters.ownerUserId} IS NULL`
        );
      }
    }
    return await db.select()
      .from(characters)
      .where(and(...conditions))
      .orderBy(characters.name);
  }

  async getCharacterTemplate(id: string): Promise<Character | undefined> {
    const [template] = await db.select()
      .from(characters)
      .where(and(eq(characters.id, id), eq(characters.isTemplate, true)))
      .limit(1);
    return template;
  }

  async createCharacterTemplate(data: Partial<InsertCharacter>): Promise<Character> {
    const [template] = await db.insert(characters)
      .values({
        ...data,
        isTemplate: true,
        campaignId: null,
        userId: null,
        name: data.name || 'New Character',
        hp: data.hp ?? 10,
        maxHp: data.maxHp ?? 10,
        energy: data.energy ?? 10,
        maxEnergy: data.maxEnergy ?? 10,
      } as any)
      .returning();
    return template;
  }

  async updateCharacterTemplate(id: string, data: Partial<Character>): Promise<Character | undefined> {
    const [template] = await db.update(characters)
      .set(data)
      .where(and(eq(characters.id, id), eq(characters.isTemplate, true)))
      .returning();
    return template;
  }

  async deleteCharacterTemplate(id: string): Promise<void> {
    // Delete related data first
    await db.delete(items).where(eq(items.characterId, id));
    await db.delete(hotbars).where(eq(hotbars.characterId, id));
    await db.delete(spells).where(eq(spells.characterId, id));
    await db.delete(characters).where(and(eq(characters.id, id), eq(characters.isTemplate, true)));
  }

  async copyTemplateToCompany(templateId: string, campaignId: string, userId: string): Promise<Character> {
    // Get the template
    const template = await this.getCharacterTemplate(templateId);
    if (!template) {
      throw new Error('Template not found');
    }
    
    // Create a new character from the template (without id, createdAt, isTemplate)
    const { id, createdAt, isTemplate, folderId, ...templateData } = template;
    
    const [newChar] = await db.insert(characters)
      .values({
        ...templateData,
        campaignId,
        userId,
        isTemplate: false,
        folderId: null, // Put in Unfiled folder
      })
      .returning();
    
    // Track old ID -> new ID mappings for items and spells
    const itemIdMap = new Map<string, string>();
    const spellIdMap = new Map<string, string>();
    
    const templateItems = await this.getItemsByCharacter(templateId);
    if (templateItems.length > 0) {
      const newItems = await db.insert(items).values(
        templateItems.map(item => {
          const { id: _oldId, characterId: _cid, containerId: _cntId, ...itemData } = item;
          return { ...itemData, characterId: newChar.id, containerId: null };
        })
      ).returning();
      templateItems.forEach((oldItem, i) => itemIdMap.set(oldItem.id, newItems[i].id));
      const containerUpdates = templateItems.filter(item => item.containerId);
      if (containerUpdates.length > 0) {
        await Promise.all(containerUpdates.map(item => {
          const newItemId = itemIdMap.get(item.id);
          const newContainerId = itemIdMap.get(item.containerId!);
          if (newItemId && newContainerId) {
            return db.update(items).set({ containerId: newContainerId }).where(eq(items.id, newItemId));
          }
        }));
      }
    }
    
    const templateSpells = await this.getSpellsByCharacter(templateId);
    if (templateSpells.length > 0) {
      const newSpells = await db.insert(spells).values(
        templateSpells.map(spell => {
          const { id: _oldId, characterId: _cid, ...spellData } = spell;
          return { ...spellData, characterId: newChar.id };
        })
      ).returning();
      templateSpells.forEach((oldSpell, i) => spellIdMap.set(oldSpell.id, newSpells[i].id));
    }
    
    const templateHotbars = await this.getHotbarsByCharacter(templateId);
    if (templateHotbars.length > 0) {
      await db.insert(hotbars).values(
        templateHotbars.map(hotbar => {
          const { id: _hid, characterId: _cid, itemId: oldItemId, spellId: oldSpellId, ...hotbarData } = hotbar;
          return {
            ...hotbarData,
            characterId: newChar.id,
            itemId: oldItemId ? itemIdMap.get(oldItemId) || null : null,
            spellId: oldSpellId ? spellIdMap.get(oldSpellId) || null : null,
          };
        })
      );
    }
    
    return newChar;
  }

  async copyCharacterToAdminLibrary(characterId: string, folderId: string | null = null): Promise<Character> {
    // Get the campaign character
    const character = await this.getCharacter(characterId);
    if (!character) {
      throw new Error('Character not found');
    }
    
    // Create a new template from the character (without id, createdAt, campaignId, userId)
    const { id, createdAt, campaignId, userId, ...characterData } = character;
    
    const [newTemplate] = await db.insert(characters)
      .values({
        ...characterData,
        campaignId: null,
        userId: null,
        isTemplate: true,
        folderId: folderId,
      })
      .returning();
    
    // Track old ID -> new ID mappings for items and spells
    const itemIdMap = new Map<string, string>();
    const spellIdMap = new Map<string, string>();
    
    const characterItems = await this.getItemsByCharacter(characterId);
    if (characterItems.length > 0) {
      const newItems = await db.insert(items).values(
        characterItems.map(item => {
          const { id: _oldId, characterId: _cid, containerId: _cntId, ...itemData } = item;
          return { ...itemData, characterId: newTemplate.id, containerId: null };
        })
      ).returning();
      characterItems.forEach((oldItem, i) => itemIdMap.set(oldItem.id, newItems[i].id));
      const containerUpdates = characterItems.filter(item => item.containerId);
      if (containerUpdates.length > 0) {
        await Promise.all(containerUpdates.map(item => {
          const newItemId = itemIdMap.get(item.id);
          const newContainerId = itemIdMap.get(item.containerId!);
          if (newItemId && newContainerId) {
            return db.update(items).set({ containerId: newContainerId }).where(eq(items.id, newItemId));
          }
        }));
      }
    }
    
    const characterSpells = await this.getSpellsByCharacter(characterId);
    if (characterSpells.length > 0) {
      const newSpells = await db.insert(spells).values(
        characterSpells.map(spell => {
          const { id: _oldId, characterId: _cid, ...spellData } = spell;
          return { ...spellData, characterId: newTemplate.id };
        })
      ).returning();
      characterSpells.forEach((oldSpell, i) => spellIdMap.set(oldSpell.id, newSpells[i].id));
    }
    
    const characterHotbars = await this.getHotbarsByCharacter(characterId);
    if (characterHotbars.length > 0) {
      await db.insert(hotbars).values(
        characterHotbars.map(hotbar => {
          const { id: _hid, characterId: _cid, itemId: oldItemId, spellId: oldSpellId, ...hotbarData } = hotbar;
          return {
            ...hotbarData,
            characterId: newTemplate.id,
            itemId: oldItemId ? itemIdMap.get(oldItemId) || null : null,
            spellId: oldSpellId ? spellIdMap.get(oldSpellId) || null : null,
          };
        })
      );
    }
    
    const customSkillsList = await this.getCharacterCustomSkills(characterId);
    if (customSkillsList.length > 0) {
      await db.insert(characterCustomSkills).values(
        customSkillsList.map(skill => {
          const { id: _sid, characterId: _cid, ...skillData } = skill;
          return { ...skillData, characterId: newTemplate.id };
        })
      );
    }
    
    const traitsList = await this.getCharacterTraits(characterId);
    if (traitsList.length > 0) {
      await db.insert(characterTraits).values(
        traitsList.map(trait => {
          const { id: _tid, characterId: _cid, ...traitData } = trait;
          return { ...traitData, characterId: newTemplate.id };
        })
      );
    }
    
    return newTemplate;
  }

  async importCharacterToCampaign(characterId: string, targetCampaignId: string, targetUserId: string | null): Promise<Character> {
    // Get the source character
    const sourceCharacter = await this.getCharacter(characterId);
    if (!sourceCharacter) {
      throw new Error('Source character not found');
    }
    
    // Create a new character in the target campaign (without id, createdAt, campaignId, userId)
    const { id, createdAt, campaignId, userId, folderId, ...characterData } = sourceCharacter;
    
    const [newChar] = await db.insert(characters)
      .values({
        ...characterData,
        campaignId: targetCampaignId,
        userId: targetUserId,
        isTemplate: false,
        folderId: null,
      })
      .returning();
    
    // Track old ID -> new ID mappings for items and spells
    const itemIdMap = new Map<string, string>();
    const spellIdMap = new Map<string, string>();
    
    const sourceItems = await this.getItemsByCharacter(characterId);
    if (sourceItems.length > 0) {
      const newItems = await db.insert(items).values(
        sourceItems.map(item => {
          const { id: _oldId, characterId: _cid, containerId: _cntId, ...itemData } = item;
          return { ...itemData, characterId: newChar.id, containerId: null };
        })
      ).returning();
      sourceItems.forEach((oldItem, i) => itemIdMap.set(oldItem.id, newItems[i].id));
      const containerUpdates = sourceItems.filter(item => item.containerId);
      if (containerUpdates.length > 0) {
        await Promise.all(containerUpdates.map(item => {
          const newItemId = itemIdMap.get(item.id);
          const newContainerId = itemIdMap.get(item.containerId!);
          if (newItemId && newContainerId) {
            return db.update(items).set({ containerId: newContainerId }).where(eq(items.id, newItemId));
          }
        }));
      }
    }
    
    const sourceSpells = await this.getSpellsByCharacter(characterId);
    if (sourceSpells.length > 0) {
      const newSpells = await db.insert(spells).values(
        sourceSpells.map(spell => {
          const { id: _oldId, characterId: _cid, ...spellData } = spell;
          return { ...spellData, characterId: newChar.id };
        })
      ).returning();
      sourceSpells.forEach((oldSpell, i) => spellIdMap.set(oldSpell.id, newSpells[i].id));
    }
    
    const sourceHotbars = await this.getHotbarsByCharacter(characterId);
    if (sourceHotbars.length > 0) {
      await db.insert(hotbars).values(
        sourceHotbars.map(hotbar => {
          const { id: _hid, characterId: _cid, itemId: oldItemId, spellId: oldSpellId, ...hotbarData } = hotbar;
          return {
            ...hotbarData,
            characterId: newChar.id,
            itemId: oldItemId ? itemIdMap.get(oldItemId) || null : null,
            spellId: oldSpellId ? spellIdMap.get(oldSpellId) || null : null,
          };
        })
      );
    }
    
    const customSkillsList = await this.getCharacterCustomSkills(characterId);
    if (customSkillsList.length > 0) {
      await db.insert(characterCustomSkills).values(
        customSkillsList.map(skill => {
          const { id: _sid, characterId: _cid, ...skillData } = skill;
          return { ...skillData, characterId: newChar.id };
        })
      );
    }
    
    const traitsList = await this.getCharacterTraits(characterId);
    if (traitsList.length > 0) {
      await db.insert(characterTraits).values(
        traitsList.map(trait => {
          const { id: _tid, characterId: _cid, ...traitData } = trait;
          return { ...traitData, characterId: newChar.id };
        })
      );
    }
    
    return newChar;
  }

  // Copy all roll entries from one owner (item/spell) to another, producing
  // standalone (unlinked) copies. Strips identity + provenance so the copies
  // are fully independent of any template.
  private async copyRollEntriesToOwner(ownerType: 'item' | 'spell', sourceOwnerId: string, newOwnerId: string): Promise<void> {
    const rolls = await this.getRollEntries(ownerType, sourceOwnerId);
    if (rolls.length === 0) return;
    const toInsert = rolls.map((r) => {
      const {
        id: _id, ownerId: _oid, ownerType: _ot,
        fromTemplateRollId: _ftr, isOverridden: _io,
        createdAt: _ca, updatedAt: _ua, ...rest
      } = r as any;
      return { ...rest, ownerType, ownerId: newOwnerId };
    });
    await this.createRollEntriesBulk(toInsert as InsertRollEntry[]);
  }

  // Copy all crafter recipes attached to a source item onto a new item as
  // fully standalone copies. Strips identity + template provenance
  // (parentTemplateId / fromTemplateRecipeId) so the imported crafter makes a
  // clean break from any recipe-template link inheritance — mirroring the
  // roll-template clean-break decision in copyRollEntriesToOwner. Ingredient
  // and outcome item references are preserved as-is (they point at library/
  // admin items that still exist). AA V2 crafter items only.
  private async copyCraftRecipesToItem(sourceItemId: string, newItemId: string): Promise<void> {
    const recipes = await this.getCraftRecipesByItem(sourceItemId);
    if (recipes.length === 0) return;
    for (const r of recipes) {
      const {
        id: _id, parentItemId: _pi, parentTemplateId: _pt,
        fromTemplateRecipeId: _ftr, ingredients, outcomes, ...rest
      } = r as any;
      await this.createCraftRecipe(
        { ...rest, parentItemId: newItemId, parentTemplateId: null, fromTemplateRecipeId: null } as any,
        ingredients.map(({ id: _i, recipeId: _r, ...x }: any) => x),
        outcomes.map(({ id: _i, recipeId: _r, ...x }: any) => x),
      );
    }
  }

  // Import a world-scoped library item into a character's inventory as a fully
  // independent copy (rolls included, no template link). Enforces system match.
  async importWorldItemToCharacter(worldItemId: string, characterId: string, userId: string): Promise<Item> {
    const src = await this.getItem(worldItemId);
    if (!src || !src.worldId) {
      throw new Error('World item not found');
    }
    const character = await this.getCharacter(characterId);
    if (!character) {
      throw new Error('Character not found');
    }
    if (character.campaignId) {
      const campaign = await this.getCampaign(character.campaignId);
      if (campaign && src.system && (campaign as any).system && src.system !== (campaign as any).system) {
        throw new Error('System mismatch');
      }
    }
    const {
      id: _id, characterId: _c, containerId: _cn, worldId: _w, campaignId: _cp,
      isTemplate: _t, isLiveTemplate: _lt, templateItemId: _ti, createdByUserId: _cu,
      ...rest
    } = src as any;
    const newItem = await this.createItem({
      ...rest,
      characterId,
      containerId: null,
      worldId: null,
      campaignId: null,
      isTemplate: false,
      isLiveTemplate: false,
      templateItemId: null,
      createdByUserId: userId,
    } as any);
    await this.copyRollEntriesToOwner('item', worldItemId, newItem.id);
    // Carry crafter recipes so an imported crafter arrives ready to craft.
    if (newItem.itemType === 'crafter') {
      try {
        await this.copyCraftRecipesToItem(worldItemId, newItem.id);
      } catch (e) {
        console.error('Failed to clone crafter recipes on world item import:', e);
      }
    }
    // Clone any pre-loaded V3 spellbook spells so a granted spellbook arrives populated.
    if (newItem.itemType === 'spellbook') {
      try {
        const sourceSpells = await this.getV3SpellsForSpellbook(worldItemId);
        for (const s of sourceSpells) {
          await this.createV3Spell({
            campaignId: character.campaignId || null,
            spellbookItemId: newItem.id,
            composition: s.composition,
            compositionHash: s.compositionHash,
            name: s.name,
            description: s.description,
            image: s.image,
            manaCost: s.manaCost,
            craftDc: s.craftDc,
            createdByUserId: userId,
            createdByCharacterId: characterId,
            authoredByUserId: s.authoredByUserId,
            status: s.status === 'awaiting_gm' ? 'ready' : s.status,
            isCanonical: false,
            flagged: s.flagged,
          } as any);
        }
      } catch (e) {
        console.error('Failed to clone spellbook spells on world import:', e);
      }
    }
    return newItem;
  }

  // Import a world-scoped library spell into a character's spellbook as a fully
  // independent copy. Maps the system_spells shape onto the spells table and
  // copies any roll entries. Enforces system match.
  async importWorldSpellToCharacter(worldSpellId: string, characterId: string): Promise<Spell> {
    const src = await this.getSystemSpell(worldSpellId);
    if (!src || !src.worldId) {
      throw new Error('World spell not found');
    }
    const character = await this.getCharacter(characterId);
    if (!character) {
      throw new Error('Character not found');
    }
    if (character.campaignId) {
      const campaign = await this.getCampaign(character.campaignId);
      if (campaign && src.system && (campaign as any).system && src.system !== (campaign as any).system) {
        throw new Error('System mismatch');
      }
    }
    let aoeValue: string | null = null;
    if (src.isAoe && src.aoeShape && src.aoeRange) {
      aoeValue = `${src.aoeShape}:${src.aoeRange}`;
    } else if (src.aoe) {
      aoeValue = src.aoe;
    }
    const newSpell = await this.createSpell({
      characterId,
      name: src.name,
      description: src.description,
      image: src.icon,
      level: src.level ?? 0,
      school: src.school,
      damage: src.damageDice,
      damageDice: src.damageDice,
      healingDice: src.healingDice,
      damageType: src.damageType,
      range: src.rangeNum,
      rangeNum: src.rangeNum,
      aoe: aoeValue,
      castingTime: src.castingTime,
      duration: src.duration,
      mod: src.mod ?? 0,
      attribute: src.attribute,
      energyCost: src.energyCost,
      manaCost: src.manaCost,
      isAoe: src.isAoe,
      aoeRange: src.aoeRange,
      aoeShape: src.aoeShape,
      isAttack: src.isAttack,
      gainEnergy: src.gainEnergy,
      passesThroughWalls: src.passesThroughWalls,
      requiresSave: src.requiresSave,
      saveAttribute: src.saveAttribute,
      saveDc: src.saveDc,
      saveSuccessEffect: src.saveSuccessEffect,
    } as any);
    await this.copyRollEntriesToOwner('spell', worldSpellId, newSpell.id);
    return newSpell;
  }

  // Import a world-scoped character template into a campaign's roster as a fully
  // functional, independent campaign character (deep-copies items, spells,
  // hotbars, custom skills, traits, and all roll entries). Enforces system match.
  async importWorldCharacterToCampaign(worldCharacterId: string, campaignId: string, userId: string): Promise<Character> {
    const template = await this.getCharacterTemplate(worldCharacterId);
    if (!template || !template.worldId) {
      throw new Error('World character not found');
    }
    const campaign = await this.getCampaign(campaignId);
    if (!campaign) {
      throw new Error('Campaign not found');
    }
    // Characters carry no system column; use the source world's system.
    const sourceWorld = await this.getWorld(template.worldId);
    const sourceSystem = (sourceWorld as any)?.system;
    if (sourceSystem && (campaign as any).system && sourceSystem !== (campaign as any).system) {
      throw new Error('System mismatch');
    }
    const {
      id: _id, createdAt: _ca, isTemplate: _t, folderId: _f,
      worldId: _w, campaignId: _cid, userId: _uid, ...templateData
    } = template as any;
    const [newChar] = await db.insert(characters)
      .values({
        ...templateData,
        campaignId,
        userId,
        isTemplate: false,
        worldId: null,
        folderId: null,
      })
      .returning();

    const itemIdMap = new Map<string, string>();
    const spellIdMap = new Map<string, string>();

    const templateItems = await this.getItemsByCharacter(worldCharacterId);
    if (templateItems.length > 0) {
      const newItems = await db.insert(items).values(
        templateItems.map(item => {
          const { id: _oldId, characterId: _c, containerId: _cntId, worldId: _wi, templateItemId: _tii, ...itemData } = item as any;
          return { ...itemData, characterId: newChar.id, containerId: null, worldId: null, templateItemId: null };
        })
      ).returning();
      templateItems.forEach((oldItem, i) => itemIdMap.set(oldItem.id, newItems[i].id));
      const containerUpdates = templateItems.filter(item => item.containerId);
      if (containerUpdates.length > 0) {
        await Promise.all(containerUpdates.map(item => {
          const newItemId = itemIdMap.get(item.id);
          const newContainerId = itemIdMap.get(item.containerId!);
          if (newItemId && newContainerId) {
            return db.update(items).set({ containerId: newContainerId }).where(eq(items.id, newItemId));
          }
        }));
      }
      for (const item of templateItems) {
        const newItemId = itemIdMap.get(item.id);
        if (!newItemId) continue;
        await this.copyRollEntriesToOwner('item', item.id, newItemId);
        // Carry crafter recipes so an imported crafter NPC can still craft.
        if ((item as any).itemType === 'crafter') {
          try {
            await this.copyCraftRecipesToItem(item.id, newItemId);
          } catch (e) {
            console.error('Failed to clone crafter recipes on world character import:', e);
          }
        }
        // Clone V3 spellbook spells so an imported spellbook arrives populated.
        if ((item as any).itemType === 'spellbook') {
          try {
            const sourceSpells = await this.getV3SpellsForSpellbook(item.id);
            for (const s of sourceSpells) {
              await this.createV3Spell({
                campaignId,
                spellbookItemId: newItemId,
                composition: s.composition,
                compositionHash: s.compositionHash,
                name: s.name,
                description: s.description,
                image: s.image,
                manaCost: s.manaCost,
                craftDc: s.craftDc,
                createdByUserId: userId,
                createdByCharacterId: newChar.id,
                authoredByUserId: s.authoredByUserId,
                status: s.status === 'awaiting_gm' ? 'ready' : s.status,
                isCanonical: false,
                flagged: s.flagged,
              } as any);
            }
          } catch (e) {
            console.error('Failed to clone spellbook spells on world character import:', e);
          }
        }
      }
    }

    const templateSpells = await this.getSpellsByCharacter(worldCharacterId);
    if (templateSpells.length > 0) {
      const newSpells = await db.insert(spells).values(
        templateSpells.map(spell => {
          const { id: _oldId, characterId: _c, templateSpellId: _tsi, ...spellData } = spell as any;
          return { ...spellData, characterId: newChar.id, templateSpellId: null };
        })
      ).returning();
      templateSpells.forEach((oldSpell, i) => spellIdMap.set(oldSpell.id, newSpells[i].id));
      for (const spell of templateSpells) {
        const newSpellId = spellIdMap.get(spell.id);
        if (newSpellId) await this.copyRollEntriesToOwner('spell', spell.id, newSpellId);
      }
    }

    const templateHotbars = await this.getHotbarsByCharacter(worldCharacterId);
    if (templateHotbars.length > 0) {
      await db.insert(hotbars).values(
        templateHotbars.map(hotbar => {
          const { id: _hid, characterId: _c, itemId: oldItemId, spellId: oldSpellId, ...hotbarData } = hotbar as any;
          return {
            ...hotbarData,
            characterId: newChar.id,
            itemId: oldItemId ? itemIdMap.get(oldItemId) || null : null,
            spellId: oldSpellId ? spellIdMap.get(oldSpellId) || null : null,
          };
        })
      );
    }

    const customSkillsList = await this.getCharacterCustomSkills(worldCharacterId);
    if (customSkillsList.length > 0) {
      await db.insert(characterCustomSkills).values(
        customSkillsList.map(skill => {
          const { id: _sid, characterId: _c, ...skillData } = skill as any;
          return { ...skillData, characterId: newChar.id };
        })
      );
    }

    const traitsList = await this.getCharacterTraits(worldCharacterId);
    if (traitsList.length > 0) {
      await db.insert(characterTraits).values(
        traitsList.map(trait => {
          const { id: _tid, characterId: _c, ...traitData } = trait as any;
          return { ...traitData, characterId: newChar.id };
        })
      );
    }

    return newChar;
  }

  // Character Template Folder operations
  async getCharacterTemplateFolders(): Promise<CharacterTemplateFolder[]> {
    return await db.select()
      .from(characterTemplateFolders)
      .orderBy(characterTemplateFolders.sortOrder, characterTemplateFolders.name);
  }

  async getCharacterTemplateFolder(id: string): Promise<CharacterTemplateFolder | undefined> {
    const [folder] = await db.select()
      .from(characterTemplateFolders)
      .where(eq(characterTemplateFolders.id, id))
      .limit(1);
    return folder;
  }

  async createCharacterTemplateFolder(data: InsertCharacterTemplateFolder): Promise<CharacterTemplateFolder> {
    const [folder] = await db.insert(characterTemplateFolders)
      .values(data)
      .returning();
    return folder;
  }

  async updateCharacterTemplateFolder(id: string, data: Partial<CharacterTemplateFolder>): Promise<CharacterTemplateFolder | undefined> {
    const [folder] = await db.update(characterTemplateFolders)
      .set(data)
      .where(eq(characterTemplateFolders.id, id))
      .returning();
    return folder;
  }

  async deleteCharacterTemplateFolder(id: string): Promise<void> {
    // Move templates in this folder to unfiled (null folderId)
    await db.update(characters)
      .set({ folderId: null })
      .where(and(eq(characters.folderId, id), eq(characters.isTemplate, true)));
    // Delete the folder
    await db.delete(characterTemplateFolders).where(eq(characterTemplateFolders.id, id));
  }

  // Token operations
  async createToken(token: InsertToken): Promise<Token> {
    const [newToken] = await db.insert(tokens).values(token).returning();
    return newToken;
  }

  async getToken(id: string): Promise<Token | undefined> {
    const [token] = await db.select().from(tokens).where(eq(tokens.id, id)).limit(1);
    return token;
  }

  async getCampaignTokens(campaignId: string): Promise<Token[]> {
    return await db.select()
      .from(tokens)
      .where(eq(tokens.campaignId, campaignId));
  }

  async getSceneTokens(sceneId: string): Promise<Token[]> {
    return await db.select()
      .from(tokens)
      .where(eq(tokens.sceneId, sceneId));
  }

  async updateToken(id: string, data: Partial<Token>): Promise<Token | undefined> {
    const [token] = await db.update(tokens)
      .set(data)
      .where(eq(tokens.id, id))
      .returning();
    return token;
  }

  async deleteToken(id: string): Promise<void> {
    await db.delete(tokens).where(eq(tokens.id, id));
  }

  async deleteTokensByCharacterId(characterId: string): Promise<void> {
    await db.delete(tokens).where(eq(tokens.characterId, characterId));
  }

  // Chat operations
  async createChatMessage(message: InsertChatMessage): Promise<ChatMessage> {
    const [chatMessage] = await db.insert(chatMessages).values(message).returning();
    return chatMessage;
  }

  async getCampaignMessages(campaignId: string, limit: number = 50): Promise<ChatMessage[]> {
    return await db.select()
      .from(chatMessages)
      .where(eq(chatMessages.campaignId, campaignId))
      .orderBy(desc(chatMessages.createdAt))
      .limit(limit);
  }

  async clearChatMessages(campaignId: string): Promise<void> {
    await db.delete(chatMessages).where(eq(chatMessages.campaignId, campaignId));
  }

  // Password Reset operations
  async createPasswordResetToken(token: InsertPasswordResetToken): Promise<PasswordResetToken> {
    const [resetToken] = await db.insert(passwordResetTokens).values(token).returning();
    return resetToken;
  }

  async getPasswordResetToken(token: string): Promise<PasswordResetToken | undefined> {
    const [resetToken] = await db.select()
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.token, token))
      .limit(1);
    return resetToken;
  }

  async deletePasswordResetToken(token: string): Promise<void> {
    await db.delete(passwordResetTokens).where(eq(passwordResetTokens.token, token));
  }

  async deleteUserPasswordResetTokens(userId: string): Promise<void> {
    await db.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, userId));
  }

  async updateUserPassword(userId: string, hashedPassword: string): Promise<void> {
    await db.update(users)
      .set({ password: hashedPassword })
      .where(eq(users.id, userId));
  }

  async updateUserGoogleTokens(userId: string, data: { googleAccessToken: string | null; googleRefreshToken: string | null; googleTokenExpiry: Date | null; googleEmail: string | null }): Promise<void> {
    await db.update(users)
      .set(data)
      .where(eq(users.id, userId));
  }

  async getUserGoogleTokens(userId: string): Promise<{ googleAccessToken: string | null; googleRefreshToken: string | null; googleTokenExpiry: Date | null; googleEmail: string | null } | undefined> {
    const [user] = await db.select({
      googleAccessToken: users.googleAccessToken,
      googleRefreshToken: users.googleRefreshToken,
      googleTokenExpiry: users.googleTokenExpiry,
      googleEmail: users.googleEmail,
    }).from(users).where(eq(users.id, userId));
    return user;
  }

  // Scene operations
  async createScene(scene: InsertScene): Promise<Scene> {
    const [newScene] = await db.insert(scenes).values(scene).returning();
    return newScene;
  }

  async getScene(id: string): Promise<Scene | undefined> {
    const [scene] = await db.select().from(scenes).where(eq(scenes.id, id)).limit(1);
    return scene;
  }

  async getCampaignScenes(campaignId: string): Promise<Scene[]> {
    return await db.select()
      .from(scenes)
      .where(eq(scenes.campaignId, campaignId))
      .orderBy(scenes.createdAt);
  }

  async getActiveScene(campaignId: string): Promise<Scene | undefined> {
    const [campaign] = await db.select()
      .from(campaigns)
      .where(eq(campaigns.id, campaignId))
      .limit(1);
    
    if (!campaign?.activeSceneId) {
      return undefined;
    }

    return await this.getScene(campaign.activeSceneId);
  }

  async updateScene(id: string, data: Partial<Scene>): Promise<Scene | undefined> {
    const [scene] = await db.update(scenes)
      .set(data)
      .where(eq(scenes.id, id))
      .returning();
    return scene;
  }

  async deleteScene(id: string): Promise<void> {
    await db.delete(scenes).where(eq(scenes.id, id));
  }

  async setActiveScene(campaignId: string, sceneId: string): Promise<Campaign | undefined> {
    const [campaign] = await db.update(campaigns)
      .set({ activeSceneId: sceneId })
      .where(eq(campaigns.id, campaignId))
      .returning();
    return campaign;
  }

  // Hotbar operations
  async getHotbar(id: string): Promise<Hotbar | undefined> {
    const [hotbar] = await db.select()
      .from(hotbars)
      .where(eq(hotbars.id, id))
      .limit(1);
    return hotbar;
  }

  async getHotbarsByCharacter(characterId: string): Promise<Hotbar[]> {
    return await db.select()
      .from(hotbars)
      .where(eq(hotbars.characterId, characterId));
  }

  async upsertHotbar(hotbar: InsertHotbar): Promise<Hotbar> {
    const [result] = await db
      .insert(hotbars)
      .values(hotbar)
      .onConflictDoUpdate({
        target: [hotbars.characterId, hotbars.hotbarType, hotbars.slotNumber],
        set: {
          itemId: hotbar.itemId,
          spellId: hotbar.spellId,
          v3SpellId: hotbar.v3SpellId,
          skillName: hotbar.skillName,
          traitId: hotbar.traitId,
        },
      })
      .returning();
    return result;
  }

  async deleteHotbar(id: string): Promise<void> {
    await db.delete(hotbars).where(eq(hotbars.id, id));
  }

  // Item operations
  async getItemsByCharacter(characterId: string): Promise<Item[]> {
    const result = await db.select()
      .from(items)
      .where(eq(items.characterId, characterId)) as Item[];
    
    return result.map(item => this.convertLegacyItemPrice(item));
  }

  async createItem(item: InsertItem): Promise<Item> {
    const [newItem] = await db.insert(items).values(item).returning() as Item[];
    return newItem;
  }

  async updateItem(id: string, updates: Partial<InsertItem>): Promise<Item | undefined> {
    const [item] = await db.update(items)
      .set(updates)
      .where(eq(items.id, id))
      .returning() as Item[];
    return item;
  }

  async deleteItem(id: string): Promise<void> {
    // Clean up any hotbar entries that reference this item
    await db.delete(hotbars).where(eq(hotbars.itemId, id));
    // Then delete the item
    await db.delete(items).where(eq(items.id, id));
  }

  async damageItem(id: string, amount: number = 1): Promise<Item | undefined> {
    const [item] = await db.select().from(items).where(eq(items.id, id)).limit(1) as Item[];
    if (!item) return undefined;

    const newDurability = Math.max(0, item.durability - amount);
    const [updatedItem] = await db.update(items)
      .set({ durability: newDurability })
      .where(eq(items.id, id))
      .returning() as Item[];
    
    return updatedItem;
  }

  async getItem(id: string): Promise<Item | undefined> {
    const [item] = await db.select().from(items).where(eq(items.id, id)).limit(1) as Item[];
    return item ? this.convertLegacyItemPrice(item) : undefined;
  }

  async getSystemItems(system?: string, ownerScope?: string[], worldId?: string): Promise<Item[]> {
    const conditions = [
      eq(items.isTemplate, true),
      eq(items.isLiveTemplate, false),
      eq(items.isArchived, false),
      sql`${items.characterId} IS NULL`,
      sql`${items.campaignId} IS NULL`,
    ];
    if (system) conditions.push(eq(items.system, system));
    // World-scoping (Task #120): when a worldId is given, return only that
    // world's rows (ownerScope is ignored — world access is authorized at the
    // route). Otherwise restrict to non-world rows so world objects never leak
    // into the admin / personal library.
    if (worldId) {
      conditions.push(eq(items.worldId, worldId));
    } else {
      conditions.push(sql`${items.worldId} IS NULL`);
      if (ownerScope) {
        conditions.push(
          ownerScope.length > 0
            ? or(sql`${items.createdByUserId} IS NULL`, inArray(items.createdByUserId, ownerScope))!
            : sql`${items.createdByUserId} IS NULL`
        );
      }
    }
    const result = await db.select()
      .from(items)
      .where(and(...conditions)) as Item[];
    return result.map(item => this.convertLegacyItemPrice(item));
  }

  async getSystemItemTemplates(system?: string, ownerScope?: string[]): Promise<Item[]> {
    const conditions = [
      eq(items.isLiveTemplate, true),
      eq(items.isArchived, false),
      sql`${items.characterId} IS NULL`,
      sql`${items.campaignId} IS NULL`,
    ];
    if (system) conditions.push(eq(items.system, system));
    if (ownerScope) {
      conditions.push(
        ownerScope.length > 0
          ? or(sql`${items.createdByUserId} IS NULL`, inArray(items.createdByUserId, ownerScope))!
          : sql`${items.createdByUserId} IS NULL`
      );
    }
    const result = await db.select()
      .from(items)
      .where(and(...conditions)) as Item[];
    return result.map(item => this.convertLegacyItemPrice(item));
  }

  async getCampaignTemplateItems(campaignId: string, userId?: string): Promise<Item[]> {
    // Get items specific to this campaign OR created by this user (GM library items)
    const result = await db.select()
      .from(items)
      .where(and(
        eq(items.isTemplate, true),
        sql`${items.characterId} IS NULL`,
        userId 
          ? or(
              eq(items.campaignId, campaignId),
              eq(items.createdByUserId, userId)
            )
          : eq(items.campaignId, campaignId)
      )) as Item[];
    return result.map(item => this.convertLegacyItemPrice(item));
  }

  // Lightweight summaries for faster item picker loading (no images to avoid Neon 507 response size limit)
  async getSystemItemSummaries(system?: string, ownerScope?: string[]): Promise<{ id: string; name: string; itemType: string; rarity: string; weight: number; price: number; currency: string }[]> {
    const conditions = [
      eq(items.isTemplate, true),
      eq(items.isLiveTemplate, false),
      eq(items.isArchived, false),
      sql`${items.characterId} IS NULL`,
      sql`${items.campaignId} IS NULL`,
    ];
    if (system) conditions.push(eq(items.system, system));
    if (ownerScope) {
      conditions.push(
        ownerScope.length > 0
          ? or(sql`${items.createdByUserId} IS NULL`, inArray(items.createdByUserId, ownerScope))!
          : sql`${items.createdByUserId} IS NULL`
      );
    }
    return await db.select({
      id: items.id,
      name: items.name,
      itemType: items.itemType,
      rarity: items.rarity,
      weight: items.itemWeight,
      price: items.price,
      currency: items.currency,
    })
      .from(items)
      .where(and(...conditions));
  }

  async getCampaignItemSummaries(campaignId: string, userId?: string): Promise<{ id: string; name: string; itemType: string; rarity: string; weight: number; price: number; currency: string }[]> {
    // Get items specific to this campaign OR created by this user (GM library items)
    return await db.select({
      id: items.id,
      name: items.name,
      itemType: items.itemType,
      rarity: items.rarity,
      weight: items.itemWeight,
      price: items.price,
      currency: items.currency,
    })
      .from(items)
      .where(and(
        eq(items.isTemplate, true),
        sql`${items.characterId} IS NULL`,
        userId 
          ? or(
              eq(items.campaignId, campaignId),
              eq(items.createdByUserId, userId)
            )
          : eq(items.campaignId, campaignId)
      ));
  }

  async moveItemToContainer(itemId: string, containerId: string | null): Promise<Item | undefined> {
    const [item] = await db.update(items)
      .set({ containerId })
      .where(eq(items.id, itemId))
      .returning() as Item[];
    return item;
  }

  async getContainerItems(containerId: string): Promise<Item[]> {
    const result = await db.select()
      .from(items)
      .where(eq(items.containerId, containerId)) as Item[];
    return result.map(item => this.convertLegacyItemPrice(item));
  }

  // Spell operations
  async getSpellsByCharacter(characterId: string): Promise<Spell[]> {
    return await db.select()
      .from(spells)
      .where(eq(spells.characterId, characterId));
  }

  async getSpell(id: string): Promise<Spell | undefined> {
    const [spell] = await db.select()
      .from(spells)
      .where(eq(spells.id, id))
      .limit(1);
    return spell;
  }

  async createSpell(spell: InsertSpell): Promise<Spell> {
    const [newSpell] = await db.insert(spells).values(spell).returning();
    return newSpell;
  }

  async updateSpell(id: string, updates: Partial<InsertSpell>): Promise<Spell | undefined> {
    const [spell] = await db.update(spells)
      .set(updates)
      .where(eq(spells.id, id))
      .returning();
    return spell;
  }

  async deleteSpell(id: string): Promise<void> {
    // Clean up any hotbar entries that reference this spell
    await db.delete(hotbars).where(eq(hotbars.spellId, id));
    // Then delete the spell
    await db.delete(spells).where(eq(spells.id, id));
  }

  async getCampaignTemplateSpells(campaignId: string): Promise<Spell[]> {
    return await db.select()
      .from(spells)
      .where(and(
        eq(spells.isTemplate, true),
        eq(spells.campaignId, campaignId)
      ));
  }

  async getItemsLinkedToTemplate(templateItemId: string): Promise<Item[]> {
    // Multi-link source of truth: items joined via item_template_links.
    // Also include legacy single-link items via items.templateItemId for backwards compatibility.
    const joined = await db.select({ item: items })
      .from(itemTemplateLinks)
      .innerJoin(items, eq(items.id, itemTemplateLinks.itemId))
      .where(eq(itemTemplateLinks.templateId, templateItemId));
    const legacy = await db.select()
      .from(items)
      .where(eq(items.templateItemId, templateItemId)) as Item[];
    const map = new Map<string, Item>();
    for (const row of joined) map.set(row.item.id, row.item as Item);
    for (const it of legacy) map.set(it.id, it);
    return Array.from(map.values());
  }

  async cleanupDuplicateCampaignTemplateItems(opts?: { apply?: boolean; system?: string }): Promise<DuplicateCampaignItemCleanupReport> {
    const apply = opts?.apply ?? false;

    // Fields that legitimately differ between a campaign-local copy and the
    // canonical system template WITHOUT constituting a "campaign-specific
    // change". Everything else is compared; any difference => the GM customized
    // the copy, so we keep it.
    const IGNORED_ITEM_FIELDS = new Set<string>([
      'id', 'characterId', 'campaignId', 'worldId', 'createdByUserId',
      'containerId', 'isTemplate', 'isLiveTemplate', 'isEquipped', 'quantity',
      'isArchived', 'templateItemId', 'templatePriority', 'templateUseOwnOrder',
      // Legacy price columns are normalized by convertLegacyItemPrice and may
      // drift independently of the canonical price/currency; ignore them.
      'priceCopper', 'priceSilver', 'priceGold', 'pricePlatinum', 'weight',
    ]);

    const normalizeValue = (v: unknown): string => {
      if (v === null || v === undefined) return '';
      if (Array.isArray(v) || typeof v === 'object') return JSON.stringify(v);
      return String(v);
    };

    const itemContentSignature = (it: Record<string, unknown>): string => {
      const keys = Object.keys(it).filter((k) => !IGNORED_ITEM_FIELDS.has(k)).sort();
      return keys.map((k) => `${k}=${normalizeValue(it[k])}`).join('\u0001');
    };

    const rollContentSignature = (rolls: RollEntry[]): string => {
      const norm = rolls.map((r) => {
        const { id: _id, ownerId: _oid, ownerType: _ot, sortOrder: _so, ...rest } =
          r as unknown as Record<string, unknown>;
        const keys = Object.keys(rest).sort();
        return keys.map((k) => `${k}=${normalizeValue(rest[k])}`).join('\u0001');
      });
      norm.sort();
      return norm.join('\u0002');
    };

    // Fetch only lightweight identity columns first. Selecting full item rows
    // in bulk overflows the Neon HTTP 64MB response cap when images are large
    // (the same reason getSystemItemSummaries exists). Full rows are loaded
    // one-at-a-time via getItem() only for matched duplicate candidates.
    const campConditions = [
      eq(items.isTemplate, true),
      eq(items.isLiveTemplate, false),
      sql`${items.characterId} IS NULL`,
      sql`${items.campaignId} IS NOT NULL`,
    ];
    if (opts?.system) campConditions.push(eq(items.system, opts.system));
    const campaignItems = await db.select({
      id: items.id, name: items.name, system: items.system, campaignId: items.campaignId,
    }).from(items).where(and(...campConditions));

    // System templates keyed by lowercase-name :: system (mirrors the client
    // dedupe key in client/src/lib/itemResolve.ts).
    const sysConditions = [
      eq(items.isTemplate, true),
      eq(items.isLiveTemplate, false),
      eq(items.isArchived, false),
      sql`${items.characterId} IS NULL`,
      sql`${items.campaignId} IS NULL`,
      sql`${items.worldId} IS NULL`,
      sql`${items.createdByUserId} IS NULL`,
    ];
    if (opts?.system) sysConditions.push(eq(items.system, opts.system));
    const systemItems = await db.select({
      id: items.id, name: items.name, system: items.system,
    }).from(items).where(and(...sysConditions));

    const sysIdByKey = new Map<string, string>();
    for (const s of systemItems) {
      const key = `${(s.name || '').toLowerCase()}::${s.system || ''}`;
      // Keep the first system match for a given name+system (canonical).
      if (!sysIdByKey.has(key)) sysIdByKey.set(key, s.id);
    }

    const report: DuplicateCampaignItemCleanupReport = {
      applied: apply,
      scanned: campaignItems.length,
      duplicatesFound: 0,
      deleted: [],
      kept: [],
    };

    for (const campLite of campaignItems) {
      const key = `${(campLite.name || '').toLowerCase()}::${campLite.system || ''}`;
      const sysId = sysIdByKey.get(key);
      if (!sysId) continue; // no matching system template — not a duplicate
      report.duplicatesFound++;

      // Items with character-owned copies must be preserved.
      const linkedCopies = await this.getItemsLinkedToTemplate(campLite.id);
      if (linkedCopies.length > 0) {
        report.kept.push({ id: campLite.id, name: campLite.name, campaignId: campLite.campaignId, systemItemId: sysId, reason: 'has-character-copies' });
        continue;
      }

      // Load full rows individually for content comparison; any difference
      // (item fields or roll entries) => GM customized it, so keep.
      const [camp, sys] = await Promise.all([this.getItem(campLite.id), this.getItem(sysId)]);
      if (!camp || !sys) continue;
      const sameContent = itemContentSignature(camp as unknown as Record<string, unknown>) ===
        itemContentSignature(sys as unknown as Record<string, unknown>);
      let sameRolls = true;
      if (sameContent) {
        const [campRolls, sysRolls] = await Promise.all([
          this.getRollEntries('item', camp.id),
          this.getRollEntries('item', sys.id),
        ]);
        sameRolls = rollContentSignature(campRolls) === rollContentSignature(sysRolls);
      }

      if (sameContent && sameRolls) {
        if (apply) {
          // Remove any provenance link rows pointing at this campaign copy,
          // then delete the campaign template item (and its roll entries).
          await db.delete(itemTemplateLinks).where(eq(itemTemplateLinks.templateId, camp.id));
          await db.delete(itemTemplateLinks).where(eq(itemTemplateLinks.itemId, camp.id));
          await this.deleteRollEntriesByOwner('item', camp.id);
          await this.deleteItem(camp.id);
        }
        report.deleted.push({ id: camp.id, name: camp.name, campaignId: camp.campaignId, systemItemId: sys.id });
      } else {
        report.kept.push({ id: camp.id, name: camp.name, campaignId: camp.campaignId, systemItemId: sys.id, reason: 'campaign-specific-changes' });
      }
    }

    return report;
  }

  async getItemTemplateLinks(itemId: string): Promise<string[]> {
    const rows = await db.select({ templateId: itemTemplateLinks.templateId })
      .from(itemTemplateLinks)
      .where(eq(itemTemplateLinks.itemId, itemId));
    return rows.map(r => r.templateId);
  }

  async addItemTemplateLink(itemId: string, templateId: string): Promise<void> {
    await db.insert(itemTemplateLinks)
      .values({ itemId, templateId })
      .onConflictDoNothing();
  }

  async removeItemTemplateLink(itemId: string, templateId: string): Promise<void> {
    await db.delete(itemTemplateLinks)
      .where(and(
        eq(itemTemplateLinks.itemId, itemId),
        eq(itemTemplateLinks.templateId, templateId),
      ));
  }

  async getSpellsLinkedToTemplate(templateSpellId: string): Promise<Spell[]> {
    // Legacy single-link path: spells.templateSpellId pointing at a campaign-scoped
    // spell template (the older, pre-unification mechanism). The new unified roll
    // templates (item-templates pool) are queried via getSpellsLinkedToRollTemplate.
    return await db.select()
      .from(spells)
      .where(eq(spells.templateSpellId, templateSpellId)) as Spell[];
  }

  async getSpellsLinkedToRollTemplate(rollTemplateId: string): Promise<{ id: string; system: string | null }[]> {
    // Unified roll templates live in the items table. spell_template_links.templateId
    // references items.id. spell_template_links.spellId may reference EITHER
    // spells.id OR system_spells.id, so we just return ids and let callers do the
    // owner-agnostic roll-entry fan-out (rolls table is keyed by ownerType+ownerId).
    const rows = await db.select({ spellId: spellTemplateLinks.spellId })
      .from(spellTemplateLinks)
      .where(eq(spellTemplateLinks.templateId, rollTemplateId));
    if (rows.length === 0) return [];
    const ids = rows.map(r => r.spellId);
    // Best-effort system lookup (used by validators); systemSpells doesn't always
    // have a system column matching items.system, so default to null when missing.
    const sp = await db.select({ id: spells.id, system: spells.system })
      .from(spells)
      .where(inArray(spells.id, ids));
    const sysMap = new Map<string, string | null>();
    for (const r of sp) sysMap.set(r.id, r.system ?? null);
    return ids.map(id => ({ id, system: sysMap.get(id) ?? null }));
  }

  async getSpellTemplateLinks(spellId: string): Promise<string[]> {
    const rows = await db.select({ templateId: spellTemplateLinks.templateId })
      .from(spellTemplateLinks)
      .where(eq(spellTemplateLinks.spellId, spellId));
    return rows.map(r => r.templateId);
  }

  async addSpellTemplateLink(spellId: string, templateId: string): Promise<void> {
    await db.insert(spellTemplateLinks)
      .values({ spellId, templateId })
      .onConflictDoNothing();
  }

  async removeSpellTemplateLink(spellId: string, templateId: string): Promise<void> {
    await db.delete(spellTemplateLinks)
      .where(and(
        eq(spellTemplateLinks.spellId, spellId),
        eq(spellTemplateLinks.templateId, templateId),
      ));
  }

  async getRollEntriesByTemplateRollId(fromTemplateRollId: string): Promise<RollEntry[]> {
    return await db.select()
      .from(rollEntries)
      .where(eq(rollEntries.fromTemplateRollId, fromTemplateRollId));
  }

  // Roll Entry operations
  async getRollEntries(ownerType: string, ownerId: string): Promise<RollEntry[]> {
    return await db.select()
      .from(rollEntries)
      .where(and(
        eq(rollEntries.ownerType, ownerType),
        eq(rollEntries.ownerId, ownerId)
      ));
  }

  async createRollEntry(entry: InsertRollEntry): Promise<RollEntry> {
    const [newEntry] = await db.insert(rollEntries).values(entry).returning();
    return newEntry;
  }

  async createRollEntriesBulk(entries: InsertRollEntry[]): Promise<RollEntry[]> {
    if (entries.length === 0) return [];
    return await db.insert(rollEntries).values(entries).returning();
  }

  async updateRollEntry(id: string, data: Partial<InsertRollEntry>): Promise<RollEntry | undefined> {
    const [entry] = await db.update(rollEntries)
      .set(data)
      .where(eq(rollEntries.id, id))
      .returning();
    return entry;
  }

  async deleteRollEntry(id: string): Promise<void> {
    await db.delete(rollEntries).where(eq(rollEntries.id, id));
  }

  async deleteRollEntriesByOwner(ownerType: string, ownerId: string): Promise<void> {
    await db.delete(rollEntries).where(and(
      eq(rollEntries.ownerType, ownerType),
      eq(rollEntries.ownerId, ownerId)
    ));
  }

  // Scene Wall operations
  async getSceneWalls(sceneId: string): Promise<SceneWall[]> {
    return await db.select().from(sceneWalls).where(eq(sceneWalls.sceneId, sceneId));
  }

  async createSceneWall(wall: InsertSceneWall): Promise<SceneWall> {
    const [newWall] = await db.insert(sceneWalls).values(wall).returning();
    return newWall;
  }

  async createSceneWallsBatch(walls: InsertSceneWall[]): Promise<SceneWall[]> {
    if (walls.length === 0) return [];
    return await db.insert(sceneWalls).values(walls).returning();
  }

  async updateSceneWall(id: string, data: Partial<InsertSceneWall>): Promise<SceneWall | undefined> {
    const [wall] = await db.update(sceneWalls).set(data).where(eq(sceneWalls.id, id)).returning();
    return wall;
  }

  async deleteSceneWall(id: string): Promise<void> {
    await db.delete(sceneWalls).where(eq(sceneWalls.id, id));
  }

  async deleteSceneWalls(sceneId: string): Promise<void> {
    await db.delete(sceneWalls).where(eq(sceneWalls.sceneId, sceneId));
  }

  // Scene Door operations
  async getSceneDoor(doorId: string): Promise<SceneDoor | undefined> {
    const [door] = await db.select().from(sceneDoors).where(eq(sceneDoors.id, doorId));
    return door;
  }

  async getSceneDoors(sceneId: string): Promise<SceneDoor[]> {
    return await db.select().from(sceneDoors).where(eq(sceneDoors.sceneId, sceneId));
  }

  async createSceneDoor(door: InsertSceneDoor): Promise<SceneDoor> {
    const [newDoor] = await db.insert(sceneDoors).values(door).returning();
    return newDoor;
  }

  async updateSceneDoor(id: string, data: Partial<InsertSceneDoor>): Promise<SceneDoor | undefined> {
    const [door] = await db.update(sceneDoors).set(data).where(eq(sceneDoors.id, id)).returning();
    return door;
  }

  async deleteSceneDoor(id: string): Promise<void> {
    await db.delete(sceneDoors).where(eq(sceneDoors.id, id));
  }

  async deleteSceneDoors(sceneId: string): Promise<void> {
    await db.delete(sceneDoors).where(eq(sceneDoors.sceneId, sceneId));
  }

  // Scene Window operations
  async getSceneWindows(sceneId: string): Promise<SceneWindow[]> {
    return await db.select().from(sceneWindows).where(eq(sceneWindows.sceneId, sceneId));
  }

  async createSceneWindow(win: InsertSceneWindow): Promise<SceneWindow> {
    const [newWindow] = await db.insert(sceneWindows).values(win).returning();
    return newWindow;
  }

  async updateSceneWindow(id: string, data: Partial<InsertSceneWindow>): Promise<SceneWindow | undefined> {
    const [win] = await db.update(sceneWindows).set(data).where(eq(sceneWindows.id, id)).returning();
    return win;
  }

  async deleteSceneWindow(id: string): Promise<void> {
    await db.delete(sceneWindows).where(eq(sceneWindows.id, id));
  }

  async deleteSceneWindows(sceneId: string): Promise<void> {
    await db.delete(sceneWindows).where(eq(sceneWindows.sceneId, sceneId));
  }

  // Scene Light operations
  async getSceneLights(sceneId: string): Promise<SceneLight[]> {
    return await db.select().from(sceneLights).where(eq(sceneLights.sceneId, sceneId));
  }

  async createSceneLight(light: InsertSceneLight): Promise<SceneLight> {
    const [newLight] = await db.insert(sceneLights).values(light).returning();
    return newLight;
  }

  async updateSceneLight(id: string, data: Partial<InsertSceneLight>): Promise<SceneLight | undefined> {
    const [light] = await db.update(sceneLights).set(data).where(eq(sceneLights.id, id)).returning();
    return light;
  }

  async deleteSceneLight(id: string): Promise<void> {
    await db.delete(sceneLights).where(eq(sceneLights.id, id));
  }

  async deleteSceneLights(sceneId: string): Promise<void> {
    await db.delete(sceneLights).where(eq(sceneLights.sceneId, sceneId));
  }

  // Scene Vision Zone operations
  async getSceneVisionZones(sceneId: string): Promise<SceneVisionZone[]> {
    return db.select().from(sceneVisionZones).where(eq(sceneVisionZones.sceneId, sceneId));
  }

  async createSceneVisionZone(zone: InsertSceneVisionZone): Promise<SceneVisionZone> {
    const [created] = await db.insert(sceneVisionZones).values(zone).returning();
    return created;
  }

  async updateVisionZone(id: string, updates: Record<string, any>): Promise<SceneVisionZone | undefined> {
    const [zone] = await db.update(sceneVisionZones).set(updates).where(eq(sceneVisionZones.id, id)).returning();
    return zone;
  }

  async deleteSceneVisionZone(zoneId: string): Promise<void> {
    await db.delete(sceneVisionZones).where(eq(sceneVisionZones.id, zoneId));
  }

  async deleteAllSceneVisionZones(sceneId: string): Promise<void> {
    await db.delete(sceneVisionZones).where(eq(sceneVisionZones.sceneId, sceneId));
  }

  // Character Permission operations
  async getCharacterPermissions(characterId: string): Promise<CharacterPermission[]> {
    return await db.select().from(characterPermissions).where(eq(characterPermissions.characterId, characterId));
  }

  async setCharacterPermission(characterId: string, userId: string, accessLevel: string): Promise<CharacterPermission> {
    const existing = await db.select().from(characterPermissions)
      .where(and(
        eq(characterPermissions.characterId, characterId),
        eq(characterPermissions.userId, userId)
      ))
      .limit(1);
    
    if (existing.length > 0) {
      const [result] = await db.update(characterPermissions)
        .set({ accessLevel })
        .where(eq(characterPermissions.id, existing[0].id))
        .returning();
      return result;
    } else {
      const [result] = await db.insert(characterPermissions)
        .values({ characterId, userId, accessLevel })
        .returning();
      return result;
    }
  }

  async getCharacterPermission(characterId: string, userId: string): Promise<CharacterPermission | undefined> {
    const [result] = await db.select().from(characterPermissions)
      .where(and(
        eq(characterPermissions.characterId, characterId),
        eq(characterPermissions.userId, userId)
      ))
      .limit(1);
    return result;
  }

  async getUserPermissionsForCharacters(userId: string, characterIds: string[]): Promise<CharacterPermission[]> {
    if (characterIds.length === 0) return [];
    return db.select()
      .from(characterPermissions)
      .where(and(
        eq(characterPermissions.userId, userId),
        inArray(characterPermissions.characterId, characterIds)
      ));
  }

  async getCharacterPermissionsForUsers(characterId: string, userIds: string[]): Promise<CharacterPermission[]> {
    if (userIds.length === 0) return [];
    return db.select()
      .from(characterPermissions)
      .where(and(
        eq(characterPermissions.characterId, characterId),
        inArray(characterPermissions.userId, userIds)
      ));
  }

  async getUserAccessibleCharacters(userId: string): Promise<Character[]> {
    // Get all characters from campaigns the user is in (as GM or player)
    // Also get characters the user owns directly
    const userCampaigns = await db.select()
      .from(campaigns)
      .where(eq(campaigns.gmUserId, userId));
    
    const userMemberships = await db.select()
      .from(campaignMembers)
      .where(eq(campaignMembers.userId, userId));
    
    const campaignIds = [
      ...userCampaigns.map(c => c.id),
      ...userMemberships.map(m => m.campaignId)
    ];
    
    if (campaignIds.length === 0) {
      // Just return characters owned by user
      return db.select()
        .from(characters)
        .where(and(
          eq(characters.userId, userId),
          sql`${characters.isTemplate} IS NOT TRUE`
        )) as Promise<Character[]>;
    }
    
    // Get characters from user's campaigns plus characters they own
    const result = await db.select()
      .from(characters)
      .where(and(
        or(
          inArray(characters.campaignId, campaignIds),
          eq(characters.userId, userId)
        ),
        sql`${characters.isTemplate} IS NOT TRUE`
      )) as Character[];
    
    return result;
  }

  async isCampaignMember(campaignId: string, userId: string): Promise<boolean> {
    const [member] = await db.select()
      .from(campaignMembers)
      .where(and(
        eq(campaignMembers.campaignId, campaignId),
        eq(campaignMembers.userId, userId)
      ))
      .limit(1);
    return !!member;
  }

  async kickMember(campaignId: string, userId: string): Promise<void> {
    await db.delete(campaignMembers)
      .where(and(
        eq(campaignMembers.campaignId, campaignId),
        eq(campaignMembers.userId, userId)
      ));
  }

  async banMember(campaignId: string, userId: string, reason?: string): Promise<CampaignBan> {
    await this.kickMember(campaignId, userId);
    
    const [ban] = await db.insert(campaignBans)
      .values({
        campaignId,
        userId,
        reason: reason || null
      })
      .returning();
    
    return ban;
  }

  async unbanMember(campaignId: string, userId: string): Promise<void> {
    await db.delete(campaignBans)
      .where(and(
        eq(campaignBans.campaignId, campaignId),
        eq(campaignBans.userId, userId)
      ));
  }

  async getCampaignBans(campaignId: string): Promise<any[]> {
    const bansData = await db.select()
      .from(campaignBans)
      .innerJoin(users, eq(campaignBans.userId, users.id))
      .where(eq(campaignBans.campaignId, campaignId));

    return bansData.map((row: any) => ({
      id: row.campaign_bans.id,
      campaignId: row.campaign_bans.campaignId,
      userId: row.campaign_bans.userId,
      bannedAt: row.campaign_bans.bannedAt,
      reason: row.campaign_bans.reason,
      username: row.users.username
    }));
  }

  async isUserBanned(campaignId: string, userId: string): Promise<boolean> {
    const [ban] = await db.select()
      .from(campaignBans)
      .where(and(
        eq(campaignBans.campaignId, campaignId),
        eq(campaignBans.userId, userId)
      ))
      .limit(1);
    return !!ban;
  }

  // Initiative Tracking operations
  async getCampaignInitiative(campaignId: string): Promise<InitiativeEntry[]> {
    return await db.select()
      .from(initiativeEntries)
      .where(eq(initiativeEntries.campaignId, campaignId))
      .orderBy(desc(initiativeEntries.value), initiativeEntries.id);
  }

  async createInitiativeEntry(entry: InsertInitiativeEntry): Promise<InitiativeEntry> {
    const [created] = await db.insert(initiativeEntries)
      .values(entry)
      .onConflictDoUpdate({
        target: [initiativeEntries.campaignId, initiativeEntries.characterId],
        set: { value: entry.value, isHidden: entry.isHidden ?? false }
      })
      .returning();
    return created;
  }

  async updateInitiativeEntry(id: string, data: Partial<InitiativeEntry>): Promise<InitiativeEntry | undefined> {
    const [updated] = await db.update(initiativeEntries)
      .set(data)
      .where(eq(initiativeEntries.id, id))
      .returning();
    return updated;
  }

  async deleteInitiativeEntry(id: string): Promise<void> {
    await db.delete(initiativeEntries).where(eq(initiativeEntries.id, id));
  }

  async clearCampaignInitiative(campaignId: string): Promise<void> {
    await db.delete(initiativeEntries).where(eq(initiativeEntries.campaignId, campaignId));
  }

  async getInitiativeEntryByCharacter(campaignId: string, characterId: string): Promise<InitiativeEntry | undefined> {
    const [entry] = await db.select()
      .from(initiativeEntries)
      .where(and(
        eq(initiativeEntries.campaignId, campaignId),
        eq(initiativeEntries.characterId, characterId)
      ))
      .limit(1);
    return entry;
  }

  // System Species operations
  async getSystemSpecies(systemName?: string, ownerScope?: string[]): Promise<SystemSpecies[]> {
    const conditions: any[] = [];
    if (systemName) conditions.push(eq(systemSpecies.systemName, systemName));
    if (ownerScope) {
      conditions.push(
        ownerScope.length > 0
          ? or(sql`${systemSpecies.ownerUserId} IS NULL`, inArray(systemSpecies.ownerUserId, ownerScope))!
          : sql`${systemSpecies.ownerUserId} IS NULL`
      );
    }
    if (conditions.length === 0) {
      return await db.select().from(systemSpecies).orderBy(systemSpecies.name);
    }
    return await db.select()
      .from(systemSpecies)
      .where(and(...conditions))
      .orderBy(systemSpecies.name);
  }

  async getSystemSpeciesById(id: string): Promise<SystemSpecies | undefined> {
    const [species] = await db.select()
      .from(systemSpecies)
      .where(eq(systemSpecies.id, id))
      .limit(1);
    return species;
  }

  async getSpeciesByName(name: string, systemName?: string): Promise<SystemSpecies | undefined> {
    const conditions = [eq(systemSpecies.name, name)];
    if (systemName) conditions.push(eq(systemSpecies.systemName, systemName));
    const [species] = await db.select()
      .from(systemSpecies)
      .where(and(...conditions))
      .limit(1);
    return species;
  }

  async createSystemSpecies(species: InsertSystemSpecies): Promise<SystemSpecies> {
    const [created] = await db.insert(systemSpecies)
      .values(species)
      .returning();
    return created;
  }

  async updateSystemSpecies(id: string, data: Partial<InsertSystemSpecies>): Promise<SystemSpecies | undefined> {
    const [updated] = await db.update(systemSpecies)
      .set(data)
      .where(eq(systemSpecies.id, id))
      .returning();
    return updated;
  }

  async deleteSystemSpecies(id: string): Promise<void> {
    await db.delete(systemSpecies).where(eq(systemSpecies.id, id));
  }

  // Campaign Species operations (campaign-local species created by GMs)
  async getCampaignSpecies(campaignId: string): Promise<CampaignSpecies[]> {
    return await db.select()
      .from(campaignSpecies)
      .where(eq(campaignSpecies.campaignId, campaignId))
      .orderBy(campaignSpecies.name);
  }

  async getCampaignSpeciesById(id: string): Promise<CampaignSpecies | undefined> {
    const [species] = await db.select()
      .from(campaignSpecies)
      .where(eq(campaignSpecies.id, id))
      .limit(1);
    return species;
  }

  async createCampaignSpecies(species: InsertCampaignSpecies): Promise<CampaignSpecies> {
    const [created] = await db.insert(campaignSpecies)
      .values(species)
      .returning();
    return created;
  }

  async updateCampaignSpecies(id: string, data: Partial<InsertCampaignSpecies>): Promise<CampaignSpecies | undefined> {
    const [updated] = await db.update(campaignSpecies)
      .set(data)
      .where(eq(campaignSpecies.id, id))
      .returning();
    return updated;
  }

  async deleteCampaignSpecies(id: string): Promise<void> {
    await db.delete(campaignSpecies).where(eq(campaignSpecies.id, id));
  }

  // Feat Template operations (reusable feat definitions)
  async getFeatTemplates(): Promise<FeatTemplate[]> {
    return await db.select().from(featTemplates).orderBy(featTemplates.name);
  }

  async getFeatTemplate(id: string): Promise<FeatTemplate | undefined> {
    const [template] = await db.select()
      .from(featTemplates)
      .where(eq(featTemplates.id, id))
      .limit(1);
    return template;
  }

  async createFeatTemplate(template: InsertFeatTemplate): Promise<FeatTemplate> {
    const [created] = await db.insert(featTemplates).values(template).returning();
    return created;
  }

  async updateFeatTemplate(id: string, data: Partial<InsertFeatTemplate>): Promise<FeatTemplate | undefined> {
    const [updated] = await db.update(featTemplates)
      .set(data)
      .where(eq(featTemplates.id, id))
      .returning();
    return updated;
  }

  async deleteFeatTemplate(id: string): Promise<void> {
    await db.delete(featTemplates).where(eq(featTemplates.id, id));
  }

  // Feat Tree operations
  async getFeatTrees(system?: string, ownerScope?: string[]): Promise<FeatTree[]> {
    const conditions: any[] = [];
    if (system) conditions.push(eq(featTrees.system, system));
    if (ownerScope) {
      conditions.push(
        ownerScope.length > 0
          ? or(sql`${featTrees.ownerUserId} IS NULL`, inArray(featTrees.ownerUserId, ownerScope))!
          : sql`${featTrees.ownerUserId} IS NULL`
      );
    }
    if (conditions.length === 0) {
      return await db.select().from(featTrees).orderBy(featTrees.name);
    }
    return await db.select().from(featTrees).where(and(...conditions)).orderBy(featTrees.name);
  }

  async getFeatTree(id: string): Promise<FeatTree | undefined> {
    const [tree] = await db.select()
      .from(featTrees)
      .where(eq(featTrees.id, id))
      .limit(1);
    return tree;
  }

  async getFeatTreeByName(name: string): Promise<FeatTree | undefined> {
    const [tree] = await db.select()
      .from(featTrees)
      .where(eq(featTrees.name, name))
      .limit(1);
    return tree;
  }

  async createFeatTree(tree: InsertFeatTree): Promise<FeatTree> {
    const [created] = await db.insert(featTrees).values(tree).returning();
    return created;
  }

  async updateFeatTree(id: string, data: Partial<InsertFeatTree>): Promise<FeatTree | undefined> {
    const [updated] = await db.update(featTrees)
      .set(data)
      .where(eq(featTrees.id, id))
      .returning();
    return updated;
  }

  async deleteFeatTree(id: string): Promise<void> {
    await db.delete(featTrees).where(eq(featTrees.id, id));
  }

  // Feat operations
  async getFeats(treeId: string): Promise<Feat[]> {
    return await db.select()
      .from(feats)
      .where(eq(feats.treeId, treeId))
      .orderBy(feats.gridY, feats.gridX);
  }

  async getFeat(id: string): Promise<Feat | undefined> {
    const [feat] = await db.select()
      .from(feats)
      .where(eq(feats.id, id))
      .limit(1);
    return feat;
  }

  async createFeat(feat: InsertFeat): Promise<Feat> {
    const [created] = await db.insert(feats).values(feat).returning();
    return created;
  }

  async updateFeat(id: string, data: Partial<InsertFeat>): Promise<Feat | undefined> {
    const [updated] = await db.update(feats)
      .set(data)
      .where(eq(feats.id, id))
      .returning();
    return updated;
  }

  async deleteFeat(id: string): Promise<void> {
    await db.delete(feats).where(eq(feats.id, id));
  }

  // Feat Connection operations
  async getFeatConnections(treeId: string): Promise<FeatConnection[]> {
    return await db.select()
      .from(featConnections)
      .where(eq(featConnections.treeId, treeId));
  }

  async createFeatConnection(connection: InsertFeatConnection): Promise<FeatConnection> {
    const [created] = await db.insert(featConnections).values(connection).returning();
    return created;
  }

  async deleteFeatConnection(id: string): Promise<void> {
    await db.delete(featConnections).where(eq(featConnections.id, id));
  }

  async deleteFeatConnectionsByFeat(featId: string): Promise<void> {
    await db.delete(featConnections)
      .where(sql`${featConnections.fromFeatId} = ${featId} OR ${featConnections.toFeatId} = ${featId}`);
  }

  // Character Feat operations
  async getCharacterFeats(characterId: string): Promise<CharacterFeat[]> {
    return await db.select()
      .from(characterFeats)
      .where(eq(characterFeats.characterId, characterId));
  }

  async unlockCharacterFeat(characterId: string, featId: string): Promise<CharacterFeat> {
    const [created] = await db.insert(characterFeats)
      .values({ characterId, featId })
      .returning();
    return created;
  }

  async removeCharacterFeat(characterId: string, featId: string): Promise<void> {
    await db.delete(characterFeats)
      .where(and(
        eq(characterFeats.characterId, characterId),
        eq(characterFeats.featId, featId)
      ));
  }

  async hasCharacterFeat(characterId: string, featId: string): Promise<boolean> {
    const [feat] = await db.select()
      .from(characterFeats)
      .where(and(
        eq(characterFeats.characterId, characterId),
        eq(characterFeats.featId, featId)
      ))
      .limit(1);
    return !!feat;
  }

  // System Spell operations
  async getSystemSpells(system?: string, ownerScope?: string[], worldId?: string): Promise<SystemSpell[]> {
    const conditions = [eq(systemSpells.isArchived, false)];
    if (system) conditions.push(eq(systemSpells.system, system));
    // World-scoping (Task #120): see getSystemItems for the worldId semantics.
    if (worldId) {
      conditions.push(eq(systemSpells.worldId, worldId));
    } else {
      conditions.push(sql`${systemSpells.worldId} IS NULL`);
      if (ownerScope) {
        conditions.push(
          ownerScope.length > 0
            ? or(sql`${systemSpells.ownerUserId} IS NULL`, inArray(systemSpells.ownerUserId, ownerScope))!
            : sql`${systemSpells.ownerUserId} IS NULL`
        );
      }
    }
    return await db.select()
      .from(systemSpells)
      .where(and(...conditions))
      .orderBy(systemSpells.level, systemSpells.name);
  }

  // Lightweight summaries for fast spell list/picker loading (no icon base64, no effects jsonb)
  async getSystemSpellSummaries(system?: string, ownerScope?: string[]): Promise<any[]> {
    const conditions = [eq(systemSpells.isArchived, false)];
    if (system) conditions.push(eq(systemSpells.system, system));
    if (ownerScope) {
      conditions.push(
        ownerScope.length > 0
          ? or(sql`${systemSpells.ownerUserId} IS NULL`, inArray(systemSpells.ownerUserId, ownerScope))!
          : sql`${systemSpells.ownerUserId} IS NULL`
      );
    }
    return await db.select({
      id: systemSpells.id,
      name: systemSpells.name,
      description: systemSpells.description,
      school: systemSpells.school,
      level: systemSpells.level,
      castingTime: systemSpells.castingTime,
      range: systemSpells.range,
      rangeNum: systemSpells.rangeNum,
      duration: systemSpells.duration,
      components: systemSpells.components,
      damageType: systemSpells.damageType,
      damageDice: systemSpells.damageDice,
      gainEnergy: systemSpells.gainEnergy,
      mod: systemSpells.mod,
      attribute: systemSpells.attribute,
      healingDice: systemSpells.healingDice,
      energyCost: systemSpells.energyCost,
      manaCost: systemSpells.manaCost,
      concentration: systemSpells.concentration,
      ritual: systemSpells.ritual,
      targetType: systemSpells.targetType,
      areaSize: systemSpells.areaSize,
      aoe: systemSpells.aoe,
      isAoe: systemSpells.isAoe,
      aoeRange: systemSpells.aoeRange,
      aoeShape: systemSpells.aoeShape,
      passesThroughWalls: systemSpells.passesThroughWalls,
      requiresSave: systemSpells.requiresSave,
      saveAttribute: systemSpells.saveAttribute,
      saveDc: systemSpells.saveDc,
      saveSuccessEffect: systemSpells.saveSuccessEffect,
      savingThrow: systemSpells.savingThrow,
      isAttack: systemSpells.isAttack,
      system: systemSpells.system,
    })
      .from(systemSpells)
      .where(and(...conditions))
      .orderBy(systemSpells.level, systemSpells.name);
  }

  async getSystemSpell(id: string): Promise<SystemSpell | undefined> {
    const [spell] = await db.select()
      .from(systemSpells)
      .where(eq(systemSpells.id, id))
      .limit(1);
    return spell;
  }

  async createSystemSpell(spell: InsertSystemSpell): Promise<SystemSpell> {
    const [created] = await db.insert(systemSpells).values(spell).returning();
    return created;
  }

  async updateSystemSpell(id: string, data: Partial<InsertSystemSpell>): Promise<SystemSpell | undefined> {
    const [updated] = await db.update(systemSpells)
      .set(data)
      .where(eq(systemSpells.id, id))
      .returning();
    return updated;
  }

  async deleteSystemSpell(id: string): Promise<void> {
    await db.delete(systemSpells).where(eq(systemSpells.id, id));
  }

  // AA V3 crafted spell operations
  async createV3Spell(spell: InsertV3Spell): Promise<V3Spell> {
    const [created] = await db.insert(v3Spells).values(spell).returning();
    return created;
  }

  async getV3Spell(id: string): Promise<V3Spell | undefined> {
    const [row] = await db.select().from(v3Spells).where(eq(v3Spells.id, id)).limit(1);
    return row;
  }

  async listV3Spells(status?: string): Promise<V3Spell[]> {
    if (status) {
      return await db.select().from(v3Spells)
        .where(eq(v3Spells.status, status))
        .orderBy(desc(v3Spells.createdAt));
    }
    return await db.select().from(v3Spells).orderBy(desc(v3Spells.createdAt));
  }

  async getCanonicalV3SpellByHash(hash: string): Promise<V3Spell | undefined> {
    // Official/canonical spells are GLOBAL admin templates only: campaignId and
    // spellbookItemId are both null. Campaign-attached rows (used in active play)
    // must never be returned here, so duplicate-conflict resolution can only ever
    // demote a global template, never a spell a campaign is currently using.
    const [row] = await db.select().from(v3Spells)
      .where(and(
        eq(v3Spells.compositionHash, hash),
        eq(v3Spells.isCanonical, true),
        isNull(v3Spells.campaignId),
        isNull(v3Spells.spellbookItemId),
      ))
      .limit(1);
    return row;
  }

  // Count how many campaigns and distinct characters are actively using a
  // recipe (by composition hash). Global admin templates (campaignId AND
  // spellbookItemId both null) are excluded so the figures reflect real play.
  async getV3SpellUsageByHash(hash: string): Promise<{ campaignCount: number; characterCount: number }> {
    const rows = await db.select({
      campaignId: v3Spells.campaignId,
      characterId: v3Spells.createdByCharacterId,
      spellbookItemId: v3Spells.spellbookItemId,
    }).from(v3Spells).where(eq(v3Spells.compositionHash, hash));
    const campaignIds = new Set<string>();
    const characterIds = new Set<string>();
    for (const r of rows) {
      // Skip global admin templates (the canonical rows themselves).
      if (!r.campaignId && !r.spellbookItemId) continue;
      if (r.campaignId) campaignIds.add(r.campaignId);
      if (r.characterId) characterIds.add(r.characterId);
    }
    return { campaignCount: campaignIds.size, characterCount: characterIds.size };
  }

  // The most recent GM-authored spell for this composition within a single
  // campaign (used to auto-fill a new craft of the same composition with the
  // campaign-local name/description before any admin approval exists).
  async getCampaignAuthoredV3SpellByHash(campaignId: string, hash: string): Promise<V3Spell | undefined> {
    const [row] = await db.select().from(v3Spells)
      .where(and(
        eq(v3Spells.campaignId, campaignId),
        eq(v3Spells.compositionHash, hash),
        inArray(v3Spells.status, ["ready", "approved"]),
        ne(v3Spells.name, ""),
      ))
      .orderBy(desc(v3Spells.updatedAt))
      .limit(1);
    return row;
  }

  async getV3SpellRequestsForCampaign(campaignId: string): Promise<V3Spell[]> {
    return await db.select().from(v3Spells)
      .where(and(eq(v3Spells.campaignId, campaignId), eq(v3Spells.status, "awaiting_gm")))
      .orderBy(desc(v3Spells.createdAt));
  }

  async getV3SpellsForCharacter(characterId: string): Promise<V3Spell[]> {
    return await db.select().from(v3Spells)
      .where(eq(v3Spells.createdByCharacterId, characterId))
      .orderBy(desc(v3Spells.createdAt));
  }

  async getV3SpellsForCampaign(campaignId: string): Promise<V3Spell[]> {
    return await db.select().from(v3Spells)
      .where(eq(v3Spells.campaignId, campaignId))
      .orderBy(desc(v3Spells.createdAt));
  }

  async getV3SpellsForSpellbook(spellbookItemId: string): Promise<V3Spell[]> {
    return await db.select().from(v3Spells)
      .where(eq(v3Spells.spellbookItemId, spellbookItemId))
      .orderBy(desc(v3Spells.createdAt));
  }

  async updateV3Spell(id: string, data: Partial<InsertV3Spell>): Promise<V3Spell | undefined> {
    const [updated] = await db.update(v3Spells)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(v3Spells.id, id))
      .returning();
    return updated;
  }

  async deleteV3Spell(id: string): Promise<void> {
    await db.delete(v3Spells).where(eq(v3Spells.id, id));
  }

  async getArchivedSystemItems(system?: string): Promise<{ id: string; name: string; itemType: string; rarity: string }[]> {
    const conditions: any[] = [
      eq(items.isTemplate, true),
      eq(items.isArchived, true),
      sql`${items.characterId} IS NULL`,
      sql`${items.campaignId} IS NULL`
    ];
    if (system) conditions.push(eq(items.system, system));
    return await db.select({
      id: items.id,
      name: items.name,
      itemType: items.itemType,
      rarity: items.rarity,
    })
      .from(items)
      .where(and(...conditions));
  }

  async getArchivedSystemSpells(system?: string): Promise<SystemSpell[]> {
    const conditions: any[] = [eq(systemSpells.isArchived, true)];
    if (system) conditions.push(eq(systemSpells.system, system));
    return await db.select()
      .from(systemSpells)
      .where(and(...conditions))
      .orderBy(systemSpells.level, systemSpells.name);
  }

  async archiveAllSystemItems(system?: string): Promise<void> {
    const conditions: any[] = [
      eq(items.isTemplate, true),
      eq(items.isArchived, false),
      sql`${items.characterId} IS NULL`,
      sql`${items.campaignId} IS NULL`
    ];
    if (system) conditions.push(eq(items.system, system));
    await db.update(items)
      .set({ isArchived: true })
      .where(and(...conditions));
  }

  async archiveAllSystemSpells(system?: string): Promise<void> {
    const conditions: any[] = [eq(systemSpells.isArchived, false)];
    if (system) conditions.push(eq(systemSpells.system, system));
    await db.update(systemSpells)
      .set({ isArchived: true })
      .where(and(...conditions));
  }

  // AA V3 element craft requirement operations
  async getV3ElementRequirements(): Promise<V3ElementRequirement[]> {
    return await db.select()
      .from(v3ElementRequirements)
      .orderBy(v3ElementRequirements.element, v3ElementRequirements.createdAt);
  }

  async getV3ElementRequirement(id: string): Promise<V3ElementRequirement | undefined> {
    const [row] = await db.select()
      .from(v3ElementRequirements)
      .where(eq(v3ElementRequirements.id, id));
    return row;
  }

  async createV3ElementRequirement(data: InsertV3ElementRequirement): Promise<V3ElementRequirement> {
    const [created] = await db.insert(v3ElementRequirements).values(data).returning();
    return created;
  }

  async updateV3ElementRequirement(id: string, data: Partial<InsertV3ElementRequirement>): Promise<V3ElementRequirement | undefined> {
    const [updated] = await db.update(v3ElementRequirements)
      .set(data)
      .where(eq(v3ElementRequirements.id, id))
      .returning();
    return updated;
  }

  async deleteV3ElementRequirement(id: string): Promise<void> {
    await db.delete(v3ElementRequirements).where(eq(v3ElementRequirements.id, id));
  }

  // AA V3 action token types -------------------------------------------------
  async getV3ActionTokenTypes(): Promise<V3ActionTokenType[]> {
    return await db.select().from(v3ActionTokenTypes).orderBy(v3ActionTokenTypes.name);
  }

  async getV3ActionTokenType(id: string): Promise<V3ActionTokenType | undefined> {
    const [row] = await db.select().from(v3ActionTokenTypes).where(eq(v3ActionTokenTypes.id, id));
    return row;
  }

  async createV3ActionTokenType(data: InsertV3ActionTokenType): Promise<V3ActionTokenType> {
    const [row] = await db.insert(v3ActionTokenTypes).values(data).returning();
    return row;
  }

  async updateV3ActionTokenType(id: string, data: Partial<InsertV3ActionTokenType>): Promise<V3ActionTokenType | undefined> {
    const [row] = await db.update(v3ActionTokenTypes).set(data).where(eq(v3ActionTokenTypes.id, id)).returning();
    return row;
  }

  async deleteV3ActionTokenType(id: string): Promise<void> {
    await db.delete(v3ActionTokenTypes).where(eq(v3ActionTokenTypes.id, id));
  }

  async getAdvancedItemTypes(): Promise<AdvancedItemType[]> {
    return await db.select().from(advancedItemTypes)
      .where(eq(advancedItemTypes.system, 'aa-v3'))
      .orderBy(advancedItemTypes.sortOrder, advancedItemTypes.name);
  }

  async getAdvancedItemType(id: string): Promise<AdvancedItemType | undefined> {
    const [row] = await db.select().from(advancedItemTypes)
      .where(and(eq(advancedItemTypes.id, id), eq(advancedItemTypes.system, 'aa-v3')));
    return row;
  }

  async createAdvancedItemType(data: InsertAdvancedItemType): Promise<AdvancedItemType> {
    const [row] = await db.insert(advancedItemTypes).values({ ...data, system: 'aa-v3' }).returning();
    return row;
  }

  async updateAdvancedItemType(id: string, data: Partial<InsertAdvancedItemType>): Promise<AdvancedItemType | undefined> {
    const { system: _ignored, ...rest } = data as any;
    const [row] = await db.update(advancedItemTypes).set(rest)
      .where(and(eq(advancedItemTypes.id, id), eq(advancedItemTypes.system, 'aa-v3'))).returning();
    return row;
  }

  async deleteAdvancedItemType(id: string): Promise<void> {
    await db.delete(advancedItemTypes)
      .where(and(eq(advancedItemTypes.id, id), eq(advancedItemTypes.system, 'aa-v3')));
  }

  async getCharacterActionTokens(characterId: string): Promise<CharacterActionToken[]> {
    return await db.select().from(characterActionTokens).where(eq(characterActionTokens.characterId, characterId));
  }

  async addCharacterActionToken(characterId: string, tokenTypeId: string): Promise<CharacterActionToken> {
    const [row] = await db.insert(characterActionTokens).values({ characterId, tokenTypeId }).returning();
    return row;
  }

  async removeCharacterActionToken(id: string): Promise<void> {
    await db.delete(characterActionTokens).where(eq(characterActionTokens.id, id));
  }

  // AA V3 weapon techniques (Task #180) -------------------------------------
  async getV3Techniques(): Promise<V3Technique[]> {
    return await db.select().from(v3Techniques).orderBy(v3Techniques.name);
  }

  async getV3Technique(id: string): Promise<V3Technique | undefined> {
    const [row] = await db.select().from(v3Techniques).where(eq(v3Techniques.id, id));
    return row;
  }

  async createV3Technique(data: InsertV3Technique): Promise<V3Technique> {
    const [created] = await db.insert(v3Techniques).values(data).returning();
    return created;
  }

  async updateV3Technique(id: string, data: Partial<InsertV3Technique>): Promise<V3Technique | undefined> {
    const [updated] = await db.update(v3Techniques).set(data).where(eq(v3Techniques.id, id)).returning();
    return updated;
  }

  async deleteV3Technique(id: string): Promise<void> {
    await db.delete(v3Techniques).where(eq(v3Techniques.id, id));
  }

  async getV3TechniqueGroups(): Promise<V3TechniqueGroup[]> {
    return await db.select().from(v3TechniqueGroups).orderBy(v3TechniqueGroups.name);
  }

  async getV3TechniqueGroup(id: string): Promise<V3TechniqueGroup | undefined> {
    const [row] = await db.select().from(v3TechniqueGroups).where(eq(v3TechniqueGroups.id, id));
    return row;
  }

  async createV3TechniqueGroup(data: InsertV3TechniqueGroup): Promise<V3TechniqueGroup> {
    const [created] = await db.insert(v3TechniqueGroups).values(data).returning();
    return created;
  }

  async updateV3TechniqueGroup(id: string, data: Partial<InsertV3TechniqueGroup>): Promise<V3TechniqueGroup | undefined> {
    const [updated] = await db.update(v3TechniqueGroups).set(data).where(eq(v3TechniqueGroups.id, id)).returning();
    return updated;
  }

  async deleteV3TechniqueGroup(id: string): Promise<void> {
    await db.delete(v3TechniqueGroups).where(eq(v3TechniqueGroups.id, id));
  }

  async getV3TechniqueGroupMembers(): Promise<V3TechniqueGroupMember[]> {
    return await db.select().from(v3TechniqueGroupMembers);
  }

  async addV3TechniqueGroupMember(groupId: string, techniqueId: string): Promise<V3TechniqueGroupMember> {
    const existing = await db.select().from(v3TechniqueGroupMembers)
      .where(and(eq(v3TechniqueGroupMembers.groupId, groupId), eq(v3TechniqueGroupMembers.techniqueId, techniqueId)));
    if (existing[0]) return existing[0];
    const [created] = await db.insert(v3TechniqueGroupMembers).values({ groupId, techniqueId }).returning();
    return created;
  }

  async removeV3TechniqueGroupMember(groupId: string, techniqueId: string): Promise<void> {
    await db.delete(v3TechniqueGroupMembers)
      .where(and(eq(v3TechniqueGroupMembers.groupId, groupId), eq(v3TechniqueGroupMembers.techniqueId, techniqueId)));
  }

  // System Skill operations (admin-defined custom skills)
  async getSystemSkills(system?: string): Promise<SystemSkill[]> {
    const conditions: any[] = [];
    if (system) conditions.push(eq(systemSkills.system, system));
    return await db.select()
      .from(systemSkills)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(systemSkills.name);
  }

  async getSystemSkill(id: string): Promise<SystemSkill | undefined> {
    const [skill] = await db.select()
      .from(systemSkills)
      .where(eq(systemSkills.id, id))
      .limit(1);
    return skill;
  }

  async createSystemSkill(skill: InsertSystemSkill): Promise<SystemSkill> {
    const [created] = await db.insert(systemSkills).values(skill).returning();
    return created;
  }

  async updateSystemSkill(id: string, data: Partial<InsertSystemSkill>): Promise<SystemSkill | undefined> {
    const [updated] = await db.update(systemSkills)
      .set(data)
      .where(eq(systemSkills.id, id))
      .returning();
    return updated;
  }

  async deleteSystemSkill(id: string): Promise<void> {
    await db.delete(systemSkills).where(eq(systemSkills.id, id));
  }

  // Character Custom Skill operations
  async getCharacterCustomSkills(characterId: string): Promise<CharacterCustomSkill[]> {
    return await db.select()
      .from(characterCustomSkills)
      .where(eq(characterCustomSkills.characterId, characterId))
      .orderBy(characterCustomSkills.name);
  }

  async getCharacterCustomSkill(id: string): Promise<CharacterCustomSkill | undefined> {
    const [skill] = await db.select()
      .from(characterCustomSkills)
      .where(eq(characterCustomSkills.id, id))
      .limit(1);
    return skill;
  }

  async addCharacterCustomSkill(skill: InsertCharacterCustomSkill): Promise<CharacterCustomSkill> {
    const [created] = await db.insert(characterCustomSkills).values(skill).returning();
    return created;
  }

  async updateCharacterCustomSkill(id: string, data: Partial<InsertCharacterCustomSkill>): Promise<CharacterCustomSkill | undefined> {
    const [updated] = await db.update(characterCustomSkills)
      .set(data)
      .where(eq(characterCustomSkills.id, id))
      .returning();
    return updated;
  }

  async removeCharacterCustomSkill(id: string): Promise<void> {
    await db.delete(characterCustomSkills).where(eq(characterCustomSkills.id, id));
  }

  // System Trait operations (admin-defined traits)
  async getSystemTraits(system?: string): Promise<SystemTrait[]> {
    const conditions: any[] = [];
    if (system) conditions.push(eq(systemTraits.system, system));
    return await db.select()
      .from(systemTraits)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(systemTraits.name);
  }

  async getSystemTrait(id: string): Promise<SystemTrait | undefined> {
    const [trait] = await db.select()
      .from(systemTraits)
      .where(eq(systemTraits.id, id))
      .limit(1);
    return trait;
  }

  async createSystemTrait(trait: InsertSystemTrait): Promise<SystemTrait> {
    const [created] = await db.insert(systemTraits).values(trait).returning();
    return created;
  }

  async updateSystemTrait(id: string, data: Partial<InsertSystemTrait>): Promise<SystemTrait | undefined> {
    const [updated] = await db.update(systemTraits)
      .set(data)
      .where(eq(systemTraits.id, id))
      .returning();
    return updated;
  }

  async deleteSystemTrait(id: string): Promise<void> {
    await db.delete(systemTraits).where(eq(systemTraits.id, id));
  }

  // Character Trait operations
  async getCharacterTraits(characterId: string): Promise<CharacterTrait[]> {
    return await db.select()
      .from(characterTraits)
      .where(eq(characterTraits.characterId, characterId))
      .orderBy(characterTraits.name);
  }

  async getCharacterTrait(id: string): Promise<CharacterTrait | undefined> {
    const [trait] = await db.select()
      .from(characterTraits)
      .where(eq(characterTraits.id, id))
      .limit(1);
    return trait;
  }

  async addCharacterTrait(trait: InsertCharacterTrait): Promise<CharacterTrait> {
    const [created] = await db.insert(characterTraits).values(trait).returning();
    return created;
  }

  async updateCharacterTrait(id: string, data: Partial<InsertCharacterTrait>): Promise<CharacterTrait | undefined> {
    const [updated] = await db.update(characterTraits)
      .set(data)
      .where(eq(characterTraits.id, id))
      .returning();
    return updated;
  }

  async removeCharacterTrait(id: string): Promise<void> {
    await db.delete(characterTraits).where(eq(characterTraits.id, id));
  }

  async resetCharacterTraitUses(characterId: string): Promise<void> {
    // Reset to max uses (usesPerLongRest + usesPerShortRest) for all traits
    const traits = await this.getCharacterTraits(characterId);
    for (const trait of traits) {
      const maxUses = (trait.usesPerLongRest || 0) + (trait.usesPerShortRest || 0);
      await db.update(characterTraits)
        .set({ currentUses: maxUses })
        .where(eq(characterTraits.id, trait.id));
    }
  }

  async restoreShortRestTraitUses(characterId: string): Promise<void> {
    // Restore short rest uses for all traits (add usesPerShortRest to currentUses, capped at max)
    const traits = await this.getCharacterTraits(characterId);
    for (const trait of traits) {
      const maxUses = (trait.usesPerLongRest || 0) + (trait.usesPerShortRest || 0);
      const newUses = Math.min(maxUses, (trait.currentUses || 0) + (trait.usesPerShortRest || 0));
      await db.update(characterTraits)
        .set({ currentUses: newUses })
        .where(eq(characterTraits.id, trait.id));
    }
  }

  // Character Folder operations
  async getCampaignFolders(campaignId: string): Promise<CharacterFolder[]> {
    return await db.select()
      .from(characterFolders)
      .where(eq(characterFolders.campaignId, campaignId))
      .orderBy(characterFolders.sortOrder, characterFolders.name);
  }

  async getCharacterFolder(id: string): Promise<CharacterFolder | undefined> {
    const [folder] = await db.select()
      .from(characterFolders)
      .where(eq(characterFolders.id, id))
      .limit(1);
    return folder;
  }

  async createCharacterFolder(folder: InsertCharacterFolder): Promise<CharacterFolder> {
    const [created] = await db.insert(characterFolders).values(folder).returning();
    return created;
  }

  async updateCharacterFolder(id: string, data: Partial<InsertCharacterFolder>): Promise<CharacterFolder | undefined> {
    const [updated] = await db.update(characterFolders)
      .set(data)
      .where(eq(characterFolders.id, id))
      .returning();
    return updated;
  }

  async deleteCharacterFolder(id: string): Promise<void> {
    // First, move all characters in this folder to "unfiled" (null folder)
    await db.update(characters)
      .set({ folderId: null })
      .where(eq(characters.folderId, id));
    // Then delete the folder
    await db.delete(characterFolders).where(eq(characterFolders.id, id));
  }

  // Scene Folder operations
  async getSceneFolders(campaignId: string): Promise<SceneFolder[]> {
    return await db.select()
      .from(sceneFolders)
      .where(eq(sceneFolders.campaignId, campaignId))
      .orderBy(sceneFolders.sortOrder, sceneFolders.name);
  }

  async getSceneFolder(id: string): Promise<SceneFolder | undefined> {
    const [folder] = await db.select()
      .from(sceneFolders)
      .where(eq(sceneFolders.id, id))
      .limit(1);
    return folder;
  }

  async createSceneFolder(folder: InsertSceneFolder): Promise<SceneFolder> {
    const [created] = await db.insert(sceneFolders).values(folder).returning();
    return created;
  }

  async updateSceneFolder(id: string, data: Partial<InsertSceneFolder>): Promise<SceneFolder | undefined> {
    const [updated] = await db.update(sceneFolders)
      .set(data)
      .where(eq(sceneFolders.id, id))
      .returning();
    return updated;
  }

  async deleteSceneFolder(id: string): Promise<void> {
    // First, move all scenes in this folder to "unfiled" (null folder)
    await db.update(scenes)
      .set({ folderId: null })
      .where(eq(scenes.folderId, id));
    // Then delete the folder
    await db.delete(sceneFolders).where(eq(sceneFolders.id, id));
  }

  // Profile operations
  async updateUserProfile(userId: string, data: { name?: string; avatarUrl?: string; bio?: string; username?: string }): Promise<User | undefined> {
    const updateData: Partial<User> = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.avatarUrl !== undefined) updateData.avatarUrl = data.avatarUrl;
    if (data.bio !== undefined) updateData.bio = data.bio;
    if (data.username !== undefined) updateData.username = data.username;
    
    if (Object.keys(updateData).length === 0) {
      return this.getUser(userId);
    }
    
    const [updated] = await db.update(users)
      .set(updateData)
      .where(eq(users.id, userId))
      .returning();
    return updated;
  }

  // Friend Request operations
  async createFriendRequest(senderId: string, recipientId: string, message?: string): Promise<FriendRequest> {
    const [request] = await db.insert(friendRequests)
      .values({
        senderId,
        recipientId,
        message: message || null,
        status: 'pending',
      })
      .returning();
    return request;
  }

  async getFriendRequest(id: string): Promise<FriendRequest | undefined> {
    const [request] = await db.select()
      .from(friendRequests)
      .where(eq(friendRequests.id, id))
      .limit(1);
    return request;
  }

  async getPendingFriendRequests(userId: string): Promise<FriendRequest[]> {
    return await db.select()
      .from(friendRequests)
      .where(and(
        eq(friendRequests.recipientId, userId),
        eq(friendRequests.status, 'pending')
      ))
      .orderBy(desc(friendRequests.createdAt));
  }

  async getSentFriendRequests(userId: string): Promise<FriendRequest[]> {
    return await db.select()
      .from(friendRequests)
      .where(and(
        eq(friendRequests.senderId, userId),
        eq(friendRequests.status, 'pending')
      ))
      .orderBy(desc(friendRequests.createdAt));
  }

  async respondToFriendRequest(requestId: string, accept: boolean): Promise<void> {
    const request = await this.getFriendRequest(requestId);
    if (!request) {
      throw new Error('Friend request not found');
    }

    if (request.status !== 'pending') {
      throw new Error('Friend request has already been responded to');
    }

    if (accept) {
      // Create friendships in both directions
      await db.insert(friendships)
        .values([
          { userId: request.senderId, friendId: request.recipientId },
          { userId: request.recipientId, friendId: request.senderId },
        ]);
    }

    // Update the request status
    await db.update(friendRequests)
      .set({
        status: accept ? 'accepted' : 'declined',
        respondedAt: new Date(),
      })
      .where(eq(friendRequests.id, requestId));
  }

  async deleteFriendRequest(id: string): Promise<void> {
    await db.delete(friendRequests).where(eq(friendRequests.id, id));
  }

  // Friendship operations
  async getFriends(userId: string): Promise<User[]> {
    const friendshipRecords = await db.select()
      .from(friendships)
      .innerJoin(users, eq(friendships.friendId, users.id))
      .where(eq(friendships.userId, userId));
    
    return friendshipRecords.map(record => record.users);
  }

  async areFriends(userId1: string, userId2: string): Promise<boolean> {
    const [friendship] = await db.select()
      .from(friendships)
      .where(and(
        eq(friendships.userId, userId1),
        eq(friendships.friendId, userId2)
      ))
      .limit(1);
    return !!friendship;
  }

  async removeFriend(userId: string, friendId: string): Promise<void> {
    // Delete both directions
    await db.delete(friendships)
      .where(and(
        eq(friendships.userId, userId),
        eq(friendships.friendId, friendId)
      ));
    await db.delete(friendships)
      .where(and(
        eq(friendships.userId, friendId),
        eq(friendships.friendId, userId)
      ));
  }

  // Note Folder operations
  async createNoteFolder(folder: InsertNoteFolder): Promise<NoteFolder> {
    const [newFolder] = await db.insert(noteFolders).values(folder).returning();
    return newFolder;
  }

  async getNoteFolder(id: string): Promise<NoteFolder | undefined> {
    const [folder] = await db.select()
      .from(noteFolders)
      .where(eq(noteFolders.id, id))
      .limit(1);
    return folder;
  }

  async getUserNoteFolders(userId: string, campaignId?: string, showHidden?: boolean): Promise<NoteFolder[]> {
    const sharedFolderRows = await db.selectDistinct({ folderId: notes.folderId })
      .from(noteShares)
      .innerJoin(notes, eq(noteShares.noteId, notes.id))
      .where(and(
        eq(noteShares.sharedWithId, userId),
        sql`${notes.folderId} IS NOT NULL`
      ));
    const sharedFolderIds = sharedFolderRows.map(r => r.folderId).filter(Boolean) as string[];

    let ownedFolders: NoteFolder[];
    if (campaignId && !showHidden) {
      ownedFolders = await db.select()
        .from(noteFolders)
        .where(and(
          eq(noteFolders.userId, userId),
          or(
            eq(noteFolders.campaignId, campaignId),
            isNull(noteFolders.campaignId)
          )
        ))
        .orderBy(noteFolders.sortOrder);
    } else {
      ownedFolders = await db.select()
        .from(noteFolders)
        .where(eq(noteFolders.userId, userId))
        .orderBy(noteFolders.sortOrder);
    }

    if (sharedFolderIds.length === 0) return ownedFolders;

    let sharedFolderConditions: any[] = [
      inArray(noteFolders.id, sharedFolderIds),
      sql`${noteFolders.userId} != ${userId}`
    ];
    if (campaignId && !showHidden) {
      sharedFolderConditions.push(
        or(
          eq(noteFolders.campaignId, campaignId),
          isNull(noteFolders.campaignId)
        )
      );
    }
    const sharedFolders = await db.select()
      .from(noteFolders)
      .where(and(...sharedFolderConditions));

    const allFolders = [...ownedFolders];
    for (const sf of sharedFolders) {
      if (!allFolders.some(f => f.id === sf.id)) allFolders.push(sf);
    }

    const collectAncestorIds = (folders: NoteFolder[]): string[] => {
      const knownIds = new Set(allFolders.map(f => f.id));
      const missingParentIds: string[] = [];
      for (const f of folders) {
        if (f.parentId && !knownIds.has(f.parentId)) {
          missingParentIds.push(f.parentId);
          knownIds.add(f.parentId);
        }
      }
      return missingParentIds;
    };

    let missingIds = collectAncestorIds(sharedFolders);
    while (missingIds.length > 0) {
      const ancestorFolders = await db.select()
        .from(noteFolders)
        .where(inArray(noteFolders.id, missingIds));
      for (const af of ancestorFolders) {
        if (!allFolders.some(f => f.id === af.id)) allFolders.push(af);
      }
      missingIds = collectAncestorIds(ancestorFolders);
    }

    return allFolders;
  }

  async updateNoteFolder(id: string, data: Partial<NoteFolder>): Promise<NoteFolder | undefined> {
    const [folder] = await db.update(noteFolders)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(noteFolders.id, id))
      .returning();
    return folder;
  }

  async deleteNoteFolder(id: string): Promise<void> {
    await db.delete(noteFolders).where(eq(noteFolders.id, id));
  }

  async reorderNoteFolders(folderOrders: { id: string; sortOrder: number }[]): Promise<void> {
    for (const item of folderOrders) {
      await db.update(noteFolders)
        .set({ sortOrder: item.sortOrder, updatedAt: new Date() })
        .where(eq(noteFolders.id, item.id));
    }
  }

  // Note operations
  async createNote(note: InsertNote): Promise<Note> {
    const [newNote] = await db.insert(notes).values(note).returning();
    return newNote;
  }

  async getNote(id: string): Promise<Note | undefined> {
    const [note] = await db.select()
      .from(notes)
      .where(eq(notes.id, id))
      .limit(1);
    return note;
  }

  async getUserNotes(userId: string, folderId?: string, campaignId?: string): Promise<Note[]> {
    const conditions = [eq(notes.userId, userId)];
    if (folderId) {
      conditions.push(eq(notes.folderId, folderId));
    }
    if (campaignId) {
      conditions.push(eq(notes.campaignId, campaignId));
    }
    return await db.select()
      .from(notes)
      .where(and(...conditions))
      .orderBy(desc(notes.isPinned), notes.sortOrder, desc(notes.updatedAt));
  }

  async getSharedNotes(userId: string): Promise<Note[]> {
    const shares = await db.select()
      .from(noteShares)
      .innerJoin(notes, eq(noteShares.noteId, notes.id))
      .where(eq(noteShares.sharedWithId, userId));
    return shares.map(s => s.notes);
  }

  async getCampaignNotesForUser(userId: string, campaignId: string, folderId?: string): Promise<Note[]> {
    // Get notes owned by user in this campaign OR personal notes (no campaign)
    // This allows users to see their personal notes from the main notes page when in a campaign
    const campaignOrPersonal = or(
      eq(notes.campaignId, campaignId),
      isNull(notes.campaignId)
    );
    
    const ownedConditions = [
      eq(notes.userId, userId),
      campaignOrPersonal
    ];
    if (folderId) {
      ownedConditions.push(eq(notes.folderId, folderId));
    }
    
    const ownedNotes = await db.select()
      .from(notes)
      .where(and(...ownedConditions))
      .orderBy(desc(notes.isPinned), notes.sortOrder, desc(notes.updatedAt));
    
    // Get notes shared with user that belong to this campaign ONLY (not personal notes from others)
    // This prevents notes shared by others without a campaign from leaking into campaign view
    const sharedConditions = [
      eq(noteShares.sharedWithId, userId),
      eq(notes.campaignId, campaignId)
    ];
    if (folderId) {
      sharedConditions.push(eq(notes.folderId, folderId));
    }
    
    const sharedData = await db.select()
      .from(noteShares)
      .innerJoin(notes, eq(noteShares.noteId, notes.id))
      .where(and(...sharedConditions));
    
    const sharedNotes = sharedData.map(s => s.notes);
    
    // Combine and deduplicate (in case somehow a note is both owned and shared)
    const allNotes = [...ownedNotes];
    for (const note of sharedNotes) {
      if (!allNotes.some(n => n.id === note.id)) {
        allNotes.push(note);
      }
    }
    
    // Sort combined notes
    return allNotes.sort((a, b) => {
      if (a.isPinned !== b.isPinned) return b.isPinned ? 1 : -1;
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
  }

  async updateNote(id: string, data: Partial<Note>): Promise<Note | undefined> {
    const [note] = await db.update(notes)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(notes.id, id))
      .returning();
    return note;
  }

  async deleteNote(id: string): Promise<void> {
    await db.delete(notes).where(eq(notes.id, id));
  }

  async searchNotes(userId: string, query: string): Promise<Note[]> {
    const searchPattern = `%${query}%`;
    return await db.select()
      .from(notes)
      .where(and(
        eq(notes.userId, userId),
        sql`(${notes.title} ILIKE ${searchPattern} OR ${notes.content} ILIKE ${searchPattern})`
      ))
      .orderBy(desc(notes.updatedAt));
  }

  // Note Reference operations
  async createNoteReference(ref: InsertNoteReference): Promise<NoteReference> {
    const [newRef] = await db.insert(noteReferences).values(ref).returning();
    return newRef;
  }

  async getNoteReferences(noteId: string): Promise<NoteReference[]> {
    return await db.select()
      .from(noteReferences)
      .where(eq(noteReferences.noteId, noteId));
  }

  async getBacklinks(entityType: string, entityId: string): Promise<NoteReference[]> {
    return await db.select()
      .from(noteReferences)
      .where(and(
        eq(noteReferences.entityType, entityType),
        eq(noteReferences.entityId, entityId)
      ));
  }

  async deleteNoteReference(id: string): Promise<void> {
    await db.delete(noteReferences).where(eq(noteReferences.id, id));
  }

  async deleteNoteReferences(noteId: string): Promise<void> {
    await db.delete(noteReferences).where(eq(noteReferences.noteId, noteId));
  }

  // Note Share operations
  async createNoteShare(share: InsertNoteShare): Promise<NoteShare> {
    const [newShare] = await db.insert(noteShares).values(share).returning();
    return newShare;
  }

  async getNoteShares(noteId: string): Promise<NoteShare[]> {
    return await db.select()
      .from(noteShares)
      .where(eq(noteShares.noteId, noteId));
  }

  async getFolderShares(folderId: string): Promise<NoteShare[]> {
    return await db.select()
      .from(noteShares)
      .where(eq(noteShares.folderId, folderId));
  }

  async getSharedWithUser(userId: string): Promise<NoteShare[]> {
    return await db.select()
      .from(noteShares)
      .where(eq(noteShares.sharedWithId, userId));
  }

  async updateNoteShare(id: string, permission: string): Promise<NoteShare | undefined> {
    const [share] = await db.update(noteShares)
      .set({ permission })
      .where(eq(noteShares.id, id))
      .returning();
    return share;
  }

  async deleteNoteShare(id: string): Promise<void> {
    await db.delete(noteShares).where(eq(noteShares.id, id));
  }

  async canAccessNote(userId: string, noteId: string): Promise<{ canAccess: boolean; permission: string | null }> {
    const note = await this.getNote(noteId);
    if (!note) {
      return { canAccess: false, permission: null };
    }
    if (note.userId === userId) {
      return { canAccess: true, permission: 'owner' };
    }
    const [share] = await db.select()
      .from(noteShares)
      .where(and(
        eq(noteShares.noteId, noteId),
        eq(noteShares.sharedWithId, userId)
      ))
      .limit(1);
    if (share) {
      return { canAccess: true, permission: share.permission };
    }
    if (note.folderId) {
      const [folderShare] = await db.select()
        .from(noteShares)
        .where(and(
          eq(noteShares.folderId, note.folderId),
          eq(noteShares.sharedWithId, userId)
        ))
        .limit(1);
      if (folderShare) {
        return { canAccess: true, permission: folderShare.permission };
      }
    }
    return { canAccess: false, permission: null };
  }

  // Token Effects CRUD operations
  async getTokenEffects(): Promise<TokenEffect[]> {
    return await db.select().from(tokenEffects);
  }

  async getTokenEffect(id: string): Promise<TokenEffect | undefined> {
    const [effect] = await db.select().from(tokenEffects).where(eq(tokenEffects.id, id)).limit(1);
    return effect;
  }

  async createTokenEffect(effect: InsertTokenEffect): Promise<TokenEffect> {
    const [newEffect] = await db.insert(tokenEffects).values(effect).returning();
    return newEffect;
  }

  async updateTokenEffect(id: string, effect: Partial<InsertTokenEffect>): Promise<TokenEffect | undefined> {
    const [updated] = await db.update(tokenEffects)
      .set(effect)
      .where(eq(tokenEffects.id, id))
      .returning();
    return updated;
  }

  async deleteTokenEffect(id: string): Promise<void> {
    await db.delete(tokenEffects).where(eq(tokenEffects.id, id));
  }

  // Spell Effects (junction table) operations
  async getSpellEffects(spellId: string): Promise<(SpellEffect & { effect: TokenEffect })[]> {
    const results = await db.select()
      .from(spellEffects)
      .innerJoin(tokenEffects, eq(spellEffects.effectId, tokenEffects.id))
      .where(eq(spellEffects.spellId, spellId));
    return results.map(r => ({
      ...r.spell_effects,
      effect: r.token_effects,
    }));
  }

  async addSpellEffect(spellId: string, effectId: string, triggerCondition: string): Promise<SpellEffect> {
    const [newSpellEffect] = await db.insert(spellEffects).values({
      spellId,
      effectId,
      triggerCondition,
    }).returning();
    return newSpellEffect;
  }

  async removeSpellEffect(id: string): Promise<void> {
    await db.delete(spellEffects).where(eq(spellEffects.id, id));
  }

  // Item Effects (junction table) operations
  async getItemEffects(itemId: string): Promise<(ItemEffect & { effect: TokenEffect })[]> {
    const results = await db.select()
      .from(itemEffects)
      .innerJoin(tokenEffects, eq(itemEffects.effectId, tokenEffects.id))
      .where(eq(itemEffects.itemId, itemId));
    return results.map(r => ({
      ...r.item_effects,
      effect: r.token_effects,
    }));
  }

  async addItemEffect(itemId: string, effectId: string, triggerCondition: string): Promise<ItemEffect> {
    const [newItemEffect] = await db.insert(itemEffects).values({
      itemId,
      effectId,
      triggerCondition,
    }).returning();
    return newItemEffect;
  }

  async removeItemEffect(id: string): Promise<void> {
    await db.delete(itemEffects).where(eq(itemEffects.id, id));
  }

  // Token Active Effects operations
  async getTokenActiveEffects(tokenId: string): Promise<(TokenActiveEffect & { effect: TokenEffect })[]> {
    const results = await db.select()
      .from(tokenActiveEffects)
      .innerJoin(tokenEffects, eq(tokenActiveEffects.effectId, tokenEffects.id))
      .where(eq(tokenActiveEffects.tokenId, tokenId));
    return results.map(r => ({
      ...r.token_active_effects,
      effect: r.token_effects,
    }));
  }

  async getTokenActiveEffect(id: string): Promise<TokenActiveEffect | undefined> {
    const [result] = await db.select()
      .from(tokenActiveEffects)
      .where(eq(tokenActiveEffects.id, id))
      .limit(1);
    return result;
  }

  async addTokenActiveEffect(activeEffect: InsertTokenActiveEffect): Promise<TokenActiveEffect> {
    const [newActiveEffect] = await db.insert(tokenActiveEffects).values(activeEffect).returning();
    return newActiveEffect;
  }

  async removeTokenActiveEffect(id: string): Promise<void> {
    await db.delete(tokenActiveEffects).where(eq(tokenActiveEffects.id, id));
  }

  async clearTokenActiveEffects(tokenId: string): Promise<void> {
    await db.delete(tokenActiveEffects).where(eq(tokenActiveEffects.tokenId, tokenId));
  }

  async updateTokenActiveEffectDuration(id: string, duration: number | null): Promise<TokenActiveEffect | undefined> {
    const [updated] = await db.update(tokenActiveEffects)
      .set({ duration })
      .where(eq(tokenActiveEffects.id, id))
      .returning();
    return updated;
  }

  // Thrown Items operations
  async getThrownItems(sceneId: string): Promise<ThrownItem[]> {
    return await db.select()
      .from(thrownItems)
      .where(eq(thrownItems.sceneId, sceneId));
  }

  async getThrownItemsByItemId(itemId: string): Promise<ThrownItem[]> {
    return await db.select()
      .from(thrownItems)
      .where(eq(thrownItems.itemId, itemId));
  }

  async createThrownItem(data: InsertThrownItem): Promise<ThrownItem> {
    const [newThrownItem] = await db.insert(thrownItems).values(data).returning();
    return newThrownItem;
  }

  async deleteThrownItem(id: string): Promise<void> {
    await db.delete(thrownItems).where(eq(thrownItems.id, id));
  }

  async deleteThrownItemsByItemId(itemId: string): Promise<void> {
    await db.delete(thrownItems).where(eq(thrownItems.itemId, itemId));
  }

  async deleteThrownItemsByScene(sceneId: string): Promise<void> {
    await db.delete(thrownItems).where(eq(thrownItems.sceneId, sceneId));
  }

  // Admin Notification operations
  async createAdminNotification(data: InsertAdminNotification): Promise<AdminNotification> {
    const [notification] = await db.insert(adminNotifications).values(data).returning();
    return notification;
  }

  async getRecentNotifications(limit: number = 20): Promise<AdminNotification[]> {
    return await db.select()
      .from(adminNotifications)
      .orderBy(desc(adminNotifications.createdAt))
      .limit(limit);
  }

  // Admin User Management operations
  async getAllUsers(): Promise<User[]> {
    return await db.select().from(users).orderBy(desc(users.createdAt));
  }

  async banUser(userId: string, reason?: string, expiresAt?: Date): Promise<User> {
    const [updated] = await db.update(users)
      .set({
        bannedAt: new Date(),
        banReason: reason || null,
        banExpiresAt: expiresAt || null,
      })
      .where(eq(users.id, userId))
      .returning();
    return updated;
  }

  async unbanUser(userId: string): Promise<User> {
    const [updated] = await db.update(users)
      .set({
        bannedAt: null,
        banReason: null,
        banExpiresAt: null,
      })
      .where(eq(users.id, userId))
      .returning();
    return updated;
  }

  async updateBan(userId: string, reason?: string, expiresAt?: Date): Promise<User> {
    const updateData: Partial<User> = {};
    if (reason !== undefined) {
      updateData.banReason = reason || null;
    }
    if (expiresAt !== undefined) {
      updateData.banExpiresAt = expiresAt || null;
    }
    const [updated] = await db.update(users)
      .set(updateData)
      .where(eq(users.id, userId))
      .returning();
    return updated;
  }

  async setUserAdmin(userId: string, isAdmin: boolean): Promise<User> {
    const [updated] = await db.update(users)
      .set({ isAdmin })
      .where(eq(users.id, userId))
      .returning();
    return updated;
  }

  async deleteUser(userId: string): Promise<void> {
    // Delete all user-related data in the correct order to avoid foreign key conflicts
    // This is a cascading delete operation

    // Delete campaigns owned by this user (cascades to all campaign-related data:
    // members, bans, characters, tokens, scenes, chat, items, spells, etc.)
    await db.delete(campaigns).where(eq(campaigns.gmUserId, userId));

    // Delete notifications
    await db.delete(userNotifications).where(eq(userNotifications.userId, userId));
    
    // Delete terms acceptance records
    await db.delete(userTermsAcceptance).where(eq(userTermsAcceptance.userId, userId));
    
    // Delete password reset tokens
    await db.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, userId));
    
    // Delete friend requests (both sent and received)
    await db.delete(friendRequests).where(or(
      eq(friendRequests.senderId, userId),
      eq(friendRequests.recipientId, userId)
    ));
    
    // Delete friendships
    await db.delete(friendships).where(or(
      eq(friendships.userId, userId),
      eq(friendships.friendId, userId)
    ));
    
    // Delete note shares (where user is shared with)
    await db.delete(noteShares).where(eq(noteShares.sharedWithId, userId));
    
    // Delete notes created by user
    const userNotes = await db.select({ id: notes.id }).from(notes).where(eq(notes.userId, userId));
    for (const note of userNotes) {
      await db.delete(noteReferences).where(eq(noteReferences.noteId, note.id));
      await db.delete(noteShares).where(eq(noteShares.noteId, note.id));
    }
    await db.delete(notes).where(eq(notes.userId, userId));
    
    // Delete note folders created by user
    await db.delete(noteFolders).where(eq(noteFolders.userId, userId));
    
    // Delete character permissions
    await db.delete(characterPermissions).where(eq(characterPermissions.userId, userId));
    
    // Delete campaign memberships
    await db.delete(campaignMembers).where(eq(campaignMembers.userId, userId));
    
    // Delete campaign bans
    await db.delete(campaignBans).where(eq(campaignBans.userId, userId));
    
    // Finally, delete the user
    await db.delete(users).where(eq(users.id, userId));
  }

  async getUserActivity(userId: string): Promise<{
    campaigns: Campaign[];
    characters: Character[];
    notes: Note[];
    memberships: CampaignMember[];
  }> {
    const [userCampaigns, userCharacters, userNotes, userMemberships] = await Promise.all([
      db.select().from(campaigns).where(eq(campaigns.gmUserId, userId)),
      db.select().from(characters).where(eq(characters.userId, userId)),
      db.select().from(notes).where(eq(notes.userId, userId)),
      db.select().from(campaignMembers).where(eq(campaignMembers.userId, userId)),
    ]);
    return {
      campaigns: userCampaigns,
      characters: userCharacters,
      notes: userNotes,
      memberships: userMemberships,
    };
  }

  // User Notification operations
  async getUserNotifications(userId: string): Promise<UserNotification[]> {
    return db.select().from(userNotifications)
      .where(eq(userNotifications.userId, userId))
      .orderBy(desc(userNotifications.createdAt));
  }

  async getUnreadNotificationCount(userId: string): Promise<number> {
    const result = await db.select({ count: sql<number>`count(*)` })
      .from(userNotifications)
      .where(and(
        eq(userNotifications.userId, userId),
        eq(userNotifications.isRead, false)
      ));
    return Number(result[0]?.count || 0);
  }

  async createUserNotification(data: InsertUserNotification): Promise<UserNotification> {
    const [notification] = await db.insert(userNotifications).values(data).returning();
    return notification;
  }

  async markNotificationRead(id: string): Promise<void> {
    await db.update(userNotifications)
      .set({ isRead: true })
      .where(eq(userNotifications.id, id));
  }

  async markAllNotificationsRead(userId: string): Promise<void> {
    await db.update(userNotifications)
      .set({ isRead: true })
      .where(eq(userNotifications.userId, userId));
  }

  async deleteNotification(id: string): Promise<void> {
    await db.delete(userNotifications).where(eq(userNotifications.id, id));
  }

  // Terms and Conditions operations
  async getCurrentTerms(): Promise<TermsAndConditions | undefined> {
    const result = await db.select().from(termsAndConditions)
      .orderBy(desc(termsAndConditions.version))
      .limit(1);
    return result[0];
  }

  async updateTerms(content: string, updatedBy: string): Promise<TermsAndConditions> {
    const current = await this.getCurrentTerms();
    const newVersion = (current?.version || 0) + 1;
    const [terms] = await db.insert(termsAndConditions).values({
      version: newVersion,
      content,
      updatedBy,
    }).returning();
    return terms;
  }

  async hasUserAcceptedCurrentTerms(userId: string): Promise<boolean> {
    const current = await this.getCurrentTerms();
    if (!current) return true; // No terms = no acceptance needed
    
    const acceptance = await db.select().from(userTermsAcceptance)
      .where(and(
        eq(userTermsAcceptance.userId, userId),
        eq(userTermsAcceptance.termsVersion, current.version)
      ))
      .limit(1);
    return acceptance.length > 0;
  }

  async acceptTerms(userId: string, version: number): Promise<UserTermsAcceptance> {
    const [acceptance] = await db.insert(userTermsAcceptance).values({
      userId,
      termsVersion: version,
    }).returning();
    return acceptance;
  }

  async getSandboxFolders(campaignId: string): Promise<SandboxFolder[]> {
    return await db.select().from(sandboxFolders).where(eq(sandboxFolders.campaignId, campaignId)).orderBy(sandboxFolders.sortOrder);
  }

  async createSandboxFolder(folder: InsertSandboxFolder): Promise<SandboxFolder> {
    const [created] = await db.insert(sandboxFolders).values(folder).returning();
    return created;
  }

  async updateSandboxFolder(id: string, data: Partial<InsertSandboxFolder>): Promise<SandboxFolder> {
    const [updated] = await db.update(sandboxFolders).set(data).where(eq(sandboxFolders.id, id)).returning();
    return updated;
  }

  async deleteSandboxFolder(id: string): Promise<void> {
    await db.delete(sandboxFolders).where(eq(sandboxFolders.id, id));
  }

  async getSandboxTemplates(campaignId: string): Promise<SandboxTemplate[]> {
    return await db.select().from(sandboxTemplates).where(eq(sandboxTemplates.campaignId, campaignId)).orderBy(sandboxTemplates.createdAt);
  }

  async createSandboxTemplate(data: InsertSandboxTemplate): Promise<SandboxTemplate> {
    const [template] = await db.insert(sandboxTemplates).values(data).returning();
    return template;
  }

  async updateSandboxTemplate(id: string, data: Partial<SandboxTemplate>): Promise<SandboxTemplate> {
    const [template] = await db.update(sandboxTemplates).set(data).where(eq(sandboxTemplates.id, id)).returning();
    return template;
  }

  async deleteSandboxTemplate(id: string): Promise<void> {
    await db.delete(sandboxTemplates).where(eq(sandboxTemplates.id, id));
  }

  async getSandboxActors(campaignId: string): Promise<SandboxActor[]> {
    return await db.select().from(sandboxActors).where(eq(sandboxActors.campaignId, campaignId)).orderBy(sandboxActors.createdAt);
  }

  async createSandboxActor(data: InsertSandboxActor): Promise<SandboxActor> {
    const [actor] = await db.insert(sandboxActors).values(data).returning();
    return actor;
  }

  async updateSandboxActor(id: string, data: Partial<SandboxActor>): Promise<SandboxActor> {
    const [actor] = await db.update(sandboxActors).set(data).where(eq(sandboxActors.id, id)).returning();
    return actor;
  }

  async deleteSandboxActor(id: string): Promise<void> {
    await db.delete(sandboxActors).where(eq(sandboxActors.id, id));
  }

  // ============================================
  // WORLDBUILDING ENTITY OPERATIONS
  // ============================================

  async getEntity(id: string): Promise<Entity | undefined> {
    const [entity] = await db.select().from(entities).where(eq(entities.id, id));
    return entity;
  }

  async getEntitiesByCampaign(campaignId: string, includeDeleted = false): Promise<Entity[]> {
    if (includeDeleted) {
      return await db.select().from(entities).where(eq(entities.campaignId, campaignId));
    }
    return await db.select().from(entities).where(
      and(eq(entities.campaignId, campaignId), eq(entities.isDeleted, false))
    );
  }

  async searchEntitiesByCampaign(campaignId: string, query: string, entityType?: string): Promise<Entity[]> {
    const lowerQuery = `%${query.toLowerCase()}%`;
    const conditions = [
      eq(entities.campaignId, campaignId),
      eq(entities.isDeleted, false),
      sql`LOWER(${entities.displayName}) LIKE ${lowerQuery}`
    ];
    if (entityType) {
      conditions.push(eq(entities.entityType, entityType));
    }
    return await db.select().from(entities).where(and(...conditions));
  }

  async createEntity(entity: InsertEntity): Promise<Entity> {
    const [created] = await db.insert(entities).values(entity).returning();
    return created;
  }

  async updateEntity(id: string, data: Partial<Entity>): Promise<Entity | undefined> {
    const [updated] = await db.update(entities)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(entities.id, id))
      .returning();
    return updated;
  }

  async softDeleteEntity(id: string): Promise<Entity | undefined> {
    const [updated] = await db.update(entities)
      .set({ isDeleted: true, deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(entities.id, id))
      .returning();
    return updated;
  }

  async restoreEntity(id: string): Promise<Entity | undefined> {
    const [updated] = await db.update(entities)
      .set({ isDeleted: false, deletedAt: null, updatedAt: new Date() })
      .where(eq(entities.id, id))
      .returning();
    return updated;
  }

  async getEntitiesBySheet(sheetId: string): Promise<Entity[]> {
    return await db.select().from(entities).where(
      and(eq(entities.sheetId, sheetId), eq(entities.isDeleted, false))
    );
  }

  async getEntitiesByNote(notePageId: string): Promise<Entity[]> {
    return await db.select().from(entities).where(
      and(eq(entities.notePageId, notePageId), eq(entities.isDeleted, false))
    );
  }

  // ============================================
  // ENTITY LINK OPERATIONS
  // ============================================

  async getEntityLink(id: string): Promise<EntityLink | undefined> {
    const [link] = await db.select().from(entityLinks).where(eq(entityLinks.id, id));
    return link;
  }

  async getEntityLinks(entityId: string): Promise<EntityLink[]> {
    return await db.select().from(entityLinks).where(
      or(eq(entityLinks.fromEntityId, entityId), eq(entityLinks.toEntityId, entityId))
    );
  }

  async getEntityLinksByCampaign(campaignId: string): Promise<EntityLink[]> {
    return await db.select().from(entityLinks).where(eq(entityLinks.campaignId, campaignId));
  }

  async createEntityLink(link: InsertEntityLink): Promise<EntityLink> {
    const [created] = await db.insert(entityLinks).values(link).returning();
    return created;
  }

  async updateEntityLink(id: string, data: Partial<EntityLink>): Promise<EntityLink | undefined> {
    const [updated] = await db.update(entityLinks)
      .set(data)
      .where(eq(entityLinks.id, id))
      .returning();
    return updated;
  }

  async deleteEntityLink(id: string): Promise<void> {
    await db.delete(entityLinks).where(eq(entityLinks.id, id));
  }

  async getEntityReferences(entityId: string): Promise<{ links: EntityLink[]; noteReferences: any[]; }> {
    const links = await this.getEntityLinks(entityId);
    const backlinks = await db.select().from(noteReferences).where(
      and(eq(noteReferences.entityType, 'entity'), eq(noteReferences.entityId, entityId))
    );
    return { links, noteReferences: backlinks };
  }

  // ============================================
  // WORLD SHARE LINK OPERATIONS
  // ============================================

  async getWorldShareLink(campaignId: string): Promise<WorldShareLink | undefined> {
    const [link] = await db.select().from(worldShareLinks)
      .where(and(eq(worldShareLinks.campaignId, campaignId), eq(worldShareLinks.isActive, true)))
      .limit(1);
    return link;
  }

  async getWorldShareLinkByToken(token: string): Promise<WorldShareLink | undefined> {
    const [link] = await db.select().from(worldShareLinks)
      .where(and(eq(worldShareLinks.token, token), eq(worldShareLinks.isActive, true)))
      .limit(1);
    return link;
  }

  async createWorldShareLink(link: InsertWorldShareLink): Promise<WorldShareLink> {
    const [created] = await db.insert(worldShareLinks).values(link).returning();
    return created;
  }

  async deleteWorldShareLink(id: string): Promise<void> {
    await db.delete(worldShareLinks).where(eq(worldShareLinks.id, id));
  }

  // ============================================
  // SPECTATOR TOKEN OPERATIONS
  // ============================================

  async getSpectatorTokenByCampaign(campaignId: string): Promise<SpectatorToken | undefined> {
    const [row] = await db.select().from(spectatorTokens)
      .where(eq(spectatorTokens.campaignId, campaignId))
      .limit(1);
    return row;
  }

  async getSpectatorTokenByToken(token: string): Promise<SpectatorToken | undefined> {
    const [row] = await db.select().from(spectatorTokens)
      .where(eq(spectatorTokens.token, token))
      .limit(1);
    if (!row) return undefined;
    if (row.expiresAt && row.expiresAt.getTime() <= Date.now()) {
      // Lazy cleanup: drop the expired row so the table stays tidy.
      await db.delete(spectatorTokens).where(eq(spectatorTokens.id, row.id));
      return undefined;
    }
    return row;
  }

  async upsertSpectatorToken(campaignId: string, token: string, createdBy: string, expiresAt?: Date | null): Promise<SpectatorToken> {
    await db.delete(spectatorTokens).where(eq(spectatorTokens.campaignId, campaignId));
    const [row] = await db.insert(spectatorTokens).values({ campaignId, token, createdBy, expiresAt: expiresAt ?? null }).returning();
    return row;
  }

  async deleteSpectatorToken(campaignId: string): Promise<void> {
    await db.delete(spectatorTokens).where(eq(spectatorTokens.campaignId, campaignId));
  }

  async deleteExpiredSpectatorTokens(): Promise<number> {
    const result = await db.delete(spectatorTokens)
      .where(and(
        sql`${spectatorTokens.expiresAt} IS NOT NULL`,
        sql`${spectatorTokens.expiresAt} <= NOW()`,
      ))
      .returning({ id: spectatorTokens.id });
    return result.length;
  }

  // ============================================
  // WORLD MAP OPERATIONS
  // ============================================

  async getWorldMaps(campaignId: string): Promise<WorldMap[]> {
    return await db.select().from(worldMaps)
      .where(eq(worldMaps.campaignId, campaignId))
      .orderBy(worldMaps.sortOrder);
  }

  async getWorldMap(id: string): Promise<WorldMap | undefined> {
    const [map] = await db.select().from(worldMaps).where(eq(worldMaps.id, id));
    return map;
  }

  async createWorldMap(map: InsertWorldMap): Promise<WorldMap> {
    const [created] = await db.insert(worldMaps).values(map).returning();
    return created;
  }

  async updateWorldMap(id: string, data: Partial<WorldMap>): Promise<WorldMap | undefined> {
    const [updated] = await db.update(worldMaps)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(worldMaps.id, id))
      .returning();
    return updated;
  }

  async deleteWorldMap(id: string): Promise<void> {
    await db.delete(worldMaps).where(eq(worldMaps.id, id));
  }

  // ============================================
  // WORLD MAP PIN OPERATIONS
  // ============================================

  async getWorldMapPins(mapId: string): Promise<WorldMapPin[]> {
    return await db.select().from(worldMapPins).where(eq(worldMapPins.mapId, mapId));
  }

  async getWorldMapPin(id: string): Promise<WorldMapPin | undefined> {
    const [pin] = await db.select().from(worldMapPins).where(eq(worldMapPins.id, id));
    return pin;
  }

  async createWorldMapPin(pin: InsertWorldMapPin): Promise<WorldMapPin> {
    const [created] = await db.insert(worldMapPins).values(pin).returning();
    return created;
  }

  async updateWorldMapPin(id: string, data: Partial<WorldMapPin>): Promise<WorldMapPin | undefined> {
    const [updated] = await db.update(worldMapPins).set(data).where(eq(worldMapPins.id, id)).returning();
    return updated;
  }

  async deleteWorldMapPin(id: string): Promise<void> {
    await db.delete(worldMapPins).where(eq(worldMapPins.id, id));
  }

  // ============================================
  // WORLD CALENDAR OPERATIONS
  // ============================================

  async getWorldCalendars(campaignId: string): Promise<WorldCalendar[]> {
    return await db.select().from(worldCalendars).where(eq(worldCalendars.campaignId, campaignId));
  }

  async getWorldCalendar(id: string): Promise<WorldCalendar | undefined> {
    const [calendar] = await db.select().from(worldCalendars).where(eq(worldCalendars.id, id));
    return calendar;
  }

  async createWorldCalendar(calendar: InsertWorldCalendar): Promise<WorldCalendar> {
    const [created] = await db.insert(worldCalendars).values(calendar).returning();
    return created;
  }

  async updateWorldCalendar(id: string, data: Partial<WorldCalendar>): Promise<WorldCalendar | undefined> {
    const [updated] = await db.update(worldCalendars)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(worldCalendars.id, id))
      .returning();
    return updated;
  }

  async deleteWorldCalendar(id: string): Promise<void> {
    await db.delete(worldCalendars).where(eq(worldCalendars.id, id));
  }

  // ============================================
  // WORLD TIMELINE EVENT OPERATIONS
  // ============================================

  async getWorldTimelineEvents(campaignId: string): Promise<WorldTimelineEvent[]> {
    return await db.select().from(worldTimelineEvents)
      .where(eq(worldTimelineEvents.campaignId, campaignId))
      .orderBy(worldTimelineEvents.sortOrder);
  }

  async getWorldTimelineEvent(id: string): Promise<WorldTimelineEvent | undefined> {
    const [event] = await db.select().from(worldTimelineEvents).where(eq(worldTimelineEvents.id, id));
    return event;
  }

  async createWorldTimelineEvent(event: InsertWorldTimelineEvent): Promise<WorldTimelineEvent> {
    const [created] = await db.insert(worldTimelineEvents).values(event).returning();
    return created;
  }

  async updateWorldTimelineEvent(id: string, data: Partial<WorldTimelineEvent>): Promise<WorldTimelineEvent | undefined> {
    const [updated] = await db.update(worldTimelineEvents)
      .set(data)
      .where(eq(worldTimelineEvents.id, id))
      .returning();
    return updated;
  }

  async deleteWorldTimelineEvent(id: string): Promise<void> {
    await db.delete(worldTimelineEvents).where(eq(worldTimelineEvents.id, id));
  }

  // ============================================
  // WORLD OPERATIONS
  // ============================================

  async getWorldsByUser(userId: string): Promise<World[]> {
    return await db.select().from(worlds)
      .where(eq(worlds.userId, userId))
      .orderBy(desc(worlds.updatedAt));
  }

  async getWorldsByCampaign(campaignId: string): Promise<World[]> {
    return await db.select().from(worlds)
      .where(eq(worlds.campaignId, campaignId))
      .orderBy(desc(worlds.updatedAt));
  }

  async getWorld(id: string): Promise<World | undefined> {
    const [world] = await db.select().from(worlds).where(eq(worlds.id, id));
    return world;
  }

  async createWorld(world: InsertWorld): Promise<World> {
    const [created] = await db.insert(worlds).values(world).returning();
    return created;
  }

  async updateWorld(id: string, data: Partial<World>): Promise<World | undefined> {
    const [updated] = await db.update(worlds)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(worlds.id, id))
      .returning();
    return updated;
  }

  async deleteWorld(id: string): Promise<void> {
    await db.delete(worlds).where(eq(worlds.id, id));
  }

  async getWorldCanvasNodes(worldId: string): Promise<WorldCanvasNode[]> {
    return await db.select().from(worldCanvasNodes).where(eq(worldCanvasNodes.worldId, worldId));
  }

  async upsertWorldCanvasNode(node: InsertWorldCanvasNode): Promise<WorldCanvasNode> {
    const [saved] = await db
      .insert(worldCanvasNodes)
      .values(node)
      .onConflictDoUpdate({
        target: [worldCanvasNodes.worldId, worldCanvasNodes.refType, worldCanvasNodes.refId],
        set: {
          x: node.x,
          y: node.y,
          width: node.width,
          height: node.height,
          z: node.z,
          updatedAt: new Date(),
        },
      })
      .returning();
    return saved;
  }

  async deleteWorldCanvasNode(worldId: string, refType: string, refId: string): Promise<void> {
    await db
      .delete(worldCanvasNodes)
      .where(
        and(
          eq(worldCanvasNodes.worldId, worldId),
          eq(worldCanvasNodes.refType, refType),
          eq(worldCanvasNodes.refId, refId),
        ),
      );
  }

  async getWorldCollaborators(worldId: string): Promise<WorldCollaborator[]> {
    return await db.select().from(worldCollaborators).where(eq(worldCollaborators.worldId, worldId));
  }

  async addWorldCollaborator(worldId: string, userId: string, role = "editor"): Promise<WorldCollaborator> {
    const [collab] = await db.insert(worldCollaborators).values({ worldId, userId, role }).onConflictDoUpdate({
      target: [worldCollaborators.worldId, worldCollaborators.userId],
      set: { role },
    }).returning();
    return collab;
  }

  async removeWorldCollaborator(worldId: string, userId: string): Promise<void> {
    await db.delete(worldCollaborators).where(and(eq(worldCollaborators.worldId, worldId), eq(worldCollaborators.userId, userId)));
  }

  async isWorldCollaborator(worldId: string, userId: string): Promise<boolean> {
    const [row] = await db.select().from(worldCollaborators).where(and(eq(worldCollaborators.worldId, worldId), eq(worldCollaborators.userId, userId))).limit(1);
    return !!row;
  }

  async getWorldsByCollaborator(userId: string): Promise<World[]> {
    const collabs = await db.select().from(worldCollaborators).where(eq(worldCollaborators.userId, userId));
    if (collabs.length === 0) return [];
    const worldIds = collabs.map(c => c.worldId);
    return await db.select().from(worlds).where(inArray(worlds.id, worldIds));
  }

  async getEntityAccessList(entityId: string): Promise<EntityAccess[]> {
    return await db.select().from(entityAccess).where(eq(entityAccess.entityId, entityId));
  }

  async setEntityAccess(entityId: string, userId: string, accessLevel: string): Promise<EntityAccess> {
    const [access] = await db.insert(entityAccess).values({ entityId, userId, accessLevel }).onConflictDoUpdate({
      target: [entityAccess.entityId, entityAccess.userId],
      set: { accessLevel },
    }).returning();
    return access;
  }

  async removeEntityAccess(entityId: string, userId: string): Promise<void> {
    await db.delete(entityAccess).where(and(eq(entityAccess.entityId, entityId), eq(entityAccess.userId, userId)));
  }

  async getUserEntityAccess(entityId: string, userId: string): Promise<EntityAccess | undefined> {
    const [row] = await db.select().from(entityAccess).where(and(eq(entityAccess.entityId, entityId), eq(entityAccess.userId, userId))).limit(1);
    return row;
  }

  // ============================================
  // WORLD-SCOPED QUERY OPERATIONS
  // ============================================

  async getEntitiesByWorld(worldId: string, includeDeleted = false): Promise<Entity[]> {
    if (includeDeleted) {
      return await db.select().from(entities).where(eq(entities.worldId, worldId));
    }
    return await db.select().from(entities).where(
      and(eq(entities.worldId, worldId), eq(entities.isDeleted, false))
    );
  }

  async searchEntitiesByWorld(worldId: string, query: string, entityType?: string): Promise<Entity[]> {
    const lowerQuery = `%${query.toLowerCase()}%`;
    const conditions = [
      eq(entities.worldId, worldId),
      eq(entities.isDeleted, false),
      sql`LOWER(${entities.displayName}) LIKE ${lowerQuery}`
    ];
    if (entityType) {
      conditions.push(eq(entities.entityType, entityType));
    }
    return await db.select().from(entities).where(and(...conditions));
  }

  async getEntityLinksByWorld(worldId: string): Promise<EntityLink[]> {
    return await db.select().from(entityLinks).where(eq(entityLinks.worldId, worldId));
  }

  async getWorldShareLinkByWorld(worldId: string): Promise<WorldShareLink | undefined> {
    const [link] = await db.select().from(worldShareLinks)
      .where(and(eq(worldShareLinks.worldId, worldId), eq(worldShareLinks.isActive, true)))
      .limit(1);
    return link;
  }

  async getWorldMapsByWorld(worldId: string): Promise<WorldMap[]> {
    return await db.select().from(worldMaps)
      .where(eq(worldMaps.worldId, worldId))
      .orderBy(worldMaps.sortOrder);
  }

  async getWorldCalendarsByWorld(worldId: string): Promise<WorldCalendar[]> {
    return await db.select().from(worldCalendars).where(eq(worldCalendars.worldId, worldId));
  }

  async getWorldTimelineEventsByWorld(worldId: string): Promise<WorldTimelineEvent[]> {
    return await db.select().from(worldTimelineEvents)
      .where(eq(worldTimelineEvents.worldId, worldId))
      .orderBy(worldTimelineEvents.sortOrder);
  }

  async getCalendarSyncsByWorld(worldId: string): Promise<WorldCalendarSync[]> {
    return await db.select().from(worldCalendarSyncs).where(eq(worldCalendarSyncs.worldId, worldId));
  }

  async getCalendarSync(id: string): Promise<WorldCalendarSync | undefined> {
    const [sync] = await db.select().from(worldCalendarSyncs).where(eq(worldCalendarSyncs.id, id)).limit(1);
    return sync;
  }

  async createCalendarSync(sync: InsertWorldCalendarSync): Promise<WorldCalendarSync> {
    const [created] = await db.insert(worldCalendarSyncs).values(sync).returning();
    return created;
  }

  async deleteCalendarSync(id: string): Promise<void> {
    await db.delete(worldCalendarSyncs).where(eq(worldCalendarSyncs.id, id));
  }

  async getTimelinesByWorld(worldId: string): Promise<WorldTimeline[]> {
    return await db.select().from(worldTimelines).where(eq(worldTimelines.worldId, worldId));
  }

  async getTimelinesByCampaign(campaignId: string): Promise<WorldTimeline[]> {
    return await db.select().from(worldTimelines).where(eq(worldTimelines.campaignId, campaignId));
  }

  async getTimeline(id: string): Promise<WorldTimeline | undefined> {
    const [timeline] = await db.select().from(worldTimelines).where(eq(worldTimelines.id, id)).limit(1);
    return timeline;
  }

  async createTimeline(data: InsertWorldTimeline): Promise<WorldTimeline> {
    const [created] = await db.insert(worldTimelines).values(data).returning();
    return created;
  }

  async updateTimeline(id: string, data: Partial<WorldTimeline>): Promise<WorldTimeline | undefined> {
    const [updated] = await db.update(worldTimelines).set(data).where(eq(worldTimelines.id, id)).returning();
    return updated;
  }

  async deleteTimeline(id: string): Promise<void> {
    await db.delete(worldTimelines).where(eq(worldTimelines.id, id));
  }

  // ============================================
  // CAMPAIGN MAP PIN OPERATIONS
  // ============================================

  async getCampaignMapPins(sceneId: string): Promise<CampaignMapPin[]> {
    return await db.select().from(campaignMapPins).where(eq(campaignMapPins.sceneId, sceneId));
  }

  async getCampaignMapPin(id: string): Promise<CampaignMapPin | undefined> {
    const [pin] = await db.select().from(campaignMapPins).where(eq(campaignMapPins.id, id));
    return pin;
  }

  async createCampaignMapPin(pin: InsertCampaignMapPin): Promise<CampaignMapPin> {
    const [created] = await db.insert(campaignMapPins).values(pin).returning();
    return created;
  }

  async updateCampaignMapPin(id: string, data: Partial<InsertCampaignMapPin>): Promise<CampaignMapPin | undefined> {
    const [updated] = await db.update(campaignMapPins).set(data).where(eq(campaignMapPins.id, id)).returning();
    return updated;
  }

  async deleteCampaignMapPin(id: string): Promise<void> {
    await db.delete(campaignMapPins).where(eq(campaignMapPins.id, id));
  }

  // ============================================
  // SHOP ITEM OPERATIONS
  // ============================================

  async getShopItems(pinId: string): Promise<ShopItem[]> {
    return await db.select().from(shopItems).where(eq(shopItems.pinId, pinId));
  }

  async getShopItem(id: string): Promise<ShopItem | undefined> {
    const [item] = await db.select().from(shopItems).where(eq(shopItems.id, id));
    return item;
  }

  async createShopItem(item: InsertShopItem): Promise<ShopItem> {
    const [created] = await db.insert(shopItems).values(item).returning();
    return created;
  }

  async updateShopItem(id: string, data: Partial<InsertShopItem>): Promise<ShopItem | undefined> {
    const [updated] = await db.update(shopItems).set(data).where(eq(shopItems.id, id)).returning();
    return updated;
  }

  async deleteShopItem(id: string): Promise<void> {
    await db.delete(shopItems).where(eq(shopItems.id, id));
  }

  async getShopHaggleRolls(pinId: string): Promise<ShopHaggleRoll[]> {
    return await db.select().from(shopHaggleRolls).where(eq(shopHaggleRolls.pinId, pinId));
  }

  async getShopHaggleRoll(pinId: string, characterId: string): Promise<ShopHaggleRoll | undefined> {
    const [roll] = await db.select().from(shopHaggleRolls)
      .where(and(eq(shopHaggleRolls.pinId, pinId), eq(shopHaggleRolls.characterId, characterId)));
    return roll;
  }

  async upsertShopHaggleRoll(data: InsertShopHaggleRoll): Promise<ShopHaggleRoll> {
    const [result] = await db.insert(shopHaggleRolls).values(data)
      .onConflictDoUpdate({
        target: [shopHaggleRolls.pinId, shopHaggleRolls.characterId],
        set: {
          roll: data.roll,
          sellPercentage: data.sellPercentage,
          d20Result: data.d20Result,
          charismaMod: data.charismaMod,
          characterName: data.characterName,
          createdAt: sql`NOW()`,
        },
      })
      .returning();
    return result;
  }

  async deleteShopHaggleRoll(pinId: string, characterId: string): Promise<void> {
    await db.delete(shopHaggleRolls)
      .where(and(eq(shopHaggleRolls.pinId, pinId), eq(shopHaggleRolls.characterId, characterId)));
  }

  async getClasses(systemName: string, ownerScope?: string[]): Promise<GameClass[]> {
    const conditions: any[] = [eq(classes.system, systemName)];
    if (ownerScope) {
      conditions.push(
        ownerScope.length > 0
          ? or(sql`${classes.ownerUserId} IS NULL`, inArray(classes.ownerUserId, ownerScope))!
          : sql`${classes.ownerUserId} IS NULL`
      );
    }
    return db.select().from(classes).where(and(...conditions));
  }

  async getClass(id: string): Promise<GameClass | undefined> {
    const [result] = await db.select().from(classes).where(eq(classes.id, id));
    return result;
  }

  async createClass(data: InsertClass): Promise<GameClass> {
    const [result] = await db.insert(classes).values(data).returning();
    return result;
  }

  async updateClass(id: string, data: Partial<InsertClass>): Promise<GameClass | undefined> {
    const [result] = await db.update(classes).set(data).where(eq(classes.id, id)).returning();
    return result;
  }

  async deleteClass(id: string): Promise<void> {
    await db.delete(classes).where(eq(classes.id, id));
  }

  async getUniversalClasses(systemName: string): Promise<GameClass[]> {
    // Only global admin-library classes (ownerUserId IS NULL) may be universal.
    // Personal-library classes never fan out to other users' characters.
    return db.select().from(classes).where(
      and(
        eq(classes.system, systemName),
        eq(classes.applyToAll, true),
        isNull(classes.ownerUserId),
      )
    );
  }

  async getCharacterIdsByCampaignSystem(systemName: string): Promise<string[]> {
    const rows = await db
      .select({ id: characters.id })
      .from(characters)
      .innerJoin(campaigns, eq(characters.campaignId, campaigns.id))
      .where(eq(campaigns.system, systemName));
    return rows.map(r => r.id);
  }

  async getClassSkillNodes(classId: string): Promise<ClassSkillNode[]> {
    return db.select().from(classSkillNodes).where(eq(classSkillNodes.classId, classId));
  }

  async getClassSkillNode(id: string): Promise<ClassSkillNode | undefined> {
    const [result] = await db.select().from(classSkillNodes).where(eq(classSkillNodes.id, id));
    return result;
  }

  async createClassSkillNode(data: InsertClassSkillNode): Promise<ClassSkillNode> {
    const [result] = await db.insert(classSkillNodes).values(data).returning();
    return result;
  }

  async updateClassSkillNode(id: string, data: Partial<InsertClassSkillNode>): Promise<ClassSkillNode | undefined> {
    const [result] = await db.update(classSkillNodes).set(data).where(eq(classSkillNodes.id, id)).returning();
    return result;
  }

  async deleteClassSkillNode(id: string): Promise<void> {
    await db.delete(classSkillNodes).where(eq(classSkillNodes.id, id));
  }

  async getClassSkillConnections(classId: string): Promise<ClassSkillConnection[]> {
    return db.select().from(classSkillConnections).where(eq(classSkillConnections.classId, classId));
  }

  async createClassSkillConnection(data: InsertClassSkillConnection): Promise<ClassSkillConnection> {
    const [result] = await db.insert(classSkillConnections).values(data).returning();
    return result;
  }

  async deleteClassSkillConnection(id: string): Promise<void> {
    await db.delete(classSkillConnections).where(eq(classSkillConnections.id, id));
  }

  async getCharacterClasses(characterId: string): Promise<CharacterClass[]> {
    return db.select().from(characterClasses).where(eq(characterClasses.characterId, characterId));
  }

  async createCharacterClass(data: InsertCharacterClass): Promise<CharacterClass> {
    const [result] = await db.insert(characterClasses).values(data).returning();
    return result;
  }

  async updateCharacterClass(id: string, data: Partial<InsertCharacterClass>): Promise<CharacterClass | undefined> {
    const [result] = await db.update(characterClasses).set(data).where(eq(characterClasses.id, id)).returning();
    return result;
  }

  async deleteCharacterClass(id: string): Promise<void> {
    await db.delete(characterClasses).where(eq(characterClasses.id, id));
  }

  async getCharacterClassSkills(characterId: string, classId: string): Promise<CharacterClassSkill[]> {
    return db.select().from(characterClassSkills).where(
      and(eq(characterClassSkills.characterId, characterId), eq(characterClassSkills.classId, classId))
    );
  }

  async createCharacterClassSkill(data: InsertCharacterClassSkill): Promise<CharacterClassSkill> {
    const [result] = await db.insert(characterClassSkills).values(data).returning();
    return result;
  }

  // ============================================
  // CRAFTER RECIPE OPERATIONS
  // ============================================

  async getCraftRecipesByItem(parentItemId: string): Promise<Array<CraftRecipe & { ingredients: CraftRecipeIngredient[]; outcomes: CraftRecipeOutcome[] }>> {
    // Exclude the item's own build recipe (isBuildRecipe=true) so it never
    // appears in a crafter's makeable-recipe list or the player craft runtime.
    const recipes = await db.select().from(craftRecipes)
      .where(and(eq(craftRecipes.parentItemId, parentItemId), eq(craftRecipes.isBuildRecipe, false)))
      .orderBy(craftRecipes.sortOrder);
    if (recipes.length === 0) return [];
    const ids = recipes.map(r => r.id);
    const [allIng, allOut] = await Promise.all([
      db.select().from(craftRecipeIngredients).where(inArray(craftRecipeIngredients.recipeId, ids)).orderBy(craftRecipeIngredients.sortOrder),
      db.select().from(craftRecipeOutcomes).where(inArray(craftRecipeOutcomes.recipeId, ids)).orderBy(craftRecipeOutcomes.sortOrder),
    ]);
    return recipes.map(r => ({
      ...r,
      ingredients: allIng.filter(i => i.recipeId === r.id),
      outcomes: allOut.filter(o => o.recipeId === r.id),
    }));
  }

  async getCraftRecipe(id: string): Promise<(CraftRecipe & { ingredients: CraftRecipeIngredient[]; outcomes: CraftRecipeOutcome[] }) | undefined> {
    const [recipe] = await db.select().from(craftRecipes).where(eq(craftRecipes.id, id));
    if (!recipe) return undefined;
    const [ingredients, outcomes] = await Promise.all([
      db.select().from(craftRecipeIngredients).where(eq(craftRecipeIngredients.recipeId, id)).orderBy(craftRecipeIngredients.sortOrder),
      db.select().from(craftRecipeOutcomes).where(eq(craftRecipeOutcomes.recipeId, id)).orderBy(craftRecipeOutcomes.sortOrder),
    ]);
    return { ...recipe, ingredients, outcomes };
  }

  async createCraftRecipe(
    recipe: InsertCraftRecipe,
    ingredients: Omit<InsertCraftRecipeIngredient, 'recipeId'>[],
    outcomes: Omit<InsertCraftRecipeOutcome, 'recipeId'>[]
  ): Promise<CraftRecipe & { ingredients: CraftRecipeIngredient[]; outcomes: CraftRecipeOutcome[] }> {
    const [created] = await db.insert(craftRecipes).values(recipe).returning();
    const ingRows = ingredients.length > 0
      ? await db.insert(craftRecipeIngredients).values(ingredients.map((ing, i) => ({ ...ing, recipeId: created.id, sortOrder: ing.sortOrder ?? i }))).returning()
      : [];
    const outRows = outcomes.length > 0
      ? await db.insert(craftRecipeOutcomes).values(outcomes.map((o, i) => ({ ...o, recipeId: created.id, sortOrder: o.sortOrder ?? i }))).returning()
      : [];
    return { ...created, ingredients: ingRows, outcomes: outRows };
  }

  async updateCraftRecipe(
    id: string,
    recipe: Partial<InsertCraftRecipe>,
    ingredients?: Omit<InsertCraftRecipeIngredient, 'recipeId'>[],
    outcomes?: Omit<InsertCraftRecipeOutcome, 'recipeId'>[]
  ): Promise<(CraftRecipe & { ingredients: CraftRecipeIngredient[]; outcomes: CraftRecipeOutcome[] }) | undefined> {
    const [updated] = await db.update(craftRecipes).set(recipe).where(eq(craftRecipes.id, id)).returning();
    if (!updated) return undefined;
    if (ingredients !== undefined) {
      await db.delete(craftRecipeIngredients).where(eq(craftRecipeIngredients.recipeId, id));
      if (ingredients.length > 0) {
        await db.insert(craftRecipeIngredients).values(ingredients.map((ing, i) => ({ ...ing, recipeId: id, sortOrder: ing.sortOrder ?? i })));
      }
    }
    if (outcomes !== undefined) {
      await db.delete(craftRecipeOutcomes).where(eq(craftRecipeOutcomes.recipeId, id));
      if (outcomes.length > 0) {
        await db.insert(craftRecipeOutcomes).values(outcomes.map((o, i) => ({ ...o, recipeId: id, sortOrder: o.sortOrder ?? i })));
      }
    }
    return this.getCraftRecipe(id);
  }

  async deleteCraftRecipe(id: string): Promise<void> {
    await db.delete(craftRecipes).where(eq(craftRecipes.id, id));
  }

  // ---- Item build recipe (the item's OWN crafting recipe) ----
  async getItemBuildRecipe(itemId: string): Promise<(CraftRecipe & { ingredients: CraftRecipeIngredient[] }) | undefined> {
    const [recipe] = await db.select().from(craftRecipes)
      .where(and(eq(craftRecipes.parentItemId, itemId), eq(craftRecipes.isBuildRecipe, true)));
    if (!recipe) return undefined;
    const ingredients = await db.select().from(craftRecipeIngredients)
      .where(eq(craftRecipeIngredients.recipeId, recipe.id)).orderBy(craftRecipeIngredients.sortOrder);
    return { ...recipe, ingredients };
  }

  async saveItemBuildRecipe(
    itemId: string,
    outputQuantity: number,
    ingredients: Omit<InsertCraftRecipeIngredient, 'recipeId'>[],
    itemName: string,
  ): Promise<CraftRecipe & { ingredients: CraftRecipeIngredient[] }> {
    const existing = await this.getItemBuildRecipe(itemId);
    if (existing) {
      await db.update(craftRecipes)
        .set({ outputQuantity, outputItemId: itemId, name: itemName })
        .where(eq(craftRecipes.id, existing.id));
      await db.delete(craftRecipeIngredients).where(eq(craftRecipeIngredients.recipeId, existing.id));
      const ingRows = ingredients.length > 0
        ? await db.insert(craftRecipeIngredients).values(ingredients.map((ing, i) => ({ ...ing, recipeId: existing.id, sortOrder: ing.sortOrder ?? i }))).returning()
        : [];
      const [updated] = await db.select().from(craftRecipes).where(eq(craftRecipes.id, existing.id));
      return { ...updated, ingredients: ingRows };
    }
    const [created] = await db.insert(craftRecipes).values({
      parentItemId: itemId,
      isBuildRecipe: true,
      name: itemName,
      outputItemId: itemId,
      outputQuantity,
      noRoll: true,
    }).returning();
    const ingRows = ingredients.length > 0
      ? await db.insert(craftRecipeIngredients).values(ingredients.map((ing, i) => ({ ...ing, recipeId: created.id, sortOrder: ing.sortOrder ?? i }))).returning()
      : [];
    return { ...created, ingredients: ingRows };
  }

  async deleteItemBuildRecipe(itemId: string): Promise<void> {
    const existing = await this.getItemBuildRecipe(itemId);
    if (existing) await db.delete(craftRecipes).where(eq(craftRecipes.id, existing.id));
  }

  // Items (in a given library scope) that have an authored build recipe, for
  // the "add an existing item-recipe into a group" picker.
  async getItemsWithBuildRecipes(system: string, ownerScope?: string[]): Promise<Array<{ id: string; name: string; image: string | null; price: number; currency: string; itemType: string }>> {
    const rows = await db.select({
      id: items.id,
      name: items.name,
      image: items.image,
      price: items.price,
      currency: items.currency,
      itemType: items.itemType,
      createdByUserId: items.createdByUserId,
    }).from(items)
      .innerJoin(craftRecipes, and(eq(craftRecipes.parentItemId, items.id), eq(craftRecipes.isBuildRecipe, true)))
      .where(and(eq(items.system, system), eq(items.isTemplate, true)));
    const filtered = ownerScope
      ? rows.filter(r => r.createdByUserId != null && ownerScope.includes(r.createdByUserId))
      : rows;
    return filtered.map(({ createdByUserId: _c, ...r }) => r);
  }

  async getCraftRecipesByTemplate(parentTemplateId: string): Promise<Array<CraftRecipe & { ingredients: CraftRecipeIngredient[]; outcomes: CraftRecipeOutcome[] }>> {
    const recipes = await db.select().from(craftRecipes)
      .where(eq(craftRecipes.parentTemplateId, parentTemplateId))
      .orderBy(craftRecipes.sortOrder);
    if (recipes.length === 0) return [];
    const ids = recipes.map(r => r.id);
    const [allIng, allOut] = await Promise.all([
      db.select().from(craftRecipeIngredients).where(inArray(craftRecipeIngredients.recipeId, ids)).orderBy(craftRecipeIngredients.sortOrder),
      db.select().from(craftRecipeOutcomes).where(inArray(craftRecipeOutcomes.recipeId, ids)).orderBy(craftRecipeOutcomes.sortOrder),
    ]);
    return recipes.map(r => ({
      ...r,
      ingredients: allIng.filter(i => i.recipeId === r.id),
      outcomes: allOut.filter(o => o.recipeId === r.id),
    }));
  }

  async getCraftRecipesByTemplateRecipeId(fromTemplateRecipeId: string): Promise<CraftRecipe[]> {
    return db.select().from(craftRecipes).where(eq(craftRecipes.fromTemplateRecipeId, fromTemplateRecipeId));
  }

  // ============================================
  // CRAFTER RECIPE TEMPLATES
  // ============================================
  async listCrafterRecipeTemplates(opts: { system?: string; ownerScope?: string[] | null }): Promise<CrafterRecipeTemplate[]> {
    const conds: any[] = [];
    if (opts.system) conds.push(eq(crafterRecipeTemplates.system, opts.system));
    if (opts.ownerScope === null) {
      conds.push(isNull(crafterRecipeTemplates.ownerUserId));
    } else if (Array.isArray(opts.ownerScope) && opts.ownerScope.length > 0) {
      conds.push(or(isNull(crafterRecipeTemplates.ownerUserId), inArray(crafterRecipeTemplates.ownerUserId, opts.ownerScope)));
    }
    const q = db.select().from(crafterRecipeTemplates);
    return (conds.length ? await q.where(and(...conds)) : await q).sort((a, b) => (a.sortOrder - b.sortOrder) || (a.name.localeCompare(b.name)));
  }

  async getCrafterRecipeTemplate(id: string): Promise<CrafterRecipeTemplate | undefined> {
    const [row] = await db.select().from(crafterRecipeTemplates).where(eq(crafterRecipeTemplates.id, id));
    return row;
  }

  async createCrafterRecipeTemplate(data: InsertCrafterRecipeTemplate): Promise<CrafterRecipeTemplate> {
    const [row] = await db.insert(crafterRecipeTemplates).values(data).returning();
    return row;
  }

  async updateCrafterRecipeTemplate(id: string, patch: Partial<InsertCrafterRecipeTemplate>): Promise<CrafterRecipeTemplate | undefined> {
    const [row] = await db.update(crafterRecipeTemplates).set(patch).where(eq(crafterRecipeTemplates.id, id)).returning();
    return row;
  }

  async deleteCrafterRecipeTemplate(id: string): Promise<void> {
    await db.delete(crafterRecipeTemplates).where(eq(crafterRecipeTemplates.id, id));
  }

  async getCrafterTemplateLinks(itemId: string): Promise<string[]> {
    const rows = await db.select({ templateId: crafterTemplateLinks.templateId })
      .from(crafterTemplateLinks).where(eq(crafterTemplateLinks.itemId, itemId));
    return rows.map(r => r.templateId);
  }

  async getItemsLinkedToCrafterTemplate(templateId: string): Promise<string[]> {
    const rows = await db.select({ itemId: crafterTemplateLinks.itemId })
      .from(crafterTemplateLinks).where(eq(crafterTemplateLinks.templateId, templateId));
    return rows.map(r => r.itemId);
  }

  async addCrafterTemplateLink(itemId: string, templateId: string): Promise<void> {
    await db.insert(crafterTemplateLinks).values({ itemId, templateId }).onConflictDoNothing();
  }

  async removeCrafterTemplateLink(itemId: string, templateId: string): Promise<void> {
    await db.delete(crafterTemplateLinks).where(and(
      eq(crafterTemplateLinks.itemId, itemId),
      eq(crafterTemplateLinks.templateId, templateId),
    ));
  }

  async deleteCharacterClassSkill(id: string): Promise<void> {
    await db.delete(characterClassSkills).where(eq(characterClassSkills.id, id));
  }
}

export const storage = new DatabaseStorage();
