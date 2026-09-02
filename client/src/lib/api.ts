// API client for backend communication

export interface GoogleDocInfo {
  id: string;
  name: string;
  modifiedTime?: string;
  webViewLink?: string;
}

export interface User {
  id: string;
  email: string;
  username: string;
  name: string;
  theme?: string | null;
  isAdmin?: boolean;
}

export interface AdminUser {
  id: string;
  email: string;
  username: string;
  name: string;
  avatarUrl?: string;
  createdAt: string;
  isAdmin?: boolean;
  bannedAt?: string | null;
  banExpiresAt?: string | null;
  banReason?: string | null;
}

export interface UserActivity {
  campaigns: { id: string; name: string; role: string; createdAt: string }[];
  characters: { id: string; name: string; campaignId: string; campaignName: string }[];
  notes: { id: string; title: string; createdAt: string }[];
}

export interface Campaign {
  id: string;
  name: string;
  inviteCode: string;
  gmUserId: string;
  gridSize: number;
  currentMap?: string;
  activeSceneId?: string;
  system: string;
  inCombat?: boolean;
  currentTurnCharacterId?: string | null;
  is18Plus?: boolean;
  createdAt: string;
  lastPlayed: string;
}

export interface Character {
  id: string;
  campaignId: string;
  userId: string;
  name: string;
  portrait?: string;
  class: string;
  level: number;
  hp: number;
  maxHp: number;
  energy: number;
  maxEnergy: number;
  mana: number;
  maxMana: number;
  race: string;
  size: string;
  sizeBonus: number;
  naturalArmor: number;
  speed: number;
  flySpeed: number;
  swimSpeed: number;
  lifespan: number;
  agility: number;
  charisma: number;
  strength: number;
  wisdom: number;
  arcana: number;
  concentration: number;
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
  biography?: string;
  gmNotes?: string;
  folderId?: string | null;
  inventory: string[];
  bonusHpFromLevelUps?: number;
  lastLevelUpRolled?: number;
  bonusEnergyFromLevelUps?: number;
  lastEnergyLevelUpRolled?: number;
  // AA V3 attributes
  constitution?: number;
  anemos?: number;
  intelligence?: number;
  // AA V3 skill values keyed by V3 skill key
  v3Skills?: Record<string, number>;
}

export interface Token {
  id: string;
  campaignId: string;
  sceneId?: string | null;
  characterId?: string;
  type: string;
  x: number;
  y: number;
  image: string;
  createdAt?: string;
}

export interface CharacterFolder {
  id: string;
  campaignId: string;
  name: string;
  sortOrder: number;
  createdAt: string;
}

export interface SceneFolder {
  id: string;
  campaignId: string;
  name: string;
  sortOrder: number;
  createdAt: string;
}

export interface CharacterTemplateFolder {
  id: string;
  name: string;
  sortOrder: number;
  createdAt: string;
}

export interface ChatMessage {
  id: string;
  campaignId: string;
  userId?: string;
  sender: string;
  text: string;
  type: string;
  createdAt: string;
}

export interface CampaignMember {
  id: string;
  campaignId: string;
  userId: string;
  role: string;
  favorite: boolean;
  joinedAt: string;
}

export interface Scene {
  id: string;
  campaignId: string;
  folderId?: string | null;
  name: string;
  backgroundImage?: string;
  gridEnabled: boolean;
  gridType: string;
  gridSize: number;
  gridColor: string;
  gridThickness: number;
  gridOpacity: number;
  gridOffsetX?: number;
  gridOffsetY?: number;
  defaultViewX: number;
  defaultViewY: number;
  defaultViewZoom: number;
  fogEnabled: boolean;
  fogExploredMemory: boolean;
  fogOpacity: number;
  fogExploredDimness: number;
  isDayTime: boolean;
  inCombat: boolean;
  currentTurnCharacterId?: string;
  createdAt: string;
}

export interface InitiativeEntry {
  id: string;
  campaignId: string;
  sceneId?: string;
  characterId: string;
  value: number;
  isHidden: boolean;
  createdAt: string;
}

export interface InitiativeData {
  entries: InitiativeEntry[];
  inCombat: boolean;
  currentTurnCharacterId?: string;
}

export interface Hotbar {
  id: string;
  characterId: string;
  hotbarType: string;
  slotNumber: number;
  itemId?: string;
  spellId?: string;
  v3SpellId?: string;
  skillName?: string;
  traitId?: string;
}

export interface Item {
  id: string;
  characterId: string;
  containerId?: string | null;
  name: string;
  image?: string;
  description?: string;
  damage?: string;
  damageType?: string;
  mod: number;
  range?: number;
  aoe?: string;
  attribute?: string;
  size?: string;
  weight: string;
  priceCopper: number;
  priceSilver: number;
  priceGold: number;
  pricePlatinum: number;
  itemWeight: number;
  quantity: number;
  durability: number;
  itemType: string;
  rarity: string;
  maxSpells?: number;
  advancedItemTypeId?: string | null;
  isContainer: boolean;
  carryCapacity?: number;
  isEquipped: boolean;
  weaponCategory?: string;
  isHeavy?: boolean;
  ammunitionType?: string;
  ammunitionTypeId?: string | null;
  armorBonus?: number;
  breakChance?: number;
  armorSlot?: string;
  damageReduction?: number;
  damageReductionType?: string;
  v3ArmorBoosts?: { target: string; amount: number }[];
  isDetonatable?: boolean;
  detonateAoeShape?: string;
  detonateAoeRange?: number;
  isDamaging?: boolean;
  // AA V3 consumable "use effect" — signed HP/Mana/Energy deltas + description.
  consumableHpChange?: number;
  consumableManaChange?: number;
  consumableEnergyChange?: number;
  consumableEffectDescription?: string | null;
  // AA V3 scrolls & runes (Task #198)
  maxDurability?: number;
  // AA V3 repair cost (lives on the item; crafter repair recipes just declare types).
  repairAmount?: number;
  repairIngredients?: { itemId: string | null; itemName: string; quantity: number }[];
  dcBonusValue?: number;
  templateItemId?: string | null;
  scrollEffectMode?: string;
  scrollKnowledgeName?: string | null;
  scrollKnowledgeAttribute?: string | null;
  scrollKnowledgeValue?: number | null;
  scrollSkillKey?: string | null;
  scrollSkillAmount?: number | null;
  runeTargetItemType?: string | null;
  runeStatEffects?: { target: string; amount: number }[];
  runeRemoveDurabilityCost?: number | null;
  runeUnremovable?: boolean;
  runeUseMode?: string;
  runeSkillKey?: string | null;
  runeSkillAdjustment?: number | null;
  runeWeaponDamageLevelBonus?: number | null;
  socketedRunes?: import("@shared/v3").V3SocketedRune[];
  // AA V3 only: technique groups assigned to this weapon item.
  v3TechniqueGroupIds?: string[] | null;
}

export interface Spell {
  id: string;
  characterId: string;
  name: string;
  image?: string;
  description?: string;
  damage?: string;
  damageDice?: string;
  healingDice?: string;
  damageType?: string;
  range?: number;
  rangeNum?: number;
  aoe?: string;
  castingTime?: string;
  duration?: string;
  level: number;
  school?: string;
  mod?: number;
  attribute?: string;
  energyCost?: number;
  manaCost?: number;
  isEquipped: boolean;
}

export interface SystemSpecies {
  id: string;
  systemName: string;
  name: string;
  description?: string;
  defaultImage?: string;
  lifespan: number;
  speed: number;
  flySpeed: number;
  swimSpeed?: number;
  size: string;
  naturalArmor: number;
  sizeBonus: number;
  startingHp: number;
  startingMaxHp: number;
  hpPerLevel: number;
  startingEnergy: number;
  startingMaxEnergy: number;
  carryWeight: number;
  featTree?: string;
  // AA V3 species fields
  attributeBonuses?: Record<string, number>;
  defaultCustomSkills?: any[];
  defaultTraits?: any[];
  createdAt: string;
}

export interface CampaignSpecies {
  id: string;
  campaignId: string;
  name: string;
  description?: string;
  defaultImage?: string;
  lifespan: number;
  speed: number;
  flySpeed: number;
  swimSpeed?: number;
  size: string;
  naturalArmor: number;
  sizeBonus: number;
  startingHp: number;
  startingMaxHp: number;
  hpPerLevel: number;
  startingEnergy: number;
  startingMaxEnergy: number;
  carryWeight: number;
  featTree?: string;
  // AA V3 species fields
  attributeBonuses?: Record<string, number>;
  defaultCustomSkills?: any[];
  defaultTraits?: any[];
  createdAt: string;
}

export interface SystemSkill {
  id: string;
  name: string;
  description?: string;
  parentAttribute: string;
  createdAt: string;
}

export interface CharacterCustomSkill {
  id: string;
  characterId: string;
  systemSkillId?: string;
  name: string;
  parentAttribute: string;
  value: number;
}

export interface CharacterPermission {
  id: string;
  characterId: string;
  userId: string;
  accessLevel: string;
}

export interface FeatTree {
  id: string;
  name: string;
  description?: string;
  gridWidth: number;
  gridHeight: number;
  createdAt: string;
}

export interface FeatTemplate {
  id: string;
  name: string;
  description?: string;
  tier: number;
  cost: number;
  icon?: string;
  effects?: any;
  createdAt: string;
}

export interface Feat {
  id: string;
  treeId: string;
  templateId?: string;
  name: string;
  description?: string;
  gridX: number;
  gridY: number;
  tier: number;
  cost: number;
  icon?: string;
  effects?: any;
  createdAt: string;
}

export interface FeatConnection {
  id: string;
  treeId: string;
  fromFeatId: string;
  toFeatId: string;
  isOptional: boolean;
}

export interface CharacterFeat {
  id: string;
  characterId: string;
  featId: string;
  unlockedAt: string;
}

export interface SystemSpell {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  school: string;
  level: number;
  castingTime: string;
  range: string;
  rangeNum?: number;
  duration: string;
  components: string;
  damageType?: string;
  damageDice?: string;
  healingDice?: string;
  mod?: number;
  attribute?: string;
  energyCost: number;
  manaCost?: number;
  concentration: boolean;
  ritual: boolean;
  targetType: string;
  areaSize?: string;
  aoe?: string;
  isAoe?: boolean;
  aoeRange?: number;
  aoeShape?: string;
  savingThrow?: string;
  effects: any;
  createdAt: string;
}

export interface FeatTreeWithData {
  tree: FeatTree;
  feats: Feat[];
  connections: FeatConnection[];
}

export interface SystemSkill {
  id: string;
  name: string;
  description?: string;
  parentAttribute: string;
  createdAt: string;
}

export interface CharacterCustomSkill {
  id: string;
  characterId: string;
  systemSkillId?: string;
  name: string;
  description?: string;
  parentAttribute: string;
  value: number;
  createdAt?: string;
}

export interface CampaignBan {
  id: string;
  campaignId: string;
  userId: string;
  bannedAt: string;
  reason?: string;
  username: string;
}

export interface CustomField {
  id: string;
  ownerType: string;
  ownerId: string;
  header: string;
  body?: string;
  // When true, this whole field is hidden from non-GM viewers — the server
  // omits it from the response entirely for them, it's never just CSS-hidden.
  gmOnly?: boolean;
  // GM-only companion note. The server strips this out of every response
  // sent to a non-GM viewer, so it's simply absent (undefined) for players.
  gmNotes?: string;
  sortOrder: number;
  createdAt: string;
}

export interface GameMap {
  id: string;
  ownerUserId: string;
  name: string;
  width: number;
  height: number;
  gridSize: number;
  mapType: string;
  terrainImage: string | null;
  thumbnail: string | null;
  activeVariantIndex: number;
  createdAt: string;
  updatedAt: string;
}

export interface MapObject {
  id: string;
  mapId: string;
  stampAssetId: string;
  x: number;
  y: number;
  rotation: number;
  width: number;
  height: number;
  zIndex: number;
  layer: string;
  createdAt: string;
}

export interface StampAssetVariant {
  id: string;
  stampAssetId: string;
  label: string;
  image: string;
  sortOrder: number;
  createdAt: string;
}

export interface StampAsset {
  id: string;
  name: string;
  category: string;
  createdByUserId: string;
  createdAt: string;
  variants: StampAssetVariant[];
}

export interface RollEntry {
  id: string;
  ownerType: string;
  ownerId: string;
  name: string;
  rollType: string;
  diceFormula?: string;
  mod?: number;
  damageType?: string;
  attribute?: string;
  applyToStat?: string;
  requiresMana?: boolean;
  manaCost?: number;
  sortOrder: number;
}

export interface SystemTrait {
  id: string;
  name: string;
  description?: string;
  parentAttribute: string;
  usesPerLongRest: number;
  usesPerShortRest?: number;
  createdAt: string;
}

export interface CharacterTrait {
  id: string;
  characterId: string;
  systemTraitId?: string;
  name: string;
  description?: string;
  parentAttribute: string;
  usesPerLongRest: number;
  usesPerShortRest?: number;
  currentUses: number;
  createdAt: string;
}

export interface UserProfile {
  id: string;
  username: string;
  name: string;
  avatarUrl?: string;
  bio?: string;
  theme?: string | null;
}

export interface FriendRequest {
  id: string;
  senderId: string;
  recipientId: string;
  status: string;
  message?: string;
  createdAt: string;
  respondedAt?: string;
}

export interface FriendRequestWithUser extends FriendRequest {
  sender?: UserProfile;
  recipient?: UserProfile;
}

export interface NoteFolder {
  id: string;
  userId: string;
  campaignId?: string | null;
  parentId?: string | null;
  name: string;
  color?: string | null;
  sortOrder: number;
  kind?: string;
  visibility?: string;
  visiblePlayerIds?: string[] | null;
  createdAt: string;
  updatedAt: string;
}

export interface Note {
  id: string;
  userId: string;
  campaignId?: string | null;
  folderId?: string | null;
  title: string;
  content: string;
  type: string;
  canvasData?: any;
  icon?: string | null;
  coverImage?: string | null;
  isPinned: boolean;
  isArchived: boolean;
  sortOrder: number;
  visibility?: string;
  visiblePlayerIds?: string[] | null;
  createdAt: string;
  updatedAt: string;
}

export interface NoteReference {
  id: string;
  noteId: string;
  entityType: string;
  entityId: string;
  label?: string | null;
  position?: number | null;
  createdAt: string;
}

export interface Timeline {
  id: string;
  userId: string;
  campaignId: string;
  name: string;
  description?: string | null;
  calendar?: { eraNames?: string[]; monthNames?: string[]; daysPerMonth?: number[] } | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeRevision {
  id: string;
  campaignId: string;
  actorUserId: string;
  entityType: string;
  entityId: string;
  action: "content" | "visibility" | "move" | "link" | "create" | "delete" | "import" | "scene_link" | "restore";
  before?: any;
  after?: any;
  createdAt: string;
}

export interface TimelineEvent {
  id: string;
  timelineId: string;
  campaignId: string;
  userId: string;
  title: string;
  description?: string | null;
  dateType: "exact" | "range" | "uncertain" | "relative" | "era" | "ordered";
  dateValue?: any;
  endDateValue?: any;
  sortOrder: number;
  tags?: string[] | null;
  category?: string | null;
  color?: string | null;
  image?: string | null;
  links?: { entityType: string; entityId: string; label?: string }[] | null;
  visibility: string;
  visiblePlayerIds?: string[] | null;
  createdAt: string;
  updatedAt: string;
}

export interface NoteShare {
  id: string;
  noteId?: string | null;
  folderId?: string | null;
  ownerId: string;
  sharedWithId: string;
  permission: string;
  createdAt: string;
}

export interface TokenEffect {
  id: string;
  name: string;
  imageUrl: string | null;
  description: string | null;
  timing: string;
  causesDamage: boolean;
  damageType: string | null;
  diceAmount: string | null;
  createdAt: Date;
}

export interface SpellEffect {
  id: string;
  spellId: string;
  effectId: string;
  triggerCondition: string;
  createdAt: Date;
  effect: TokenEffect;
}

export interface ItemEffect {
  id: string;
  itemId: string;
  effectId: string;
  triggerCondition: string;
  createdAt: Date;
  effect: TokenEffect;
}

export interface TokenActiveEffect {
  id: string;
  tokenId: string;
  effectId: string;
  sourceType: string | null;
  sourceId: string | null;
  appliedAt: Date;
  duration: number | null;
  effect: TokenEffect;
}

export interface ThrownItem {
  id: string;
  sceneId: string;
  itemId: string;
  characterId: string;
  x: number;
  y: number;
  attachedToTokenId?: string | null;
  createdAt: string;
  item?: {
    id: string;
    name: string;
    image?: string | null;
    detonateAoeRange?: number | null;
    detonateAoeShape?: string | null;
    isDetonatable?: boolean;
  } | null;
}

export interface BanDetails {
  isBanned: boolean;
  banExpiresAt?: string | null;
  banReason?: string | null;
}

type BanCallback = (banDetails: BanDetails) => void;

class ApiClient {
  private baseUrl = '/api';
  private banCallback: BanCallback | null = null;

