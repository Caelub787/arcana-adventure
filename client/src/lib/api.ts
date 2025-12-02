// API client for backend communication

export interface User {
  id: string;
  email: string;
  username: string;
  name: string;
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
  inventory: string[];
}

export interface Token {
  id: string;
  campaignId: string;
  characterId?: string;
  type: string;
  x: number;
  y: number;
  image: string;
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
}

export interface Spell {
  id: string;
  characterId: string;
  name: string;
  image?: string;
  description?: string;
  damage?: string;
  damageType?: string;
  range?: number;
  aoe?: string;
  castingTime?: string;
  duration?: string;
  level: number;
  school?: string;
  isEquipped: boolean;
}

export interface SystemSpecies {
  id: string;
  systemName: string;
  name: string;
  description?: string;
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
  featTree?: string;
  createdAt: string;
}

export interface CharacterPermission {
  id: string;
  characterId: string;
  userId: string;
  accessLevel: string;
}

export interface CampaignBan {
  id: string;
  campaignId: string;
  userId: string;
  bannedAt: string;
  reason?: string;
  username: string;
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

  // Tokens
  async createToken(campaignId: string, token: Omit<Token, 'id' | 'campaignId'>): Promise<Token> {
    return this.request(`/campaigns/${campaignId}/tokens`, {
      method: 'POST',
      body: JSON.stringify(token),
    });
  }

  async getCampaignTokens(campaignId: string): Promise<Token[]> {
    return this.request(`/campaigns/${campaignId}/tokens`);
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
  
  // Chat
  async getChatMessages(campaignId: string): Promise<ChatMessage[]> {
    return this.request(`/campaigns/${campaignId}/chat`);
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

  async setActiveScene(campaignId: string, sceneId: string): Promise<void> {
    return this.request(`/campaigns/${campaignId}/active-scene`, {
      method: 'POST',
      body: JSON.stringify({ sceneId }),
    });
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

  // Admin System Items
  async getSystemItems(): Promise<Item[]> {
    return this.request('/admin/system-items');
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
}

export const gameWs = new GameWebSocket();
