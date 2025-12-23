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
  type SceneFolder, type InsertSceneFolder,
  type FriendRequest, type InsertFriendRequest,
  type Friendship, type InsertFriendship,
  type NoteFolder, type InsertNoteFolder,
  type Note, type InsertNote,
  type NoteReference, type InsertNoteReference,
  type NoteShare, type InsertNoteShare,
  users, campaigns, campaignMembers, campaignBans, characters, tokens, chatMessages, passwordResetTokens, scenes, hotbars, items, spells, characterPermissions, initiativeEntries, systemSpecies, campaignSpecies, featTemplates, featTrees, feats, featConnections, characterFeats, systemSpells, systemSkills, characterCustomSkills, systemTraits, characterTraits, characterFolders, sceneFolders, friendRequests, friendships, noteFolders, notes, noteReferences, noteShares
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc, sql, inArray } from "drizzle-orm";

export interface SearchableEntity {
  id: string;
  type: 'spell' | 'trait' | 'skill' | 'item' | 'species';
  name: string;
  description?: string;
  icon?: string;
}

export interface IStorage {
  // Entity search for notes reference picker
  searchEntities(query: string, type?: string): Promise<SearchableEntity[]>;

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

  // Campaign Member operations
  addCampaignMember(member: InsertCampaignMember): Promise<CampaignMember>;
  getCampaignMembers(campaignId: string): Promise<CampaignMember[]>;
  getCampaignMembership(userId: string, campaignId: string): Promise<CampaignMember | null>;
  removeCampaignMember(campaignId: string, userId: string): Promise<void>;
  toggleFavorite(campaignId: string, userId: string): Promise<void>;
  setAssignedCharacter(campaignId: string, userId: string, characterId: string | null): Promise<void>;
  getAssignedCharacter(campaignId: string, userId: string): Promise<string | null>;
  isGM(userId: string, campaignId: string): Promise<boolean>;

  // Character operations
  createCharacter(character: InsertCharacter): Promise<Character>;
  getCharacter(id: string): Promise<Character | undefined>;
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
  getCampaignTemplateItems(campaignId: string): Promise<Item[]>;
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

  // Character Permission operations
  getCharacterPermissions(characterId: string): Promise<CharacterPermission[]>;
  setCharacterPermission(characterId: string, userId: string, accessLevel: string): Promise<CharacterPermission>;
  getCharacterPermission(characterId: string, userId: string): Promise<CharacterPermission | undefined>;
  getUserPermissionsForCharacters(userId: string, characterIds: string[]): Promise<CharacterPermission[]>;
  getCharacterPermissionsForUsers(characterId: string, userIds: string[]): Promise<CharacterPermission[]>;

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
  updateUserProfile(userId: string, data: { name?: string; avatarUrl?: string; bio?: string }): Promise<User | undefined>;

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
  getUserNoteFolders(userId: string, campaignId?: string): Promise<NoteFolder[]>;
  updateNoteFolder(id: string, data: Partial<NoteFolder>): Promise<NoteFolder | undefined>;
  deleteNoteFolder(id: string): Promise<void>;

  // Note operations
  createNote(note: InsertNote): Promise<Note>;
  getNote(id: string): Promise<Note | undefined>;
  getUserNotes(userId: string, folderId?: string, campaignId?: string): Promise<Note[]>;
  getSharedNotes(userId: string): Promise<Note[]>;
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
}