  setBanCallback(callback: BanCallback | null) {
    this.banCallback = callback;
  }

  private async request<T>(url: string, options?: RequestInit): Promise<T> {
    // Propagate spectator scope so the server returns player-only data for
    // every API call made from a spectator tab — even if the user is the GM.
    // Derive directly from the URL so initial requests can't race a setter.
    const isSpectator =
      typeof window !== 'undefined' &&
      (() => {
        try {
          return new URLSearchParams(window.location.search).get('spectator') === '1';
        } catch {
          return false;
        }
      })();
    const spectatorHeaders: Record<string, string> = isSpectator ? { 'X-Spectator-Mode': '1' } : {};
    const response = await fetch(`${this.baseUrl}${url}`, {
      ...options,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...spectatorHeaders,
        ...options?.headers,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Request failed' }));
      
      if (response.status === 403 && error.banned) {
        const banDetails: BanDetails = {
          isBanned: true,
          banExpiresAt: error.banExpiresAt || null,
          banReason: error.banReason || null,
        };
        if (this.banCallback) {
          this.banCallback(banDetails);
        }
      }
      
      throw new Error(error.details || error.error || 'Request failed');
    }

    return response.json();
  }

  // Auth
  async register(email: string, password: string, username: string, name: string): Promise<{ user: User }> {
    return this.request('/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, username, name }),
    });
  }

  async login(email: string, password: string, rememberMe?: boolean): Promise<{ user: User }> {
    return this.request('/login', {
      method: 'POST',
      body: JSON.stringify({ email, password, rememberMe }),
    });
  }

  async logout(): Promise<void> {
    return this.request('/logout', { method: 'POST' });
  }

  async getMe(): Promise<{ user: User }> {
    return this.request('/me');
  }

  async updateTheme(theme: string): Promise<UserProfile> {
    return this.request('/profile/theme', {
      method: 'PUT',
      body: JSON.stringify({ theme }),
    });
  }

  // Campaigns
  async createCampaign(name: string, system?: string, gridSize?: number, currentMap?: string): Promise<Campaign> {
    return this.request('/campaigns', {
      method: 'POST',
      body: JSON.stringify({ name, system, gridSize, currentMap }),
    });
  }

  async getCampaigns(): Promise<{ created: Campaign[], joined: Campaign[] }> {
    return this.request('/campaigns');
  }

  async getCampaign(id: string): Promise<Campaign> {
    return this.request(`/campaigns/${id}`);
  }

