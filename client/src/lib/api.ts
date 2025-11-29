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
  createdAt: string;
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

  async updateCharacter(id: string, data: Partial<Character>): Promise<Character> {
    return this.request(`/characters/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
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
}

export const api = new ApiClient();

// WebSocket client for real-time updates
export class GameWebSocket {
  private ws: WebSocket | null = null;
  private campaignId: string | null = null;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private messageHandlers: Set<(data: any) => void> = new Set();

  connect(campaignId: string) {
    this.campaignId = campaignId;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    
    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      console.log('WebSocket connected');
      this.send({ type: 'join_campaign', campaignId });
    };

    this.ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      this.messageHandlers.forEach(handler => handler(data));
    };

    this.ws.onclose = () => {
      console.log('WebSocket disconnected, reconnecting...');
      this.reconnectTimeout = setTimeout(() => {
        if (this.campaignId) {
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
    this.messageHandlers.clear();
  }

  send(data: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
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
}

export const gameWs = new GameWebSocket();
