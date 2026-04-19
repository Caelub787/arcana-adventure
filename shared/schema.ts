import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, boolean, jsonb, real, json, index, uniqueIndex, type AnyPgColumn } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Users table
// Express session store table (managed by connect-pg-simple). Defined here so
// drizzle-kit push does not drop it during schema syncs.
export const session = pgTable("session", {
  sid: varchar("sid").primaryKey().notNull(),
  sess: json("sess").notNull(),
  expire: timestamp("expire", { precision: 6, mode: "date" }).notNull(),
}, (table) => ({
  expireIdx: index("IDX_session_expire").on(table.expire),
}));

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull().unique(),
  username: text("username").notNull().unique(),
  name: text("name").notNull(),
  password: text("password").notNull(),
  avatarUrl: text("avatar_url"), // User profile picture
  bio: text("bio"), // Optional user bio
  isAdmin: boolean("is_admin").default(false), // Site administrator
  bannedAt: timestamp("banned_at"), // When user was banned (null = not banned)
  banExpiresAt: timestamp("ban_expires_at"), // When ban expires (null = permanent)
  banReason: text("ban_reason"), // Reason for the ban
  googleAccessToken: text("google_access_token"),
  googleRefreshToken: text("google_refresh_token"),
  googleTokenExpiry: timestamp("google_token_expiry"),
  googleEmail: text("google_email"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// Friend Requests table (pending friend requests)
export const friendRequests = pgTable("friend_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  senderId: varchar("sender_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  recipientId: varchar("recipient_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("pending"), // "pending", "accepted", "declined"
  message: text("message"), // Optional message with request
  createdAt: timestamp("created_at").defaultNow().notNull(),
  respondedAt: timestamp("responded_at"),
}, (table) => ({
  uniqueRequest: uniqueIndex("friend_requests_sender_recipient_unique").on(
    table.senderId,
    table.recipientId
  ),
}));

export const insertFriendRequestSchema = createInsertSchema(friendRequests).omit({
  id: true,
  createdAt: true,
  respondedAt: true,
});

export type InsertFriendRequest = z.infer<typeof insertFriendRequestSchema>;
export type FriendRequest = typeof friendRequests.$inferSelect;

// Friendships table (confirmed friendships - bidirectional)
export const friendships = pgTable("friendships", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  friendId: varchar("friend_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  uniqueFriendship: uniqueIndex("friendships_user_friend_unique").on(
    table.userId,
    table.friendId
  ),
}));

export const insertFriendshipSchema = createInsertSchema(friendships).omit({
  id: true,
  createdAt: true,
});

export type InsertFriendship = z.infer<typeof insertFriendshipSchema>;
export type Friendship = typeof friendships.$inferSelect;

// Campaigns table
export const campaigns = pgTable("campaigns", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  inviteCode: text("invite_code").notNull().unique(),
  gmUserId: varchar("gm_user_id").notNull().references(() => users.id),
  gridSize: integer("grid_size").default(50).notNull(), // deprecated, kept for backward compat
  currentMap: text("current_map"), // deprecated, kept for backward compat
  activeSceneId: varchar("active_scene_id"),
  hotbarSlots: integer("hotbar_slots").default(5).notNull(), // Number of slots per hotbar (default 5)
  system: text("system").notNull().default("arcana-adventure"),
  defaultPanel: text("default_panel").default("characters"),
  inCombat: boolean("in_combat").default(false).notNull(),
  currentTurnCharacterId: varchar("current_turn_character_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastPlayed: timestamp("last_played").defaultNow().notNull(),
});

export const insertCampaignSchema = createInsertSchema(campaigns).omit({
  id: true,
  createdAt: true,
  lastPlayed: true,
});

export type InsertCampaign = z.infer<typeof insertCampaignSchema>;
export type Campaign = typeof campaigns.$inferSelect;

// Scene Folders table (for organizing scenes within campaigns)
export const sceneFolders = pgTable("scene_folders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  campaignId: varchar("campaign_id").notNull().references(() => campaigns.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertSceneFolderSchema = createInsertSchema(sceneFolders).omit({
  id: true,
  createdAt: true,
});

export type InsertSceneFolder = z.infer<typeof insertSceneFolderSchema>;
export type SceneFolder = typeof sceneFolders.$inferSelect;

