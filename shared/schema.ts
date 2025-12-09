import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, boolean, jsonb, real, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Users table
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull().unique(),
  username: text("username").notNull().unique(),
  name: text("name").notNull(),
  password: text("password").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// Campaigns table
export const campaigns = pgTable("campaigns", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  inviteCode: text("invite_code").notNull().unique(),
  gmUserId: varchar("gm_user_id").notNull().references(() => users.id),
  gridSize: integer("grid_size").default(50).notNull(), // deprecated, kept for backward compat
  currentMap: text("current_map"), // deprecated, kept for backward compat
  activeSceneId: varchar("active_scene_id"),
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

// Scenes table (for battlemap scenes within campaigns)
export const scenes = pgTable("scenes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  campaignId: varchar("campaign_id").notNull().references(() => campaigns.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  backgroundImage: text("background_image"),
  gridEnabled: boolean("grid_enabled").default(true).notNull(),
  gridType: text("grid_type").default("square").notNull(), // "square" or "hex"
  gridSize: integer("grid_size").default(50).notNull(),
  gridColor: text("grid_color").default("#ffffff").notNull(), // Hex color for grid lines
  gridThickness: real("grid_thickness").default(1).notNull(), // Line thickness in pixels
  gridOpacity: real("grid_opacity").default(0.4).notNull(), // 0.0 to 1.0
  defaultViewX: integer("default_view_x").default(0).notNull(),
  defaultViewY: integer("default_view_y").default(0).notNull(),
  defaultViewZoom: real("default_view_zoom").default(1).notNull(),
  defaultViewVersion: integer("default_view_version").default(0).notNull(), // 0 = legacy pixel offsets, 1 = world center coords
  inCombat: boolean("in_combat").default(false).notNull(), // Whether combat/initiative tracking is active
  currentTurnCharacterId: varchar("current_turn_character_id"), // Character whose turn it is
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
  role: text("role").notNull().default("player"), // "gm" or "player"
  favorite: boolean("favorite").default(false).notNull(),
  assignedCharacterId: varchar("assigned_character_id"), // Character auto-assigned to player on load
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
export const characters = pgTable("characters", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  campaignId: varchar("campaign_id").notNull().references(() => campaigns.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  portrait: text("portrait"),
  class: text("class").default(""), // Kept for backward compat, not used in UI
  level: integer("level").default(1).notNull(),
  hp: integer("hp").notNull(),
  maxHp: integer("max_hp").notNull(),
  energy: integer("energy").notNull(),
  maxEnergy: integer("max_energy").notNull(),
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
  // Exhaustion (0-7 scale)
  exhaustion: integer("exhaustion").notNull().default(0),
  // Background/notes
  biography: text("biography"),
  gmNotes: text("gm_notes"),
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
  characterId: varchar("character_id").references(() => characters.id, { onDelete: "cascade" }),
  type: text("type").notNull(), // "player" or "enemy"
  x: real("x").notNull(),
  y: real("y").notNull(),
  image: text("image").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertTokenSchema = createInsertSchema(tokens).omit({
  id: true,
  createdAt: true,
});

export type InsertToken = z.infer<typeof insertTokenSchema>;
export type Token = typeof tokens.$inferSelect;

// Chat Messages table
export const chatMessages = pgTable("chat_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  campaignId: varchar("campaign_id").notNull().references(() => campaigns.id, { onDelete: "cascade" }),
  userId: varchar("user_id").references(() => users.id, { onDelete: "set null" }),
  sender: text("sender").notNull(), // Display name
  text: text("text").notNull(),
  type: text("type").notNull().default("chat"), // "chat" or "system"
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
  containerId: varchar("container_id").references(() => items.id, { onDelete: "cascade" }), // For nested inventories
  isTemplate: boolean("is_template").default(false).notNull(), // True for campaign item templates
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
  carryWeight: integer("carry_weight").default(50).notNull(), // Base carry weight capacity
  featTree: text("feat_tree").default(""), // Reference to the feat tree for this species
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertSystemSpeciesSchema = createInsertSchema(systemSpecies).omit({
  id: true,
  createdAt: true,
});

export type InsertSystemSpecies = z.infer<typeof insertSystemSpeciesSchema>;
export type SystemSpecies = typeof systemSpecies.$inferSelect;

// System Skills table (admin-defined custom skills that can be added to characters)
export const systemSkills = pgTable("system_skills", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  parentAttribute: text("parent_attribute").notNull().default("wit"), // might, finesse, wit, presence, will, craft
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
  usesPerLongRest: integer("uses_per_long_rest").notNull().default(1),
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
  currentUses: integer("current_uses").notNull().default(0), // Current uses remaining
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
  characterId: varchar("character_id").notNull().references(() => characters.id, { onDelete: "cascade" }),
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
  isEquipped: boolean("is_equipped").default(false).notNull(),
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
export const characterPermissions = pgTable("character_permissions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  characterId: varchar("character_id").notNull().references(() => characters.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  accessLevel: text("access_level").notNull().default("none"), // "none", "view", "edit"
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
  sceneId: varchar("scene_id").notNull().references(() => scenes.id, { onDelete: "cascade" }),
  characterId: varchar("character_id").notNull().references(() => characters.id, { onDelete: "cascade" }),
  value: integer("value").notNull(), // Initiative roll result (1d20 + Finesse)
  isHidden: boolean("is_hidden").default(false).notNull(), // GM can hide characters from players
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  uniqueSceneCharacter: uniqueIndex("initiative_entries_scene_char_unique").on(
    table.sceneId,
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
  gridWidth: integer("grid_width").default(7).notNull(), // Grid columns
  gridHeight: integer("grid_height").default(10).notNull(), // Grid rows
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
  damageType: text("damage_type"), // Sharp, Blunt, Piercing, Flame, Frost, Storm, Tide, Stone, Flux, Light, Dark, Sound, Health
  damageDice: text("damage_dice"), // Dice notation e.g. "2d6"
  mod: integer("mod").default(0), // Flat bonus added after dice roll (like weapons)
  attribute: text("attribute"), // Attribute used for attack rolls (might, finesse, wit, presence, will, craft)
  healingDice: text("healing_dice"),
  energyCost: integer("energy_cost").default(1).notNull(),
  concentration: boolean("concentration").default(false).notNull(),
  ritual: boolean("ritual").default(false).notNull(),
  targetType: text("target_type").default("single").notNull(),
  areaSize: text("area_size"),
  aoe: text("aoe"), // Area of effect type: cone, sphere, line, cube, cylinder (like weapons)
  isAoe: boolean("is_aoe").default(false), // Whether the spell has an area of effect
  aoeRange: integer("aoe_range"), // Area of effect range in feet (optional, no default)
  aoeShape: text("aoe_shape"), // Shape of the area effect: circle, square, cone, line
  savingThrow: text("saving_throw"),
  effects: jsonb("effects").default([]).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertSystemSpellSchema = createInsertSchema(systemSpells).omit({
  id: true,
  createdAt: true,
});

export type InsertSystemSpell = z.infer<typeof insertSystemSpellSchema>;
export type SystemSpell = typeof systemSpells.$inferSelect;
