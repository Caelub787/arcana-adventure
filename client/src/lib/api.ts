// API client for backend communication

export interface User {
  id: string;
  email: string;
  username: string;
  name: string;
  isAdmin?: boolean;
}

export interface Campaign {
  id: string;
  name: string;
  inviteCode: string;
  gmUserId: string;
  gridSize: number;
  currentMap?: string;
  activeSceneId?: string;
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
  race: string;
  size: string;
  sizeBonus: number;
  naturalArmor: number;
  speed: number;
  flySpeed: number;
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
  defaultViewX: number;
  defaultViewY: number;
  defaultViewZoom: number;
  inCombat: boolean;
  currentTurnCharacterId?: string;
  createdAt: string;
}

export interface InitiativeEntry {
  id: string;
  sceneId: string;
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
  isContainer: boolean;
  carryCapacity?: number;
  isEquipped: boolean;
  weaponCategory?: string;
  isHeavy?: boolean;
  ammunitionType?: string;
  armorBonus?: number;
  breakChance?: number;
  armorSlot?: string;
  damageReduction?: number;
  damageReductionType?: string;
  isThrowable?: boolean;
  throwableAoe?: boolean;
  throwableAoeShape?: string;
  throwableAoeRange?: number;
  throwablePickup?: boolean;
  isDamaging?: boolean;
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

export interface SystemTrait {
  id: string;
  name: string;
  description?: string;
  parentAttribute: string;
  usesPerLongRest: number;
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
  currentUses: number;
  createdAt: string;
}

export interface UserProfile {
  id: string;
  username: string;
  name: string;
  avatarUrl?: string;
  bio?: string;
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
    throwableAoeRange?: number | null;
    throwableAoeShape?: string | null;
    throwableAoe?: boolean;
  } | null;
}

class ApiClient {
  private baseUrl = '/api';

