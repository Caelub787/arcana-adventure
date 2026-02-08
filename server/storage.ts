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
  users, campaigns, campaignMembers, campaignBans, characters, tokens, chatMessages, passwordResetTokens, scenes, hotbars, items, spells, characterPermissions, initiativeEntries, systemSpecies, campaignSpecies, featTemplates, featTrees, feats, featConnections, characterFeats, systemSpells, systemSkills, characterCustomSkills, systemTraits, characterTraits, characterFolders, characterTemplateFolders, sceneFolders, friendRequests, friendships, noteFolders, notes, noteReferences, noteShares, tokenEffects, spellEffects, itemEffects, tokenActiveEffects, thrownItems, adminNotifications, userNotifications, termsAndConditions, userTermsAcceptance, sandboxFolders, sandboxTemplates, sandboxActors, rollEntries, sceneWalls, sceneDoors, sceneWindows, sceneLights
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc, sql, inArray, or, isNull } from "drizzle-orm";

export interface SearchableEntity {
  id: string;
  type: 'spell' | 'trait' | 'skill' | 'item' | 'species' | 'character';
  name: string;
  description?: string;
  icon?: string;
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
  getCharacterTemplates(): Promise<Character[]>;
  getCharacterTemplate(id: string): Promise<Character | undefined>;
  createCharacterTemplate(data: Partial<InsertCharacter>): Promise<Character>;
  updateCharacterTemplate(id: string, data: Partial<Character>): Promise<Character | undefined>;
  deleteCharacterTemplate(id: string): Promise<void>;
  copyTemplateToCompany(templateId: string, campaignId: string, userId: string): Promise<Character>;
  importCharacterToCampaign(characterId: string, targetCampaignId: string, targetUserId: string | null): Promise<Character>;

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
  getSystemItems(): Promise<Item[]>;
  getCampaignTemplateItems(campaignId: string, userId?: string): Promise<Item[]>;
  // Lightweight summaries for picker dialogs (faster loading)
  getSystemItemSummaries(): Promise<{ id: string; name: string; itemType: string; rarity: string; weight: number }[]>;
  getCampaignItemSummaries(campaignId: string, userId?: string): Promise<{ id: string; name: string; itemType: string; rarity: string; weight: number }[]>;
  createItem(item: InsertItem): Promise<Item>;
  updateItem(id: string, updates: Partial<InsertItem>): Promise<Item | undefined>;
  deleteItem(id: string): Promise<void>;
  damageItem(id: string, amount?: number): Promise<Item | undefined>;
  getItem(id: string): Promise<Item | undefined>;
  moveItemToContainer(itemId: string, containerId: string | null): Promise<Item | undefined>;
  getContainerItems(containerId: string): Promise<Item[]>;

  // Spell operations
  getSpellsByCharacter(characterId: string): Promise<Spell[]>;
  getSpell(id: string): Promise<Spell | undefined>;
  createSpell(spell: InsertSpell): Promise<Spell>;
  updateSpell(id: string, updates: Partial<InsertSpell>): Promise<Spell | undefined>;
  deleteSpell(id: string): Promise<void>;

  // Roll Entry operations
  getRollEntries(ownerType: string, ownerId: string): Promise<RollEntry[]>;
  createRollEntry(entry: InsertRollEntry): Promise<RollEntry>;
  updateRollEntry(id: string, data: Partial<InsertRollEntry>): Promise<RollEntry | undefined>;
  deleteRollEntry(id: string): Promise<void>;
  deleteRollEntriesByOwner(ownerType: string, ownerId: string): Promise<void>;

  // Scene Wall operations
  getSceneWalls(sceneId: string): Promise<SceneWall[]>;
  createSceneWall(wall: InsertSceneWall): Promise<SceneWall>;
  updateSceneWall(id: string, data: Partial<InsertSceneWall>): Promise<SceneWall | undefined>;
  deleteSceneWall(id: string): Promise<void>;
  deleteSceneWalls(sceneId: string): Promise<void>;

  // Scene Door operations
  getSceneDoor(doorId: string): Promise<SceneDoor | undefined>;
  getSceneDoors(sceneId: string): Promise<SceneDoor[]>;
  createSceneDoor(door: InsertSceneDoor): Promise<SceneDoor>;
  updateSceneDoor(id: string, data: Partial<InsertSceneDoor>): Promise<SceneDoor | undefined>;
  deleteSceneDoor(id: string): Promise<void>;

  // Scene Window operations
  getSceneWindows(sceneId: string): Promise<SceneWindow[]>;
  createSceneWindow(win: InsertSceneWindow): Promise<SceneWindow>;
  updateSceneWindow(id: string, data: Partial<InsertSceneWindow>): Promise<SceneWindow | undefined>;
  deleteSceneWindow(id: string): Promise<void>;

