import React, { useState } from "react";
import { Link, useLocation } from "wouter";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Trash2, LogOut, Play, Plus, Crown, User } from "lucide-react";
import bgImage from "@assets/generated_images/dark_fantasy_landscape_with_arcane_ruins.png";

// Mock Data
const MOCK_CAMPAIGNS = {
  created: [
    { id: "c1", name: "The Shadowed Keep", players: 4, lastPlayed: "2 hours ago" },
    { id: "c2", name: "Ruins of Azlant", players: 2, lastPlayed: "1 week ago" },
  ],
  joined: [
    { id: "j1", name: "Curse of Strahd", gm: "DungeonMaster99", charName: "Valerius", lastPlayed: "Yesterday" },
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
        <div className="flex items-center gap-4 mb-8">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/")} className="text-stone-400 hover:text-white hover:bg-white/10">
            <ArrowLeft />
          </Button>
          <h1 className="font-display text-4xl font-bold text-amber-500">My Campaigns</h1>
        </div>

        <div className="space-y-10">
          
          {/* Created Campaigns Section */}
          <section>
            <div className="flex items-center justify-between mb-4 border-b border-stone-800 pb-2">
              <h2 className="text-xl font-bold text-stone-300 flex items-center gap-2">
                <Crown className="h-5 w-5 text-amber-600" /> Created Campaigns
              </h2>
              <Button size="sm" variant="outline" className="bg-stone-900 border-stone-700 hover:bg-stone-800 text-xs" onClick={() => setLocation("/campaign?role=gm&new=true")}>
                <Plus className="h-3 w-3 mr-1" /> New
              </Button>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {campaigns.created.map(campaign => (
                <Card key={campaign.id} className="bg-stone-900/60 border-stone-800 backdrop-blur hover:border-amber-900/50 transition-all group">
                  <CardHeader className="pb-2">
                    <CardTitle className="flex justify-between items-start text-lg text-stone-200 font-display">
                      {campaign.name}
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-8 w-8 text-stone-600 hover:text-red-400 hover:bg-red-950/30 -mt-1 -mr-2"
                        onClick={() => handleDelete(campaign.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex justify-between text-sm text-stone-500 mb-4">
                      <span>{campaign.players} Players</span>
                      <span>{campaign.lastPlayed}</span>
                    </div>
                    <Button className="w-full bg-amber-900/50 hover:bg-amber-800 text-amber-100 border border-amber-900" onClick={() => setLocation("/campaign?role=gm")}>
                      <Play className="h-4 w-4 mr-2" /> Launch
                    </Button>
                  </CardContent>
                </Card>
              ))}
              {campaigns.created.length === 0 && (
                <div className="col-span-2 text-center py-8 text-stone-600 italic border border-dashed border-stone-800 rounded bg-stone-950/30">
                  No active campaigns found. Start a new adventure!
                </div>
              )}
            </div>
          </section>

          {/* Joined Campaigns Section */}
          <section>
            <div className="flex items-center justify-between mb-4 border-b border-stone-800 pb-2">
              <h2 className="text-xl font-bold text-stone-300 flex items-center gap-2">
                <User className="h-5 w-5 text-blue-500" /> Joined Campaigns
              </h2>
              <Button size="sm" variant="outline" className="bg-stone-900 border-stone-700 hover:bg-stone-800 text-xs">
                <Plus className="h-3 w-3 mr-1" /> Join
              </Button>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {campaigns.joined.map(campaign => (
                <Card key={campaign.id} className="bg-stone-900/60 border-stone-800 backdrop-blur hover:border-blue-900/50 transition-all group">
                  <CardHeader className="pb-2">
                    <CardTitle className="flex justify-between items-start text-lg text-stone-200 font-display">
                      {campaign.name}
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-8 w-8 text-stone-600 hover:text-red-400 hover:bg-red-950/30 -mt-1 -mr-2"
                        onClick={() => handleLeave(campaign.id)}
                      >
                        <LogOut className="h-4 w-4" />
                      </Button>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-sm text-stone-500 mb-4 space-y-1">
                      <div className="flex justify-between">
                        <span>GM: {campaign.gm}</span>
                        <span>{campaign.lastPlayed}</span>
                      </div>
                      <div className="text-blue-400">Playing as: {campaign.charName}</div>
                    </div>
                    <Button className="w-full bg-blue-900/30 hover:bg-blue-800/50 text-blue-100 border border-blue-900" onClick={() => setLocation("/campaign?role=player")}>
                      <Play className="h-4 w-4 mr-2" /> Resume
                    </Button>
                  </CardContent>
                </Card>
              ))}
              {campaigns.joined.length === 0 && (
                <div className="col-span-2 text-center py-8 text-stone-600 italic border border-dashed border-stone-800 rounded bg-stone-950/30">
                  You haven't joined any campaigns yet.
                </div>
              )}
            </div>
          </section>

        </div>
      </div>
    </div>
  );
}