export class DatabaseStorage implements IStorage {
  // Entity search for notes reference picker
  async searchEntities(query: string, type?: string): Promise<SearchableEntity[]> {
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
    // Get campaigns where user is GM (with favorite status)
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
      favorite: row.campaign_members?.favorite ?? false
    }));

    // Get campaigns where user is a member (but not GM)
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
      favorite: row.campaign_members?.favorite ?? false
    }));

    return {
      created: createdCampaigns,
      joined: joinedCampaigns
    };
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

  async isGM(userId: string, campaignId: string): Promise<boolean> {
    const campaign = await this.getCampaign(campaignId);
    if (!campaign) {
      return false;
    }

    // Check if user is the GM of the campaign
    if (campaign.gmUserId === userId) {
      return true;
    }

    // Also check campaign members table
    const [member] = await db.select()
      .from(campaignMembers)
      .where(and(
        eq(campaignMembers.userId, userId),
        eq(campaignMembers.campaignId, campaignId)
      ))
      .limit(1);

    return member?.role === 'gm';
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
    
    // Copy items from template to new character
    const templateItems = await this.getItemsByCharacter(templateId);
    for (const item of templateItems) {
      const { id: itemId, createdAt: itemCreatedAt, characterId, ...itemData } = item;
      await db.insert(items).values({
        ...itemData,
        characterId: newChar.id,
      });
    }
    
    // Copy hotbars from template
    const templateHotbars = await this.getHotbarsByCharacter(templateId);
    for (const hotbar of templateHotbars) {
      const { id: hotbarId, characterId, ...hotbarData } = hotbar;
      await db.insert(hotbars).values({
        ...hotbarData,
        characterId: newChar.id,
      });
    }
    
    // Copy spells from template
    const templateSpells = await this.getSpellsByCharacter(templateId);
    for (const spell of templateSpells) {
      const { id: spellId, characterId, ...spellData } = spell;
      await db.insert(spells).values({
        ...spellData,
        characterId: newChar.id,
      });
    }
    
    return newChar;
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
    return await db.select()
      .from(items)
      .where(eq(items.characterId, characterId));
  }

  async createItem(item: InsertItem): Promise<Item> {
    const [newItem] = await db.insert(items).values(item).returning() as Item[];
    return newItem;
  }

  async updateItem(id: string, updates: Partial<InsertItem>): Promise<Item | undefined> {
    const [item] = await db.update(items)
      .set(updates)
      .where(eq(items.id, id))
      .returning();
    return item;
  }

  async deleteItem(id: string): Promise<void> {
    // Clean up any hotbar entries that reference this item
    await db.delete(hotbars).where(eq(hotbars.itemId, id));
    // Then delete the item
    await db.delete(items).where(eq(items.id, id));
  }

  async damageItem(id: string, amount: number = 1): Promise<Item | undefined> {
    const [item] = await db.select().from(items).where(eq(items.id, id)).limit(1);
    if (!item) return undefined;

    const newDurability = Math.max(0, item.durability - amount);
    const [updatedItem] = await db.update(items)
      .set({ durability: newDurability })
      .where(eq(items.id, id))
      .returning();
    
    return updatedItem;
  }

  async getItem(id: string): Promise<Item | undefined> {
    const [item] = await db.select().from(items).where(eq(items.id, id)).limit(1);
    return item;
  }

  async getSystemItems(): Promise<Item[]> {
    return await db.select()
      .from(items)
      .where(and(
        eq(items.isTemplate, true),
        sql`${items.characterId} IS NULL`,
        sql`${items.campaignId} IS NULL`
      ));
  }

  async getCampaignTemplateItems(campaignId: string): Promise<Item[]> {
    return await db.select()
      .from(items)
      .where(and(
        eq(items.isTemplate, true),
        eq(items.campaignId, campaignId),
        sql`${items.characterId} IS NULL`
      ));
  }

  async moveItemToContainer(itemId: string, containerId: string | null): Promise<Item | undefined> {
    const [item] = await db.update(items)
      .set({ containerId })
      .where(eq(items.id, itemId))
      .returning();
    return item;
  }

  async getContainerItems(containerId: string): Promise<Item[]> {
    return await db.select()
      .from(items)
      .where(eq(items.containerId, containerId));
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
      .orderBy(desc(initiativeEntries.value));
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
  async updateUserProfile(userId: string, data: { name?: string; avatarUrl?: string; bio?: string }): Promise<User | undefined> {
    const updateData: Partial<User> = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.avatarUrl !== undefined) updateData.avatarUrl = data.avatarUrl;
    if (data.bio !== undefined) updateData.bio = data.bio;
    
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

  async getUserNoteFolders(userId: string, campaignId?: string): Promise<NoteFolder[]> {
    if (campaignId) {
      return await db.select()
        .from(noteFolders)
        .where(and(
          eq(noteFolders.userId, userId),
          eq(noteFolders.campaignId, campaignId)
        ))
        .orderBy(noteFolders.sortOrder);
    }
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
}

export const storage = new DatabaseStorage();
