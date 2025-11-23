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
  }
};