  private async request<T>(url: string, options?: RequestInit): Promise<T> {
    const response = await fetch(`${this.baseUrl}${url}`, {
      ...options,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(error.error || 'Request failed');
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

  async login(email: string, password: string): Promise<{ user: User }> {
    return this.request('/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  }

  async logout(): Promise<void> {
    return this.request('/logout', { method: 'POST' });
  }

  async getMe(): Promise<{ user: User }> {
    return this.request('/me');
  }

  // Campaigns
  async createCampaign(name: string, gridSize?: number, currentMap?: string): Promise<Campaign> {
    return this.request('/campaigns', {
      method: 'POST',
      body: JSON.stringify({ name, gridSize, currentMap }),
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

  // Rest actions
  async shortRest(characterId: string): Promise<{
    success: boolean;
    hpRestored: number;
    newHp: number;
    rationsConsumed: number;
    character: Character;
    dieType?: string;
    hpRoll?: number;
  }> {
    return this.request(`/characters/${characterId}/short-rest`, {
      method: 'POST',
    });
  }

  async longRest(characterId: string): Promise<{
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
  
  // Chat
  async getChatMessages(campaignId: string): Promise<ChatMessage[]> {
    return this.request(`/campaigns/${campaignId}/chat`);
  }

  async clearChatMessages(campaignId: string): Promise<void> {
    return this.request(`/campaigns/${campaignId}/chat`, { method: 'DELETE' });
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

  // Public system item (single item for entity references)
  async getSystemItem(id: string): Promise<Item> {
    return this.request(`/system-items/${id}`);
  }

  // Lightweight item summaries for fast picker loading (no images to avoid response size limits)
  async getSystemItemSummaries(): Promise<{ id: string; name: string; itemType: string; rarity: string; weight: number }[]> {
    return this.request('/system-items/summary');
  }

  async getTemplateItemSummaries(campaignId: string): Promise<{ campaignItems: { id: string; name: string; itemType: string; rarity: string; weight: number }[], systemItems: { id: string; name: string; itemType: string; rarity: string; weight: number }[] }> {
    return this.request(`/campaigns/${campaignId}/template-items/summary`);
  }

  // Lazy-load individual item image for item picker
  async getItemImage(itemId: string): Promise<{ image: string | null }> {
    return this.request(`/items/${itemId}/image`);
  }

  // Admin System Items
  async getSystemItems(): Promise<Item[]> {
    return this.request('/admin/system-items');
  }

  // Public System Items (for notes graph and entity references)
  async getPublicSystemItems(): Promise<Item[]> {
    return this.request('/system-items');
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

  // Admin System Species
  async getSystemSpecies(systemName?: string): Promise<SystemSpecies[]> {
    const params = systemName ? `?system=${encodeURIComponent(systemName)}` : '';
    return this.request(`/admin/system-species${params}`);
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
  async getSpecies(systemName?: string): Promise<SystemSpecies[]> {
    const params = systemName ? `?system=${encodeURIComponent(systemName)}` : '';
    return this.request(`/species${params}`);
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
  async getSystemSpells(): Promise<SystemSpell[]> {
    return this.request('/admin/spells');
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
  async getSystemSkills(): Promise<SystemSkill[]> {
    return this.request('/admin/skills');
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
  async getPublicSkills(): Promise<SystemSkill[]> {
    return this.request('/skills');
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
  async getSystemTraits(): Promise<SystemTrait[]> {
    return this.request('/admin/traits');
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
  async getPublicTraits(): Promise<SystemTrait[]> {
    return this.request('/traits');
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
  async getPublicSpells(): Promise<SystemSpell[]> {
    return this.request('/spells');
  }

  // Admin Character Templates
  async getCharacterTemplates(): Promise<Character[]> {
    return this.request('/admin/character-templates');
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

  // Public character templates (for campaign use)
  async getPublicCharacterTemplates(): Promise<Character[]> {
    return this.request('/character-templates');
  }

  async copyTemplateToCompany(campaignId: string, templateId: string): Promise<Character> {
    return this.request(`/campaigns/${campaignId}/characters/from-template/${templateId}`, {
      method: 'POST',
    });
  }

  // Admin Feat Trees
  async getFeatTrees(): Promise<FeatTree[]> {
    return this.request('/admin/feat-trees');
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
  async getPublicFeatTrees(): Promise<FeatTree[]> {
    return this.request('/feat-trees');
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
  async getSceneInitiative(sceneId: string): Promise<InitiativeData> {
    return this.request(`/scenes/${sceneId}/initiative`);
  }

  async rollInitiative(sceneId: string, characterId: string, value: number, isHidden?: boolean): Promise<InitiativeEntry> {
    return this.request(`/scenes/${sceneId}/initiative`, {
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

  async clearSceneInitiative(sceneId: string): Promise<void> {
    return this.request(`/scenes/${sceneId}/initiative`, { method: 'DELETE' });
  }

  async updateCombatState(sceneId: string, inCombat: boolean, currentTurnCharacterId?: string): Promise<Scene> {
    return this.request(`/scenes/${sceneId}/combat`, {
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

  // Token Effects - public read, admin write
  async getTokenEffects(): Promise<TokenEffect[]> {
    return this.request('/token-effects');
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
}

export interface SearchableEntity {
  id: string;
  type: 'spell' | 'trait' | 'skill' | 'item' | 'species' | 'character';
  name: string;
  description?: string;
  icon?: string;
}

export const api = new ApiClient();

// WebSocket client for real-time updates
export class GameWebSocket {
  private ws: WebSocket | null = null;
  private campaignId: string | null = null;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private messageHandlers: Set<(data: any) => void> = new Set();
  private joinedCampaign: boolean = false;
  private pendingMessages: Array<any> = [];

  connect(campaignId: string) {
    // If already connected to this campaign and joined, don't reconnect
    if (this.campaignId === campaignId && this.joinedCampaign && this.ws && this.ws.readyState === WebSocket.OPEN) {
      console.log('WebSocket: Already connected and joined to campaign:', campaignId);
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
    this.joinedCampaign = false;
    this.pendingMessages = [];
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    
    console.log('WebSocket: Creating new connection for campaign:', campaignId);
    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      console.log('WebSocket: Connection opened, sending join_campaign for:', campaignId);
      this.send({ type: 'join_campaign', campaignId });
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
      this.reconnectTimeout = setTimeout(() => {
        if (this.campaignId) {
          console.log('WebSocket: Attempting reconnect to campaign:', this.campaignId);
          this.connect(this.campaignId);
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
    this.joinedCampaign = false;
    this.pendingMessages = [];
    this.messageHandlers.clear();
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

  sendTokenMove(tokenId: string, x: number, y: number) {
    if (!this.campaignId) {
      console.error('Cannot send token move: not connected to a campaign');
      return;
    }
    this.send({ type: 'token_move', campaignId: this.campaignId, tokenId, x, y });
  }

  sendChatMessage(userId: string, sender: string, text: string, messageType = 'chat') {
    if (!this.campaignId) {
      console.error('Cannot send chat message: not connected to a campaign');
      return;
    }
    this.send({ type: 'chat_message', campaignId: this.campaignId, text, messageType });
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