  // Scene Light operations
  getSceneLights(sceneId: string): Promise<SceneLight[]>;
  createSceneLight(light: InsertSceneLight): Promise<SceneLight>;
  updateSceneLight(id: string, data: Partial<InsertSceneLight>): Promise<SceneLight | undefined>;
  deleteSceneLight(id: string): Promise<void>;

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
  getSceneInitiative(sceneId: string): Promise<InitiativeEntry[]>;
  createInitiativeEntry(entry: InsertInitiativeEntry): Promise<InitiativeEntry>;
  updateInitiativeEntry(id: string, data: Partial<InitiativeEntry>): Promise<InitiativeEntry | undefined>;
  deleteInitiativeEntry(id: string): Promise<void>;
  clearSceneInitiative(sceneId: string): Promise<void>;
  getInitiativeEntryByCharacter(sceneId: string, characterId: string): Promise<InitiativeEntry | undefined>;

  // System Species operations
  getSystemSpecies(systemName?: string): Promise<SystemSpecies[]>;
  getSystemSpeciesById(id: string): Promise<SystemSpecies | undefined>;
  getSpeciesByName(name: string): Promise<SystemSpecies | undefined>;
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
  getFeatTrees(): Promise<FeatTree[]>;
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
  getSystemSpells(): Promise<SystemSpell[]>;
  getSystemSpell(id: string): Promise<SystemSpell | undefined>;
  createSystemSpell(spell: InsertSystemSpell): Promise<SystemSpell>;
  updateSystemSpell(id: string, data: Partial<InsertSystemSpell>): Promise<SystemSpell | undefined>;
  deleteSystemSpell(id: string): Promise<void>;

