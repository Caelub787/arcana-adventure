import { 
  type User, type InsertUser,
  type Campaign, type InsertCampaign,
  type CampaignMember, type InsertCampaignMember,
  type Character, type InsertCharacter,
  type Token, type InsertToken,
  type ChatMessage, type InsertChatMessage,
  users, campaigns, campaignMembers, characters, tokens, chatMessages
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc, sql } from "drizzle-orm";

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
  getUserCampaigns(userId: string): Promise<{ created: Campaign[], joined: Campaign[] }>;

  // Campaign Member operations
  addCampaignMember(member: InsertCampaignMember): Promise<CampaignMember>;
  getCampaignMembers(campaignId: string): Promise<CampaignMember[]>;
  removeCampaignMember(campaignId: string, userId: string): Promise<void>;
  toggleFavorite(campaignId: string, userId: string): Promise<void>;

  // Character operations
  createCharacter(character: InsertCharacter): Promise<Character>;
  getCharacter(id: string): Promise<Character | undefined>;
  getCampaignCharacters(campaignId: string): Promise<Character[]>;
  updateCharacter(id: string, data: Partial<Character>): Promise<Character | undefined>;

  // Token operations
  createToken(token: InsertToken): Promise<Token>;
  getCampaignTokens(campaignId: string): Promise<Token[]>;
  updateToken(id: string, data: Partial<Token>): Promise<Token | undefined>;
  deleteToken(id: string): Promise<void>;

  // Chat operations
  createChatMessage(message: InsertChatMessage): Promise<ChatMessage>;
  getCampaignMessages(campaignId: string, limit?: number): Promise<ChatMessage[]>;
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

  async getUserCampaigns(userId: string): Promise<{ created: Campaign[], joined: Campaign[] }> {
    // Get campaigns where user is GM
    const createdCampaigns = await db.select()
      .from(campaigns)
      .where(eq(campaigns.gmUserId, userId))
      .orderBy(desc(campaigns.lastPlayed));

    // Get campaigns where user is a member (but not GM)
    const joinedCampaignsData = await db.select()
      .from(campaignMembers)
      .innerJoin(campaigns, eq(campaignMembers.campaignId, campaigns.id))
      .where(and(
        eq(campaignMembers.userId, userId),
        eq(campaignMembers.role, "player")
      ))
      .orderBy(desc(campaigns.lastPlayed));

    const joinedCampaigns = joinedCampaignsData.map((row: any) => row.campaigns);

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

  async getCampaignMembers(campaignId: string): Promise<CampaignMember[]> {
    return await db.select()
      .from(campaignMembers)
      .where(eq(campaignMembers.campaignId, campaignId));
  }

  async removeCampaignMember(campaignId: string, userId: string): Promise<void> {
    await db.delete(campaignMembers)
      .where(and(
        eq(campaignMembers.campaignId, campaignId),
        eq(campaignMembers.userId, userId)
      ));
  }

  async toggleFavorite(campaignId: string, userId: string): Promise<void> {
    const [member] = await db.select()
      .from(campaignMembers)
      .where(and(
        eq(campaignMembers.campaignId, campaignId),
        eq(campaignMembers.userId, userId)
      ))
      .limit(1);

    if (member) {
      await db.update(campaignMembers)
        .set({ favorite: !member.favorite })
        .where(eq(campaignMembers.id, member.id));
    }
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
}

export const storage = new DatabaseStorage();