  async updateCampaign(id: string, data: Partial<Campaign>): Promise<Campaign> {
    return this.request(`/campaigns/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async joinCampaign(inviteCode: string): Promise<Campaign> {
    return this.request('/campaigns/join', {
      method: 'POST',
      body: JSON.stringify({ inviteCode }),
    });
  }

  async deleteCampaign(id: string): Promise<void> {
    return this.request(`/campaigns/${id}`, { method: 'DELETE' });
  }

  async leaveCampaign(id: string): Promise<void> {
    return this.request(`/campaigns/${id}/leave`, { method: 'POST' });
  }

  async toggleFavorite(id: string): Promise<void> {
    return this.request(`/campaigns/${id}/favorite`, { method: 'POST' });
  }

  async duplicateCampaign(id: string): Promise<Campaign> {
    return this.request(`/campaigns/${id}/duplicate`, { method: 'POST' });
  }

  async getAssignedCharacter(campaignId: string): Promise<{ characterId: string | null }> {
    return this.request(`/campaigns/${campaignId}/assigned-character`);
  }

  async setAssignedCharacter(campaignId: string, characterId: string | null): Promise<void> {
    return this.request(`/campaigns/${campaignId}/assigned-character`, {
      method: 'POST',
      body: JSON.stringify({ characterId }),
    });
  }

  async getGmHotbar(campaignId: string): Promise<(string | null)[]> {
    return this.request(`/campaigns/${campaignId}/gm-hotbar`);
  }

  async updateGmHotbar(campaignId: string, hotbar: (string | null)[]): Promise<(string | null)[]> {
    return this.request(`/campaigns/${campaignId}/gm-hotbar`, {
      method: 'PUT',
      body: JSON.stringify({ hotbar }),
    });
  }

  // Characters
  async createCharacter(campaignId: string, character: Omit<Character, 'id' | 'userId' | 'campaignId'>): Promise<Character> {
    return this.request(`/campaigns/${campaignId}/characters`, {
      method: 'POST',
      body: JSON.stringify(character),
    });
  }

  async getCampaignCharacters(campaignId: string): Promise<Character[]> {
    return this.request(`/campaigns/${campaignId}/characters`);
  }

  async getCharacter(id: string): Promise<Character> {
    return this.request(`/characters/${id}`);
  }

  async updateCharacter(id: string, data: Partial<Character>): Promise<Character> {
    return this.request(`/characters/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteCharacter(id: string): Promise<{ success: boolean }> {
    return this.request(`/characters/${id}`, {
      method: 'DELETE',
    });
  }

  // Character Import (cross-campaign)
  async getImportableCharacters(campaignId: string): Promise<{ campaign: Campaign, characters: Character[] }[]> {
    return this.request(`/campaigns/${campaignId}/importable-characters`);
  }

  async importCharacter(campaignId: string, sourceCharacterId: string): Promise<Character> {
    return this.request(`/campaigns/${campaignId}/import-character`, {
      method: 'POST',
      body: JSON.stringify({ sourceCharacterId }),
    });
  }

  // Import a world-scoped library object into a campaign (independent copy).
  async importWorldItem(campaignId: string, worldItemId: string, characterId: string): Promise<Item> {
    return this.request(`/campaigns/${campaignId}/import-world-item`, {
      method: 'POST',
      body: JSON.stringify({ worldItemId, characterId }),
    });
  }

  async importWorldSpell(campaignId: string, worldSpellId: string, characterId: string): Promise<Spell> {
    return this.request(`/campaigns/${campaignId}/import-world-spell`, {
      method: 'POST',
      body: JSON.stringify({ worldSpellId, characterId }),
    });
  }

  async importWorldCharacter(campaignId: string, worldCharacterId: string): Promise<Character> {
    return this.request(`/campaigns/${campaignId}/import-world-character`, {
      method: 'POST',
      body: JSON.stringify({ worldCharacterId }),
    });
  }

  // Rest actions
  async shortRest(characterId: string, skipFood?: boolean): Promise<{
    success: boolean;
    hpRestored: number;
    energyRestored?: number;
    newHp: number;
    rationsConsumed: number;
    character: Character;
    dieType?: string;
    hpRoll?: number;
  }> {
    return this.request(`/characters/${characterId}/short-rest`, {
      method: 'POST',
      body: JSON.stringify({ skipFood: !!skipFood }),
    });
  }

  async longRest(characterId: string, skipFood?: boolean): Promise<{
    success: boolean;
    hpRestored: number;
    newHp: number;
    exhaustionRecovered: number;
    newExhaustion: number;
    rationsConsumed: number;
    character: Character;
  }> {
    return this.request(`/characters/${characterId}/long-rest`, {
      method: 'POST',
      body: JSON.stringify({ skipFood: !!skipFood }),
    });
  }

  // Tokens
  async createToken(campaignId: string, token: Omit<Token, 'id' | 'campaignId'>): Promise<Token> {
    return this.request(`/campaigns/${campaignId}/tokens`, {
      method: 'POST',
      body: JSON.stringify(token),
    });
  }

  async getCampaignTokens(campaignId: string, sceneId?: string): Promise<Token[]> {
    const url = sceneId 
      ? `/campaigns/${campaignId}/tokens?sceneId=${sceneId}`
      : `/campaigns/${campaignId}/tokens`;
    return this.request(url);
  }

  async updateToken(id: string, data: Partial<Token>): Promise<Token> {
    return this.request(`/tokens/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteToken(id: string): Promise<void> {
    return this.request(`/tokens/${id}`, { method: 'DELETE' });
  }

  // Chat
  async getCampaignMessages(campaignId: string): Promise<ChatMessage[]> {
    return this.request(`/campaigns/${campaignId}/messages`);
  }

  // Members
  async getCampaignMembers(campaignId: string): Promise<CampaignMember[]> {
    return this.request(`/campaigns/${campaignId}/members`);
  }

  // Member management (kick/ban)
  async kickMember(campaignId: string, userId: string): Promise<void> {
    return this.request(`/campaigns/${campaignId}/kick/${userId}`, { method: 'POST' });
  }

  async banMember(campaignId: string, userId: string, reason?: string): Promise<void> {
    return this.request(`/campaigns/${campaignId}/ban/${userId}`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  }

  async unbanMember(campaignId: string, userId: string): Promise<void> {
    return this.request(`/campaigns/${campaignId}/bans/${userId}`, { method: 'DELETE' });
  }

  async getCampaignBans(campaignId: string): Promise<CampaignBan[]> {
    return this.request(`/campaigns/${campaignId}/bans`);
  }

  async setMemberRole(campaignId: string, memberId: string, role: 'player' | 'assistant_gm'): Promise<CampaignMember> {
    return this.request(`/campaigns/${campaignId}/members/${memberId}/role`, {
      method: 'PATCH',
      body: JSON.stringify({ role }),
    });
  }

  async setTrustedPlayer(campaignId: string, memberId: string, trusted: boolean): Promise<CampaignMember> {
    return this.request(`/campaigns/${campaignId}/members/${memberId}/trusted-player`, {
      method: 'PATCH',
      body: JSON.stringify({ trusted }),
    });
  }

  async setMemberPinned(campaignId: string, memberId: string, pinned: boolean): Promise<CampaignMember> {
    return this.request(`/campaigns/${campaignId}/members/${memberId}/pinned`, {
      method: 'PATCH',
      body: JSON.stringify({ pinned }),
    });
  }

  async updateBeaconColor(campaignId: string, beaconColor: string): Promise<CampaignMember> {
    return this.request(`/campaigns/${campaignId}/beacon-color`, {
      method: 'PATCH',
      body: JSON.stringify({ beaconColor }),
    });
  }
  
  // Chat
  async getChatMessages(campaignId: string): Promise<ChatMessage[]> {
    return this.request(`/campaigns/${campaignId}/chat`);
  }

  async clearChatMessages(campaignId: string): Promise<void> {
    return this.request(`/campaigns/${campaignId}/chat`, { method: 'DELETE' });
  }

  async getRollFeed(campaignId: string): Promise<any[]> {
    return this.request(`/campaigns/${campaignId}/roll-feed`);
  }

  // Scenes
  async getScenes(campaignId: string): Promise<Scene[]> {
    return this.request(`/campaigns/${campaignId}/scenes`);
  }

  async createScene(campaignId: string, scene: Partial<Scene>): Promise<Scene> {
    return this.request(`/campaigns/${campaignId}/scenes`, {
      method: 'POST',
      body: JSON.stringify(scene),
    });
  }

  async getScene(sceneId: string): Promise<Scene> {
    return this.request(`/scenes/${sceneId}`);
  }

  async updateScene(sceneId: string, data: Partial<Scene>): Promise<Scene> {
    return this.request(`/scenes/${sceneId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteScene(sceneId: string): Promise<void> {
    return this.request(`/scenes/${sceneId}`, { method: 'DELETE' });
  }

  // Thrown Items
  async getThrownItems(sceneId: string): Promise<ThrownItem[]> {
    return this.request(`/scenes/${sceneId}/thrown-items`);
  }

  async createThrownItem(sceneId: string, data: { itemId: string; characterId: string; x: number; y: number; attachedToTokenId?: string | null }): Promise<ThrownItem> {
    return this.request(`/scenes/${sceneId}/thrown-items`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async deleteThrownItem(id: string): Promise<void> {
    return this.request(`/thrown-items/${id}`, { method: 'DELETE' });
  }

  async detonateThrownItems(itemId: string): Promise<void> {
    return this.request(`/thrown-items/item/${itemId}/detonate`, { method: 'DELETE' });
  }

  // Hotbars
  async getHotbars(characterId: string): Promise<Hotbar[]> {
    return this.request(`/characters/${characterId}/hotbars`);
  }

  async upsertHotbar(characterId: string, hotbar: Omit<Hotbar, 'id' | 'characterId'>): Promise<Hotbar> {
    return this.request(`/characters/${characterId}/hotbars`, {
      method: 'POST',
      body: JSON.stringify(hotbar),
    });
  }

  async deleteHotbar(id: string): Promise<void> {
    return this.request(`/hotbars/${id}`, { method: 'DELETE' });
  }

  // AA V3 free hotbar (per-user, per-campaign loadouts)
  async getFreeHotbar(campaignId: string): Promise<any[]> {
    return this.request(`/campaigns/${campaignId}/free-hotbar`);
  }

  async setFreeHotbarSlot(campaignId: string, data: { loadoutIndex: number; slotIndex: number; characterId?: string | null; itemId?: string | null }): Promise<any> {
    return this.request(`/campaigns/${campaignId}/free-hotbar`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteFreeHotbarEntry(campaignId: string, entryId: string): Promise<void> {
    return this.request(`/campaigns/${campaignId}/free-hotbar/${entryId}`, { method: 'DELETE' });
  }

  async getFreeHotbarCharacters(campaignId: string): Promise<{ id: string; name: string; portrait: string | null; userId: string | null; canEdit: boolean }[]> {
    return this.request(`/campaigns/${campaignId}/free-hotbar/characters`);
  }

  async equipItem(id: string, equipped: boolean): Promise<{ item: Item; unequippedIds: string[] }> {
    return this.request(`/items/${id}/equip`, {
      method: 'POST',
      body: JSON.stringify({ equipped }),
    });
  }

  // Items
  async getItems(characterId: string): Promise<Item[]> {
    return this.request(`/characters/${characterId}/items`);
  }

  async createItem(characterId: string, item: Partial<Item>): Promise<Item> {
    return this.request(`/characters/${characterId}/items`, {
      method: 'POST',
      body: JSON.stringify(item),
    });
  }

  async updateItem(id: string, data: Partial<Item>): Promise<Item> {
    return this.request(`/items/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteItem(id: string): Promise<void> {
    return this.request(`/items/${id}`, { method: 'DELETE' });
  }

  async syncItemTechniques(characterId: string, itemId: string): Promise<Item> {
    return this.request(`/characters/${characterId}/items/${itemId}/sync-techniques`, {
      method: 'POST',
    });
  }

  // AA V3 runes & multi-purpose scrolls (Task #198)
  async socketRune(characterId: string, itemId: string, runeItemId: string): Promise<Item> {
    return this.request(`/characters/${characterId}/items/${itemId}/socket-rune`, {
      method: 'POST',
      body: JSON.stringify({ runeItemId }),
    });
  }

  async removeRune(characterId: string, itemId: string, slotIndex: number): Promise<Item> {
    return this.request(`/characters/${characterId}/items/${itemId}/remove-rune`, {
      method: 'POST',
      body: JSON.stringify({ slotIndex }),
    });
  }

  async useScroll(characterId: string, itemId: string): Promise<any> {
    return this.request(`/characters/${characterId}/items/${itemId}/use-scroll`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
  }

  // GM-only: reverse a permanent V3 skill-boost (from skill scrolls). action
  // 'decrement' lowers the boost by `amount` (default 1, removed at <= 0);
  // 'clear' removes the entry entirely. AA V3 only.
  async adjustV3SkillBoost(
    characterId: string,
    skillKey: string,
    action: 'decrement' | 'clear',
    amount = 1,
  ): Promise<any> {
    return this.request(`/characters/${characterId}/v3-skill-boost`, {
      method: 'POST',
      body: JSON.stringify({ skillKey, action, amount }),
    });
  }

  // Crafter Recipes (AA V2 only)
  async getCraftRecipes(itemId: string): Promise<any[]> {
    return this.request(`/items/${itemId}/recipes`);
  }
  async createCraftRecipe(itemId: string, data: any): Promise<any> {
    return this.request(`/admin/items/${itemId}/recipes`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }
  async updateCraftRecipe(recipeId: string, data: any): Promise<any> {
    return this.request(`/admin/recipes/${recipeId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }
  async deleteCraftRecipe(recipeId: string): Promise<void> {
    return this.request(`/admin/recipes/${recipeId}`, { method: 'DELETE' });
  }
  // Item build recipe (the item's OWN crafting recipe)
  async getItemBuildRecipe(itemId: string): Promise<{ buildRecipe: any | null }> {
    return this.request(`/admin/items/${itemId}/build-recipe`);
  }
  async saveItemBuildRecipe(itemId: string, data: { outputQuantity: number; ingredients: any[] }): Promise<{ buildRecipe: any }> {
    return this.request(`/admin/items/${itemId}/build-recipe`, { method: 'PUT', body: JSON.stringify(data) });
  }
  async deleteItemBuildRecipe(itemId: string): Promise<{ success: boolean }> {
    return this.request(`/admin/items/${itemId}/build-recipe`, { method: 'DELETE' });
  }
  async getItemsWithBuildRecipes(system: string = 'aa-v2', personal?: boolean): Promise<Array<{ id: string; name: string; image: string | null; price: number; currency: string; itemType: string }>> {
    return this.request(`/admin/items-with-build-recipes?system=${encodeURIComponent(system)}${personal ? '&personal=1' : ''}`);
  }
  async addItemRecipeToTemplate(templateId: string, itemId: string): Promise<any> {
    return this.request(`/admin/crafter-recipe-templates/${templateId}/add-item-recipe`, { method: 'POST', body: JSON.stringify({ itemId }) });
  }
  async addItemRecipeToCrafter(crafterItemId: string, itemId: string): Promise<any> {
    return this.request(`/admin/items/${crafterItemId}/add-item-recipe`, { method: 'POST', body: JSON.stringify({ itemId }) });
  }
  async craftRecipe(itemId: string, body: { recipeId: string; characterId: string }): Promise<any> {
    return this.request(`/items/${itemId}/craft`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }
  async repairItem(itemId: string, body: { recipeId: string; characterId: string; targetItemId: string }): Promise<any> {
    return this.request(`/items/${itemId}/repair`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  // AA V3 Advanced Item Types (admin CRUD + public read)
  async getAdminAdvancedItemTypes(personal?: boolean): Promise<AdvancedItemType[]> {
    const params = personal ? '?personal=true' : '';
    return this.request(`/admin/advanced-item-types${params}`);
  }
  async getAdvancedItemTypes(personal?: boolean): Promise<AdvancedItemType[]> {
    const params = personal ? '?personal=true' : '';
    return this.request(`/admin/advanced-item-types${params}`);
  }
  async createAdvancedItemType(data: { name: string; sortOrder?: number; personal?: boolean }): Promise<AdvancedItemType> {
    return this.request(`/admin/advanced-item-types`, { method: 'POST', body: JSON.stringify(data) });
  }
  async updateAdvancedItemType(id: string, data: Partial<{ name: string; sortOrder: number }>): Promise<AdvancedItemType> {
    return this.request(`/admin/advanced-item-types/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
  }
  async deleteAdvancedItemType(id: string): Promise<{ success: boolean }> {
    return this.request(`/admin/advanced-item-types/${id}`, { method: 'DELETE' });
  }

  // Crafter Recipe Templates (AA V2 only)
  async listCrafterRecipeTemplates(system: string = 'aa-v2', personal?: boolean): Promise<any[]> {
    return this.request(`/admin/crafter-recipe-templates?system=${encodeURIComponent(system)}${personal ? '&personal=1' : ''}`);
  }
  async getCrafterRecipeTemplate(id: string): Promise<any> {
    return this.request(`/admin/crafter-recipe-templates/${id}`);
  }
  async createCrafterRecipeTemplate(data: any): Promise<any> {
    return this.request(`/admin/crafter-recipe-templates`, { method: 'POST', body: JSON.stringify(data) });
  }
  async updateCrafterRecipeTemplate(id: string, patch: any): Promise<any> {
    return this.request(`/admin/crafter-recipe-templates/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
  }
  async deleteCrafterRecipeTemplate(id: string): Promise<void> {
    return this.request(`/admin/crafter-recipe-templates/${id}`, { method: 'DELETE' });
  }
  async createCrafterTemplateRecipe(templateId: string, data: any): Promise<any> {
    return this.request(`/admin/crafter-recipe-templates/${templateId}/recipes`, { method: 'POST', body: JSON.stringify(data) });
  }
  async getCrafterTemplateLinks(itemId: string): Promise<{ templateIds: string[] }> {
    return this.request(`/admin/items/${itemId}/crafter-template-links`);
  }
  async setCrafterTemplateLinks(itemId: string, templateIds: string[]): Promise<{ templateIds: string[] }> {
    return this.request(`/admin/items/${itemId}/crafter-template-links`, { method: 'PUT', body: JSON.stringify({ templateIds }) });
  }

  // Spells
  async getSpells(characterId: string): Promise<Spell[]> {
    return this.request(`/characters/${characterId}/spells`);
  }

  async createSpell(characterId: string, spell: Partial<Spell>): Promise<Spell> {
    return this.request(`/characters/${characterId}/spells`, {
      method: 'POST',
      body: JSON.stringify(spell),
    });
  }

  async updateSpell(id: string, data: Partial<Spell>): Promise<Spell> {
    return this.request(`/spells/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteSpell(id: string): Promise<void> {
    return this.request(`/spells/${id}`, { method: 'DELETE' });
  }

  // Roll Entries
  async getItemRolls(itemId: string): Promise<RollEntry[]> {
    return this.request(`/items/${itemId}/rolls`);
  }

  async getSpellRolls(spellId: string): Promise<RollEntry[]> {
    return this.request(`/spells/${spellId}/rolls`);
  }

  async getTraitRolls(traitId: string): Promise<RollEntry[]> {
    return this.request(`/character-traits/${traitId}/rolls`);
  }

  async createRollEntry(data: Partial<RollEntry>): Promise<RollEntry> {
    return this.request('/roll-entries', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateRollEntry(id: string, data: Partial<RollEntry>): Promise<RollEntry> {
    return this.request(`/roll-entries/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteRollEntry(id: string): Promise<void> {
    return this.request(`/roll-entries/${id}`, { method: 'DELETE' });
  }

  async resetRollEntryToTemplate(id: string): Promise<RollEntry> {
    return this.request(`/roll-entries/${id}/reset-template`, { method: 'POST' });
  }

  // Custom Fields (C.A. only)
  async getItemCustomFields(itemId: string): Promise<CustomField[]> {
    return this.request(`/items/${itemId}/custom-fields`);
  }

  async getCharacterCustomFields(characterId: string): Promise<CustomField[]> {
    return this.request(`/characters/${characterId}/custom-fields`);
  }

  async createCustomField(data: Partial<CustomField>): Promise<CustomField> {
    return this.request('/custom-fields', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateCustomField(id: string, data: Partial<CustomField>): Promise<CustomField> {
    return this.request(`/custom-fields/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteCustomField(id: string): Promise<void> {
    return this.request(`/custom-fields/${id}`, { method: 'DELETE' });
  }

  // Map Maker
  async getMaps(): Promise<GameMap[]> {
    return this.request('/maps');
  }

  async createMap(data: { name?: string; width?: number; height?: number; gridSize?: number; mapType?: string }): Promise<GameMap> {
    return this.request('/maps', { method: 'POST', body: JSON.stringify(data) });
  }

  async getMap(id: string): Promise<GameMap & { objects: MapObject[] }> {
    return this.request(`/maps/${id}`);
  }

  async updateMap(id: string, data: Partial<GameMap>): Promise<GameMap> {
    return this.request(`/maps/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
  }

  async deleteMap(id: string): Promise<void> {
    return this.request(`/maps/${id}`, { method: 'DELETE' });
  }

  async createMapObject(mapId: string, data: { stampAssetId: string; x: number; y: number; rotation?: number; width?: number; height?: number; zIndex?: number; layer?: string }): Promise<MapObject> {
    return this.request(`/maps/${mapId}/objects`, { method: 'POST', body: JSON.stringify(data) });
  }

  async updateMapObject(id: string, data: Partial<MapObject>): Promise<MapObject> {
    return this.request(`/map-objects/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
  }

  async deleteMapObject(id: string): Promise<void> {
    return this.request(`/map-objects/${id}`, { method: 'DELETE' });
  }

  async getStampAssets(): Promise<StampAsset[]> {
    return this.request('/stamp-assets');
  }

  async createStampAsset(data: { name: string; category?: string }): Promise<StampAsset> {
    return this.request('/stamp-assets', { method: 'POST', body: JSON.stringify(data) });
  }

  async updateStampAsset(id: string, data: { name?: string; category?: string }): Promise<StampAsset> {
    return this.request(`/stamp-assets/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
  }

  async deleteStampAsset(id: string): Promise<void> {
    return this.request(`/stamp-assets/${id}`, { method: 'DELETE' });
  }

  async createStampAssetVariant(stampAssetId: string, data: { label: string; image: string; sortOrder?: number }): Promise<StampAssetVariant> {
    return this.request(`/stamp-assets/${stampAssetId}/variants`, { method: 'POST', body: JSON.stringify(data) });
  }

  async updateStampAssetVariant(id: string, data: { label?: string; image?: string; sortOrder?: number }): Promise<StampAssetVariant> {
    return this.request(`/stamp-asset-variants/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
  }

  async deleteStampAssetVariant(id: string): Promise<void> {
    return this.request(`/stamp-asset-variants/${id}`, { method: 'DELETE' });
  }

  async registerSceneFromUpload(campaignId: string, image: string, name?: string): Promise<Scene> {
    return this.request(`/campaigns/${campaignId}/scenes/from-upload`, {
      method: 'POST',
      body: JSON.stringify({ image, name }),
    });
  }

  async importMapToScene(mapId: string, data: { campaignId: string; image: string; name?: string }): Promise<any> {
    return this.request(`/maps/${mapId}/import-to-scene`, { method: 'POST', body: JSON.stringify(data) });
  }

  async uploadBase64Image(dataUrl: string): Promise<{ url: string }> {
    return this.request('/upload/base64', { method: 'POST', body: JSON.stringify({ data: dataUrl }) });
  }

  // Public system item (single item for entity references)
  async getSystemItem(id: string): Promise<Item> {
    return this.request(`/system-items/${id}`);
  }

  // Lightweight item summaries for fast picker loading (no images to avoid response size limits)
  async getSystemItemSummaries(system?: string, campaignId?: string, personal?: boolean): Promise<{ id: string; name: string; itemType: string; rarity: string; weight: number; price: number; currency: string }[]> {
    const qs = new URLSearchParams();
    if (system) qs.set('system', system);
    if (campaignId) qs.set('campaignId', campaignId);
    if (personal) qs.set('personal', '1');
    const s = qs.toString();
    return this.request(`/system-items/summary${s ? `?${s}` : ''}`);
  }

  async getTemplateItemSummaries(campaignId: string): Promise<{ campaignItems: { id: string; name: string; itemType: string; rarity: string; weight: number; price: number; currency: string }[], systemItems: { id: string; name: string; itemType: string; rarity: string; weight: number; price: number; currency: string }[] }> {
    return this.request(`/campaigns/${campaignId}/template-items/summary`);
  }

  // Lazy-load individual item image for item picker
  async getItemImage(itemId: string): Promise<{ image: string | null }> {
    return this.request(`/items/${itemId}/image`);
  }

  // Admin System Items
  async getSystemItems(system?: string, campaignId?: string, personal?: boolean, worldId?: string): Promise<Item[]> {
    const qs = new URLSearchParams();
    if (system) qs.set('system', system);
    if (campaignId) qs.set('campaignId', campaignId);
    if (personal) qs.set('personal', '1');
    if (worldId) qs.set('worldId', worldId);
    const s = qs.toString();
    return this.request(`/admin/system-items${s ? `?${s}` : ''}`);
  }

  // Public System Items (for notes graph and entity references)
  async getPublicSystemItems(campaignId?: string): Promise<Item[]> {
    const params = campaignId ? `?campaignId=${encodeURIComponent(campaignId)}` : '';
    return this.request(`/system-items${params}`);
  }

  // Get all characters the user has access to (for notes graph)
  async getMyCharacters(): Promise<Character[]> {
    return this.request('/my-characters');
  }

  async createSystemItem(item: Partial<Item>): Promise<Item> {
    return this.request('/admin/system-items', {
      method: 'POST',
      body: JSON.stringify(item),
    });
  }

  async updateSystemItem(id: string, data: Partial<Item>): Promise<Item> {
    return this.request(`/admin/system-items/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteSystemItem(id: string): Promise<void> {
    return this.request(`/admin/system-items/${id}`, { method: 'DELETE' });
  }

  async archiveSystemItem(id: string): Promise<any> {
    return this.request(`/admin/system-items/${id}/archive`, { method: 'POST' });
  }

  async restoreSystemItem(id: string): Promise<any> {
    return this.request(`/admin/system-items/${id}/restore`, { method: 'POST' });
  }

  async archiveAllSystemItems(system?: string): Promise<void> {
    return this.request('/admin/system-items/archive-all', { method: 'POST', body: system ? JSON.stringify({ system }) : undefined });
  }

  // Item Templates (admin live templates whose roll edits propagate to linked items)
  async getItemTemplates(system?: string, personal?: boolean): Promise<Item[]> {
    const qs = new URLSearchParams();
    if (system) qs.set('system', system);
    if (personal) qs.set('personal', '1');
    const s = qs.toString();
    return this.request(`/admin/item-templates${s ? `?${s}` : ''}`);
  }

  async getItemTemplate(id: string): Promise<Item> {
    return this.request(`/admin/item-templates/${id}`);
  }

  async createItemTemplate(item: Partial<Item>): Promise<Item> {
    return this.request('/admin/item-templates', {
      method: 'POST',
      body: JSON.stringify(item),
    });
  }

  async updateItemTemplate(id: string, data: Partial<Item>): Promise<Item> {
    return this.request(`/admin/item-templates/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteItemTemplate(id: string): Promise<void> {
    return this.request(`/admin/item-templates/${id}`, { method: 'DELETE' });
  }

  async linkItemToTemplate(itemId: string, templateId: string | null): Promise<{ success: boolean; templateItemId: string | null }> {
    return this.request(`/items/${itemId}/link-template`, {
      method: 'POST',
      body: JSON.stringify({ templateId }),
    });
  }

  // Multi-template links for AAv2 admin item dialog
  async getItemTemplateLinks(itemId: string): Promise<{ templateIds: string[] }> {
    return this.request(`/items/${itemId}/template-links`);
  }

  async setItemTemplateLinks(itemId: string, templateIds: string[]): Promise<{ templateIds: string[] }> {
    return this.request(`/items/${itemId}/template-links`, {
      method: 'PUT',
      body: JSON.stringify({ templateIds }),
    });
  }

  // Spell ↔ unified Roll Templates link management. Roll Templates are
  // shared with items (admin item-templates pool); link IDs reference items.id.
  async getSpellTemplateLinks(spellId: string): Promise<{ templateIds: string[] }> {
    return this.request(`/spells/${spellId}/template-links`);
  }

  async setSpellTemplateLinks(spellId: string, templateIds: string[]): Promise<{ templateIds: string[] }> {
    return this.request(`/spells/${spellId}/template-links`, {
      method: 'PUT',
      body: JSON.stringify({ templateIds }),
    });
  }

  async copyItemToSystem(id: string, targetSystem: string): Promise<Item> {
    return this.request(`/admin/system-items/${id}/copy-to-system`, {
      method: 'POST',
      body: JSON.stringify({ targetSystem }),
    });
  }

  async duplicateSystemItem(id: string): Promise<Item> {
    return this.request(`/admin/system-items/${id}/duplicate`, {
      method: 'POST',
    });
  }

  async copySpellToSystem(id: string, targetSystem: string): Promise<SystemSpell> {
    return this.request(`/admin/spells/${id}/copy-to-system`, {
      method: 'POST',
      body: JSON.stringify({ targetSystem }),
    });
  }

  async duplicateSystemSpell(id: string): Promise<SystemSpell> {
    return this.request(`/admin/spells/${id}/duplicate`, {
      method: 'POST',
    });
  }

  async getArchivedItems(system?: string, personal?: boolean): Promise<any[]> {
    const qs = new URLSearchParams();
    if (system) qs.set('system', system);
    if (personal) qs.set('personal', 'true');
    const params = qs.toString() ? `?${qs.toString()}` : '';
    return this.request(`/admin/archived-items${params}`);
  }

  async archiveSystemSpell(id: string): Promise<any> {
    return this.request(`/admin/system-spells/${id}/archive`, { method: 'POST' });
  }

  async restoreSystemSpell(id: string): Promise<any> {
    return this.request(`/admin/system-spells/${id}/restore`, { method: 'POST' });
  }

  async archiveAllSystemSpells(system?: string): Promise<void> {
    return this.request('/admin/system-spells/archive-all', { method: 'POST', body: system ? JSON.stringify({ system }) : undefined });
  }

  async bulkArchiveItems(ids: string[]): Promise<void> {
    await fetch('/api/admin/system-items/bulk-archive', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }), credentials: 'include' });
  }

  async bulkRestoreItems(ids: string[]): Promise<void> {
    await fetch('/api/admin/system-items/bulk-restore', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }), credentials: 'include' });
  }

  async bulkDeleteItems(ids: string[]): Promise<void> {
    await fetch('/api/admin/system-items/bulk-delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }), credentials: 'include' });
  }

  async bulkArchiveSpells(ids: string[]): Promise<void> {
    await fetch('/api/admin/system-spells/bulk-archive', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }), credentials: 'include' });
  }

  async bulkRestoreSpells(ids: string[]): Promise<void> {
    await fetch('/api/admin/system-spells/bulk-restore', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }), credentials: 'include' });
  }

  async bulkDeleteSpells(ids: string[]): Promise<void> {
    await fetch('/api/admin/system-spells/bulk-delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }), credentials: 'include' });
  }

  async getArchivedSpells(system?: string, personal?: boolean): Promise<any[]> {
    const qs = new URLSearchParams();
    if (system) qs.set('system', system);
    if (personal) qs.set('personal', 'true');
    const params = qs.toString() ? `?${qs.toString()}` : '';
    return this.request(`/admin/archived-spells${params}`);
  }

  // Admin System Species
  async getSystemSpecies(systemName?: string, campaignId?: string, personal?: boolean): Promise<SystemSpecies[]> {
    const qs = new URLSearchParams();
    if (systemName) qs.set('system', systemName);
    if (campaignId) qs.set('campaignId', campaignId);
    if (personal) qs.set('personal', '1');
    const s = qs.toString();
    return this.request(`/admin/system-species${s ? `?${s}` : ''}`);
  }

  async createSystemSpecies(species: Partial<SystemSpecies>): Promise<SystemSpecies> {
    return this.request('/admin/system-species', {
      method: 'POST',
      body: JSON.stringify(species),
    });
  }

  async updateSystemSpecies(id: string, data: Partial<SystemSpecies>): Promise<SystemSpecies> {
    return this.request(`/admin/system-species/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteSystemSpecies(id: string): Promise<void> {
    return this.request(`/admin/system-species/${id}`, { method: 'DELETE' });
  }

  // Public species (for character creation)
  async getSpecies(systemName?: string, campaignId?: string): Promise<SystemSpecies[]> {
    const qs = new URLSearchParams();
    if (systemName) qs.set('system', systemName);
    if (campaignId) qs.set('campaignId', campaignId);
    const s = qs.toString();
    return this.request(`/species${s ? `?${s}` : ''}`);
  }

  // Campaign Species (GM-managed species for the campaign)
  async getCampaignSpecies(campaignId: string): Promise<CampaignSpecies[]> {
    return this.request(`/campaigns/${campaignId}/species`);
  }

  async createCampaignSpecies(campaignId: string, species: Partial<CampaignSpecies>): Promise<CampaignSpecies> {
    return this.request(`/campaigns/${campaignId}/species`, {
      method: 'POST',
      body: JSON.stringify(species),
    });
  }

  async updateCampaignSpecies(campaignId: string, speciesId: string, data: Partial<CampaignSpecies>): Promise<CampaignSpecies> {
    return this.request(`/campaigns/${campaignId}/species/${speciesId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteCampaignSpecies(campaignId: string, speciesId: string): Promise<void> {
    return this.request(`/campaigns/${campaignId}/species/${speciesId}`, { method: 'DELETE' });
  }

  // Character Folders (for organizing characters in campaigns)
  async getCampaignFolders(campaignId: string): Promise<CharacterFolder[]> {
    return this.request(`/campaigns/${campaignId}/folders`);
  }

  async createCharacterFolder(campaignId: string, data: { name: string; sortOrder?: number }): Promise<CharacterFolder> {
    return this.request(`/campaigns/${campaignId}/folders`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateCharacterFolder(campaignId: string, folderId: string, data: Partial<CharacterFolder>): Promise<CharacterFolder> {
    return this.request(`/campaigns/${campaignId}/folders/${folderId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteCharacterFolder(campaignId: string, folderId: string): Promise<void> {
    return this.request(`/campaigns/${campaignId}/folders/${folderId}`, { method: 'DELETE' });
  }

  async moveCharacterToFolder(characterId: string, folderId: string | null): Promise<Character> {
    return this.request(`/characters/${characterId}/folder`, {
      method: 'PATCH',
      body: JSON.stringify({ folderId }),
    });
  }

  // Scene Folders (for organizing scenes in campaigns)
  async getSceneFolders(campaignId: string): Promise<SceneFolder[]> {
    return this.request(`/campaigns/${campaignId}/scene-folders`);
  }

  async createSceneFolder(campaignId: string, data: { name: string; sortOrder?: number }): Promise<SceneFolder> {
    return this.request(`/campaigns/${campaignId}/scene-folders`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateSceneFolder(campaignId: string, folderId: string, data: Partial<SceneFolder>): Promise<SceneFolder> {
    return this.request(`/campaigns/${campaignId}/scene-folders/${folderId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteSceneFolder(campaignId: string, folderId: string): Promise<void> {
    return this.request(`/campaigns/${campaignId}/scene-folders/${folderId}`, { method: 'DELETE' });
  }

  async moveSceneToFolder(sceneId: string, folderId: string | null): Promise<Scene> {
    return this.request(`/scenes/${sceneId}/folder`, {
      method: 'PATCH',
      body: JSON.stringify({ folderId }),
    });
  }

  async setActiveScene(campaignId: string, sceneId: string | null): Promise<Campaign> {
    return this.request(`/campaigns/${campaignId}/active-scene`, {
      method: 'PATCH',
      body: JSON.stringify({ sceneId }),
    });
  }

  // Admin Feat Templates
  async getFeatTemplates(): Promise<FeatTemplate[]> {
    return this.request('/admin/feat-templates');
  }

  async getFeatTemplate(id: string): Promise<FeatTemplate> {
    return this.request(`/admin/feat-templates/${id}`);
  }

  async createFeatTemplate(template: Partial<FeatTemplate>): Promise<FeatTemplate> {
    return this.request('/admin/feat-templates', {
      method: 'POST',
      body: JSON.stringify(template),
    });
  }

  async updateFeatTemplate(id: string, data: Partial<FeatTemplate>): Promise<FeatTemplate> {
    return this.request(`/admin/feat-templates/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteFeatTemplate(id: string): Promise<void> {
    return this.request(`/admin/feat-templates/${id}`, { method: 'DELETE' });
  }

  // Admin System Spells
  async getSystemSpells(system?: string, personal?: boolean, worldId?: string): Promise<SystemSpell[]> {
    const qs = new URLSearchParams();
    if (system) qs.set('system', system);
    if (personal) qs.set('personal', '1');
    if (worldId) qs.set('worldId', worldId);
    const s = qs.toString();
    return this.request(`/admin/spells${s ? `?${s}` : ''}`);
  }

  // Lightweight summaries (no icon base64, no effects jsonb) for fast loading
  async getSystemSpellSummaries(system?: string, campaignId?: string, personal?: boolean): Promise<any[]> {
    const qs = new URLSearchParams();
    if (system) qs.set('system', system);
    if (campaignId) qs.set('campaignId', campaignId);
    if (personal) qs.set('personal', '1');
    const s = qs.toString();
    return this.request(`/system-spells/summary${s ? `?${s}` : ''}`);
  }

  // Lazy-load individual spell icon for spell pickers
  async getSystemSpellIcon(spellId: string): Promise<{ icon: string | null }> {
    return this.request(`/system-spells/${spellId}/icon`);
  }

  async getSystemSpell(id: string): Promise<SystemSpell> {
    return this.request(`/admin/spells/${id}`);
  }

  async createSystemSpell(spell: Partial<SystemSpell>): Promise<SystemSpell> {
    return this.request('/admin/spells', {
      method: 'POST',
      body: JSON.stringify(spell),
    });
  }

  async updateSystemSpell(id: string, data: Partial<SystemSpell>): Promise<SystemSpell> {
    return this.request(`/admin/spells/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteSystemSpell(id: string): Promise<void> {
    return this.request(`/admin/spells/${id}`, { method: 'DELETE' });
  }

  // Admin System Skills
  async getSystemSkills(system?: string, personal?: boolean): Promise<SystemSkill[]> {
    const p = new URLSearchParams();
    if (system) p.set('system', system);
    if (personal) p.set('personal', 'true');
    const qs = p.toString();
    return this.request(`/admin/skills${qs ? '?' + qs : ''}`);
  }

  async getSystemSkill(id: string): Promise<SystemSkill> {
    return this.request(`/admin/skills/${id}`);
  }

  async createSystemSkill(skill: Partial<SystemSkill>): Promise<SystemSkill> {
    return this.request('/admin/skills', {
      method: 'POST',
      body: JSON.stringify(skill),
    });
  }

  async updateSystemSkill(id: string, data: Partial<SystemSkill>): Promise<SystemSkill> {
    return this.request(`/admin/skills/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteSystemSkill(id: string): Promise<void> {
    return this.request(`/admin/skills/${id}`, { method: 'DELETE' });
  }

  // Public skills (for character sheet)
  async getPublicSkills(system?: string): Promise<SystemSkill[]> {
    const params = system ? `?system=${encodeURIComponent(system)}` : '';
    return this.request(`/skills${params}`);
  }

  // Character Custom Skills
  async getCharacterCustomSkills(characterId: string): Promise<CharacterCustomSkill[]> {
    return this.request(`/characters/${characterId}/custom-skills`);
  }

  async addCharacterCustomSkill(characterId: string, skill: Partial<CharacterCustomSkill>): Promise<CharacterCustomSkill> {
    return this.request(`/characters/${characterId}/custom-skills`, {
      method: 'POST',
      body: JSON.stringify(skill),
    });
  }

  async updateCharacterCustomSkill(characterId: string, skillId: string, data: Partial<CharacterCustomSkill>): Promise<CharacterCustomSkill> {
    return this.request(`/characters/${characterId}/custom-skills/${skillId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async removeCharacterCustomSkill(characterId: string, skillId: string): Promise<void> {
    return this.request(`/characters/${characterId}/custom-skills/${skillId}`, { method: 'DELETE' });
  }

  // Admin System Traits
  async getSystemTraits(system?: string, personal?: boolean): Promise<SystemTrait[]> {
    const p = new URLSearchParams();
    if (system) p.set('system', system);
    if (personal) p.set('personal', 'true');
    const qs = p.toString();
    return this.request(`/admin/traits${qs ? '?' + qs : ''}`);
  }

  async getSystemTrait(id: string): Promise<SystemTrait> {
    return this.request(`/admin/traits/${id}`);
  }

  async createSystemTrait(trait: Partial<SystemTrait>): Promise<SystemTrait> {
    return this.request('/admin/traits', {
      method: 'POST',
      body: JSON.stringify(trait),
    });
  }

  async updateSystemTrait(id: string, data: Partial<SystemTrait>): Promise<SystemTrait> {
    return this.request(`/admin/traits/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteSystemTrait(id: string): Promise<void> {
    return this.request(`/admin/traits/${id}`, { method: 'DELETE' });
  }

  // Public traits (for character sheet)
  async getPublicTraits(system?: string): Promise<SystemTrait[]> {
    const params = system ? `?system=${encodeURIComponent(system)}` : '';
    return this.request(`/traits${params}`);
  }

  // Character Traits
  async getCharacterTraits(characterId: string): Promise<CharacterTrait[]> {
    return this.request(`/characters/${characterId}/traits`);
  }

  async addCharacterTrait(characterId: string, trait: Partial<CharacterTrait>): Promise<CharacterTrait> {
    return this.request(`/characters/${characterId}/traits`, {
      method: 'POST',
      body: JSON.stringify(trait),
    });
  }

  async updateCharacterTrait(characterId: string, traitId: string, data: Partial<CharacterTrait>): Promise<CharacterTrait> {
    return this.request(`/characters/${characterId}/traits/${traitId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async removeCharacterTrait(characterId: string, traitId: string): Promise<void> {
    return this.request(`/characters/${characterId}/traits/${traitId}`, { method: 'DELETE' });
  }

  async useCharacterTrait(characterId: string, traitId: string): Promise<CharacterTrait> {
    return this.request(`/characters/${characterId}/traits/${traitId}/use`, {
      method: 'POST',
    });
  }

  // Public spells (for character sheet and feat effects)
  async getPublicSpells(campaignId?: string): Promise<SystemSpell[]> {
    const params = campaignId ? `?campaignId=${encodeURIComponent(campaignId)}` : '';
    return this.request(`/spells${params}`);
  }

  // Admin Character Templates
  async getCharacterTemplates(personal?: boolean, worldId?: string): Promise<Character[]> {
    const qs = new URLSearchParams();
    if (personal) qs.set('personal', '1');
    if (worldId) qs.set('worldId', worldId);
    const s = qs.toString();
    return this.request(`/admin/character-templates${s ? `?${s}` : ''}`);
  }

  async getCharacterTemplate(id: string): Promise<Character> {
    return this.request(`/admin/character-templates/${id}`);
  }

  async createCharacterTemplate(data: Partial<Character>): Promise<Character> {
    return this.request('/admin/character-templates', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateCharacterTemplate(id: string, data: Partial<Character>): Promise<Character> {
    return this.request(`/admin/character-templates/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteCharacterTemplate(id: string): Promise<void> {
    return this.request(`/admin/character-templates/${id}`, { method: 'DELETE' });
  }

  // Admin Character Template Folders
  async getCharacterTemplateFolders(): Promise<CharacterTemplateFolder[]> {
    return this.request('/admin/character-template-folders');
  }

  async createCharacterTemplateFolder(data: { name: string; sortOrder?: number }): Promise<CharacterTemplateFolder> {
    return this.request('/admin/character-template-folders', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateCharacterTemplateFolder(id: string, data: Partial<CharacterTemplateFolder>): Promise<CharacterTemplateFolder> {
    return this.request(`/admin/character-template-folders/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteCharacterTemplateFolder(id: string): Promise<void> {
    return this.request(`/admin/character-template-folders/${id}`, { method: 'DELETE' });
  }

  // Admin User Management (Site Security)
  async getAllUsers(): Promise<AdminUser[]> {
    return this.request('/admin/users');
  }

  async banUser(userId: string, reason?: string, expiresAt?: string): Promise<AdminUser> {
    return this.request(`/admin/users/${userId}/ban`, {
      method: 'POST',
      body: JSON.stringify({ reason, expiresAt }),
    });
  }

  async unbanUser(userId: string): Promise<AdminUser> {
    return this.request(`/admin/users/${userId}/unban`, {
      method: 'POST',
    });
  }

  async updateBan(userId: string, reason?: string, expiresAt?: string | null): Promise<AdminUser> {
    return this.request(`/admin/users/${userId}/ban`, {
      method: 'PUT',
      body: JSON.stringify({ reason, expiresAt }),
    });
  }

  async getUserActivity(userId: string): Promise<UserActivity> {
    return this.request(`/admin/users/${userId}/activity`);
  }

  async setUserAdmin(userId: string, isAdmin: boolean): Promise<AdminUser> {
    return this.request(`/admin/set-admin/${userId}`, {
      method: 'POST',
      body: JSON.stringify({ isAdmin }),
    });
  }

  async deleteUser(userId: string): Promise<{ success: boolean; message: string }> {
    return this.request(`/admin/users/${userId}`, {
      method: 'DELETE',
    });
  }

  async sendPasswordResetEmail(userId: string): Promise<{ success: boolean; message: string }> {
    return this.request(`/admin/users/${userId}/send-password-reset`, {
      method: 'POST',
    });
  }

  async broadcastSiteUpdate(): Promise<{ success: boolean; message: string }> {
    return this.request('/admin/broadcast-update', {
      method: 'POST',
    });
  }

  // Public character templates (for campaign use)
  async getPublicCharacterTemplates(campaignId?: string): Promise<Character[]> {
    const params = campaignId ? `?campaignId=${encodeURIComponent(campaignId)}` : '';
    return this.request(`/character-templates${params}`);
  }

  async copyTemplateToCompany(campaignId: string, templateId: string): Promise<Character> {
    return this.request(`/campaigns/${campaignId}/characters/from-template/${templateId}`, {
      method: 'POST',
    });
  }


  // Admin Feat Trees
  async getFeatTrees(system?: string, campaignId?: string, personal?: boolean): Promise<FeatTree[]> {
    const qs = new URLSearchParams();
    if (system) qs.set('system', system);
    if (campaignId) qs.set('campaignId', campaignId);
    if (personal) qs.set('personal', '1');
    const s = qs.toString();
    return this.request(`/admin/feat-trees${s ? `?${s}` : ''}`);
  }

  async getFeatTree(id: string): Promise<FeatTreeWithData> {
    return this.request(`/feat-trees/${id}`);
  }

  async createFeatTree(tree: Partial<FeatTree>): Promise<FeatTree> {
    return this.request('/admin/feat-trees', {
      method: 'POST',
      body: JSON.stringify(tree),
    });
  }

  async updateFeatTree(id: string, data: Partial<FeatTree>): Promise<FeatTree> {
    return this.request(`/admin/feat-trees/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteFeatTree(id: string): Promise<void> {
    return this.request(`/admin/feat-trees/${id}`, { method: 'DELETE' });
  }

  // Feats within a tree
  async createFeat(treeId: string, feat: Partial<Feat>): Promise<Feat> {
    return this.request(`/admin/feat-trees/${treeId}/feats`, {
      method: 'POST',
      body: JSON.stringify(feat),
    });
  }

  async updateFeat(id: string, data: Partial<Feat>): Promise<Feat> {
    return this.request(`/admin/feats/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteFeat(id: string): Promise<void> {
    return this.request(`/admin/feats/${id}`, { method: 'DELETE' });
  }

  // Feat connections
  async createFeatConnection(treeId: string, connection: Partial<FeatConnection>): Promise<FeatConnection> {
    return this.request(`/admin/feat-trees/${treeId}/connections`, {
      method: 'POST',
      body: JSON.stringify(connection),
    });
  }

  async deleteFeatConnection(id: string): Promise<void> {
    return this.request(`/admin/feat-connections/${id}`, { method: 'DELETE' });
  }

  // Public feat tree routes (for character sheet)
  async getPublicFeatTrees(system?: string): Promise<FeatTree[]> {
    const params = system ? `?system=${encodeURIComponent(system)}` : '';
    return this.request(`/feat-trees${params}`);
  }

  async getFeatTreeByName(name: string): Promise<FeatTreeWithData> {
    return this.request(`/feat-trees/by-name/${encodeURIComponent(name)}`);
  }

  // Character feats
  async getCharacterFeats(characterId: string): Promise<CharacterFeat[]> {
    return this.request(`/characters/${characterId}/feats`);
  }

  async unlockCharacterFeat(characterId: string, featId: string): Promise<CharacterFeat> {
    return this.request(`/characters/${characterId}/feats/${featId}`, {
      method: 'POST',
    });
  }

  async removeCharacterFeat(characterId: string, featId: string): Promise<void> {
    return this.request(`/characters/${characterId}/feats/${featId}`, { method: 'DELETE' });
  }

  async removeCharacterClassNode(characterId: string, classId: string, nodeId: string): Promise<any> {
    return this.request(`/characters/${characterId}/classes/${classId}/nodes/${nodeId}`, { method: 'DELETE' });
  }

  // Campaign Template Items
  async getTemplateItems(campaignId: string): Promise<{ campaignItems: Item[], systemItems: Item[] }> {
    return this.request(`/campaigns/${campaignId}/template-items`);
  }

  async createCampaignTemplateItem(campaignId: string, item: Partial<Item>): Promise<Item> {
    return this.request(`/campaigns/${campaignId}/template-items`, {
      method: 'POST',
      body: JSON.stringify(item),
    });
  }

  async updateCampaignTemplateItem(campaignId: string, id: string, data: Partial<Item>): Promise<Item> {
    return this.request(`/campaigns/${campaignId}/template-items/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteCampaignTemplateItem(campaignId: string, id: string): Promise<void> {
    return this.request(`/campaigns/${campaignId}/template-items/${id}`, { method: 'DELETE' });
  }

  async getTemplateSpells(campaignId: string): Promise<Spell[]> {
    return this.request(`/campaigns/${campaignId}/template-spells`);
  }

  async createCampaignTemplateSpell(campaignId: string, spell: Partial<Spell>): Promise<Spell> {
    return this.request(`/campaigns/${campaignId}/template-spells`, {
      method: 'POST',
      body: JSON.stringify(spell),
    });
  }

  async updateCampaignTemplateSpell(campaignId: string, id: string, data: any): Promise<any> {
    return this.request(`/campaigns/${campaignId}/template-spells/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteCampaignTemplateSpell(campaignId: string, id: string): Promise<void> {
    return this.request(`/campaigns/${campaignId}/template-spells/${id}`, { method: 'DELETE' });
  }

  // Character Permissions
  async getCharacterPermissions(characterId: string): Promise<CharacterPermission[]> {
    return this.request(`/characters/${characterId}/permissions`);
  }

  async setCharacterPermission(characterId: string, userId: string, accessLevel: string): Promise<CharacterPermission> {
    return this.request(`/characters/${characterId}/permissions/${userId}`, {
      method: 'PUT',
      body: JSON.stringify({ accessLevel }),
    });
  }

  async setCharacterPermissionForAllPlayers(characterId: string, accessLevel: string): Promise<{ updated: number }> {
    return this.request(`/characters/${characterId}/permissions/all`, {
      method: 'PUT',
      body: JSON.stringify({ accessLevel }),
    });
  }

  // Get current user's permissions for all characters in a campaign
  async getMyPermissions(campaignId: string): Promise<{ permissions: Record<string, string>; isGM: boolean }> {
    return this.request(`/campaigns/${campaignId}/my-permissions`);
  }

  // Initiative Tracking
  async getCampaignInitiative(campaignId: string): Promise<InitiativeData> {
    return this.request(`/campaigns/${campaignId}/initiative`);
  }

  async rollInitiative(campaignId: string, characterId: string, value: number, isHidden?: boolean): Promise<InitiativeEntry> {
    return this.request(`/campaigns/${campaignId}/initiative`, {
      method: 'POST',
      body: JSON.stringify({ characterId, value, isHidden }),
    });
  }

  async updateInitiativeEntry(id: string, data: { value?: number; isHidden?: boolean }): Promise<InitiativeEntry> {
    return this.request(`/initiative/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteInitiativeEntry(id: string): Promise<void> {
    return this.request(`/initiative/${id}`, { method: 'DELETE' });
  }

  async clearCampaignInitiative(campaignId: string): Promise<void> {
    return this.request(`/campaigns/${campaignId}/initiative`, { method: 'DELETE' });
  }

  async updateCombatState(campaignId: string, inCombat: boolean, currentTurnCharacterId?: string): Promise<any> {
    return this.request(`/campaigns/${campaignId}/combat`, {
      method: 'POST',
      body: JSON.stringify({ inCombat, currentTurnCharacterId }),
    });
  }

  // Profile endpoints
  async getProfile(): Promise<UserProfile> {
    return this.request('/profile');
  }

  async updateProfile(data: { name?: string; bio?: string }): Promise<UserProfile> {
    return this.request('/profile', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async updateAvatar(avatarUrl: string): Promise<UserProfile> {
    return this.request('/profile/avatar', {
      method: 'PUT',
      body: JSON.stringify({ avatarUrl }),
    });
  }

  async updateUsername(username: string): Promise<UserProfile> {
    return this.request('/profile/username', {
      method: 'PUT',
      body: JSON.stringify({ username }),
    });
  }

  // Friend request endpoints
  async sendFriendRequest(recipientUsername: string, message?: string): Promise<FriendRequest> {
    return this.request('/friends/requests', {
      method: 'POST',
      body: JSON.stringify({ recipientUsername, message }),
    });
  }

  async getIncomingFriendRequests(): Promise<FriendRequestWithUser[]> {
    return this.request('/friends/requests/incoming');
  }

  async getOutgoingFriendRequests(): Promise<FriendRequestWithUser[]> {
    return this.request('/friends/requests/outgoing');
  }

  async acceptFriendRequest(requestId: string): Promise<{ success: boolean }> {
    return this.request(`/friends/requests/${requestId}/accept`, {
      method: 'POST',
    });
  }

  async declineFriendRequest(requestId: string): Promise<{ success: boolean }> {
    return this.request(`/friends/requests/${requestId}/decline`, {
      method: 'POST',
    });
  }

  async cancelFriendRequest(requestId: string): Promise<{ success: boolean }> {
    return this.request(`/friends/requests/${requestId}`, {
      method: 'DELETE',
    });
  }

  // Friendship endpoints
  async getFriends(): Promise<UserProfile[]> {
    return this.request('/friends');
  }

  async removeFriend(friendId: string): Promise<{ success: boolean }> {
    return this.request(`/friends/${friendId}`, {
      method: 'DELETE',
    });
  }

  // User search
  async searchUserByUsername(username: string): Promise<UserProfile> {
    return this.request(`/users/search?username=${encodeURIComponent(username)}`);
  }

  // Note Folder endpoints
  async getNoteFolders(campaignId?: string, showHidden?: boolean): Promise<NoteFolder[]> {
    const params = new URLSearchParams();
    if (campaignId) params.set('campaignId', campaignId);
    if (showHidden) params.set('showHidden', 'true');
    const queryString = params.toString();
    return this.request(`/notes/folders${queryString ? `?${queryString}` : ''}`);
  }

  async createNoteFolder(folder: Partial<NoteFolder>): Promise<NoteFolder> {
    return this.request('/notes/folders', {
      method: 'POST',
      body: JSON.stringify(folder),
    });
  }

  async updateNoteFolder(id: string, data: Partial<NoteFolder>): Promise<NoteFolder> {
    return this.request(`/notes/folders/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteNoteFolder(id: string): Promise<{ success: boolean }> {
    return this.request(`/notes/folders/${id}`, { method: 'DELETE' });
  }

  async reorderNoteFolders(folderOrders: { id: string; sortOrder: number }[]): Promise<{ success: boolean }> {
    return this.request('/notes/folders/reorder', {
      method: 'POST',
      body: JSON.stringify({ folderOrders }),
    });
  }

  // Note endpoints
  async getNotes(folderId?: string, campaignId?: string): Promise<Note[]> {
    const params = new URLSearchParams();
    if (folderId) params.append('folderId', folderId);
    if (campaignId) params.append('campaignId', campaignId);
    const queryString = params.toString();
    return this.request(`/notes${queryString ? `?${queryString}` : ''}`);
  }

  async getSharedNotes(): Promise<Note[]> {
    return this.request('/notes/shared');
  }

  async searchNotes(query: string): Promise<Note[]> {
    return this.request(`/notes/search?q=${encodeURIComponent(query)}`);
  }

  async createNote(note: Partial<Note>): Promise<Note> {
    return this.request('/notes', {
      method: 'POST',
      body: JSON.stringify(note),
    });
  }

  async getOrCreateEntityNote(campaignId: string, entityType: string, entityId: string, title?: string): Promise<Note> {
    return this.request('/notes/for-entity', {
      method: 'POST',
      body: JSON.stringify({ campaignId, entityType, entityId, title }),
    });
  }

  async importNoteToCampaign(noteId: string, destinationCampaignId: string): Promise<{ note: Note; entityImported: boolean; entityId: string | null; sameSystem: boolean; unlinked: boolean }> {
    return this.request(`/notes/${noteId}/import-to-campaign`, {
      method: 'POST',
      body: JSON.stringify({ destinationCampaignId }),
    });
  }

  async getNoteHistory(noteId: string): Promise<KnowledgeRevision[]> {
    return this.request(`/notes/${noteId}/history`);
  }

  async restoreNoteRevision(noteId: string, revisionId: string): Promise<Note> {
    return this.request(`/notes/${noteId}/restore/${revisionId}`, { method: 'POST' });
  }

  async getCampaignKnowledgeActivity(campaignId: string): Promise<KnowledgeRevision[]> {
    return this.request(`/campaigns/${campaignId}/knowledge-activity`);
  }

  async getTimelines(campaignId: string): Promise<Timeline[]> {
    return this.request(`/timelines?campaignId=${encodeURIComponent(campaignId)}`);
  }

  async createTimeline(data: Partial<Timeline>): Promise<Timeline> {
    return this.request('/timelines', { method: 'POST', body: JSON.stringify(data) });
  }

  async updateTimeline(id: string, data: Partial<Timeline>): Promise<Timeline> {
    return this.request(`/timelines/${id}`, { method: 'PUT', body: JSON.stringify(data) });
  }

  async deleteTimeline(id: string): Promise<void> {
    return this.request(`/timelines/${id}`, { method: 'DELETE' });
  }

  async getTimelineEvents(timelineId: string): Promise<TimelineEvent[]> {
    return this.request(`/timelines/${timelineId}/events`);
  }

  async createTimelineEvent(data: Partial<TimelineEvent> & { timelineId: string }): Promise<TimelineEvent> {
    return this.request('/timeline-events', { method: 'POST', body: JSON.stringify(data) });
  }

  async updateTimelineEvent(id: string, data: Partial<TimelineEvent>): Promise<TimelineEvent> {
    return this.request(`/timeline-events/${id}`, { method: 'PUT', body: JSON.stringify(data) });
  }

  async deleteTimelineEvent(id: string): Promise<void> {
    return this.request(`/timeline-events/${id}`, { method: 'DELETE' });
  }

  async getNote(id: string): Promise<Note> {
    return this.request(`/notes/${id}`);
  }

  async updateNote(id: string, data: Partial<Note>): Promise<Note> {
    return this.request(`/notes/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteNote(id: string): Promise<{ success: boolean }> {
    return this.request(`/notes/${id}`, { method: 'DELETE' });
  }

  // Google Drive status
  async getDriveStatus(): Promise<{ connected: boolean; email?: string; name?: string }> {
    return this.request('/drive/status');
  }

  // Google Docs sync endpoints
  async getDriveFiles(): Promise<GoogleDocInfo[]> {
    return this.request('/notes/drive-files');
  }

  async exportNoteToDrive(noteId: string, existingDocId?: string): Promise<{ success: boolean; docId: string; webViewLink: string }> {
    return this.request(`/notes/${noteId}/export-to-drive`, {
      method: 'POST',
      body: JSON.stringify({ existingDocId }),
    });
  }

  async importFromDrive(docId: string, folderId?: string, campaignId?: string): Promise<Note> {
    return this.request('/notes/import-from-drive', {
      method: 'POST',
      body: JSON.stringify({ docId, folderId, campaignId }),
    });
  }

  async getGoogleAuthUrl(): Promise<{ url: string }> {
    return this.request('/google/auth-url');
  }

  async getGoogleStatus(): Promise<{ connected: boolean; email?: string }> {
    return this.request('/google/status');
  }

  async disconnectGoogle(): Promise<{ success: boolean }> {
    return this.request('/google/disconnect', { method: 'POST' });
  }

  // Note Reference endpoints
  async getNoteReferences(noteId: string): Promise<NoteReference[]> {
    return this.request(`/notes/${noteId}/references`);
  }

  async createNoteReference(noteId: string, ref: Partial<NoteReference>): Promise<NoteReference> {
    return this.request(`/notes/${noteId}/references`, {
      method: 'POST',
      body: JSON.stringify(ref),
    });
  }

  async deleteNoteReference(noteId: string, refId: string): Promise<{ success: boolean }> {
    return this.request(`/notes/${noteId}/references/${refId}`, { method: 'DELETE' });
  }

  async getBacklinks(entityType: string, entityId: string): Promise<NoteReference[]> {
    return this.request(`/backlinks?entityType=${encodeURIComponent(entityType)}&entityId=${encodeURIComponent(entityId)}`);
  }

  // Note Share endpoints
  async getNoteShares(noteId: string): Promise<NoteShare[]> {
    return this.request(`/notes/${noteId}/shares`);
  }

  async shareNote(noteId: string, friendId: string, permission?: string): Promise<NoteShare> {
    return this.request(`/notes/${noteId}/shares`, {
      method: 'POST',
      body: JSON.stringify({ friendId, permission: permission || 'view' }),
    });
  }

  async updateNoteShare(noteId: string, shareId: string, permission: string): Promise<NoteShare> {
    return this.request(`/notes/${noteId}/shares/${shareId}`, {
      method: 'PUT',
      body: JSON.stringify({ permission }),
    });
  }

  async deleteNoteShare(noteId: string, shareId: string): Promise<{ success: boolean }> {
    return this.request(`/notes/${noteId}/shares/${shareId}`, { method: 'DELETE' });
  }

  // Entity search for note references
  async searchEntities(query: string, type?: string): Promise<SearchableEntity[]> {
    const params = new URLSearchParams({ q: query });
    if (type && type !== 'all') params.append('type', type);
    return this.request(`/search/entities?${params.toString()}`);
  }

  // Campaign-scoped character/item search for the note "Connect" flow -
  // distinct from searchEntities() above, which hits global system-library
  // tables and isn't scoped to a single campaign's actual characters/items.
  async searchCampaignConnectEntities(campaignId: string, query: string, type?: 'character' | 'item'): Promise<SearchableEntity[]> {
    const params = new URLSearchParams({ q: query });
    if (type) params.append('type', type);
    return this.request(`/campaigns/${campaignId}/connect-search?${params.toString()}`);
  }

  async connectNoteToEntity(noteId: string, entityType: 'character-sheet' | 'item-sheet', entityId: string): Promise<NoteReference> {
    return this.request(`/notes/${noteId}/connect`, {
      method: 'POST',
      body: JSON.stringify({ entityType, entityId }),
    });
  }

  // Token Effects - public read, admin write
  async getTokenEffects(personal?: boolean, system?: string): Promise<TokenEffect[]> {
    const p = new URLSearchParams();
    if (personal) p.set('personal', 'true');
    if (system) p.set('system', system);
    const qs = p.toString() ? `?${p.toString()}` : '';
    return this.request(`/admin/token-effects${qs}`);
  }

  async getTokenEffect(id: string): Promise<TokenEffect> {
    return this.request(`/admin/token-effects/${id}`);
  }

  async createTokenEffect(effect: Partial<TokenEffect>): Promise<TokenEffect> {
    return this.request('/admin/token-effects', {
      method: 'POST',
      body: JSON.stringify(effect),
    });
  }

  async updateTokenEffect(id: string, effect: Partial<TokenEffect>): Promise<TokenEffect> {
    return this.request(`/admin/token-effects/${id}`, {
      method: 'PUT',
      body: JSON.stringify(effect),
    });
  }

  async deleteTokenEffect(id: string): Promise<void> {
    return this.request(`/admin/token-effects/${id}`, { method: 'DELETE' });
  }

  // Spell Effects
  async getSpellEffects(spellId: string): Promise<SpellEffect[]> {
    return this.request(`/spells/${spellId}/effects`);
  }

  async addSpellEffect(spellId: string, effectId: string, triggerCondition: string): Promise<SpellEffect> {
    return this.request(`/spells/${spellId}/effects`, {
      method: 'POST',
      body: JSON.stringify({ effectId, triggerCondition }),
    });
  }

  async removeSpellEffect(id: string): Promise<void> {
    return this.request(`/spell-effects/${id}`, { method: 'DELETE' });
  }

  // Item Effects
  async getItemEffects(itemId: string): Promise<ItemEffect[]> {
    return this.request(`/items/${itemId}/effects`);
  }

  async addItemEffect(itemId: string, effectId: string, triggerCondition: string): Promise<ItemEffect> {
    return this.request(`/items/${itemId}/effects`, {
      method: 'POST',
      body: JSON.stringify({ effectId, triggerCondition }),
    });
  }

  async removeItemEffect(id: string): Promise<void> {
    return this.request(`/item-effects/${id}`, { method: 'DELETE' });
  }

  // Token Active Effects
  async getTokenActiveEffects(tokenId: string): Promise<TokenActiveEffect[]> {
    return this.request(`/tokens/${tokenId}/active-effects`);
  }

  async applyTokenEffect(tokenId: string, effectId: string, sourceType?: string, sourceId?: string, duration?: number): Promise<TokenActiveEffect> {
    return this.request(`/tokens/${tokenId}/active-effects`, {
      method: 'POST',
      body: JSON.stringify({ effectId, sourceType, sourceId, duration }),
    });
  }

  async removeTokenActiveEffect(id: string): Promise<void> {
    return this.request(`/token-active-effects/${id}`, { method: 'DELETE' });
  }

  async clearTokenActiveEffects(tokenId: string): Promise<void> {
    return this.request(`/tokens/${tokenId}/active-effects`, { method: 'DELETE' });
  }

  async processEffectTriggers(sceneId: string, characterId: string, timing: 'start_of_turn' | 'start_of_round', isNewRound?: boolean): Promise<{
    processed: Array<{
      effectId: string;
      effectName: string;
      rolls: number[];
      bonus: number;
      total: number;
      damageType: string;
      isHealing: boolean;
      characterName: string;
      newHp: number;
    }>;
  }> {
    return this.request(`/scenes/${sceneId}/effect-triggers`, {
      method: 'POST',
      body: JSON.stringify({ characterId, timing, isNewRound }),
    });
  }

  async getSandboxFolders(campaignId: string): Promise<any[]> {
    return this.request(`/campaigns/${campaignId}/sandbox/folders`);
  }

  async createSandboxFolder(campaignId: string, data: { name: string; parentId?: string }): Promise<any> {
    return this.request(`/campaigns/${campaignId}/sandbox/folders`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateSandboxFolder(campaignId: string, folderId: string, data: any): Promise<any> {
    return this.request(`/campaigns/${campaignId}/sandbox/folders/${folderId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteSandboxFolder(campaignId: string, folderId: string): Promise<void> {
    return this.request(`/campaigns/${campaignId}/sandbox/folders/${folderId}`, {
      method: 'DELETE',
    });
  }

  async getSandboxTemplates(campaignId: string): Promise<SandboxTemplate[]> {
    return this.request(`/campaigns/${campaignId}/sandbox/templates`);
  }

  async createSandboxTemplate(campaignId: string, data: { name: string; folderId?: string }): Promise<SandboxTemplate> {
    return this.request(`/campaigns/${campaignId}/sandbox/templates`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async seedArcanaTemplates(campaignId: string): Promise<{ templates: SandboxTemplate[] }> {
    return this.request(`/campaigns/${campaignId}/sandbox/seed-arcana`, {
      method: 'POST',
    });
  }

  async updateSandboxTemplate(campaignId: string, templateId: string, data: Partial<SandboxTemplate>): Promise<SandboxTemplate> {
    return this.request(`/campaigns/${campaignId}/sandbox/templates/${templateId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteSandboxTemplate(campaignId: string, templateId: string): Promise<void> {
    return this.request(`/campaigns/${campaignId}/sandbox/templates/${templateId}`, {
      method: 'DELETE',
    });
  }

  async getSandboxActors(campaignId: string): Promise<SandboxActor[]> {
    return this.request(`/campaigns/${campaignId}/sandbox/actors`);
  }

  async createSandboxActor(campaignId: string, data: { name: string; templateId?: string; folderId?: string }): Promise<SandboxActor> {
    return this.request(`/campaigns/${campaignId}/sandbox/actors`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateSandboxActor(campaignId: string, actorId: string, data: Partial<SandboxActor>): Promise<SandboxActor> {
    return this.request(`/campaigns/${campaignId}/sandbox/actors/${actorId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteSandboxActor(campaignId: string, actorId: string): Promise<void> {
    return this.request(`/campaigns/${campaignId}/sandbox/actors/${actorId}`, {
      method: 'DELETE',
    });
  }

  async getCampaignMapPins(campaignId: string, sceneId: string): Promise<any[]> {
    return this.request(`/campaigns/${campaignId}/scenes/${sceneId}/map-pins`);
  }

  async createCampaignMapPin(campaignId: string, sceneId: string, data: any): Promise<any> {
    return this.request(`/campaigns/${campaignId}/scenes/${sceneId}/map-pins`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateCampaignMapPin(pinId: string, data: any): Promise<any> {
    return this.request(`/campaign-map-pins/${pinId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteCampaignMapPin(pinId: string): Promise<void> {
    return this.request(`/campaign-map-pins/${pinId}`, {
      method: 'DELETE',
    });
  }

  async getShopItems(pinId: string): Promise<any[]> {
    return this.request(`/campaign-map-pins/${pinId}/shop-items`);
  }

  async createShopItem(pinId: string, data: any): Promise<any> {
    return this.request(`/campaign-map-pins/${pinId}/shop-items`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateShopItem(itemId: string, data: any): Promise<any> {
    return this.request(`/shop-items/${itemId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteShopItem(itemId: string): Promise<void> {
    return this.request(`/shop-items/${itemId}`, {
      method: 'DELETE',
    });
  }

  async buyFromShop(pinId: string, data: { shopItemId: string; characterId: string }): Promise<any> {
    return this.request(`/campaign-map-pins/${pinId}/buy`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async sellToShop(pinId: string, data: { characterId: string; itemId: string; sellPercentage: number }): Promise<any> {
    return this.request(`/campaign-map-pins/${pinId}/sell`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getHaggleRolls(pinId: string): Promise<any[]> {
    return this.request(`/campaign-map-pins/${pinId}/haggle-rolls`);
  }

  async getHaggleRoll(pinId: string, characterId: string): Promise<any | null> {
    return this.request(`/campaign-map-pins/${pinId}/haggle-rolls/${characterId}`);
  }

  async saveHaggleRoll(pinId: string, data: { characterId: string; characterName: string; roll: number; sellPercentage: number; d20Result: number; charismaMod: number }): Promise<any> {
    return this.request(`/campaign-map-pins/${pinId}/haggle-rolls`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async resetHaggleRoll(pinId: string, characterId: string): Promise<any> {
    return this.request(`/campaign-map-pins/${pinId}/haggle-rolls/${characterId}`, {
      method: 'DELETE',
    });
  }

  // ---- AA V3 spell crafting ----
  async craftV3Spell(characterId: string, composition: V3SpellComposition, spellbookItemId?: string): Promise<V3CraftResult> {
    return this.request(`/v3/spells/craft`, {
      method: 'POST',
      body: JSON.stringify({ characterId, composition, spellbookItemId }),
    });
  }

  async getSpellbookSpells(itemId: string): Promise<V3Spell[]> {
    return this.request(`/v3/spellbooks/${itemId}/spells`);
  }

  async removeSpellFromSpellbook(spellId: string): Promise<{ success: boolean }> {
    return this.request(`/v3/spells/${spellId}/remove-from-spellbook`, { method: 'POST' });
  }

  async addSpellToSpellbook(itemId: string, data: { composition: V3SpellComposition; name: string; description?: string; image?: string | null }): Promise<V3Spell> {
    return this.request(`/v3/spellbooks/${itemId}/spells`, { method: 'POST', body: JSON.stringify(data) });
  }

  async authorV3Spell(spellId: string, data: { name: string; description?: string; image?: string | null }): Promise<V3Spell> {
    return this.request(`/v3/spells/${spellId}/author`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getV3SpellRequests(campaignId: string): Promise<V3Spell[]> {
    return this.request(`/campaigns/${campaignId}/v3-spell-requests`);
  }

  async getCampaignV3Spells(campaignId: string): Promise<V3Spell[]> {
    return this.request(`/campaigns/${campaignId}/v3-spells`);
  }

  async getCharacterV3Spells(characterId: string): Promise<V3Spell[]> {
    return this.request(`/v3/characters/${characterId}/spells`);
  }

  async getCanonicalV3Spell(hash: string, campaignId?: string): Promise<V3Spell | null> {
    return this.request(`/v3/spells/canonical/${hash}${campaignId ? `?campaignId=${encodeURIComponent(campaignId)}` : ''}`);
  }

  async getAdminV3Spells(status?: string, personal?: boolean): Promise<V3Spell[]> {
    const qs = new URLSearchParams();
    if (status) qs.set('status', status);
    if (personal) qs.set('personal', 'true');
    return this.request(`/admin/v3-spells${qs.toString() ? `?${qs.toString()}` : ''}`);
  }

  async approveV3Spell(spellId: string, resolution?: 'keep_this' | 'keep_other'): Promise<V3SpellApproveResult> {
    return this.request(`/admin/v3-spells/${spellId}/approve`, {
      method: 'POST',
      body: JSON.stringify(resolution ? { resolution } : {}),
    });
  }

  async rejectV3Spell(spellId: string): Promise<V3Spell> {
    return this.request(`/admin/v3-spells/${spellId}/reject`, { method: 'POST' });
  }

  async createAdminV3Spell(data: { composition: V3SpellComposition; name: string; description?: string; image?: string | null; personal?: boolean }): Promise<V3SpellCreateResult> {
    return this.request(`/admin/v3-spells`, { method: 'POST', body: JSON.stringify(data) });
  }

  async updateAdminV3Spell(spellId: string, data: { name?: string; description?: string; image?: string | null }): Promise<V3Spell> {
    return this.request(`/admin/v3-spells/${spellId}`, { method: 'PATCH', body: JSON.stringify(data) });
  }

  async deleteAdminV3Spell(spellId: string): Promise<{ success: boolean }> {
    return this.request(`/admin/v3-spells/${spellId}`, { method: 'DELETE' });
  }

  // AA V3 element craft requirements
  async getV3ElementRequirements(campaignId?: string): Promise<V3ElementRequirement[]> {
    return this.request(`/v3/element-requirements${campaignId ? `?campaignId=${encodeURIComponent(campaignId)}` : ''}`);
  }

  async getAdminV3ElementRequirements(personal?: boolean): Promise<V3ElementRequirement[]> {
    return this.request(`/admin/v3-element-requirements${personal ? '?personal=true' : ''}`);
  }

  async createV3ElementRequirement(data: {
    element: string;
    conditionType: 'knowledge' | 'item';
    knowledgeName?: string | null;
    itemId?: string | null;
    itemName?: string | null;
    consumed?: boolean;
    personal?: boolean;
  }): Promise<V3ElementRequirement> {
    return this.request(`/admin/v3-element-requirements`, { method: 'POST', body: JSON.stringify(data) });
  }

  async updateV3ElementRequirement(id: string, data: { consumed?: boolean; knowledgeName?: string | null; itemName?: string | null }): Promise<V3ElementRequirement> {
    return this.request(`/admin/v3-element-requirements/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
  }

  async deleteV3ElementRequirement(id: string): Promise<{ success: boolean }> {
    return this.request(`/admin/v3-element-requirements/${id}`, { method: 'DELETE' });
  }

  // AA V3 weapon techniques (Task #180)
  async getV3Techniques(personal?: boolean): Promise<V3Technique[]> {
    const params = personal ? '?personal=true' : '';
    return this.request(`/admin/v3-techniques${params}`);
  }

  async getV3TechniqueGroups(personal?: boolean): Promise<V3TechniqueGroup[]> {
    const params = personal ? '?personal=true' : '';
    return this.request(`/admin/v3-technique-groups${params}`);
  }

  // Authoritatively use a technique: the server validates eligibility and
  // deducts energy + a required consumable item, returning the updated
  // character. The client still rolls the dice for display only.
  async useV3Technique(
    techniqueId: string,
    characterId: string,
    weaponItemId: string,
  ): Promise<{ success: boolean; energySpent: number; consumedItem: { id: string; name: string | null } | null; character: any }> {
    return this.request(`/v3/techniques/${techniqueId}/use`, {
      method: 'POST',
      body: JSON.stringify({ characterId, weaponItemId }),
    });
  }

  // Unlock a technique for a character by spending 1 class skill point (GMs
  // unlock for free). Unlocks are global per character — the technique becomes
  // usable from every weapon that grants it.
  async unlockV3Technique(
    techniqueId: string,
    characterId: string,
    weaponItemId: string,
  ): Promise<{ success: boolean; pointSpent: number; character: any }> {
    return this.request(`/v3/techniques/${techniqueId}/unlock`, {
      method: 'POST',
      body: JSON.stringify({ characterId, weaponItemId }),
    });
  }

  async removeV3Technique(
    techniqueId: string,
    characterId: string,
  ): Promise<{ success: boolean; pointRefunded: number; character: any }> {
    return this.request(`/v3/techniques/${techniqueId}/remove`, {
      method: 'POST',
      body: JSON.stringify({ characterId }),
    });
  }

  async getAdminV3Techniques(personal?: boolean): Promise<V3Technique[]> {
    const params = personal ? '?personal=true' : '';
    return this.request(`/admin/v3-techniques${params}`);
  }

  async createV3Technique(data: {
    name: string;
    image?: string | null;
    description?: string | null;
    energyCost?: number;
    rollMode?: 'base_damage' | 'skill_check';
    skillKey?: string | null;
    requirements?: V3TechniqueCondition[];
    personal?: boolean;
  }): Promise<V3Technique> {
    return this.request(`/admin/v3-techniques`, { method: 'POST', body: JSON.stringify(data) });
  }

  async updateV3Technique(id: string, data: Partial<{
    name: string;
    image: string | null;
    description: string | null;
    energyCost: number;
    rollMode: 'base_damage' | 'skill_check';
    skillKey: string | null;
    requirements: V3TechniqueCondition[];
  }>): Promise<V3Technique> {
    return this.request(`/admin/v3-techniques/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
  }

  async deleteV3Technique(id: string): Promise<{ success: boolean }> {
    return this.request(`/admin/v3-techniques/${id}`, { method: 'DELETE' });
  }

  async getAdminV3TechniqueGroups(personal?: boolean): Promise<V3TechniqueGroup[]> {
    const params = personal ? '?personal=true' : '';
    return this.request(`/admin/v3-technique-groups${params}`);
  }

  async createV3TechniqueGroup(data: { name: string; personal?: boolean }): Promise<V3TechniqueGroup> {
    return this.request(`/admin/v3-technique-groups`, { method: 'POST', body: JSON.stringify(data) });
  }

  async updateV3TechniqueGroup(id: string, data: { name: string }): Promise<V3TechniqueGroup> {
    return this.request(`/admin/v3-technique-groups/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
  }

  async deleteV3TechniqueGroup(id: string): Promise<{ success: boolean }> {
    return this.request(`/admin/v3-technique-groups/${id}`, { method: 'DELETE' });
  }

  // AA V3 Ammunition Types (admin CRUD + public read)
  async getV3AmmunitionTypes(): Promise<V3AmmunitionType[]> {
    return this.request(`/v3/ammunition-types`);
  }

  async getAdminV3AmmunitionTypes(personal?: boolean): Promise<V3AmmunitionType[]> {
    const params = personal ? '?personal=true' : '';
    return this.request(`/admin/v3-ammunition-types${params}`);
  }

  async createV3AmmunitionType(data: { name: string; personal?: boolean }): Promise<V3AmmunitionType> {
    return this.request(`/admin/v3-ammunition-types`, { method: 'POST', body: JSON.stringify(data) });
  }

  async updateV3AmmunitionType(id: string, data: { name: string }): Promise<V3AmmunitionType> {
    return this.request(`/admin/v3-ammunition-types/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
  }

  async deleteV3AmmunitionType(id: string): Promise<{ success: boolean }> {
    return this.request(`/admin/v3-ammunition-types/${id}`, { method: 'DELETE' });
  }

  // AA V3 Action Token Types (admin CRUD + character assignments)
  async getAdminV3ActionTokenTypes(personal?: boolean): Promise<V3ActionTokenType[]> {
    const params = personal ? '?personal=true' : '';
    return this.request(`/admin/v3-action-tokens${params}`);
  }

  async getV3ActionTokenTypes(personal?: boolean): Promise<V3ActionTokenType[]> {
    const params = personal ? '?personal=true' : '';
    return this.request(`/admin/v3-action-tokens${params}`);
  }

  async createV3ActionTokenType(data: { name: string; image?: string | null; description?: string | null; personal?: boolean }): Promise<V3ActionTokenType> {
    return this.request(`/admin/v3-action-tokens`, { method: 'POST', body: JSON.stringify(data) });
  }

  async updateV3ActionTokenType(id: string, data: Partial<{ name: string; image: string | null; description: string | null }>): Promise<V3ActionTokenType> {
    return this.request(`/admin/v3-action-tokens/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
  }

  async deleteV3ActionTokenType(id: string): Promise<{ success: boolean }> {
    return this.request(`/admin/v3-action-tokens/${id}`, { method: 'DELETE' });
  }

  async getCharacterActionTokens(characterId: string): Promise<CharacterActionTokenWithType[]> {
    return this.request(`/characters/${characterId}/action-tokens`);
  }

  async addCharacterActionToken(characterId: string, tokenTypeId: string): Promise<CharacterActionTokenWithType> {
    return this.request(`/characters/${characterId}/action-tokens`, { method: 'POST', body: JSON.stringify({ tokenTypeId }) });
  }

  async removeCharacterActionToken(characterId: string, assignmentId: string): Promise<{ success: boolean }> {
    return this.request(`/characters/${characterId}/action-tokens/${assignmentId}`, { method: 'DELETE' });
  }

  async addV3TechniqueGroupMember(groupId: string, techniqueId: string): Promise<any> {
    return this.request(`/admin/v3-technique-groups/${groupId}/members`, { method: 'POST', body: JSON.stringify({ techniqueId }) });
  }

  async removeV3TechniqueGroupMember(groupId: string, techniqueId: string): Promise<{ success: boolean }> {
    return this.request(`/admin/v3-technique-groups/${groupId}/members/${techniqueId}`, { method: 'DELETE' });
  }

}

export interface SandboxTemplate {
  id: string;
  campaignId: string;
  folderId: string | null;
  name: string;
  data: string;
  createdAt: string;
}

export interface SandboxActor {
  id: string;
  campaignId: string;
  templateId: string | null;
  folderId: string | null;
  name: string;
  data: string;
  createdAt: string;
}

export interface SearchableEntity {
  id: string;
  type: 'spell' | 'trait' | 'skill' | 'item' | 'species' | 'character';
  name: string;
  description?: string;
  icon?: string;
}

export interface V3SpellSecondary {
  element: string;
  role: string;
}

export interface V3SpellComposition {
  core: string;
  secondaries: V3SpellSecondary[];
  intent: string;
  delivery: string;
  reach: string;
  duration: string;
}

export interface V3Spell {
  id: string;
  campaignId: string | null;
  spellbookItemId: string | null;
  composition: V3SpellComposition;
  compositionHash: string;
  name: string;
  description: string;
  image: string | null;
  manaCost: number;
  craftDc: number;
  createdByUserId: string | null;
  createdByCharacterId: string | null;
  authoredByUserId: string | null;
  status: 'awaiting_gm' | 'ready' | 'approved' | 'rejected';
  isCanonical: boolean;
  flagged: boolean;
  createdAt: string;
  updatedAt: string;
  createdByCharacterName?: string | null;
}

export interface V3ElementRequirement {
  id: string;
  element: string;
  conditionType: 'knowledge' | 'item';
  knowledgeName: string | null;
  itemId: string | null;
  itemName: string | null;
  consumed: boolean;
  createdAt: string;
}

// AA V3 weapon techniques (Task #180)
export interface V3TechniqueCondition {
  conditionType: 'knowledge' | 'item';
  knowledgeName?: string | null;
  itemId?: string | null;
  itemName?: string | null;
  consumed?: boolean | null;
}

export interface V3Technique {
  id: string;
  name: string;
  image: string | null;
  description: string | null;
  energyCost: number;
  rollMode: 'base_damage' | 'skill_check';
  skillKey: string | null;
  requirements: V3TechniqueCondition[];
  system: string;
  createdAt: string;
}

export interface V3TechniqueGroup {
  id: string;
  name: string;
  system: string;
  createdAt: string;
  techniqueIds: string[];
}

export interface V3AmmunitionType {
  id: string;
  name: string;
  system: string;
  createdAt: string;
}

export interface V3ActionTokenType {
  id: string;
  name: string;
  image: string | null;
  description: string | null;
  system: string;
  createdAt: string;
}

export interface AdvancedItemType {
  id: string;
  name: string;
  system: string;
  sortOrder: number;
  createdAt: string;
}

export interface CharacterActionTokenWithType {
  id: string;
  characterId: string;
  tokenTypeId: string;
  createdAt: string;
  tokenType?: V3ActionTokenType;
}

// Returned by admin approve/create when another official (canonical) spell
// already exists for the same recipe hash; the admin chooses which one stays.
export interface V3SpellConflict {
  conflict: true;
  existing: V3Spell;
  candidate: V3Spell;
  // How many campaigns / distinct characters currently use this recipe (shared
  // by both spells since they share a composition hash).
  usage?: { campaignCount: number; characterCount: number };
}

export type V3SpellApproveResult = V3Spell | V3SpellConflict;
export type V3SpellCreateResult = V3Spell | V3SpellConflict;

export function isV3SpellConflict(res: V3SpellApproveResult | V3SpellCreateResult): res is V3SpellConflict {
  return !!res && typeof res === 'object' && 'conflict' in res && (res as V3SpellConflict).conflict === true;
}

export interface V3CraftResult {
  success: boolean;
  roll?: { d20: number; anemos: number; total: number; dc: number };
  manaCost: number;
  manaSpent: number;
  tokenSpent: boolean;
  autoFilled?: boolean;
  spell?: V3Spell;
  character?: Character;
}

export const api = new ApiClient();

// WebSocket client for real-time updates
export class GameWebSocket {
  private ws: WebSocket | null = null;
  private campaignId: string | null = null;
  private worldId: string | null = null;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private messageHandlers: Set<(data: any) => void> = new Set();
  private joinedCampaign: boolean = false;
  private joinedWorld: boolean = false;
  private pendingMessages: Array<any> = [];
  private incognitoMode: boolean = false;
  private spectatorMode: boolean = false;

  connect(campaignId: string, incognito: boolean = false, spectator: boolean = false) {
    // If already connected to this campaign and joined with same incognito/spectator mode, don't reconnect
    if (this.campaignId === campaignId && this.joinedCampaign && this.incognitoMode === incognito && this.spectatorMode === spectator && this.ws && this.ws.readyState === WebSocket.OPEN) {
      console.log('WebSocket: Already connected and joined to campaign:', campaignId, incognito ? '(incognito)' : '', spectator ? '(spectator)' : '');
      return;
    }
    
    // Clean up any existing connection
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    if (this.ws) {
      this.ws.onclose = null; // Prevent reconnect on intentional close
      this.ws.close();
      this.ws = null;
    }
    
    this.campaignId = campaignId;
    this.worldId = null;
    this.joinedWorld = false;
    this.joinedCampaign = false;
    this.pendingMessages = [];
    this.incognitoMode = incognito;
    this.spectatorMode = spectator;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    
    console.log('WebSocket: Creating new connection for campaign:', campaignId, incognito ? '(INCOGNITO)' : '', spectator ? '(SPECTATOR)' : '');
    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      console.log('WebSocket: Connection opened, sending join_campaign for:', campaignId, this.incognitoMode ? '(incognito)' : '', this.spectatorMode ? '(spectator)' : '');
      this.send({ type: 'join_campaign', campaignId, incognito: this.incognitoMode, spectator: this.spectatorMode });
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        // Track when we've successfully joined the campaign
        if (data.type === 'joined_campaign') {
          console.log('WebSocket: Received joined_campaign response:', data);
          if (data.campaignId === this.campaignId) {
            console.log('WebSocket: Successfully joined campaign', this.campaignId);
            this.joinedCampaign = true;
            // Send any pending messages
            while (this.pendingMessages.length > 0) {
              const msg = this.pendingMessages.shift();
              console.log('WebSocket: Sending pending message:', msg.type);
              this.send(msg);
            }
          }
        }
        
        this.messageHandlers.forEach(handler => handler(data));
      } catch (e) {
        console.error('WebSocket: Error parsing message:', e);
      }
    };

    this.ws.onclose = () => {
      console.log('WebSocket: Connection closed');
      this.joinedCampaign = false;
      const savedIncognitoMode = this.incognitoMode;
      const savedSpectatorMode = this.spectatorMode;
      this.reconnectTimeout = setTimeout(() => {
        if (this.campaignId) {
          console.log('WebSocket: Attempting reconnect to campaign:', this.campaignId, savedIncognitoMode ? '(incognito)' : '', savedSpectatorMode ? '(spectator)' : '');
          this.connect(this.campaignId, savedIncognitoMode, savedSpectatorMode);
        }
      }, 3000);
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
  }

  // connectWorld — join a world room for live world-scoped updates in the
  // standalone /worldbuilder page (worlds with no linked campaign have no
  // campaign room to broadcast through).
  connectWorld(worldId: string) {
    if (this.worldId === worldId && this.joinedWorld && this.ws && this.ws.readyState === WebSocket.OPEN) {
      console.log('WebSocket: Already connected and joined to world:', worldId);
      return;
    }

    // Clean up any existing connection
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    if (this.ws) {
      this.ws.onclose = null; // Prevent reconnect on intentional close
      this.ws.close();
      this.ws = null;
    }

    this.worldId = worldId;
    this.campaignId = null;
    this.joinedCampaign = false;
    this.joinedWorld = false;
    this.pendingMessages = [];
    this.incognitoMode = false;
    this.spectatorMode = false;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    console.log('WebSocket: Creating new connection for world:', worldId);
    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      console.log('WebSocket: Connection opened, sending join_world for:', worldId);
      this.send({ type: 'join_world', worldId });
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === 'joined_world' && data.worldId === this.worldId) {
          console.log('WebSocket: Successfully joined world', this.worldId);
          this.joinedWorld = true;
          while (this.pendingMessages.length > 0) {
            const msg = this.pendingMessages.shift();
            this.send(msg);
          }
        }

        this.messageHandlers.forEach(handler => handler(data));
      } catch (e) {
        console.error('WebSocket: Error parsing message:', e);
      }
    };

    this.ws.onclose = () => {
      console.log('WebSocket: World connection closed');
      this.joinedWorld = false;
      this.reconnectTimeout = setTimeout(() => {
        if (this.worldId) {
          console.log('WebSocket: Attempting reconnect to world:', this.worldId);
          this.connectWorld(this.worldId);
        }
      }, 3000);
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
  }

  disconnect() {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.campaignId = null;
    this.worldId = null;
    this.joinedCampaign = false;
    this.joinedWorld = false;
    this.pendingMessages = [];
    this.incognitoMode = false;
    this.messageHandlers.clear();
  }

  // disconnectWorld — leave the current world room and close the world
  // connection without nuking registered message handlers (handlers are owned
  // by React hooks that unsubscribe themselves).
  disconnectWorld() {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    if (this.ws) {
      if (this.worldId && this.ws.readyState === WebSocket.OPEN) {
        this.send({ type: 'leave_world', worldId: this.worldId });
      }
      this.ws.onclose = null; // Prevent reconnect on intentional close
      this.ws.close();
      this.ws = null;
    }
    this.worldId = null;
    this.joinedWorld = false;
    this.pendingMessages = [];
  }

  // sendWorldCursor — broadcast this user's live cursor position (normalized
  // {x, y} within the active section) so standalone-world collaborators can
  // render each other's cursors in the Canvas/Graph editors. Passing a null
  // cursor signals the pointer has left the collaborative surface.
  sendWorldCursor(cursor: { x: number; y: number } | null, section?: string) {
    if (!this.worldId || !this.joinedWorld) return;
    this.send({ type: 'world_cursor', worldId: this.worldId, cursor, section });
  }
  
  isIncognito(): boolean {
    return this.incognitoMode;
  }

  send(data: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }
  
  isJoinedToCampaign(): boolean {
    return this.joinedCampaign && this.ws?.readyState === WebSocket.OPEN;
  }
  
  getCurrentCampaignId(): string | null {
    return this.campaignId;
  }

  onMessage(handler: (data: any) => void) {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  // Throttle token moves per token to prevent flooding
  private tokenMoveTimestamps: Map<string, number> = new Map();
  
  sendTokenMove(tokenId: string, x: number, y: number, force = false, path?: { x: number; y: number }[]) {
    if (!this.campaignId) {
      console.error('Cannot send token move: not connected to a campaign');
      return;
    }

    if (!force) {
      const now = Date.now();
      const lastMove = this.tokenMoveTimestamps.get(tokenId) || 0;
      if (now - lastMove < 50) return;
      this.tokenMoveTimestamps.set(tokenId, now);
    } else {
      this.tokenMoveTimestamps.set(tokenId, Date.now());
    }

    this.send({ type: 'token_move', campaignId: this.campaignId, tokenId, x, y, path });
  }

  sendChatMessage(userId: string, sender: string, text: string, messageType = 'chat', recipientId?: string, recipientName?: string) {
    if (!this.campaignId) {
      console.error('Cannot send chat message: not connected to a campaign');
      return;
    }
    this.send({ type: 'chat_message', campaignId: this.campaignId, text, messageType, recipientId, recipientName });
  }

  sendCharacterUpdate(characterId: string) {
    if (!this.campaignId) {
      console.error('Cannot send character update: not connected to a campaign');
      return;
    }
    this.send({ type: 'character_update', campaignId: this.campaignId, characterId });
  }
  
  sendDiceRoll(dieType: string, modifier: number = 0, purpose?: string, characterId?: string, advantage?: 'none' | 'advantage' | 'disadvantage') {
    if (!this.campaignId) {
      console.error('Cannot send dice roll: not connected to a campaign');
      return;
    }
    
    const message = { 
      type: 'request_dice_roll', 
      campaignId: this.campaignId, 
      dieType,
      modifier,
      purpose,
      characterId,
      advantage: advantage || 'none'
    };
    
    // If not yet joined, queue the message
    if (!this.joinedCampaign) {
      console.log('WebSocket: Queueing dice roll until campaign join is confirmed');
      this.pendingMessages.push(message);
      return;
    }
    
    this.send(message);
  }
  
  sendInitiativeRoll(sceneId: string, characterId: string) {
    if (!this.campaignId) {
      console.error('Cannot send initiative roll: not connected to a campaign');
      return;
    }
    
    const message = { 
      type: 'request_initiative_roll', 
      campaignId: this.campaignId, 
      sceneId,
      characterId
    };
    
    // If not yet joined, queue the message
    if (!this.joinedCampaign) {
      console.log('WebSocket: Queueing initiative roll until campaign join is confirmed');
      this.pendingMessages.push(message);
      return;
    }
    
    this.send(message);
  }
  
  // Send combat damage - bypasses normal edit permissions
  // Anyone in the campaign can apply damage to tokens during combat
  sendCombatDamage(
    characterId: string, 
    damage: number, 
    damageType?: string, 
    attackerName?: string,
    isHealing?: boolean
  ) {
    if (!this.campaignId) {
      console.error('Cannot send combat damage: not connected to a campaign');
      return;
    }
    
    const message = { 
      type: 'apply_combat_damage', 
      campaignId: this.campaignId, 
      characterId,
      damage,
      damageType,
      attackerName,
      isHealing: isHealing || false
    };
    
    // If not yet joined, queue the message
    if (!this.joinedCampaign) {
      console.log('WebSocket: Queueing combat damage until campaign join is confirmed');
      this.pendingMessages.push(message);
      return;
    }
    
    this.send(message);
  }
  
  // Send combat energy - bypasses normal edit permissions
  // For Energy damage type spells - adds or subtracts from target's energy
  sendCombatEnergy(
    characterId: string, 
    amount: number, 
    attackerName?: string,
    isGain?: boolean
  ) {
    if (!this.campaignId) {
      console.error('Cannot send combat energy: not connected to a campaign');
      return;
    }
    
    const message = { 
      type: 'apply_combat_energy', 
      campaignId: this.campaignId, 
      characterId,
      amount,
      attackerName,
      isGain: isGain || false
    };
    
    // If not yet joined, queue the message
    if (!this.joinedCampaign) {
      console.log('WebSocket: Queueing combat energy until campaign join is confirmed');
      this.pendingMessages.push(message);
      return;
    }
    
    this.send(message);
  }
  
  sendCombatMana(
    characterId: string, 
    amount: number, 
    attackerName?: string,
    isGain?: boolean
  ) {
    if (!this.campaignId) {
      console.error('Cannot send combat mana: not connected to a campaign');
      return;
    }
    
    const message = { 
      type: 'apply_combat_mana', 
      campaignId: this.campaignId, 
      characterId,
      amount,
      attackerName,
      isGain: isGain || false
    };
    
    if (!this.joinedCampaign) {
      console.log('WebSocket: Queueing combat mana until campaign join is confirmed');
      this.pendingMessages.push(message);
      return;
    }
    
    this.send(message);
  }
  
  // Send AoE targeting state - broadcasts to all campaign members
  // so everyone can see each other's AoE placement
  sendAoeTargeting(
    aoeState: {
      active: boolean;
      spellName?: string;
      spellAoe?: string;
      casterTokenId?: string;
      casterName?: string;
      center: { x: number; y: number };
      locked: boolean;
    }
  ) {
    if (!this.campaignId) {
      console.error('Cannot send AoE targeting: not connected to a campaign');
      return;
    }
    
    const message = { 
      type: 'aoe_targeting',
      campaignId: this.campaignId,
      ...aoeState
    };
    
    // If not yet joined, queue the message
    if (!this.joinedCampaign) {
      console.log('WebSocket: Queueing AoE targeting until campaign join is confirmed');
      this.pendingMessages.push(message);
      return;
    }
    
    this.send(message);
  }
  
  // Clear AoE targeting when exiting targeting mode
  clearAoeTargeting() {
    if (!this.campaignId) return;
    
    this.send({
      type: 'aoe_targeting',
      campaignId: this.campaignId,
      active: false,
      center: { x: 0, y: 0 },
      locked: false
    });
  }
  
  // Send roll notification - broadcasts to all campaign members
  // so everyone can see each other's attack/damage/spell rolls
  sendRollNotification(notification: {
    type: string;
    dieType?: string;
    label: string;
    result: number;
    modifier?: number;
    total: number;
    username?: string;
    characterName?: string;
    calculationBreakdown?: string;
    isHealing?: boolean;
    customColor?: string;
  }) {
    if (!this.campaignId) {
      return;
    }
    
    const message = { 
      type: 'roll_notification',
      campaignId: this.campaignId,
      notification
    };
    
    // If not yet joined, queue the message
    if (!this.joinedCampaign) {
      this.pendingMessages.push(message);
      return;
    }
    
    this.send(message);
  }
  
  // Send token targeting state - broadcasts to all campaign members
  // so GMs can see who is targeting which token
  sendTokenTargeting(targetState: {
    targetTokenId: string | null;
    characterId?: string;
    characterName?: string;
  }) {
    if (!this.campaignId) {
      console.error('Cannot send token targeting: not connected to a campaign');
      return;
    }
    
    const message = { 
      type: 'token_targeting',
      campaignId: this.campaignId,
      ...targetState
    };
    
    // If not yet joined, queue the message
    if (!this.joinedCampaign) {
      console.log('WebSocket: Queueing token targeting until campaign join is confirmed');
      this.pendingMessages.push(message);
      return;
    }
    
    this.send(message);
  }
  
  // Clear token targeting when exiting target mode
  clearTokenTargeting() {
    if (!this.campaignId) return;
    
    this.send({
      type: 'token_targeting',
      campaignId: this.campaignId,
      targetTokenId: null
    });
  }
  
  // Send viewport update - broadcasts to all campaign members
  // so GMs can see where each player is looking on the battle map
  sendViewport(viewportState: {
    viewportX: number;
    viewportY: number;
    viewportWidth: number;
    viewportHeight: number;
    zoom: number;
  }) {
    if (!this.campaignId) {
      return;
    }
    
    const message = { 
      type: 'viewport_update',
      campaignId: this.campaignId,
      ...viewportState
    };
    
    // If not yet joined, queue the message
    if (!this.joinedCampaign) {
      this.pendingMessages.push(message);
      return;
    }
    
    this.send(message);
  }

  // Tell other campaign members whether this client's tab is actually being
  // looked at, so the GM's "Show player screens" overlay can hide a player
  // who has been tabbed away for a while instead of showing a stale view.
  sendViewportVisibility(visible: boolean) {
    if (!this.campaignId) {
      return;
    }

    const message = {
      type: 'viewport_visibility',
      campaignId: this.campaignId,
      visible,
    };

    if (!this.joinedCampaign) {
      this.pendingMessages.push(message);
      return;
    }

    this.send(message);
  }

  // Send beacon - broadcasts a temporary pulsating ring to all campaign members
  // Used to draw attention to a specific grid location
  sendBeacon(beaconState: {
    gridX: number;
    gridY: number;
  }) {
    if (!this.campaignId) {
      return;
    }
    
    const message = { 
      type: 'beacon',
      campaignId: this.campaignId,
      ...beaconState
    };
    
    // If not yet joined, queue the message
    if (!this.joinedCampaign) {
      this.pendingMessages.push(message);
      return;
    }
    
    this.send(message);
  }
  
  // Send ruler/AOE measurement marker - broadcasts to all OTHER campaign members.
  // action 'place' adds a persistent marker, 'clear' removes the sender's markers,
  // 'clearAll' (GM) removes everyone's markers. Pure measurement layer (no damage).
  sendRuler(payload: {
    action: 'place' | 'clear' | 'clearAll';
    marker?: {
      id: string;
      shape: 'cone' | 'line' | 'square' | 'circle';
      casterX: number;
      casterY: number;
      targetX: number;
      targetY: number;
      length?: number;
      width?: number;
      arc?: number;
      side?: number;
      radius?: number;
    };
  }) {
    if (!this.campaignId) return;

    const message = {
      type: 'ruler',
      campaignId: this.campaignId,
      ...payload,
    };

    if (!this.joinedCampaign) {
      this.pendingMessages.push(message);
      return;
    }

    this.send(message);
  }

  // Send thrown item placed - broadcasts to all campaign members
  // so everyone can see throwable items placed on the map
  sendThrownItemPlaced(thrownItem: ThrownItem, sceneId: string) {
    if (!this.campaignId) {
      return;
    }
    
    const message = { 
      type: 'thrown_item_placed',
      campaignId: this.campaignId,
      thrownItem,
      sceneId
    };
    
    // If not yet joined, queue the message
    if (!this.joinedCampaign) {
      this.pendingMessages.push(message);
      return;
    }
    
    this.send(message);
  }
  
  // Send thrown items detonated - broadcasts to all campaign members
  // so everyone can see detonation effects and damage
  sendThrownItemsDetonated(itemId: string, sceneId: string, detonationData: {
    itemName: string;
    damageRoll: number;
    damageType: string;
    affectedTokenIds: string[];
    affectedNames: string[];
    characterName: string;
  }) {
    if (!this.campaignId) {
      return;
    }
    
    const message = { 
      type: 'thrown_items_detonated',
      campaignId: this.campaignId,
      itemId,
      sceneId,
      ...detonationData
    };
    
    // If not yet joined, queue the message
    if (!this.joinedCampaign) {
      this.pendingMessages.push(message);
      return;
    }
    
    this.send(message);
  }
}

export const gameWs = new GameWebSocket();

// User Notification types
export interface UserNotification {
  id: string;
  userId: string;
  type: string;
  title: string;
  message: string | null;
  referenceId: string | null;
  isRead: boolean;
  createdAt: string;
}

// Terms & Conditions types
export interface TermsAndConditions {
  id: string;
  version: number;
  content: string;
  updatedBy: string;
  createdAt: string;
}

// User Notification API functions
export async function getNotifications(): Promise<UserNotification[]> {
  const response = await fetch('/api/notifications');
  if (!response.ok) {
    throw new Error('Failed to fetch notifications');
  }
  return response.json();
}

export async function getUnreadNotificationCount(): Promise<number> {
  const response = await fetch('/api/notifications/count');
  if (!response.ok) {
    throw new Error('Failed to fetch notification count');
  }
  const data = await response.json();
  return data.count;
}

export async function markNotificationRead(id: string): Promise<void> {
  const response = await fetch(`/api/notifications/${id}/read`, {
    method: 'POST',
  });
  if (!response.ok) {
    throw new Error('Failed to mark notification as read');
  }
}

export async function markAllNotificationsRead(): Promise<void> {
  const response = await fetch('/api/notifications/read-all', {
    method: 'POST',
  });
  if (!response.ok) {
    throw new Error('Failed to mark all notifications as read');
  }
}

export async function deleteNotification(id: string): Promise<void> {
  const response = await fetch(`/api/notifications/${id}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    throw new Error('Failed to delete notification');
  }
}

// Terms & Conditions API functions
export async function getTerms(): Promise<TermsAndConditions | null> {
  const response = await fetch('/api/terms');
  if (!response.ok) {
    throw new Error('Failed to fetch terms');
  }
  return response.json();
}

export async function updateTerms(content: string): Promise<TermsAndConditions> {
  const response = await fetch('/api/terms', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ content }),
  });
  if (!response.ok) {
    throw new Error('Failed to update terms');
  }
  return response.json();
}

export async function getTermsStatus(): Promise<{ hasAccepted: boolean; currentVersion: number | null }> {
  const response = await fetch('/api/terms/status');
  if (!response.ok) {
    throw new Error('Failed to check terms status');
  }
  const data = await response.json();
  return { hasAccepted: data.hasAccepted, currentVersion: data.currentVersion ?? null };
}

export async function acceptTerms(): Promise<void> {
  const response = await fetch('/api/terms/accept', {
    method: 'POST',
  });
  if (!response.ok) {
    throw new Error('Failed to accept terms');
  }
}

// WebSocket client for note collaboration
export interface NotePresence {
  userId: string;
  username: string;
  cursorPosition?: { line: number; column: number } | null;
  lastActive: number;
}

export type NoteCollaborationHandler = (data: any) => void;

export class NoteWebSocket {
  private ws: WebSocket | null = null;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private messageHandlers: Set<NoteCollaborationHandler> = new Set();
  private joinedNotes: Set<string> = new Set();
  private isConnected: boolean = false;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;

  connect() {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }
    
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    
    console.log('NoteWebSocket: Creating connection');
    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      console.log('NoteWebSocket: Connection opened');
      this.isConnected = true;
      this.reconnectAttempts = 0;
      
      // Rejoin any notes we were in
      this.joinedNotes.forEach((noteId) => {
        this.send({ type: 'join_note', noteId });
      });
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        // Handle note-related messages
        if (['note_joined', 'note_update', 'note_presence_update', 'cursor_update'].includes(data.type)) {
          this.messageHandlers.forEach(handler => handler(data));
        }
      } catch (e) {
        console.error('NoteWebSocket: Error parsing message:', e);
      }
    };

    this.ws.onclose = () => {
      console.log('NoteWebSocket: Connection closed');
      this.isConnected = false;
      
      // Attempt reconnect if we have joined notes
      if (this.joinedNotes.size > 0 && this.reconnectAttempts < this.maxReconnectAttempts) {
        this.reconnectAttempts++;
        const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
        this.reconnectTimeout = setTimeout(() => {
          console.log('NoteWebSocket: Attempting reconnect...');
          this.connect();
        }, delay);
      }
    };

    this.ws.onerror = (error) => {
      console.error('NoteWebSocket error:', error);
    };
  }

  disconnect() {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    
    // Leave all notes before disconnecting
    this.joinedNotes.forEach((noteId) => {
      this.send({ type: 'leave_note', noteId });
    });
    
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    
    this.isConnected = false;
    this.joinedNotes.clear();
    this.messageHandlers.clear();
  }

  private send(data: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  onMessage(handler: NoteCollaborationHandler) {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  joinNote(noteId: string) {
    if (!this.isConnected) {
      this.connect();
    }
    
    if (!this.joinedNotes.has(noteId)) {
      this.joinedNotes.add(noteId);
      this.send({ type: 'join_note', noteId });
    }
  }

  leaveNote(noteId: string) {
    if (this.joinedNotes.has(noteId)) {
      this.joinedNotes.delete(noteId);
      this.send({ type: 'leave_note', noteId });
    }
    
    // If no more notes, we can disconnect
    if (this.joinedNotes.size === 0) {
      this.disconnect();
    }
  }

  sendNoteUpdate(noteId: string, updates: { title?: string; content?: string; canvasData?: string }) {
    if (!this.joinedNotes.has(noteId)) return;
    
    this.send({
      type: 'note_update',
      noteId,
      ...updates
    });
  }

  sendCursorUpdate(noteId: string, cursorPosition: { line: number; column: number } | null, selection?: { start: number; end: number }) {
    if (!this.joinedNotes.has(noteId)) return;
    
    this.send({
      type: 'cursor_update',
      noteId,
      cursorPosition,
      selection
    });
  }

  isJoinedToNote(noteId: string): boolean {
    return this.joinedNotes.has(noteId) && this.isConnected;
  }
}

export const noteWs = new NoteWebSocket();

export class GlobalWebSocket {
  private ws: WebSocket | null = null;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private messageHandlers: Set<(data: any) => void> = new Set();
  private isConnected: boolean = false;

  connect() {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      this.isConnected = true;
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this.messageHandlers.forEach(handler => handler(data));
      } catch (e) {
        // ignore parse errors
      }
    };

    this.ws.onclose = () => {
      this.isConnected = false;
      this.reconnectTimeout = setTimeout(() => {
        this.connect();
      }, 3000);
    };

    this.ws.onerror = () => {};
  }

  disconnect() {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }
    this.isConnected = false;
  }

  onMessage(handler: (data: any) => void) {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }
}

export const globalWs = new GlobalWebSocket();
