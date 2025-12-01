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
  users, campaigns, campaignMembers, campaignBans, characters, tokens, chatMessages, passwordResetTokens, scenes, hotbars, items, spells, characterPermissions, initiativeEntries
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc, sql, inArray } from "drizzle-orm";

export interface IStorage {
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

  // Token operations
  createToken(token: InsertToken): Promise<Token>;
  getToken(id: string): Promise<Token | undefined>;
  getCampaignTokens(campaignId: string): Promise<Token[]>;
  updateToken(id: string, data: Partial<Token>): Promise<Token | undefined>;
  deleteToken(id: string): Promise<void>;

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
}

export class DatabaseStorage implements IStorage {
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
      username: row.users.username
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
}

export const storage = new DatabaseStorage();
