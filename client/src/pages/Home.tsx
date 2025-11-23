import React from "react";
import { motion } from "framer-motion";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Play, Users, Settings, ScrollText, Plus, Heart } from "lucide-react";
import bgImage from "@assets/generated_images/dark_fantasy_landscape_with_arcane_ruins.png";

import { MOCK_CAMPAIGNS } from "@/lib/mockData";

export default function Home() {
  const [location, setLocation] = useLocation();
  const favorites = MOCK_CAMPAIGNS.filter(c => c.favorite);
  const user = JSON.parse(localStorage.getItem("arcana_user") || "{}");

  const handleLogout = () => {
    localStorage.removeItem("arcana_user");
    setLocation("/login");
  };

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-black font-sans text-stone-100">
      {/* Background Layer */}
      <div className="absolute inset-0 z-0">
        <img 
          src={bgImage} 
          alt="Background" 
          className="h-full w-full object-cover opacity-60"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-transparent" />
      </div>

      {/* Content Layer */}
      <div className="relative z-10 flex min-h-screen flex-col items-center justify-center p-6">
        
        {/* User & Logout */}
        <div className="absolute top-4 right-4 flex items-center gap-4">
          <div className="text-stone-400 text-sm">
            Welcome, <span className="text-amber-500 font-bold">{user.name || "Traveler"}</span>
          </div>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={handleLogout}
            className="text-stone-500 hover:text-stone-300 hover:bg-stone-900/50"
          >
            Logout
          </Button>
        </div>

        {/* Title */}
        <motion.div 
          initial={{ y: -50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="mb-12 text-center"
        >
          <h1 className="font-display text-6xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-b from-amber-100 to-amber-600 drop-shadow-[0_4px_4px_rgba(0,0,0,0.8)] filter">
            Arcana Adventures
          </h1>
          <p className="mt-2 font-medieval text-xl text-stone-400">
            Tabletop Manager & RPG Hub
          </p>
        </motion.div>

        {/* Main Menu */}
        <motion.div 
          initial={{ y: 50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.2, ease: "easeOut" }}
          className="w-full max-w-4xl space-y-8"
        >
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            
            {/* New Campaign (Restored) */}
            <Link href="/campaign?role=gm&new=true">
              <Card className="group cursor-pointer border-stone-800 bg-stone-950/60 backdrop-blur-sm transition-all hover:-translate-y-1 hover:border-amber-600/50 hover:bg-stone-900/80 hover:shadow-[0_0_30px_rgba(217,119,6,0.2)]">
                <CardHeader>
                  <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-amber-900/30 text-amber-500 group-hover:bg-amber-600 group-hover:text-white transition-colors">
                    <Plus className="h-6 w-6" />
                  </div>
                  <CardTitle className="font-display text-xl text-stone-200 group-hover:text-amber-400">New Campaign</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-stone-500 group-hover:text-stone-400">
                    Start a new adventure as the Game Master. Create maps, manage encounters, and invite players.
                  </p>
                </CardContent>
              </Card>
            </Link>

            {/* My Campaigns */}
            <Link href="/my-campaigns">
              <Card className="group cursor-pointer border-stone-800 bg-stone-950/60 backdrop-blur-sm transition-all hover:-translate-y-1 hover:border-blue-600/50 hover:bg-stone-900/80 hover:shadow-[0_0_30px_rgba(37,99,235,0.2)]">
                <CardHeader>
                  <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-blue-900/30 text-blue-500 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                    <ScrollText className="h-6 w-6 ml-1" />
                  </div>
                  <CardTitle className="font-display text-xl text-stone-200 group-hover:text-blue-400">My Campaigns</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-stone-500 group-hover:text-stone-400">
                    Resume your adventures, manage your created campaigns, or join new ones.
                  </p>
                </CardContent>
              </Card>
            </Link>

            {/* Settings */}
            <Card className="group cursor-pointer border-stone-800 bg-stone-950/60 backdrop-blur-sm transition-all hover:-translate-y-1 hover:border-purple-600/50 hover:bg-stone-900/80 hover:shadow-[0_0_30px_rgba(147,51,234,0.2)]">
              <CardHeader>
                <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-purple-900/30 text-purple-500 group-hover:bg-purple-600 group-hover:text-white transition-colors">
                  <Settings className="h-6 w-6" />
                </div>
                <CardTitle className="font-display text-xl text-stone-200 group-hover:text-purple-400">Settings</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-stone-500 group-hover:text-stone-400">
                  Configure audio, graphics, and account preferences.
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Favorites Section */}
          <div className="w-full">
             <h2 className="text-2xl font-display text-stone-400 mb-4 flex items-center gap-2">
               <Heart className="h-5 w-5 text-red-500 fill-current" /> Your Favorites
             </h2>
             
             {favorites.length === 0 ? (
               <div className="w-full p-6 rounded border border-dashed border-stone-800 bg-stone-950/30 text-center text-stone-600">
                 No favorites yet. Visit "My Campaigns" to star your adventures.
               </div>
             ) : (
               <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                 {favorites.map(campaign => (
                   <Link key={campaign.id} href={campaign.type === 'created' ? "/campaign?role=gm" : "/campaign?role=player"}>
                     <Card className="group cursor-pointer border-stone-800 bg-stone-950/40 backdrop-blur-sm transition-all hover:-translate-y-1 hover:border-red-900/50 hover:bg-stone-900/60">
                       <CardContent className="p-4 flex items-center justify-between">
                         <div>
                           <h3 className="font-display text-stone-200 group-hover:text-amber-400 transition-colors">{campaign.name}</h3>
                           <div className="text-xs text-stone-500 mt-1 flex items-center gap-2">
                             <span>{campaign.lastPlayed}</span>
                             {campaign.type === 'created' && <span className="text-amber-700 border border-amber-900/30 px-1 rounded text-[10px]">GM</span>}
                           </div>
                         </div>
                         <Play className="h-4 w-4 text-stone-600 group-hover:text-white" />
                       </CardContent>
                     </Card>
                   </Link>
                 ))}
               </div>
             )}
          </div>

        </motion.div>

        <div className="mt-12 text-xs text-stone-600 font-mono">
          v0.1.0 Alpha • Built with Replit
        </div>
      </div>
    </div>
  );
}
