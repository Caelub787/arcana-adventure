import { Campaign } from "./mockData";

const CAMPAIGNS_KEY = "arcana_campaigns";

export interface UserCampaigns {
  created: Campaign[];
  joined: Campaign[];
}

export const storage = {
  getCampaigns: (userEmail: string): UserCampaigns => {
    if (!userEmail) return { created: [], joined: [] };
    
    const allCampaigns = JSON.parse(localStorage.getItem(CAMPAIGNS_KEY) || "{}");
    const userCampaigns = allCampaigns[userEmail] || { created: [], joined: [] };
    
    return userCampaigns;
  },

  saveCampaigns: (userEmail: string, campaigns: UserCampaigns) => {
    if (!userEmail) return;

    const allCampaigns = JSON.parse(localStorage.getItem(CAMPAIGNS_KEY) || "{}");
    allCampaigns[userEmail] = campaigns;
    localStorage.setItem(CAMPAIGNS_KEY, JSON.stringify(allCampaigns));
  },

  addCreatedCampaign: (userEmail: string, campaign: Campaign) => {
    const campaigns = storage.getCampaigns(userEmail);
    // Generate a random invite code if not provided
    if (!campaign.inviteCode) {
      campaign.inviteCode = "ARCANA-" + Math.floor(1000 + Math.random() * 9000);
    }
    campaigns.created.push(campaign);
    storage.saveCampaigns(userEmail, campaigns);
  },

  toggleFavorite: (userEmail: string, campaignId: string, type: 'created' | 'joined') => {
    const campaigns = storage.getCampaigns(userEmail);
    const list = type === 'created' ? campaigns.created : campaigns.joined;
    
    const index = list.findIndex(c => c.id === campaignId);
    if (index !== -1) {
      list[index].favorite = !list[index].favorite;
      storage.saveCampaigns(userEmail, campaigns);
    }
    return campaigns;
  },

  deleteCreatedCampaign: (userEmail: string, campaignId: string) => {
    const campaigns = storage.getCampaigns(userEmail);
    campaigns.created = campaigns.created.filter(c => c.id !== campaignId);
    storage.saveCampaigns(userEmail, campaigns);
    return campaigns;
  },

  leaveJoinedCampaign: (userEmail: string, campaignId: string) => {
    const campaigns = storage.getCampaigns(userEmail);
    campaigns.joined = campaigns.joined.filter(c => c.id !== campaignId);
    storage.saveCampaigns(userEmail, campaigns);
    return campaigns;
  },

  joinCampaignByCode: (userEmail: string, code: string) => {
    const allData = JSON.parse(localStorage.getItem(CAMPAIGNS_KEY) || "{}");
    let foundCampaign: Campaign | null = null;
    let gmName = "Unknown GM";

    // Search for the campaign in all users' created lists
    for (const email in allData) {
      const userCampaigns = allData[email] as UserCampaigns;
      const match = userCampaigns.created.find(c => c.inviteCode === code);
      if (match) {
        foundCampaign = match;
        gmName = email.split('@')[0]; // Simple username from email
        break;
      }
    }

    if (foundCampaign) {
      const userCampaigns = storage.getCampaigns(userEmail);
      
      // Check if already joined
      if (userCampaigns.joined.some(c => c.id === foundCampaign!.id) || 
          userCampaigns.created.some(c => c.id === foundCampaign!.id)) {
        throw new Error("You are already in this campaign.");
      }

      const joinedCampaign: Campaign = {
        ...foundCampaign,
        type: 'joined',
        gm: gmName,
        charName: 'New Character', // Default
        lastPlayed: 'Never',
        favorite: false
      };

      userCampaigns.joined.push(joinedCampaign);
      storage.saveCampaigns(userEmail, userCampaigns);
      return userCampaigns;
    } else {
      throw new Error("Invalid invite code.");
    }
  }
};