// Scenes table (for battlemap scenes within campaigns)
export const scenes = pgTable("scenes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  campaignId: varchar("campaign_id").notNull().references(() => campaigns.id, { onDelete: "cascade" }),
  folderId: varchar("folder_id"), // Optional folder for organization
  name: text("name").notNull(),
  backgroundImage: text("background_image"),
  gridEnabled: boolean("grid_enabled").default(true).notNull(),
  gridType: text("grid_type").default("square").notNull(), // "square" or "hex"
  gridSize: integer("grid_size").default(50).notNull(),
  gridColor: text("grid_color").default("#ffffff").notNull(), // Hex color for grid lines
  gridThickness: real("grid_thickness").default(1).notNull(), // Line thickness in pixels
  gridOpacity: real("grid_opacity").default(0.4).notNull(), // 0.0 to 1.0
  gridOffsetX: integer("grid_offset_x").default(0).notNull(),
  gridOffsetY: integer("grid_offset_y").default(0).notNull(),
  defaultViewX: integer("default_view_x").default(0).notNull(),
  defaultViewY: integer("default_view_y").default(0).notNull(),
  defaultViewZoom: real("default_view_zoom").default(1).notNull(),
  defaultViewVersion: integer("default_view_version").default(0).notNull(), // 0 = legacy pixel offsets, 1 = world center coords
  inCombat: boolean("in_combat").default(false).notNull(), // Whether combat/initiative tracking is active
  currentTurnCharacterId: varchar("current_turn_character_id"), // Character whose turn it is
  // Fog of War settings
  fogEnabled: boolean("fog_enabled").default(false).notNull(),
  fogExploredMemory: boolean("fog_explored_memory").default(true).notNull(),
  fogTokenVision: boolean("fog_token_vision").default(true).notNull(),
  fogLightVision: boolean("fog_light_vision").default(true).notNull(),
  fogWallBlocking: boolean("fog_wall_blocking").default(true).notNull(),
  fogDoorBlocking: boolean("fog_door_blocking").default(true).notNull(),
  fogOpacity: real("fog_opacity").default(0.85).notNull(),
  fogExploredDimness: real("fog_explored_dimness").default(0.5).notNull(),
  fogTexture: text("fog_texture").default("solid").notNull(), // "solid", "clouds", "noise"
  fogState: text("fog_state"), // JSON string of grid-based fog state {cellSize, cells: {x_y: "hidden"|"explored"|"visible"}}
  feetPerCell: real("feet_per_cell").default(5).notNull(),
  // Day/Night system
  isDayTime: boolean("is_day_time").default(true).notNull(),
  globalLightLevel: real("global_light_level").default(1.0).notNull(), // 0.0 (pitch dark) to 1.0 (full daylight)
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertSceneSchema = createInsertSchema(scenes).omit({
  id: true,
  createdAt: true,
});

export type InsertScene = z.infer<typeof insertSceneSchema>;
export type Scene = typeof scenes.$inferSelect;

// Campaign Members (players in campaigns)
export const campaignMembers = pgTable("campaign_members", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  campaignId: varchar("campaign_id").notNull().references(() => campaigns.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: text("role").notNull().default("player"), // "gm", "assistant_gm", or "player"
  favorite: boolean("favorite").default(false).notNull(),
  assignedCharacterId: varchar("assigned_character_id"), // Character auto-assigned to player on load
  gmHotbar: text("gm_hotbar").array(), // Array of character IDs for GM's character hotbar
  beaconColor: text("beacon_color"), // RGB hex color for player's beacon clicks (e.g., "#FF5500")
  joinedAt: timestamp("joined_at").defaultNow().notNull(),
});

export const insertCampaignMemberSchema = createInsertSchema(campaignMembers).omit({
  id: true,
  joinedAt: true,
});

export type InsertCampaignMember = z.infer<typeof insertCampaignMemberSchema>;
export type CampaignMember = typeof campaignMembers.$inferSelect;

// Campaign Bans (banned players who cannot rejoin)
export const campaignBans = pgTable("campaign_bans", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  campaignId: varchar("campaign_id").notNull().references(() => campaigns.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  bannedAt: timestamp("banned_at").defaultNow().notNull(),
  reason: text("reason"),
});

export const insertCampaignBanSchema = createInsertSchema(campaignBans).omit({
  id: true,
  bannedAt: true,
});

export type InsertCampaignBan = z.infer<typeof insertCampaignBanSchema>;
export type CampaignBan = typeof campaignBans.$inferSelect;

// Characters table (expanded for RPG features)
// Note: campaignId/userId are nullable to support admin character templates
export const characters = pgTable("characters", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  campaignId: varchar("campaign_id").references(() => campaigns.id, { onDelete: "cascade" }),
  userId: varchar("user_id").references(() => users.id, { onDelete: "cascade" }),
  isTemplate: boolean("is_template").notNull().default(false), // Admin character templates have this = true
  name: text("name").notNull(),
  portrait: text("portrait"),
  class: text("class").default(""), // Kept for backward compat, not used in UI
  level: integer("level").default(1).notNull(),
  hp: integer("hp").notNull(),
  maxHp: integer("max_hp").notNull(),
  energy: integer("energy").notNull(),
  maxEnergy: integer("max_energy").notNull(),
  mana: integer("mana").notNull().default(0),
  maxMana: integer("max_mana").notNull().default(0),
  // Race information
  race: text("race").notNull().default("Human"),
  size: text("size").notNull().default("Medium"),
  sizeBonus: integer("size_bonus").notNull().default(0),
  naturalArmor: integer("natural_armor").notNull().default(5),
  speed: integer("speed").notNull().default(30),
  flySpeed: integer("fly_speed").notNull().default(0),
  lifespan: integer("lifespan").notNull().default(100),
  featTree: text("feat_tree").default(""), // Race-specific feat tree
  // Level-up HP tracking
  bonusHpFromLevelUps: integer("bonus_hp_from_level_ups").notNull().default(0), // Extra HP gained from level-up dice rolls
  lastLevelUpRolled: integer("last_level_up_rolled").notNull().default(1), // Last level at which HP was rolled
  // Level-up Energy tracking
  bonusEnergyFromLevelUps: integer("bonus_energy_from_level_ups").notNull().default(0), // Extra energy gained from level-up dice rolls
  lastEnergyLevelUpRolled: integer("last_energy_level_up_rolled").notNull().default(1), // Last level at which energy was rolled
  showHpBar: boolean("show_hp_bar").notNull().default(true),
  showEnergyBar: boolean("show_energy_bar").notNull().default(true),
  showManaBar: boolean("show_mana_bar").notNull().default(true),
  classSkillPoints: integer("class_skill_points").notNull().default(0),
  // New Attributes (range -2 to 5, mod equals value)
  might: integer("might").notNull().default(0),
  finesse: integer("finesse").notNull().default(0),
  wit: integer("wit").notNull().default(0),
  presence: integer("presence").notNull().default(0),
  will: integer("will").notNull().default(0),
  craft: integer("craft").notNull().default(0),
  // Legacy attributes (kept for backward compatibility)
  agility: integer("agility").notNull().default(0),
  charisma: integer("charisma").notNull().default(0),
  strength: integer("strength").notNull().default(0),
  wisdom: integer("wisdom").notNull().default(0),
  arcana: integer("arcana").notNull().default(0),
  concentration: integer("concentration").notNull().default(0),
  // Skills (range -2 to 5)
  skillAgility: integer("skill_agility").notNull().default(0),
  skillArcana: integer("skill_arcana").notNull().default(0),
  skillCharisma: integer("skill_charisma").notNull().default(0),
  skillConcentration: integer("skill_concentration").notNull().default(0),
  skillDeception: integer("skill_deception").notNull().default(0),
  skillHistory: integer("skill_history").notNull().default(0),
  skillIntimidation: integer("skill_intimidation").notNull().default(0),
  skillInvestigation: integer("skill_investigation").notNull().default(0),
  skillMedicine: integer("skill_medicine").notNull().default(0),
  skillPerception: integer("skill_perception").notNull().default(0),
  skillSleightOfHand: integer("skill_sleight_of_hand").notNull().default(0),
  skillStealth: integer("skill_stealth").notNull().default(0),
  skillStrength: integer("skill_strength").notNull().default(0),
  skillWisdom: integer("skill_wisdom").notNull().default(0),
  skillCulture: integer("skill_culture").notNull().default(0),
  skillSurvival: integer("skill_survival").notNull().default(0),
  skillBeastHandling: integer("skill_beast_handling").notNull().default(0),
  // Point cancellation settings (0-2 range, how many negative points are cancelled)
  cancelledAttrPoints: integer("cancelled_attr_points").notNull().default(0),
  cancelledSkillPoints: integer("cancelled_skill_points").notNull().default(0),
  // Exhaustion (0-7 scale)
  exhaustion: integer("exhaustion").notNull().default(0),
  // Vision settings
  visionType: text("vision_type").default("normal").notNull(), // "normal", "darkvision", "blindsight", "truesight", "tremorsense"
  dayVisionDistance: integer("day_vision_distance").default(60).notNull(), // Vision distance in feet during day
  nightVisionDistance: integer("night_vision_distance").default(30).notNull(), // Vision distance in feet during night/dark
  specialVisionNotes: text("special_vision_notes"), // Freeform notes about special vision abilities
  // Background/notes
  nickname: text("nickname"), // Optional nickname to display on tokens instead of character name
  hasMotivation: boolean("has_motivation").default(false).notNull(),
  biography: text("biography"),
  gmNotes: text("gm_notes"),
  // Folder organization
  folderId: varchar("folder_id"), // References characterFolders.id but nullable for unfiled characters
  // Legacy inventory (kept for backward compatibility, use items table for new features)
  inventory: text("inventory").array().default(sql`ARRAY[]::text[]`).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertCharacterSchema = createInsertSchema(characters).omit({
  id: true,
  createdAt: true,
});

export type InsertCharacter = z.infer<typeof insertCharacterSchema>;
export type Character = typeof characters.$inferSelect;

// Tokens table (for battlemap)
export const tokens = pgTable("tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  campaignId: varchar("campaign_id").notNull().references(() => campaigns.id, { onDelete: "cascade" }),
  sceneId: varchar("scene_id").references(() => scenes.id, { onDelete: "cascade" }),
  characterId: varchar("character_id").references(() => characters.id, { onDelete: "cascade" }),
  type: text("type").notNull(), // "player" or "enemy"
  x: real("x").notNull(),
  y: real("y").notNull(),
  image: text("image").notNull(),
  isInvisible: boolean("is_invisible").default(false).notNull(), // GM sees 40% opacity, non-edit users see nothing
  // Vision overrides
  isBlind: boolean("is_blind").default(false).notNull(), // Token cannot see anything
  visionOverrideDistance: integer("vision_override_distance"), // Temporary vision distance override (null = use character default)
  visionOverrideType: text("vision_override_type"), // Temporary vision type override (null = use character default)
  lightRadius: integer("light_radius"), // Light emitted by this token (e.g. torch)
  lightColor: text("light_color").default("#ffcc44"), // Color of token-emitted light
  lightIntensity: real("light_intensity").default(1.0), // 0.0-1.0 intensity of token light
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertTokenSchema = createInsertSchema(tokens).omit({
  id: true,
  createdAt: true,
});

export type InsertToken = z.infer<typeof insertTokenSchema>;
export type Token = typeof tokens.$inferSelect;

// Thrown Items table (for throwable items placed on the battle map)
export const thrownItems = pgTable("thrown_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sceneId: varchar("scene_id").notNull().references(() => scenes.id, { onDelete: "cascade" }),
  itemId: varchar("item_id").notNull().references(() => items.id, { onDelete: "cascade" }),
  characterId: varchar("character_id").notNull().references(() => characters.id, { onDelete: "cascade" }), // Who threw it
  x: real("x").notNull(), // Grid x position
  y: real("y").notNull(), // Grid y position
  attachedToTokenId: varchar("attached_to_token_id").references(() => tokens.id, { onDelete: "cascade" }), // If attached to a token
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertThrownItemSchema = createInsertSchema(thrownItems).omit({
  id: true,
  createdAt: true,
});

export type InsertThrownItem = z.infer<typeof insertThrownItemSchema>;
export type ThrownItem = typeof thrownItems.$inferSelect;

// Character Folders (for organizing characters in campaigns)
export const characterFolders = pgTable("character_folders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  campaignId: varchar("campaign_id").notNull().references(() => campaigns.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertCharacterFolderSchema = createInsertSchema(characterFolders).omit({
  id: true,
  createdAt: true,
});

export type InsertCharacterFolder = z.infer<typeof insertCharacterFolderSchema>;
export type CharacterFolder = typeof characterFolders.$inferSelect;

// Character Template Folders (for organizing admin character templates)
export const characterTemplateFolders = pgTable("character_template_folders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertCharacterTemplateFolderSchema = createInsertSchema(characterTemplateFolders).omit({
  id: true,
  createdAt: true,
});

export type InsertCharacterTemplateFolder = z.infer<typeof insertCharacterTemplateFolderSchema>;
export type CharacterTemplateFolder = typeof characterTemplateFolders.$inferSelect;

// Chat Messages table
export const chatMessages = pgTable("chat_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  campaignId: varchar("campaign_id").notNull().references(() => campaigns.id, { onDelete: "cascade" }),
  userId: varchar("user_id").references(() => users.id, { onDelete: "set null" }),
  sender: text("sender").notNull(), // Display name
  text: text("text").notNull(),
  type: text("type").notNull().default("chat"), // "chat" or "system" or "roll" or "whisper"
  recipientId: varchar("recipient_id").references(() => users.id, { onDelete: "set null" }),
  recipientName: text("recipient_name"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertChatMessageSchema = createInsertSchema(chatMessages).omit({
  id: true,
  createdAt: true,
});

export type InsertChatMessage = z.infer<typeof insertChatMessageSchema>;
export type ChatMessage = typeof chatMessages.$inferSelect;

// Password Reset Tokens table
export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertPasswordResetTokenSchema = createInsertSchema(passwordResetTokens).omit({
  id: true,
  createdAt: true,
});

export type InsertPasswordResetToken = z.infer<typeof insertPasswordResetTokenSchema>;
export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;

// Items table (for inventory system)
export const items = pgTable("items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  characterId: varchar("character_id").references(() => characters.id, { onDelete: "cascade" }), // Null for campaign template items
  campaignId: varchar("campaign_id").references(() => campaigns.id, { onDelete: "cascade" }), // For campaign template items
  createdByUserId: varchar("created_by_user_id").references(() => users.id, { onDelete: "set null" }), // Track which GM created this item (for GM library items)
  containerId: varchar("container_id").references((): AnyPgColumn => items.id, { onDelete: "cascade" }), // For nested inventories
  isTemplate: boolean("is_template").default(false).notNull(), // True for campaign item templates
  isLiveTemplate: boolean("is_live_template").default(false).notNull(), // True for admin-managed live templates whose roll edits propagate to all linked items
  name: text("name").notNull(),
  image: text("image"),
  description: text("description"), // GM only editable
  rules: text("rules"), // Rules text, GM only editable
  rulesVisible: boolean("rules_visible").default(true).notNull(), // Whether rules are visible to players
  damage: text("damage"), // Dice notation e.g. "1d8"
  damageType: text("damage_type"), // Sharp, Blunt, Piercing, Flame, Frost, Storm, Tide, Stone, Flux, Light, Dark, Sound, Health
  mod: integer("mod").default(0), // Flat bonus added after dice roll
  range: integer("range"), // In feet
  aoe: text("aoe"), // Area of effect type: cone, sphere, line, cube, cylinder, or null for none
  attribute: text("attribute"), // Attribute used for attack rolls (might, finesse, wit, presence, will, craft)
  size: text("size"), // Item size
  isHeavy: boolean("is_heavy").default(false).notNull(), // Heavy or Light - if heavy, cannot carry another weapon
  ammunitionType: text("ammunition_type"), // Type of ammunition: "arrow", "bolt", "bullet", "dart", etc. (only for itemType === 'ammunition')
  weaponCategory: text("weapon_category"), // Category for ranged weapons: "bow", "crossbow", "sling", "firearm", etc.
  breakChance: integer("break_chance").default(10).notNull(), // 0-100 percentage chance ammunition breaks on use
  price: integer("price").default(0).notNull(), // Price value
  currency: text("currency").default("copper").notNull(), // copper, silver, gold, platinum
  itemWeight: real("item_weight").default(0).notNull(), // In pounds
  quantity: integer("quantity").default(1).notNull(),
  durability: integer("durability").default(10).notNull(), // 0-10
  itemType: text("item_type").notNull(), // "weapon", "armor", "consumable", "utility", "container", "currency"
  rarity: text("rarity").default("common").notNull(), // "common", "uncommon", "rare", "epic", "legendary"
  isContainer: boolean("is_container").default(false).notNull(),
  carryCapacity: integer("carry_capacity").default(0), // Additional carry capacity if container, affects max carry weight
  isEquipped: boolean("is_equipped").default(false).notNull(),
  // Armor-specific fields
  armorSlot: text("armor_slot"), // "helm", "chest", "arm", "legs", "boots" - which body part the armor covers
  armorBonus: integer("armor_bonus").default(0), // Bonus to DC when equipped
  damageReduction: integer("damage_reduction").default(0), // Amount of damage reduction
  damageReductionType: text("damage_reduction_type"), // Damage type reduced: Sharp, Blunt, Piercing, Flame, Frost, Storm, Tide, Stone, Flux, Light, Dark, Sound
  grantsDcBonus: boolean("grants_dc_bonus").default(false).notNull(),
  dcBonusValue: integer("dc_bonus_value").default(0),
  // Legacy price fields (kept for backward compatibility)
  priceCopper: integer("price_copper").default(0).notNull(),
  priceSilver: integer("price_silver").default(0).notNull(),
  priceGold: integer("price_gold").default(0).notNull(),
  pricePlatinum: integer("price_platinum").default(0).notNull(),
  weight: text("weight").default("light"), // Legacy field
  // Ration servings for consumables (used for rest mechanics)
  // null or 0 means not a ration, positive values indicate how many rations this item provides
  rationServings: integer("ration_servings").default(0),
  // Damaging consumable - when true, consumable can be rolled like a weapon (attack/damage rolls)
  isDamaging: boolean("is_damaging").default(false).notNull(),
  isDetonatable: boolean("is_detonatable").default(false).notNull(),
  detonateAoeShape: text("detonate_aoe_shape"),
  detonateAoeRange: integer("detonate_aoe_range").default(15),
  // Item effect toggle - when true, allows linking token effects to this weapon/item
  canApplyEffects: boolean("can_apply_effects").default(false).notNull(), // Enables item to apply token effects on hit
  system: text("system").notNull().default("arcana-adventure"),
  isArchived: boolean("is_archived").default(false).notNull(),
  templateItemId: varchar("template_item_id").references(() => items.id, { onDelete: "set null" }),
});

export const insertItemSchema = createInsertSchema(items).omit({
  id: true,
}).refine((data) => {
  // Validate breakChance is between 0 and 100
  const breakChance = data.breakChance as number | undefined | null;
  if (breakChance !== undefined && breakChance !== null) {
    if (breakChance < 0 || breakChance > 100) {
      return false;
    }
  }
  return true;
}, {
  message: "Break chance must be between 0 and 100",
  path: ["breakChance"],
});

export type InsertItem = z.infer<typeof insertItemSchema>;
export type Item = typeof items.$inferSelect;

// System Species table (for race/species definitions in game systems)
export const systemSpecies = pgTable("system_species", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  systemName: text("system_name").notNull().default("Arcana Adventure"), // Which game system this species belongs to
  name: text("name").notNull(),
  description: text("description"),
  defaultImage: text("default_image"), // Default token image for characters of this species
  lifespan: integer("lifespan").default(100).notNull(),
  speed: integer("speed").default(30).notNull(),
  flySpeed: integer("fly_speed").default(0).notNull(),
  size: text("size").default("Medium").notNull(), // Tiny, Small, Medium, Large, Huge, Gargantuan
  naturalArmor: integer("natural_armor").default(5).notNull(),
  sizeBonus: integer("size_bonus").default(0).notNull(),
  startingHp: integer("starting_hp").default(10).notNull(),
  startingMaxHp: integer("starting_max_hp").default(10).notNull(),
  hpPerLevel: integer("hp_per_level").default(5).notNull(),
  startingEnergy: integer("starting_energy").default(10).notNull(),
  startingMaxEnergy: integer("starting_max_energy").default(10).notNull(),
  energyPerLevel: integer("energy_per_level").default(6).notNull(), // Dice size for energy level-ups (d6 by default)
  startingMana: integer("starting_mana").default(0).notNull(),
  startingMaxMana: integer("starting_max_mana").default(0).notNull(),
  manaPerLevel: integer("mana_per_level").default(0).notNull(),
  carryWeight: integer("carry_weight").default(50).notNull(), // Base carry weight capacity
  featTree: text("feat_tree").default(""), // Reference to the feat tree for this species
  visionType: text("vision_type").default("normal").notNull(),
  dayVisionDistance: integer("day_vision_distance").default(60).notNull(),
  nightVisionDistance: integer("night_vision_distance").default(30).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertSystemSpeciesSchema = createInsertSchema(systemSpecies).omit({
  id: true,
  createdAt: true,
});

export type InsertSystemSpecies = z.infer<typeof insertSystemSpeciesSchema>;
export type SystemSpecies = typeof systemSpecies.$inferSelect;

// Campaign Species table (campaign-local race/species definitions created by GMs)
export const campaignSpecies = pgTable("campaign_species", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  campaignId: varchar("campaign_id").notNull().references(() => campaigns.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  defaultImage: text("default_image"),
  lifespan: integer("lifespan").default(100).notNull(),
  speed: integer("speed").default(30).notNull(),
  flySpeed: integer("fly_speed").default(0).notNull(),
  size: text("size").default("Medium").notNull(),
  naturalArmor: integer("natural_armor").default(5).notNull(),
  sizeBonus: integer("size_bonus").default(0).notNull(),
  startingHp: integer("starting_hp").default(10).notNull(),
  startingMaxHp: integer("starting_max_hp").default(10).notNull(),
  hpPerLevel: integer("hp_per_level").default(5).notNull(),
  startingEnergy: integer("starting_energy").default(10).notNull(),
  startingMaxEnergy: integer("starting_max_energy").default(10).notNull(),
  energyPerLevel: integer("energy_per_level").default(6).notNull(),
  startingMana: integer("starting_mana").default(0).notNull(),
  startingMaxMana: integer("starting_max_mana").default(0).notNull(),
  carryWeight: integer("carry_weight").default(50).notNull(),
  featTree: text("feat_tree").default(""),
  visionType: text("vision_type").default("normal").notNull(),
  dayVisionDistance: integer("day_vision_distance").default(60).notNull(),
  nightVisionDistance: integer("night_vision_distance").default(30).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertCampaignSpeciesSchema = createInsertSchema(campaignSpecies).omit({
  id: true,
  createdAt: true,
});

export type InsertCampaignSpecies = z.infer<typeof insertCampaignSpeciesSchema>;
export type CampaignSpecies = typeof campaignSpecies.$inferSelect;

// System Skills table (admin-defined custom skills that can be added to characters)
export const systemSkills = pgTable("system_skills", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  parentAttribute: text("parent_attribute").notNull().default("wit"), // might, finesse, wit, presence, will, craft
  system: text("system").notNull().default("arcana-adventure"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertSystemSkillSchema = createInsertSchema(systemSkills).omit({
  id: true,
  createdAt: true,
});

export type InsertSystemSkill = z.infer<typeof insertSystemSkillSchema>;
export type SystemSkill = typeof systemSkills.$inferSelect;

// Character Custom Skills table (links characters to custom skills with values)
export const characterCustomSkills = pgTable("character_custom_skills", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  characterId: varchar("character_id").notNull().references(() => characters.id, { onDelete: "cascade" }),
  systemSkillId: varchar("system_skill_id").references(() => systemSkills.id, { onDelete: "cascade" }), // Links to system skill if from admin
  name: text("name").notNull(), // Skill name (can be custom if no systemSkillId)
  parentAttribute: text("parent_attribute").notNull().default("wit"), // might, finesse, wit, presence, will, craft
  value: integer("value").notNull().default(0), // Skill modifier value (-2 to 5)
}, (table) => ({
  uniqueCharacterSkill: uniqueIndex("character_custom_skills_char_name_unique").on(
    table.characterId,
    table.name
  ),
}));

export const insertCharacterCustomSkillSchema = createInsertSchema(characterCustomSkills).omit({
  id: true,
});

export type InsertCharacterCustomSkill = z.infer<typeof insertCharacterCustomSkillSchema>;
export type CharacterCustomSkill = typeof characterCustomSkills.$inferSelect;

// System Traits table (admin-defined traits that can be added to characters)
export const systemTraits = pgTable("system_traits", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  parentAttribute: text("parent_attribute").notNull().default("will"), // might, finesse, wit, presence, will, craft
  system: text("system").notNull().default("arcana-adventure"),
  usesPerLongRest: integer("uses_per_long_rest").notNull().default(1),
  usesPerShortRest: integer("uses_per_short_rest").default(0), // Uses restored on short rest
  // Damage reduction/resistance/immunity
  damageModifierType: text("damage_modifier_type").default("none"), // "none", "reduce", "resistance", "immune"
  damageModifierDamageType: text("damage_modifier_damage_type"), // Damage type affected
  damageModifierValue: integer("damage_modifier_value").default(0), // Value for "reduce" type
  // Vision modifiers
  visionModifier: integer("vision_modifier").default(0), // +/- to vision distance
  visionModifierTime: text("vision_modifier_time").default("both"), // "day", "night", "both"
  visionOverrideType: text("vision_override_type"), // Override vision type (null = no override)
  visionOverrideToggle: boolean("vision_override_toggle").default(false), // If true, overrides rather than stacks
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertSystemTraitSchema = createInsertSchema(systemTraits).omit({
  id: true,
  createdAt: true,
});

export type InsertSystemTrait = z.infer<typeof insertSystemTraitSchema>;
export type SystemTrait = typeof systemTraits.$inferSelect;

// Character Traits table (links characters to traits with usage tracking)
export const characterTraits = pgTable("character_traits", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  characterId: varchar("character_id").notNull().references(() => characters.id, { onDelete: "cascade" }),
  systemTraitId: varchar("system_trait_id").references(() => systemTraits.id, { onDelete: "cascade" }), // Links to system trait if from admin
  name: text("name").notNull(), // Trait name (can be custom if no systemTraitId)
  description: text("description"),
  parentAttribute: text("parent_attribute").notNull().default("will"), // might, finesse, wit, presence, will, craft
  usesPerLongRest: integer("uses_per_long_rest").notNull().default(1),
  usesPerShortRest: integer("uses_per_short_rest").default(0), // Uses restored on short rest
  currentUses: integer("current_uses").notNull().default(0), // Current uses remaining
  // Damage reduction/resistance/immunity
  damageModifierType: text("damage_modifier_type").default("none"), // "none", "reduce", "resistance", "immune"
  damageModifierDamageType: text("damage_modifier_damage_type"), // Damage type affected
  damageModifierValue: integer("damage_modifier_value").default(0), // Value for "reduce" type
  // Vision modifiers
  visionModifier: integer("vision_modifier").default(0), // +/- to vision distance
  visionModifierTime: text("vision_modifier_time").default("both"), // "day", "night", "both"
  visionOverrideType: text("vision_override_type"), // Override vision type (null = no override)
  visionOverrideToggle: boolean("vision_override_toggle").default(false), // If true, overrides rather than stacks
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertCharacterTraitSchema = createInsertSchema(characterTraits).omit({
  id: true,
  createdAt: true,
});

export type InsertCharacterTrait = z.infer<typeof insertCharacterTraitSchema>;
export type CharacterTrait = typeof characterTraits.$inferSelect;

// Spells table (for magic system) - MUST be before hotbars to avoid TDZ error
export const spells = pgTable("spells", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  characterId: varchar("character_id").references(() => characters.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  image: text("image"),
  description: text("description"),
  damage: text("damage"), // Dice notation (legacy)
  damageDice: text("damage_dice"), // Dice notation e.g. "2d6"
  healingDice: text("healing_dice"), // For healing spells
  damageType: text("damage_type"),
  range: integer("range"),
  rangeNum: integer("range_num").default(30), // Numeric range in feet for distance calculations
  aoe: text("aoe"),
  castingTime: text("casting_time"),
  duration: text("duration"),
  level: integer("level").default(0).notNull(), // Spell level 0-9
  school: text("school"), // e.g. "evocation", "abjuration"
  mod: integer("mod").default(0), // Flat bonus added after dice roll
  attribute: text("attribute"), // Attribute used for attack rolls (might, finesse, wit, presence, will, craft)
  energyCost: integer("energy_cost").default(1), // Energy cost to cast
  manaCost: integer("mana_cost").default(0), // Mana cost to cast (AA V2 only)
  isEquipped: boolean("is_equipped").default(false).notNull(),
  isAttack: boolean("is_attack").default(true).notNull(), // If true: Attack/Damage rolls, if false: Use/Effect rolls
  gainEnergy: boolean("gain_energy").default(false), // For Energy damage type: if true adds energy, if false subtracts
  isAoe: boolean("is_aoe").default(false),
  aoeRange: integer("aoe_range"),
  aoeShape: text("aoe_shape"),
  passesThroughWalls: boolean("passes_through_walls").default(false),
  requiresSave: boolean("requires_save").default(false),
  saveAttribute: text("save_attribute"),
  saveDc: integer("save_dc"),
  saveSuccessEffect: text("save_success_effect"),
  isTemplate: boolean("is_template").default(false).notNull(),
  campaignId: varchar("campaign_id").references(() => campaigns.id, { onDelete: "cascade" }),
  templateSpellId: varchar("template_spell_id").references(() => spells.id, { onDelete: "set null" }),
});

export const insertSpellSchema = createInsertSchema(spells).omit({
  id: true,
});

export type InsertSpell = z.infer<typeof insertSpellSchema>;
export type Spell = typeof spells.$inferSelect;

// Hotbars table (for quick access slots)
export const hotbars = pgTable("hotbars", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  characterId: varchar("character_id").notNull().references(() => characters.id, { onDelete: "cascade" }),
  hotbarType: text("hotbar_type").notNull(), // "weapons", "magic", "skills", "consumables", "utility", "armor"
  slotNumber: integer("slot_number").notNull(), // 0-4 for most, 0-2 for weapons, 0-1 for consumables, 0-4 for armor (helm/chest/arm/legs/boots)
  itemId: varchar("item_id").references(() => items.id, { onDelete: "set null" }), // For weapons, consumables, utility
  spellId: varchar("spell_id").references(() => spells.id, { onDelete: "set null" }), // For magic hotbar
  skillName: text("skill_name"), // For skills hotbar
  traitId: varchar("trait_id").references(() => characterTraits.id, { onDelete: "set null" }), // For skills hotbar (traits)
}, (table) => ({
  uniqueSlot: uniqueIndex("hotbars_character_type_slot_unique").on(
    table.characterId,
    table.hotbarType,
    table.slotNumber
  ),
}));

export const insertHotbarSchema = createInsertSchema(hotbars).omit({
  id: true,
});

export type InsertHotbar = z.infer<typeof insertHotbarSchema>;
export type Hotbar = typeof hotbars.$inferSelect;

// Character Permissions table (for managing who can view/edit characters)
// Access level hierarchy:
// - "none": No access at all
// - "name": Can only see the character's name on tokens (token name only)
// - "view": Can see full stats, inventory, abilities (read-only access)
// - "edit": Can edit the character (full control)
export const characterPermissions = pgTable("character_permissions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  characterId: varchar("character_id").notNull().references(() => characters.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  accessLevel: text("access_level").notNull().default("none"), // "none", "name", "view", "edit"
}, (table) => ({
  uniqueCharacterUser: uniqueIndex("character_permissions_char_user_unique").on(
    table.characterId,
    table.userId
  ),
}));

export const insertCharacterPermissionSchema = createInsertSchema(characterPermissions).omit({
  id: true,
});

export type InsertCharacterPermission = z.infer<typeof insertCharacterPermissionSchema>;
export type CharacterPermission = typeof characterPermissions.$inferSelect;

// Initiative Entries table (for combat initiative tracking)
export const initiativeEntries = pgTable("initiative_entries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  campaignId: varchar("campaign_id").notNull().references(() => campaigns.id, { onDelete: "cascade" }),
  sceneId: varchar("scene_id").references(() => scenes.id, { onDelete: "cascade" }),
  characterId: varchar("character_id").notNull().references(() => characters.id, { onDelete: "cascade" }),
  value: integer("value").notNull(), // Initiative roll result (1d20 + Finesse)
  isHidden: boolean("is_hidden").default(false).notNull(), // GM can hide characters from players
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  uniqueCampaignCharacter: uniqueIndex("initiative_entries_campaign_char_unique").on(
    table.campaignId,
    table.characterId
  ),
}));

export const insertInitiativeEntrySchema = createInsertSchema(initiativeEntries).omit({
  id: true,
  createdAt: true,
});

export type InsertInitiativeEntry = z.infer<typeof insertInitiativeEntrySchema>;
export type InitiativeEntry = typeof initiativeEntries.$inferSelect;

// Feat Templates table (reusable feat definitions, like item templates)
export const featTemplates = pgTable("feat_templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  icon: text("icon"), // Icon name or image URL
  tier: integer("tier").default(1).notNull(), // Tier level (for unlocking requirements)
  cost: integer("cost").default(1).notNull(), // Points required to unlock
  effects: jsonb("effects").default([]).notNull(), // Array of effect objects
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertFeatTemplateSchema = createInsertSchema(featTemplates).omit({
  id: true,
  createdAt: true,
});

export type InsertFeatTemplate = z.infer<typeof insertFeatTemplateSchema>;
export type FeatTemplate = typeof featTemplates.$inferSelect;

// Feat Trees table (for skill trees/talent trees)
export const featTrees = pgTable("feat_trees", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  system: text("system").notNull().default("arcana-adventure"),
  gridWidth: integer("grid_width").default(7).notNull(),
  gridHeight: integer("grid_height").default(10).notNull(),
  defaultViewX: integer("default_view_x"),
  defaultViewY: integer("default_view_y"),
  defaultViewZoom: real("default_view_zoom"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertFeatTreeSchema = createInsertSchema(featTrees).omit({
  id: true,
  createdAt: true,
});

export type InsertFeatTree = z.infer<typeof insertFeatTreeSchema>;
export type FeatTree = typeof featTrees.$inferSelect;

// Feats table (individual nodes in feat trees - can reference a template or have inline data)
export const feats = pgTable("feats", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  treeId: varchar("tree_id").notNull().references(() => featTrees.id, { onDelete: "cascade" }),
  templateId: varchar("template_id").references(() => featTemplates.id, { onDelete: "set null" }), // Optional reference to template
  // Inline data (used when no template, or for overrides)
  name: text("name").notNull(),
  description: text("description"),
  icon: text("icon"), // Icon name or image URL
  image: text("image"), // Profile picture image URL for visual display
  gridX: integer("grid_x").notNull().default(0), // X position in grid
  gridY: integer("grid_y").notNull().default(0), // Y position in grid
  tier: integer("tier").default(1).notNull(), // Tier level (for unlocking requirements)
  cost: integer("cost").default(1).notNull(), // Points required to unlock
  effects: jsonb("effects").default([]).notNull(), // Array of effect objects
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertFeatSchema = createInsertSchema(feats).omit({
  id: true,
  createdAt: true,
});

export type InsertFeat = z.infer<typeof insertFeatSchema>;
export type Feat = typeof feats.$inferSelect;

// Feat effect types for reference:
// { type: "hp_bonus", value: 5 }
// { type: "max_hp_bonus", value: 10 }
// { type: "dc_bonus", value: 2 }
// { type: "speed_bonus", value: 10 }
// { type: "attribute_bonus", attribute: "might", value: 1 }
// { type: "skill_bonus", skill: "perception", value: 1 }
// { type: "spell_grant", spellName: "Fireball", spellLevel: 3 }
// { type: "ability_grant", abilityName: "Dark Vision", description: "..." }

// Feat Connections table (lines between feats showing prerequisites)
export const featConnections = pgTable("feat_connections", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  treeId: varchar("tree_id").notNull().references(() => featTrees.id, { onDelete: "cascade" }),
  fromFeatId: varchar("from_feat_id").notNull().references(() => feats.id, { onDelete: "cascade" }),
  toFeatId: varchar("to_feat_id").notNull().references(() => feats.id, { onDelete: "cascade" }),
});

export const insertFeatConnectionSchema = createInsertSchema(featConnections).omit({
  id: true,
});

export type InsertFeatConnection = z.infer<typeof insertFeatConnectionSchema>;
export type FeatConnection = typeof featConnections.$inferSelect;

// Character Feats table (tracking which feats characters have unlocked)
export const characterFeats = pgTable("character_feats", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  characterId: varchar("character_id").notNull().references(() => characters.id, { onDelete: "cascade" }),
  featId: varchar("feat_id").notNull().references(() => feats.id, { onDelete: "cascade" }),
  unlockedAt: timestamp("unlocked_at").defaultNow().notNull(),
}, (table) => ({
  uniqueCharacterFeat: uniqueIndex("character_feats_char_feat_unique").on(
    table.characterId,
    table.featId
  ),
}));

export const insertCharacterFeatSchema = createInsertSchema(characterFeats).omit({
  id: true,
  unlockedAt: true,
});

export type InsertCharacterFeat = z.infer<typeof insertCharacterFeatSchema>;
export type CharacterFeat = typeof characterFeats.$inferSelect;

// System Spells table (global spell definitions that can be granted via feats, learned by characters)
export const systemSpells = pgTable("system_spells", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  icon: text("icon"),
  school: text("school").default("Evocation").notNull(),
  level: integer("level").default(1).notNull(),
  castingTime: text("casting_time").default("1 action").notNull(),
  range: text("range").default("30 ft").notNull(),
  rangeNum: integer("range_num").default(30), // Numeric range in feet for distance calculations
  duration: text("duration").default("Instantaneous").notNull(),
  components: text("components").default("V, S").notNull(),
  damageType: text("damage_type"), // Sharp, Blunt, Piercing, Flame, Frost, Storm, Tide, Stone, Flux, Light, Dark, Sound, Health, Energy
  damageDice: text("damage_dice"), // Dice notation e.g. "2d6"
  gainEnergy: boolean("gain_energy").default(false), // For Energy damage type: if true adds energy, if false subtracts
  mod: integer("mod").default(0), // Flat bonus added after dice roll (like weapons)
  attribute: text("attribute"), // Attribute used for attack rolls (might, finesse, wit, presence, will, craft)
  healingDice: text("healing_dice"),
  energyCost: integer("energy_cost").default(1).notNull(),
  manaCost: integer("mana_cost").default(0).notNull(),
  concentration: boolean("concentration").default(false).notNull(),
  ritual: boolean("ritual").default(false).notNull(),
  targetType: text("target_type").default("single").notNull(),
  areaSize: text("area_size"),
  aoe: text("aoe"), // Area of effect type: cone, sphere, line, cube, cylinder (like weapons)
  isAoe: boolean("is_aoe").default(false), // Whether the spell has an area of effect
  aoeRange: integer("aoe_range"), // Area of effect range in feet (optional, no default)
  aoeShape: text("aoe_shape"), // Shape of the area effect: circle, square, cone, line
  passesThroughWalls: boolean("passes_through_walls").default(false),
  requiresSave: boolean("requires_save").default(false),
  saveAttribute: text("save_attribute"),
  saveDc: integer("save_dc"),
  saveSuccessEffect: text("save_success_effect"),
  savingThrow: text("saving_throw"),
  effects: jsonb("effects").default([]).notNull(),
  isAttack: boolean("is_attack").default(true).notNull(), // If true: Attack/Damage rolls, if false: Use/Effect rolls
  system: text("system").notNull().default("arcana-adventure"),
  isArchived: boolean("is_archived").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertSystemSpellSchema = createInsertSchema(systemSpells).omit({
  id: true,
  createdAt: true,
});

export type InsertSystemSpell = z.infer<typeof insertSystemSpellSchema>;
export type SystemSpell = typeof systemSpells.$inferSelect;

// ============================================
// NOTES SYSTEM (Obsidian-like notes with sharing)
// ============================================

// Note Folders table (for organizing notes hierarchically)
export const noteFolders = pgTable("note_folders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  campaignId: varchar("campaign_id").references(() => campaigns.id, { onDelete: "cascade" }), // null = personal folder
  parentId: varchar("parent_id").references((): any => noteFolders.id, { onDelete: "cascade" }), // For nested folders
  name: text("name").notNull(),
  color: text("color"), // Optional folder color
  sortOrder: integer("sort_order").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertNoteFolderSchema = createInsertSchema(noteFolders).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertNoteFolder = z.infer<typeof insertNoteFolderSchema>;
export type NoteFolder = typeof noteFolders.$inferSelect;

// Notes table (main note documents - can be regular notes or canvas pages)
export const notes = pgTable("notes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  campaignId: varchar("campaign_id").references(() => campaigns.id, { onDelete: "cascade" }), // null = personal note
  folderId: varchar("folder_id").references(() => noteFolders.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  content: text("content").default("").notNull(), // Markdown content for regular notes
  type: text("type").default("note").notNull(), // "note" or "canvas"
  canvasData: jsonb("canvas_data"), // For canvas pages: nodes, positions, connections
  icon: text("icon"), // Optional custom icon
  coverImage: text("cover_image"), // Optional cover image
  isPinned: boolean("is_pinned").default(false).notNull(),
  isArchived: boolean("is_archived").default(false).notNull(),
  sortOrder: integer("sort_order").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertNoteSchema = createInsertSchema(notes).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertNote = z.infer<typeof insertNoteSchema>;
export type Note = typeof notes.$inferSelect;

// Note References table (links from notes to game entities)
export const noteReferences = pgTable("note_references", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  noteId: varchar("note_id").notNull().references(() => notes.id, { onDelete: "cascade" }),
  entityType: text("entity_type").notNull(), // "character", "item", "spell", "trait", "skill", "species", "campaign", "scene", "note"
  entityId: varchar("entity_id").notNull(), // ID of the referenced entity
  label: text("label"), // Optional display label (defaults to entity name)
  position: integer("position"), // Position in the note content (character offset)
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertNoteReferenceSchema = createInsertSchema(noteReferences).omit({
  id: true,
  createdAt: true,
});

export type InsertNoteReference = z.infer<typeof insertNoteReferenceSchema>;
export type NoteReference = typeof noteReferences.$inferSelect;

// Note Backlinks view (for finding notes that reference a specific entity)
// This is derived from noteReferences - use a query to find backlinks

// Note Shares table (sharing notes/folders with friends)
export const noteShares = pgTable("note_shares", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  noteId: varchar("note_id").references(() => notes.id, { onDelete: "cascade" }),
  folderId: varchar("folder_id").references(() => noteFolders.id, { onDelete: "cascade" }),
  ownerId: varchar("owner_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  sharedWithId: varchar("shared_with_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  permission: text("permission").default("view").notNull(), // "view" or "edit"
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertNoteShareSchema = createInsertSchema(noteShares).omit({
  id: true,
  createdAt: true,
});

export type InsertNoteShare = z.infer<typeof insertNoteShareSchema>;
export type NoteShare = typeof noteShares.$inferSelect;

// Canvas Node data structure (stored in canvasData jsonb)
// {
//   nodes: [
//     { id: string, type: "text" | "note" | "entity", x: number, y: number, width: number, height: number, content?: string, noteId?: string, entityType?: string, entityId?: string }
//   ],
//   connections: [
//     { id: string, fromNodeId: string, toNodeId: string, label?: string, color?: string }
//   ]
// }

// ============================================
// TOKEN EFFECTS SYSTEM (Status effects for combat)
// ============================================

// Token Effects table (admin-defined status effects)
export const tokenEffects = pgTable("token_effects", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  imageUrl: text("image_url"),
  description: text("description"),
  timing: text("timing").notNull().default("start_of_turn"), // "start_of_round" or "start_of_turn"
  causesDamage: boolean("causes_damage").default(false).notNull(),
  damageType: text("damage_type"), // Sharp, Blunt, Piercing, Flame, Frost, Storm, Tide, Stone, Flux, Light, Dark, Sound, Health
  diceAmount: text("dice_amount"), // Dice notation e.g. "1d6", "2d4"
  hasDuration: boolean("has_duration").default(false).notNull(), // Whether this effect expires after a set time
  defaultDuration: integer("default_duration"), // Default number of rounds/turns until effect expires
  durationType: text("duration_type").default("turns"), // "turns" (player's turn) or "rounds" (full combat round)
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertTokenEffectSchema = createInsertSchema(tokenEffects).omit({
  id: true,
  createdAt: true,
});

export type InsertTokenEffect = z.infer<typeof insertTokenEffectSchema>;
export type TokenEffect = typeof tokenEffects.$inferSelect;

// Spell Effects junction table (linking effects to spells with trigger conditions)
export const spellEffects = pgTable("spell_effects", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  spellId: varchar("spell_id").notNull().references(() => systemSpells.id, { onDelete: "cascade" }),
  effectId: varchar("effect_id").notNull().references(() => tokenEffects.id, { onDelete: "cascade" }),
  triggerCondition: text("trigger_condition").notNull().default("always"), // "success", "failure", "always"
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertSpellEffectSchema = createInsertSchema(spellEffects).omit({
  id: true,
  createdAt: true,
});

export type InsertSpellEffect = z.infer<typeof insertSpellEffectSchema>;
export type SpellEffect = typeof spellEffects.$inferSelect;

// Item Effects junction table (linking effects to items/weapons with trigger conditions)
export const itemEffects = pgTable("item_effects", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  itemId: varchar("item_id").notNull().references(() => items.id, { onDelete: "cascade" }),
  effectId: varchar("effect_id").notNull().references(() => tokenEffects.id, { onDelete: "cascade" }),
  triggerCondition: text("trigger_condition").notNull().default("always"), // "success", "failure", "always"
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertItemEffectSchema = createInsertSchema(itemEffects).omit({
  id: true,
  createdAt: true,
});

export type InsertItemEffect = z.infer<typeof insertItemEffectSchema>;
export type ItemEffect = typeof itemEffects.$inferSelect;

// Token Active Effects table (tracking active effects on tokens in combat)
export const tokenActiveEffects = pgTable("token_active_effects", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tokenId: varchar("token_id").notNull().references(() => tokens.id, { onDelete: "cascade" }),
  effectId: varchar("effect_id").notNull().references(() => tokenEffects.id, { onDelete: "cascade" }),
  sourceType: text("source_type"), // "spell", "item", "manual" - how the effect was applied
  sourceId: varchar("source_id"), // ID of the spell or item that applied the effect
  appliedAt: timestamp("applied_at").defaultNow().notNull(),
  duration: integer("duration"), // Number of rounds remaining, null = permanent until removed
});

export const insertTokenActiveEffectSchema = createInsertSchema(tokenActiveEffects).omit({
  id: true,
  appliedAt: true,
});

export type InsertTokenActiveEffect = z.infer<typeof insertTokenActiveEffectSchema>;
export type TokenActiveEffect = typeof tokenActiveEffects.$inferSelect;

// Admin Notifications table (for broadcasting push notifications to all users)
export const adminNotifications = pgTable("admin_notifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  message: text("message").notNull(),
  patchNotes: text("patch_notes"), // Optional, for site update patch notes
  createdBy: varchar("created_by").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertAdminNotificationSchema = createInsertSchema(adminNotifications).omit({
  id: true,
  createdAt: true,
});

export type InsertAdminNotification = z.infer<typeof insertAdminNotificationSchema>;
export type AdminNotification = typeof adminNotifications.$inferSelect;

// User Notifications table (for friend requests, system notifications, etc.)
export const userNotifications = pgTable("user_notifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  type: text("type").notNull(), // "friend_request", "friend_accepted", "system"
  title: text("title").notNull(),
  message: text("message"),
  referenceId: varchar("reference_id"), // ID of related entity (e.g., friend request ID)
  isRead: boolean("is_read").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertUserNotificationSchema = createInsertSchema(userNotifications).omit({
  id: true,
  createdAt: true,
});

export type InsertUserNotification = z.infer<typeof insertUserNotificationSchema>;
export type UserNotification = typeof userNotifications.$inferSelect;

// Terms and Conditions table
export const termsAndConditions = pgTable("terms_and_conditions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  version: integer("version").notNull(),
  content: text("content").notNull(),
  updatedBy: varchar("updated_by").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertTermsAndConditionsSchema = createInsertSchema(termsAndConditions).omit({
  id: true,
  createdAt: true,
});

export type InsertTermsAndConditions = z.infer<typeof insertTermsAndConditionsSchema>;
export type TermsAndConditions = typeof termsAndConditions.$inferSelect;

// User Terms Acceptance tracking
export const userTermsAcceptance = pgTable("user_terms_acceptance", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  termsVersion: integer("terms_version").notNull(),
  acceptedAt: timestamp("accepted_at").defaultNow().notNull(),
}, (table) => ({
  uniqueUserVersion: uniqueIndex("user_terms_unique").on(table.userId, table.termsVersion),
}));

export const insertUserTermsAcceptanceSchema = createInsertSchema(userTermsAcceptance).omit({
  id: true,
  acceptedAt: true,
});

export type InsertUserTermsAcceptance = z.infer<typeof insertUserTermsAcceptanceSchema>;
export type UserTermsAcceptance = typeof userTermsAcceptance.$inferSelect;

// Sandbox Folders table
export const sandboxFolders = pgTable("sandbox_folders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  campaignId: varchar("campaign_id").notNull().references(() => campaigns.id, { onDelete: "cascade" }),
  parentId: varchar("parent_id").references((): AnyPgColumn => sandboxFolders.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  color: varchar("color", { length: 20 }),
  sortOrder: integer("sort_order").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertSandboxFolderSchema = createInsertSchema(sandboxFolders).omit({
  id: true,
  createdAt: true,
});
export type InsertSandboxFolder = z.infer<typeof insertSandboxFolderSchema>;
export type SandboxFolder = typeof sandboxFolders.$inferSelect;

// Sandbox Templates table
export const sandboxTemplates = pgTable("sandbox_templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  campaignId: varchar("campaign_id").notNull().references(() => campaigns.id, { onDelete: "cascade" }),
  folderId: varchar("folder_id").references(() => sandboxFolders.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  data: text("data").default("{}"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertSandboxTemplateSchema = createInsertSchema(sandboxTemplates).omit({
  id: true,
  createdAt: true,
});
export type InsertSandboxTemplate = z.infer<typeof insertSandboxTemplateSchema>;
export type SandboxTemplate = typeof sandboxTemplates.$inferSelect;

// Sandbox Actors table
export const sandboxActors = pgTable("sandbox_actors", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  campaignId: varchar("campaign_id").notNull().references(() => campaigns.id, { onDelete: "cascade" }),
  templateId: varchar("template_id").references(() => sandboxTemplates.id, { onDelete: "set null" }),
  folderId: varchar("folder_id").references(() => sandboxFolders.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  data: text("data").default("{}"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertSandboxActorSchema = createInsertSchema(sandboxActors).omit({
  id: true,
  createdAt: true,
});
export type InsertSandboxActor = z.infer<typeof insertSandboxActorSchema>;
export type SandboxActor = typeof sandboxActors.$inferSelect;

// Roll Entries table (multiple roll definitions per item or spell)
export const rollEntries = pgTable("roll_entries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  ownerType: text("owner_type").notNull(), // "item" or "spell"
  ownerId: varchar("owner_id").notNull(), // references items.id or spells.id
  name: text("name").notNull(), // e.g. "Attack Roll", "Damage Roll", "Heal"
  description: text("description"), // optional description explaining what this roll does
  rollType: text("roll_type").notNull(), // "attack", "damage", "heal", "effect"
  diceFormula: text("dice_formula"), // e.g. "1d20", "2d6+3", "1d8"
  mod: integer("mod").default(0),
  damageType: text("damage_type"), // "Sharp", "Blunt", "Piercing", "Flame", etc.
  attribute: text("attribute"), // "might", "finesse", "wit", "presence", "will", "craft" - adds attribute mod
  applyToStat: text("apply_to_stat").default("none"), // "hp", "energy", "none" - what stat to affect on target
  sortOrder: integer("sort_order").default(0).notNull(),
  range: integer("range"),
  aoeShape: text("aoe_shape"), // "cone", "sphere", "line", "cube", "cylinder"
  aoeRange: integer("aoe_range"),
  requiresSave: boolean("requires_save").default(false),
  saveAttribute: text("save_attribute"),
  saveDc: integer("save_dc"),
  saveSuccessEffect: text("save_success_effect"),
  saveDcType: text("save_dc_type").default("value"),
  saveDcAttribute: text("save_dc_attribute"),
  statDirection: text("stat_direction").default("subtract"),
  gainEnergy: boolean("gain_energy").default(false),
  isAttack: boolean("is_attack").default(true),
  isAoe: boolean("is_aoe").default(false),
  passesThroughWalls: boolean("passes_through_walls").default(false),
  primaryColor: text("primary_color"),
  requiresEnergy: boolean("requires_energy").default(false),
  energyCost: integer("energy_cost"),
  requiresMana: boolean("requires_mana").default(false),
  manaCost: integer("mana_cost"),
  noRoll: boolean("no_roll").default(false),
  enableChatMessage: boolean("enable_chat_message").default(false),
  chatMessage: text("chat_message"),
  applyTokenEffects: boolean("apply_token_effects").default(false),
  tokenEffectIds: text("token_effect_ids").array(),
  effectTriggerCondition: text("effect_trigger_condition").default("always"),
  isHidden: boolean("is_hidden").default(false),
  requiredSkillId: varchar("required_skill_id"),
  requiredSkillValue: integer("required_skill_value").default(1),
  hasDcCheck: boolean("has_dc_check").default(false),
  dcToSucceed: integer("dc_to_succeed"),
  fromTemplateRollId: varchar("from_template_roll_id").references(() => rollEntries.id, { onDelete: "set null" }),
});

export const insertRollEntrySchema = createInsertSchema(rollEntries).omit({
  id: true,
});
export type InsertRollEntry = z.infer<typeof insertRollEntrySchema>;
export type RollEntry = typeof rollEntries.$inferSelect;

// Scene Walls table (for fog of war line-of-sight)
export const sceneWalls = pgTable("scene_walls", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sceneId: varchar("scene_id").notNull().references(() => scenes.id, { onDelete: "cascade" }),
  x1: real("x1").notNull(),
  y1: real("y1").notNull(),
  x2: real("x2").notNull(),
  y2: real("y2").notNull(),
  wallType: text("wall_type").default("solid").notNull(), // "solid" (blocks movement+vision), "transparent" (blocks movement only), "one_way" (blocks vision from one side), "invisible" (blocks movement only, not rendered)
  oneWayDirection: text("one_way_direction"), // "left" or "right" - which side blocks vision for one-way walls
  snapToGrid: boolean("snap_to_grid").default(true).notNull(),
  playerVisible: boolean("player_visible").default(true).notNull(), // Whether players see the wall line
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertSceneWallSchema = createInsertSchema(sceneWalls).omit({
  id: true,
  createdAt: true,
});
export type InsertSceneWall = z.infer<typeof insertSceneWallSchema>;
export type SceneWall = typeof sceneWalls.$inferSelect;

// Scene Doors table
export const sceneDoors = pgTable("scene_doors", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sceneId: varchar("scene_id").notNull().references(() => scenes.id, { onDelete: "cascade" }),
  x1: real("x1").notNull(),
  y1: real("y1").notNull(),
  x2: real("x2").notNull(),
  y2: real("y2").notNull(),
  isOpen: boolean("is_open").default(false).notNull(),
  isLocked: boolean("is_locked").default(false).notNull(),
  blocksVisionWhenClosed: boolean("blocks_vision_when_closed").default(true).notNull(),
  blocksMovementWhenClosed: boolean("blocks_movement_when_closed").default(true).notNull(),
  snapToGrid: boolean("snap_to_grid").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertSceneDoorSchema = createInsertSchema(sceneDoors).omit({
  id: true,
  createdAt: true,
});
export type InsertSceneDoor = z.infer<typeof insertSceneDoorSchema>;
export type SceneDoor = typeof sceneDoors.$inferSelect;

// Scene Windows table
export const sceneWindows = pgTable("scene_windows", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sceneId: varchar("scene_id").notNull().references(() => scenes.id, { onDelete: "cascade" }),
  x1: real("x1").notNull(),
  y1: real("y1").notNull(),
  x2: real("x2").notNull(),
  y2: real("y2").notNull(),
  shutterClosed: boolean("shutter_closed").default(false).notNull(), // Shutter blocks vision when closed
  snapToGrid: boolean("snap_to_grid").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertSceneWindowSchema = createInsertSchema(sceneWindows).omit({
  id: true,
  createdAt: true,
});
export type InsertSceneWindow = z.infer<typeof insertSceneWindowSchema>;
export type SceneWindow = typeof sceneWindows.$inferSelect;

// Scene Lights table
export const sceneLights = pgTable("scene_lights", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sceneId: varchar("scene_id").notNull().references(() => scenes.id, { onDelete: "cascade" }),
  x: real("x").notNull(),
  y: real("y").notNull(),
  radius: integer("radius").default(30).notNull(), // Light radius in feet
  color: text("color").default("#ffcc44").notNull(), // Light color hex
  intensity: real("intensity").default(1.0).notNull(), // 0.0-1.0
  softEdge: boolean("soft_edge").default(true).notNull(), // Soft vs hard edge
  flicker: boolean("flicker").default(false).notNull(),
  flickerSpeed: real("flicker_speed").default(1.0).notNull(), // 0.5-3.0 flicker animation speed
  attachmentType: text("attachment_type").default("static").notNull(), // "static", "token", "item"
  attachedTokenId: varchar("attached_token_id").references(() => tokens.id, { onDelete: "cascade" }),
  attachedItemId: varchar("attached_item_id"), // references items.id but not FK constrained for flexibility
  enabled: boolean("enabled").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertSceneLightSchema = createInsertSchema(sceneLights).omit({
  id: true,
  createdAt: true,
});
export type InsertSceneLight = z.infer<typeof insertSceneLightSchema>;
export type SceneLight = typeof sceneLights.$inferSelect;

export const sceneVisionZones = pgTable("scene_vision_zones", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sceneId: varchar("scene_id").notNull().references(() => scenes.id, { onDelete: "cascade" }),
  name: text("name").default("Zone"),
  mode: text("mode").notNull().default("indoor"), // "indoor" or "outdoor"
  points: text("points").notNull(), // JSON array of {x, y} points defining the polygon
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertSceneVisionZoneSchema = createInsertSchema(sceneVisionZones).omit({
  id: true,
  createdAt: true,
});

export type InsertSceneVisionZone = z.infer<typeof insertSceneVisionZoneSchema>;
export type SceneVisionZone = typeof sceneVisionZones.$inferSelect;

export const sceneMapPins = pgTable("scene_map_pins", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sceneId: varchar("scene_id").notNull().references(() => scenes.id, { onDelete: "cascade" }),
  campaignId: varchar("campaign_id").notNull().references(() => campaigns.id, { onDelete: "cascade" }),
  x: integer("x").notNull().default(0),
  y: integer("y").notNull().default(0),
  pinType: text("pin_type").notNull().default("text_bubble"),
  label: text("label").default(""),
  icon: text("icon").default("pin"),
  color: text("color").default("#e74c3c"),
  targetSceneId: varchar("target_scene_id"),
  textContent: text("text_content").default(""),
  cameraX: integer("camera_x"),
  cameraY: integer("camera_y"),
  cameraZoom: real("camera_zoom"),
});


// ============================================
// WORLDBUILDING ENTITY SYSTEM
// ============================================

export const worlds = pgTable("worlds", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  image: text("image"),
  homeContent: text("home_content"),
  customTags: text("custom_tags").array().default(sql`ARRAY[]::text[]`),
  system: text("system").default("arcana-adventure"),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  campaignId: varchar("campaign_id").references(() => campaigns.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertWorldSchema = createInsertSchema(worlds).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertWorld = z.infer<typeof insertWorldSchema>;
export type World = typeof worlds.$inferSelect;

export const ENTITY_TYPES = [
  "article", "canvas"
] as const;
export type EntityType = typeof ENTITY_TYPES[number];

export const PREDEFINED_TAGS = [
  "Building/Landmark", "Character", "God/Deity", "Condition", "Conflict",
  "Article", "Ethnicity/Species", "Geographic Location", "Item", "Language",
  "Material", "Military", "Myth/Legend", "Natural Law", "Organization",
  "Faction/Sect", "Plot", "Profession", "Session Report", "Settlement",
  "Spell", "Technology", "Title/Rank", "Tradition/Ritual", "Religions/Cults", "Vehicle"
] as const;

export const OLD_ENTITY_TYPE_TO_TAG: Record<string, string> = {
  character: "Character",
  location: "Geographic Location",
  faction: "Faction/Sect",
  quest: "Plot",
  event: "Conflict",
  lore: "Article",
  item: "Item",
  encounter: "Conflict",
  clue: "Plot",
  magic: "Spell",
  timeline: "Article",
};

export const VISIBILITY_LEVELS = ["gm_only", "shared", "player_visible"] as const;
export type VisibilityLevel = typeof VISIBILITY_LEVELS[number];

export const entities = pgTable("entities", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  campaignId: varchar("campaign_id").references(() => campaigns.id, { onDelete: "cascade" }),
  worldId: varchar("world_id").references(() => worlds.id, { onDelete: "cascade" }),
  entityType: text("entity_type").notNull(),
  displayName: text("display_name").notNull(),
  description: text("description"),
  articleContent: text("article_content"),
  image: text("image"),
  sheetId: varchar("sheet_id").references(() => characters.id, { onDelete: "set null" }),
  notePageId: varchar("note_page_id").references(() => notes.id, { onDelete: "set null" }),
  visibility: text("visibility").notNull().default("gm_only"),
  tags: text("tags").array().default(sql`ARRAY[]::text[]`),
  loreFields: jsonb("lore_fields").default({}),
  questData: jsonb("quest_data"),
  eventData: jsonb("event_data"),
  clueData: jsonb("clue_data"),
  locationData: jsonb("location_data"),
  factionData: jsonb("faction_data"),
  encounterData: jsonb("encounter_data"),
  magicData: jsonb("magic_data"),
  timelineData: jsonb("timeline_data"),
  isDeleted: boolean("is_deleted").default(false).notNull(),
  deletedAt: timestamp("deleted_at"),
  createdBy: varchar("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertEntitySchema = createInsertSchema(entities).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  isDeleted: true,
  deletedAt: true,
});

export type InsertEntity = z.infer<typeof insertEntitySchema>;
export type Entity = typeof entities.$inferSelect;

export const LINK_TYPES = [
  "ally", "enemy", "member_of", "located_in", "related_to", "quest_target",
  "quest_giver", "owns", "controls", "parent_of", "child_of", "employs",
  "guards", "trades_with", "worships", "rivals", "mentor_of", "student_of",
  "found_at", "found_from", "related_quest", "custom"
] as const;
export type LinkType = typeof LINK_TYPES[number];

export const entityLinks = pgTable("entity_links", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  campaignId: varchar("campaign_id").references(() => campaigns.id, { onDelete: "cascade" }),
  worldId: varchar("world_id").references(() => worlds.id, { onDelete: "cascade" }),
  fromEntityId: varchar("from_entity_id").notNull().references(() => entities.id, { onDelete: "cascade" }),
  toEntityId: varchar("to_entity_id").notNull().references(() => entities.id, { onDelete: "cascade" }),
  linkType: text("link_type").notNull(),
  label: text("label"),
  metadata: jsonb("metadata").default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertEntityLinkSchema = createInsertSchema(entityLinks).omit({
  id: true,
  createdAt: true,
});

export type InsertEntityLink = z.infer<typeof insertEntityLinkSchema>;
export type EntityLink = typeof entityLinks.$inferSelect;

export const worldShareLinks = pgTable("world_share_links", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  campaignId: varchar("campaign_id").references(() => campaigns.id, { onDelete: "cascade" }),
  worldId: varchar("world_id").references(() => worlds.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  createdBy: varchar("created_by").references(() => users.id, { onDelete: "set null" }),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertWorldShareLinkSchema = createInsertSchema(worldShareLinks).omit({
  id: true,
  createdAt: true,
});
export type InsertWorldShareLink = z.infer<typeof insertWorldShareLinkSchema>;
export type WorldShareLink = typeof worldShareLinks.$inferSelect;

export const worldMaps = pgTable("world_maps", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  campaignId: varchar("campaign_id").references(() => campaigns.id, { onDelete: "cascade" }),
  worldId: varchar("world_id").references(() => worlds.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  imageUrl: text("image_url"),
  description: text("description"),
  parentMapId: varchar("parent_map_id").references((): AnyPgColumn => worldMaps.id, { onDelete: "set null" }),
  visibility: text("visibility").notNull().default("gm_only"),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertWorldMapSchema = createInsertSchema(worldMaps).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertWorldMap = z.infer<typeof insertWorldMapSchema>;
export type WorldMap = typeof worldMaps.$inferSelect;

export const MAP_PIN_TYPES = ["text_reveal", "map_link", "entity_link"] as const;
export type MapPinType = typeof MAP_PIN_TYPES[number];

export const worldMapPins = pgTable("world_map_pins", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  mapId: varchar("map_id").notNull().references(() => worldMaps.id, { onDelete: "cascade" }),
  x: real("x").notNull(),
  y: real("y").notNull(),
  label: text("label"),
  icon: text("icon"),
  color: text("color").default("#f59e0b"),
  pinType: text("pin_type").notNull().default("text_reveal"),
  textContent: text("text_content"),
  targetMapId: varchar("target_map_id").references(() => worldMaps.id, { onDelete: "set null" }),
  targetEntityId: varchar("target_entity_id").references(() => entities.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertWorldMapPinSchema = createInsertSchema(worldMapPins).omit({
  id: true,
  createdAt: true,
});
export type InsertWorldMapPin = z.infer<typeof insertWorldMapPinSchema>;
export type WorldMapPin = typeof worldMapPins.$inferSelect;

export const worldCalendars = pgTable("world_calendars", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  campaignId: varchar("campaign_id").references(() => campaigns.id, { onDelete: "cascade" }),
  worldId: varchar("world_id").references(() => worlds.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  monthNames: jsonb("month_names").notNull().default(sql`'[]'::jsonb`),
  daysPerMonth: jsonb("days_per_month").notNull().default(sql`'[]'::jsonb`),
  weekDayNames: jsonb("week_day_names").notNull().default(sql`'[]'::jsonb`),
  currentYear: integer("current_year").default(1),
  currentMonth: integer("current_month").default(0),
  currentDay: integer("current_day").default(1),
  yearSuffix: text("year_suffix").default(""),
  notes: jsonb("notes").default(sql`'{}'::jsonb`),
  events: jsonb("events").default(sql`'[]'::jsonb`),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertWorldCalendarSchema = createInsertSchema(worldCalendars).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertWorldCalendar = z.infer<typeof insertWorldCalendarSchema>;
export type WorldCalendar = typeof worldCalendars.$inferSelect;

export const worldTimelines = pgTable("world_timelines", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  worldId: varchar("world_id").references(() => worlds.id, { onDelete: "cascade" }),
  campaignId: varchar("campaign_id").references(() => campaigns.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  color: text("color"),
  sortOrder: integer("sort_order").default(0),
  visibility: text("visibility").notNull().default("gm_only"),
  eras: jsonb("eras").default(sql`'[]'::jsonb`),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertWorldTimelineSchema = createInsertSchema(worldTimelines).omit({
  id: true,
  createdAt: true,
});
export type InsertWorldTimeline = z.infer<typeof insertWorldTimelineSchema>;
export type WorldTimeline = typeof worldTimelines.$inferSelect;

export const worldTimelineEvents = pgTable("world_timeline_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  campaignId: varchar("campaign_id").references(() => campaigns.id, { onDelete: "cascade" }),
  worldId: varchar("world_id").references(() => worlds.id, { onDelete: "cascade" }),
  timelineId: varchar("timeline_id").references(() => worldTimelines.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  date: text("date"),
  endDate: text("end_date"),
  era: text("era"),
  entityId: varchar("entity_id").references(() => entities.id, { onDelete: "set null" }),
  calendarId: varchar("calendar_id").references(() => worldCalendars.id, { onDelete: "set null" }),
  color: text("color"),
  icon: text("icon"),
  sortOrder: integer("sort_order").default(0),
  visibility: text("visibility").notNull().default("gm_only"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertWorldTimelineEventSchema = createInsertSchema(worldTimelineEvents).omit({
  id: true,
  createdAt: true,
});
export type InsertWorldTimelineEvent = z.infer<typeof insertWorldTimelineEventSchema>;
export type WorldTimelineEvent = typeof worldTimelineEvents.$inferSelect;

export const worldCalendarSyncs = pgTable("world_calendar_syncs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  worldId: varchar("world_id").notNull().references(() => worlds.id, { onDelete: "cascade" }),
  sourceCalendarId: varchar("source_calendar_id").notNull().references(() => worldCalendars.id, { onDelete: "cascade" }),
  targetCalendarId: varchar("target_calendar_id").notNull().references(() => worldCalendars.id, { onDelete: "cascade" }),
  epochOffset: integer("epoch_offset").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertWorldCalendarSyncSchema = createInsertSchema(worldCalendarSyncs).omit({
  id: true,
  createdAt: true,
});
export type InsertWorldCalendarSync = z.infer<typeof insertWorldCalendarSyncSchema>;
export type WorldCalendarSync = typeof worldCalendarSyncs.$inferSelect;

// ============================================
// CAMPAIGN MAP PINS (replaces scene_map_pins)
// ============================================

export const campaignMapPins = pgTable("campaign_map_pins", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sceneId: varchar("scene_id").notNull().references(() => scenes.id, { onDelete: "cascade" }),
  campaignId: varchar("campaign_id").notNull().references(() => campaigns.id, { onDelete: "cascade" }),
  x: real("x").notNull().default(0),
  y: real("y").notNull().default(0),
  label: text("label").default(""),
  icon: text("icon").default("pin"),
  color: text("color").default("#f59e0b"),
  pinType: text("pin_type").notNull().default("text_reveal"),
  textContent: text("text_content"),
  targetSceneId: varchar("target_scene_id"),
  isShop: boolean("is_shop").default(false),
  shopkeeperMoney: integer("shopkeeper_money").default(0),
  shopkeeperCharacterId: varchar("shopkeeper_character_id"),
  defaultSellPercentage: integer("default_sell_percentage").default(80),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertCampaignMapPinSchema = createInsertSchema(campaignMapPins).omit({
  id: true,
  createdAt: true,
});
export type InsertCampaignMapPin = z.infer<typeof insertCampaignMapPinSchema>;
export type CampaignMapPin = typeof campaignMapPins.$inferSelect;

// ============================================
// SHOP ITEMS (attached to campaign map pins)
// ============================================

export const shopItems = pgTable("shop_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  pinId: varchar("pin_id").notNull().references(() => campaignMapPins.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  image: text("image"),
  price: integer("price").notNull().default(0),
  currency: text("currency").notNull().default("gold"),
  itemType: text("item_type"),
  quantity: integer("quantity").notNull().default(-1),
  itemData: jsonb("item_data"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertShopItemSchema = createInsertSchema(shopItems).omit({
  id: true,
  createdAt: true,
});
export type InsertShopItem = z.infer<typeof insertShopItemSchema>;
export type ShopItem = typeof shopItems.$inferSelect;

export const shopHaggleRolls = pgTable("shop_haggle_rolls", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  pinId: varchar("pin_id").notNull().references(() => campaignMapPins.id, { onDelete: "cascade" }),
  characterId: varchar("character_id").notNull(),
  characterName: text("character_name").default(""),
  roll: integer("roll").notNull(),
  sellPercentage: integer("sell_percentage").notNull(),
  d20Result: integer("d20_result").notNull(),
  charismaMod: integer("charisma_mod").default(0),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  uniqueIndex("shop_haggle_rolls_pin_character_unique").on(table.pinId, table.characterId),
]);

export const insertShopHaggleRollSchema = createInsertSchema(shopHaggleRolls).omit({
  id: true,
  createdAt: true,
});
export type InsertShopHaggleRoll = z.infer<typeof insertShopHaggleRollSchema>;
export type ShopHaggleRoll = typeof shopHaggleRolls.$inferSelect;

export const classes = pgTable("classes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  image: text("image"),
  system: text("system").notNull().default("aa-v2"),
  skillTreeId: text("skill_tree_id"),
  gridWidth: integer("grid_width").default(7).notNull(),
  gridHeight: integer("grid_height").default(10).notNull(),
  defaultViewX: integer("default_view_x"),
  defaultViewY: integer("default_view_y"),
  defaultViewZoom: real("default_view_zoom"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertClassSchema = createInsertSchema(classes).omit({
  id: true,
  createdAt: true,
});
export type InsertClass = z.infer<typeof insertClassSchema>;
export type GameClass = typeof classes.$inferSelect;

export const classSkillNodes = pgTable("class_skill_nodes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  classId: varchar("class_id").notNull().references(() => classes.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  icon: text("icon"),
  image: text("image"),
  gridX: integer("grid_x").notNull().default(0),
  gridY: integer("grid_y").notNull().default(0),
  tier: integer("tier").default(1).notNull(),
  cost: integer("cost").default(1).notNull(),
  effects: jsonb("effects").default([]).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertClassSkillNodeSchema = createInsertSchema(classSkillNodes).omit({
  id: true,
  createdAt: true,
});
export type InsertClassSkillNode = z.infer<typeof insertClassSkillNodeSchema>;
export type ClassSkillNode = typeof classSkillNodes.$inferSelect;

export const classSkillConnections = pgTable("class_skill_connections", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  classId: varchar("class_id").notNull().references(() => classes.id, { onDelete: "cascade" }),
  fromNodeId: varchar("from_node_id").notNull().references(() => classSkillNodes.id, { onDelete: "cascade" }),
  toNodeId: varchar("to_node_id").notNull().references(() => classSkillNodes.id, { onDelete: "cascade" }),
});

export const insertClassSkillConnectionSchema = createInsertSchema(classSkillConnections).omit({
  id: true,
});
export type InsertClassSkillConnection = z.infer<typeof insertClassSkillConnectionSchema>;
export type ClassSkillConnection = typeof classSkillConnections.$inferSelect;

export const characterClasses = pgTable("character_classes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  characterId: varchar("character_id").notNull().references(() => characters.id, { onDelete: "cascade" }),
  classId: varchar("class_id").notNull().references(() => classes.id, { onDelete: "cascade" }),
  classLevel: integer("class_level").notNull().default(1),
  classPoints: integer("class_points").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  uniqueCharacterClass: uniqueIndex("character_classes_char_class_unique").on(
    table.characterId,
    table.classId
  ),
}));

export const insertCharacterClassSchema = createInsertSchema(characterClasses).omit({
  id: true,
  createdAt: true,
});
export type InsertCharacterClass = z.infer<typeof insertCharacterClassSchema>;
export type CharacterClass = typeof characterClasses.$inferSelect;

export const characterClassSkills = pgTable("character_class_skills", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  characterId: varchar("character_id").notNull().references(() => characters.id, { onDelete: "cascade" }),
  classId: varchar("class_id").notNull().references(() => classes.id, { onDelete: "cascade" }),
  nodeId: varchar("node_id").notNull().references(() => classSkillNodes.id, { onDelete: "cascade" }),
  unlockedAt: timestamp("unlocked_at").defaultNow().notNull(),
}, (table) => ({
  uniqueCharacterClassSkill: uniqueIndex("character_class_skills_unique").on(
    table.characterId,
    table.nodeId
  ),
}));

export const insertCharacterClassSkillSchema = createInsertSchema(characterClassSkills).omit({
  id: true,
  unlockedAt: true,
});
export type InsertCharacterClassSkill = z.infer<typeof insertCharacterClassSkillSchema>;
export type CharacterClassSkill = typeof characterClassSkills.$inferSelect;

export const worldCollaborators = pgTable("world_collaborators", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  worldId: varchar("world_id").notNull().references(() => worlds.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: text("role").notNull().default("editor"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  uniqueWorldUser: uniqueIndex("world_collaborators_unique").on(table.worldId, table.userId),
}));

export const insertWorldCollaboratorSchema = createInsertSchema(worldCollaborators).omit({
  id: true,
  createdAt: true,
});
export type InsertWorldCollaborator = z.infer<typeof insertWorldCollaboratorSchema>;
export type WorldCollaborator = typeof worldCollaborators.$inferSelect;

export const entityAccess = pgTable("entity_access", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  entityId: varchar("entity_id").notNull().references(() => entities.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  accessLevel: text("access_level").notNull().default("view"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  uniqueEntityUser: uniqueIndex("entity_access_unique").on(table.entityId, table.userId),
}));

export const insertEntityAccessSchema = createInsertSchema(entityAccess).omit({
  id: true,
  createdAt: true,
});
export type InsertEntityAccess = z.infer<typeof insertEntityAccessSchema>;
export type EntityAccess = typeof entityAccess.$inferSelect;

export const spectatorTokens = pgTable("spectator_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  campaignId: varchar("campaign_id").notNull().references(() => campaigns.id, { onDelete: "cascade" }).unique(),
  token: text("token").notNull().unique(),
  createdBy: varchar("created_by").references(() => users.id, { onDelete: "set null" }),
  expiresAt: timestamp("expires_at"), // Null = never expires
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertSpectatorTokenSchema = createInsertSchema(spectatorTokens).omit({
  id: true,
  createdAt: true,
});
export type InsertSpectatorToken = z.infer<typeof insertSpectatorTokenSchema>;
export type SpectatorToken = typeof spectatorTokens.$inferSelect;
