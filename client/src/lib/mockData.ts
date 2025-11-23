export interface Campaign {
  id: string;
  name: string;
  players?: number;
  gm?: string;
  charName?: string;
  lastPlayed: string;
  favorite: boolean;
  type: 'created' | 'joined';
  inviteCode?: string;
  gridSize?: number;
}

export const MOCK_CAMPAIGNS: Campaign[] = [
  { id: "c1", name: "The Shadowed Keep", players: 4, lastPlayed: "2 hours ago", favorite: true, type: 'created' },
  { id: "c2", name: "Ruins of Azlant", players: 2, lastPlayed: "1 week ago", favorite: false, type: 'created' },
  { id: "j1", name: "Curse of Strahd", gm: "DungeonMaster99", charName: "Valerius", lastPlayed: "Yesterday", favorite: true, type: 'joined' },
];
