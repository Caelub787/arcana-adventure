import React, { useState } from "react";
import { Link, useLocation } from "wouter";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Trash2, LogOut, Play, Plus, Crown, User, Heart, Star } from "lucide-react";
import bgImage from "@assets/generated_images/dark_fantasy_landscape_with_arcane_ruins.png";

// Mock Data with Favorite flag
const MOCK_CAMPAIGNS = {
  created: [
    { id: "c1", name: "The Shadowed Keep", players: 4, lastPlayed: "2 hours ago", favorite: true },
    { id: "c2", name: "Ruins of Azlant", players: 2, lastPlayed: "1 week ago", favorite: false },
  ],
  joined: [
    { id: "j1", name: "Curse of Strahd", gm: "DungeonMaster99", charName: "Valerius", lastPlayed: "Yesterday", favorite: true },
  ]
};

export default function MyCampaigns() {
  const [_, setLocation] = useLocation();
  const [campaigns, setCampaigns] = useState(MOCK_CAMPAIGNS);

  const handleDelete = (id: string) => {
    setCampaigns(prev => ({
      ...prev,
      created: prev.created.filter(c => c.id !== id)
    }));
  };

  const handleLeave = (id: string) => {
    setCampaigns(prev => ({
      ...prev,
      joined: prev.joined.filter(c => c.id !== id)
    }));
  };

  const toggleFavorite = (id: string, type: 'created' | 'joined') => {
    setCampaigns(prev => ({
      ...prev,
      [type]: prev[type].map(c => 
        c.id === id ? { ...c, favorite: !c.favorite } : c
      )
    }));
  };

  const renderCampaignCard = (campaign: any, type: 'created' | 'joined') => {
    const isCreated = type === 'created';
    const borderColor = isCreated ? 'hover:border-amber-900/50' : 'hover:border-blue-900/50';
    const launchButton = isCreated 
      ? (
        <Button className="w-full bg-amber-900/50 hover:bg-amber-800 text-amber-100 border border-amber-900" onClick={() => setLocation("/campaign?role=gm")}>
          <Play className="h-4 w-4 mr-2" /> Launch
        </Button>
      ) 
      : (
        <Button className="w-full bg-blue-900/30 hover:bg-blue-800/50 text-blue-100 border border-blue-900" onClick={() => setLocation("/campaign?role=player")}>
          <Play className="h-4 w-4 mr-2" /> Resume
        </Button>
      );

    return (
      <Card key={campaign.id} className={`bg-stone-900/60 border-stone-800 backdrop-blur transition-all group ${borderColor}`}>
        <CardHeader className="pb-2">
          <CardTitle className="flex justify-between items-start text-lg text-stone-200 font-display">
            <div className="flex items-center gap-2">
              {campaign.name}
              {isCreated && <Crown className="h-3 w-3 text-amber-600" />}
            </div>
            <div className="flex gap-1">
              <Button 
                variant="ghost" 
                size="icon" 
                className={`h-8 w-8 ${campaign.favorite ? 'text-red-500' : 'text-stone-600 hover:text-red-400'} hover:bg-stone-800`}
                onClick={() => toggleFavorite(campaign.id, type)}
              >
                <Heart className={`h-4 w-4 ${campaign.favorite ? 'fill-current' : ''}`} />
              </Button>
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-8 w-8 text-stone-600 hover:text-red-400 hover:bg-red-950/30"
                onClick={() => isCreated ? handleDelete(campaign.id) : handleLeave(campaign.id)}
              >
                {isCreated ? <Trash2 className="h-4 w-4" /> : <LogOut className="h-4 w-4" />}
              </Button>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-stone-500 mb-4 space-y-1">
            <div className="flex justify-between">
              <span>{isCreated ? `${campaign.players} Players` : `GM: ${campaign.gm}`}</span>
              <span>{campaign.lastPlayed}</span>
            </div>
            {!isCreated && <div className="text-blue-400">Playing as: {campaign.charName}</div>}
          </div>
          {launchButton}
        </CardContent>
      </Card>
    );
  };

  const allCampaigns = [
    ...campaigns.created.map(c => ({ ...c, type: 'created' as const })), 
    ...campaigns.joined.map(c => ({ ...c, type: 'joined' as const }))
  ];
  
  const favorites = allCampaigns.filter(c => c.favorite);

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-black font-sans text-stone-100">
      {/* Background Layer */}
      <div className="absolute inset-0 z-0">
        <img 
          src={bgImage} 
          alt="Background" 
          className="h-full w-full object-cover opacity-40 blur-sm"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/80 via-black/50 to-black/80" />
      </div>

      <div className="relative z-10 container mx-auto p-6 max-w-4xl">
        
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => setLocation("/")} className="text-stone-400 hover:text-white hover:bg-white/10">
              <ArrowLeft />
            </Button>
            <h1 className="font-display text-4xl font-bold text-amber-500">My Campaigns</h1>
          </div>
          
          {/* New Campaign Button - Prominent */}
          <Button 
            className="bg-amber-700 hover:bg-amber-600 text-white font-bold shadow-lg shadow-amber-900/20"
            onClick={() => setLocation("/campaign?role=gm&new=true")}
          >
            <Plus className="h-4 w-4 mr-2" /> New Campaign
          </Button>
        </div>

        <Tabs defaultValue="all" className="w-full">
          <TabsList className="grid w-full grid-cols-2 bg-stone-900/80 border border-stone-800">
            <TabsTrigger value="all" className="data-[state=active]:bg-stone-800 data-[state=active]:text-stone-100">All Campaigns</TabsTrigger>
            <TabsTrigger value="favorites" className="data-[state=active]:bg-stone-800 data-[state=active]:text-stone-100 flex items-center gap-2">
              <Heart className="h-3 w-3 fill-current text-red-500" /> Favorites
            </TabsTrigger>
          </TabsList>
          
          <div className="mt-6">
            <TabsContent value="all" className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
              {/* Created Section */}
              <section>
                <div className="flex items-center justify-between mb-4 border-b border-stone-800 pb-2">
                  <h2 className="text-xl font-bold text-stone-300 flex items-center gap-2">
                    <Crown className="h-5 w-5 text-amber-600" /> Created
                  </h2>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  {campaigns.created.map(c => renderCampaignCard(c, 'created'))}
                  {campaigns.created.length === 0 && (
                    <div className="col-span-2 text-center py-8 text-stone-600 italic border border-dashed border-stone-800 rounded bg-stone-950/30">
                      No active created campaigns.
                    </div>
                  )}
                </div>
              </section>

              {/* Joined Section */}
              <section>
                <div className="flex items-center justify-between mb-4 border-b border-stone-800 pb-2">
                  <h2 className="text-xl font-bold text-stone-300 flex items-center gap-2">
                    <User className="h-5 w-5 text-blue-500" /> Joined
                  </h2>
                  <Button size="sm" variant="outline" className="bg-stone-900 border-stone-700 hover:bg-stone-800 text-xs">
                    <Plus className="h-3 w-3 mr-1" /> Join Existing
                  </Button>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  {campaigns.joined.map(c => renderCampaignCard(c, 'joined'))}
                  {campaigns.joined.length === 0 && (
                    <div className="col-span-2 text-center py-8 text-stone-600 italic border border-dashed border-stone-800 rounded bg-stone-950/30">
                      No joined campaigns.
                    </div>
                  )}
                </div>
              </section>
            </TabsContent>

            <TabsContent value="favorites" className="animate-in fade-in slide-in-from-bottom-4 duration-500">
               <div className="grid gap-4 md:grid-cols-2">
                  {favorites.map(c => renderCampaignCard(c, c.type))}
                  {favorites.length === 0 && (
                    <div className="col-span-2 text-center py-12 text-stone-500 flex flex-col items-center gap-2 border border-dashed border-stone-800 rounded bg-stone-950/30">
                      <Heart className="h-8 w-8 text-stone-700" />
                      <p>No favorites yet. Heart a campaign to see it here!</p>
                    </div>
                  )}
               </div>
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </div>
  );
}