  // System Skill operations (admin-defined custom skills)
  getSystemSkills(): Promise<SystemSkill[]>;
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
  getSystemTraits(): Promise<SystemTrait[]>;
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
      joinedAt: row.campaign_members.joinedAt,
      beaconColor: row.campaign_members.beaconColor,
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
    const [character] = await db.update(characters)
      .set(data)
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
  async getCharacterTemplates(): Promise<Character[]> {
    return await db.select()
      .from(characters)
      .where(eq(characters.isTemplate, true))
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
    
    // Copy items from template to new character, tracking ID mappings
    // First pass: create all items without containerId references
    const templateItems = await this.getItemsByCharacter(templateId);
    for (const item of templateItems) {
      const { id: oldItemId, characterId, containerId, ...itemData } = item;
      const [newItem] = await db.insert(items).values({
        ...itemData,
        characterId: newChar.id,
        containerId: null, // Clear containerId initially
      }).returning();
      itemIdMap.set(oldItemId, newItem.id);
    }
    
    // Second pass: update containerId references to point to new item IDs
    for (const item of templateItems) {
      if (item.containerId) {
        const newItemId = itemIdMap.get(item.id);
        const newContainerId = itemIdMap.get(item.containerId);
        if (newItemId && newContainerId) {
          await db.update(items)
            .set({ containerId: newContainerId })
            .where(eq(items.id, newItemId));
        }
      }
    }
    
    // Copy spells from template to new character, tracking ID mappings
    const templateSpells = await this.getSpellsByCharacter(templateId);
    for (const spell of templateSpells) {
      const { id: oldSpellId, characterId, ...spellData } = spell;
      const [newSpell] = await db.insert(spells).values({
        ...spellData,
        characterId: newChar.id,
      }).returning();
      spellIdMap.set(oldSpellId, newSpell.id);
    }
    
    // Copy hotbars from template, remapping item/spell IDs to new ones
    const templateHotbars = await this.getHotbarsByCharacter(templateId);
    for (const hotbar of templateHotbars) {
      const { id: hotbarId, characterId, itemId: oldItemId, spellId: oldSpellId, ...hotbarData } = hotbar;
      
      // Remap item and spell IDs to the newly copied ones
      const newItemId = oldItemId ? itemIdMap.get(oldItemId) || null : null;
      const newSpellId = oldSpellId ? spellIdMap.get(oldSpellId) || null : null;
      
      await db.insert(hotbars).values({
        ...hotbarData,
        characterId: newChar.id,
        itemId: newItemId,
        spellId: newSpellId,
      });
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
    
    // Copy items from character to template, tracking ID mappings
    // First pass: create all items without containerId references
    const characterItems = await this.getItemsByCharacter(characterId);
    for (const item of characterItems) {
      const { id: oldItemId, characterId: charId, containerId, ...itemData } = item;
      const [newItem] = await db.insert(items).values({
        ...itemData,
        characterId: newTemplate.id,
        containerId: null, // Clear containerId initially
      }).returning();
      itemIdMap.set(oldItemId, newItem.id);
    }
    
    // Second pass: update containerId references to point to new item IDs
    for (const item of characterItems) {
      if (item.containerId) {
        const newItemId = itemIdMap.get(item.id);
        const newContainerId = itemIdMap.get(item.containerId);
        if (newItemId && newContainerId) {
          await db.update(items)
            .set({ containerId: newContainerId })
            .where(eq(items.id, newItemId));
        }
      }
    }
    
    // Copy spells from character to template, tracking ID mappings
    const characterSpells = await this.getSpellsByCharacter(characterId);
    for (const spell of characterSpells) {
      const { id: oldSpellId, characterId: charId, ...spellData } = spell;
      const [newSpell] = await db.insert(spells).values({
        ...spellData,
        characterId: newTemplate.id,
      }).returning();
      spellIdMap.set(oldSpellId, newSpell.id);
    }
    
    // Copy hotbars from character, remapping item/spell IDs to new ones
    const characterHotbars = await this.getHotbarsByCharacter(characterId);
    for (const hotbar of characterHotbars) {
      const { id: hotbarId, characterId: charId, itemId: oldItemId, spellId: oldSpellId, ...hotbarData } = hotbar;
      
      // Remap item and spell IDs to the newly copied ones
      const newItemId = oldItemId ? itemIdMap.get(oldItemId) || null : null;
      const newSpellId = oldSpellId ? spellIdMap.get(oldSpellId) || null : null;
      
      await db.insert(hotbars).values({
        ...hotbarData,
        characterId: newTemplate.id,
        itemId: newItemId,
        spellId: newSpellId,
      });
    }
    
    // Copy custom skills
    const customSkillsList = await this.getCharacterCustomSkills(characterId);
    for (const skill of customSkillsList) {
      const { id: skillId, characterId: charId, ...skillData } = skill;
      await db.insert(characterCustomSkills).values({
        ...skillData,
        characterId: newTemplate.id,
      });
    }
    
    // Copy traits
    const traitsList = await this.getCharacterTraits(characterId);
    for (const trait of traitsList) {
      const { id: traitId, characterId: charId, ...traitData } = trait;
      await db.insert(characterTraits).values({
        ...traitData,
        characterId: newTemplate.id,
      });
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
    
    // Copy items from source to new character, tracking ID mappings
    // First pass: create all items without containerId references
    const sourceItems = await this.getItemsByCharacter(characterId);
    for (const item of sourceItems) {
      const { id: oldItemId, characterId: charId, containerId, ...itemData } = item;
      const [newItem] = await db.insert(items).values({
        ...itemData,
        characterId: newChar.id,
        containerId: null,
      }).returning();
      itemIdMap.set(oldItemId, newItem.id);
    }
    
    // Second pass: update containerId references to point to new item IDs
    for (const item of sourceItems) {
      if (item.containerId) {
        const newItemId = itemIdMap.get(item.id);
        const newContainerId = itemIdMap.get(item.containerId);
        if (newItemId && newContainerId) {
          await db.update(items)
            .set({ containerId: newContainerId })
            .where(eq(items.id, newItemId));
        }
      }
    }
    
    // Copy spells from source to new character, tracking ID mappings
    const sourceSpells = await this.getSpellsByCharacter(characterId);
    for (const spell of sourceSpells) {
      const { id: oldSpellId, characterId: charId, ...spellData } = spell;
      const [newSpell] = await db.insert(spells).values({
        ...spellData,
        characterId: newChar.id,
      }).returning();
      spellIdMap.set(oldSpellId, newSpell.id);
    }
    
    // Copy hotbars from source, remapping item/spell IDs to new ones
    const sourceHotbars = await this.getHotbarsByCharacter(characterId);
    for (const hotbar of sourceHotbars) {
      const { id: hotbarId, characterId: charId, itemId: oldItemId, spellId: oldSpellId, ...hotbarData } = hotbar;
      
      const newItemId = oldItemId ? itemIdMap.get(oldItemId) || null : null;
      const newSpellId = oldSpellId ? spellIdMap.get(oldSpellId) || null : null;
      
      await db.insert(hotbars).values({
        ...hotbarData,
        characterId: newChar.id,
        itemId: newItemId,
        spellId: newSpellId,
      });
    }
    
    // Copy custom skills
    const customSkillsList = await this.getCharacterCustomSkills(characterId);
    for (const skill of customSkillsList) {
      const { id: skillId, characterId: charId, ...skillData } = skill;
      await db.insert(characterCustomSkills).values({
        ...skillData,
        characterId: newChar.id,
      });
    }
    
    // Copy traits
    const traitsList = await this.getCharacterTraits(characterId);
    for (const trait of traitsList) {
      const { id: traitId, characterId: charId, ...traitData } = trait;
      await db.insert(characterTraits).values({
        ...traitData,
        characterId: newChar.id,
      });
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

  async getSystemItems(): Promise<Item[]> {
    const result = await db.select()
      .from(items)
      .where(and(
        eq(items.isTemplate, true),
        sql`${items.characterId} IS NULL`,
        sql`${items.campaignId} IS NULL`
      )) as Item[];
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
  async getSystemItemSummaries(): Promise<{ id: string; name: string; itemType: string; rarity: string; weight: number }[]> {
    return await db.select({
      id: items.id,
      name: items.name,
      itemType: items.itemType,
      rarity: items.rarity,
      weight: items.itemWeight,
    })
      .from(items)
      .where(and(
        eq(items.isTemplate, true),
        sql`${items.characterId} IS NULL`,
        sql`${items.campaignId} IS NULL`
      ));
  }

  async getCampaignItemSummaries(campaignId: string, userId?: string): Promise<{ id: string; name: string; itemType: string; rarity: string; weight: number }[]> {
    // Get items specific to this campaign OR created by this user (GM library items)
    return await db.select({
      id: items.id,
      name: items.name,
      itemType: items.itemType,
      rarity: items.rarity,
      weight: items.itemWeight,
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
  async getSceneInitiative(sceneId: string): Promise<InitiativeEntry[]> {
    return await db.select()
      .from(initiativeEntries)
      .where(eq(initiativeEntries.sceneId, sceneId))
      .orderBy(desc(initiativeEntries.value), initiativeEntries.id);
  }

  async createInitiativeEntry(entry: InsertInitiativeEntry): Promise<InitiativeEntry> {
    const [created] = await db.insert(initiativeEntries)
      .values(entry)
      .onConflictDoUpdate({
        target: [initiativeEntries.sceneId, initiativeEntries.characterId],
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

  async clearSceneInitiative(sceneId: string): Promise<void> {
    await db.delete(initiativeEntries).where(eq(initiativeEntries.sceneId, sceneId));
  }

  async getInitiativeEntryByCharacter(sceneId: string, characterId: string): Promise<InitiativeEntry | undefined> {
    const [entry] = await db.select()
      .from(initiativeEntries)
      .where(and(
        eq(initiativeEntries.sceneId, sceneId),
        eq(initiativeEntries.characterId, characterId)
      ))
      .limit(1);
    return entry;
  }

  // System Species operations
  async getSystemSpecies(systemName?: string): Promise<SystemSpecies[]> {
    if (systemName) {
      return await db.select()
        .from(systemSpecies)
        .where(eq(systemSpecies.systemName, systemName))
        .orderBy(systemSpecies.name);
    }
    return await db.select()
      .from(systemSpecies)
      .orderBy(systemSpecies.name);
  }

  async getSystemSpeciesById(id: string): Promise<SystemSpecies | undefined> {
    const [species] = await db.select()
      .from(systemSpecies)
      .where(eq(systemSpecies.id, id))
      .limit(1);
    return species;
  }

  async getSpeciesByName(name: string): Promise<SystemSpecies | undefined> {
    const [species] = await db.select()
      .from(systemSpecies)
      .where(eq(systemSpecies.name, name))
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
  async getFeatTrees(): Promise<FeatTree[]> {
    return await db.select().from(featTrees).orderBy(featTrees.name);
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
  async getSystemSpells(): Promise<SystemSpell[]> {
    return await db.select()
      .from(systemSpells)
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

  // System Skill operations (admin-defined custom skills)
  async getSystemSkills(): Promise<SystemSkill[]> {
    return await db.select()
      .from(systemSkills)
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
  async getSystemTraits(): Promise<SystemTrait[]> {
    return await db.select()
      .from(systemTraits)
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
    if (campaignId) {
      if (showHidden) {
        // Show all folders for the user (including those from other campaigns)
        return await db.select()
          .from(noteFolders)
          .where(eq(noteFolders.userId, userId))
          .orderBy(noteFolders.sortOrder);
      } else {
        // Show folders for this campaign OR global folders (null campaignId)
        return await db.select()
          .from(noteFolders)
          .where(and(
            eq(noteFolders.userId, userId),
            or(
              eq(noteFolders.campaignId, campaignId),
              isNull(noteFolders.campaignId)
            )
          ))
          .orderBy(noteFolders.sortOrder);
      }
    }
    // No campaign context (main notes page) - show ALL folders including campaign-specific ones
    return await db.select()
      .from(noteFolders)
      .where(eq(noteFolders.userId, userId))
      .orderBy(noteFolders.sortOrder);
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
}

export const storage = new DatabaseStorage();
