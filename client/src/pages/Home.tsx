import React, { useState, useEffect } from "react";
import { LoadingLogo } from "@/components/LoadingLogo";
import { motion } from "framer-motion";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Play, Users, BookOpen, ScrollText, Plus, Heart, Shield, FileText, Globe } from "lucide-react";
import bgImage from "@assets/home_background.webp";
import { useAuth } from "@/lib/AuthContext";
import { api, getTerms, getTermsStatus, acceptTerms, type TermsAndConditions } from "@/lib/api";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import ProfileDropdown from "@/components/ProfileDropdown";
import NotificationsBell from "@/components/NotificationsBell";

export default function Home() {
  const [location, setLocation] = useLocation();
  const { user, isAdmin, logout } = useAuth();
  const queryClient = useQueryClient();
  const [showTermsPopup, setShowTermsPopup] = useState(false);
  const [showTermsView, setShowTermsView] = useState(false);
  
  // Load campaigns from API with React Query
  const { data: campaignsData, isLoading } = useQuery<{ created: any[], joined: any[] }>({
    queryKey: ['/api/campaigns'],
    enabled: !!user,
  });

  // Query for terms and conditions
  const { data: currentTerms } = useQuery<TermsAndConditions | null>({
    queryKey: ['/api/terms'],
    queryFn: getTerms,
    enabled: !!user,
  });

  // Query for terms acceptance status
  const { data: termsStatus } = useQuery<{ hasAccepted: boolean; currentVersion: number | null }>({
    queryKey: ['/api/terms/status'],
    queryFn: getTermsStatus,
    enabled: !!user,
  });

  // Accept terms mutation
  const acceptTermsMutation = useMutation({
    mutationFn: acceptTerms,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/terms/status'] });
      setShowTermsPopup(false);
    },
  });

  // Show terms popup if user hasn't accepted current terms
  useEffect(() => {
    if (termsStatus && !termsStatus.hasAccepted && termsStatus.currentVersion !== null) {
      setShowTermsPopup(true);
    }
  }, [termsStatus]);

  const userCampaigns = campaignsData ?? { created: [], joined: [] };
  const favorites = [...(userCampaigns.created ?? []), ...(userCampaigns.joined ?? [])].filter((c: any) => c.favorite);

  const handleLogout = async () => {
    await logout();
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
        
        {/* Notifications Bell - Top Left */}
        {user && (
          <div className="absolute top-4 left-4">
            <NotificationsBell />
          </div>
        )}

        {/* Profile Dropdown - Top Right */}
        <div className="absolute top-4 right-4">
          <ProfileDropdown onLogout={handleLogout} />
        </div>

        {/* Title */}
        <motion.div 
          initial={{ y: -50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="mb-8 text-center"
        >
          <h1 className="font-display text-6xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-b from-amber-100 to-amber-600 drop-shadow-[0_4px_4px_rgba(0,0,0,0.8)] filter">
            Arcana Adventure
          </h1>
          <p className="mt-2 font-display text-xl text-stone-400">
            Tabletop Manager & RPG Hub
          </p>
        </motion.div>

        {/* Main Content Area */}
        <motion.div 
          initial={{ y: 50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.2, ease: "easeOut" }}
          className="w-full max-w-full px-4 space-y-8"
        >
          
          {/* Favorites Section (At Top) */}
          <Card className="border-stone-800 bg-stone-900/70 backdrop-blur-sm">
            <CardHeader>
              <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-red-900/30 text-red-500">
                <Heart className="h-6 w-6 fill-current" />
              </div>
              <CardTitle className="font-display text-xl text-stone-200">Your Favorites</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="w-full p-6 rounded border border-stone-800 bg-stone-950/30 text-center text-stone-500 flex items-center justify-center gap-2">
                  <LoadingLogo className="h-4 w-4" />
                  Loading favorites...
                </div>
              ) : favorites.length === 0 ? (
                <div className="w-full p-6 rounded border border-dashed border-stone-800 bg-stone-950/30 text-center text-stone-600">
                  No favorites yet. Visit "My Campaigns" to star your adventures.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {favorites.map((campaign: any) => {
                    const isCreated = (userCampaigns.created ?? []).some((c: any) => c.id === campaign.id);
                    return (
                      <Link key={campaign.id} href={`/campaign/${campaign.id}`} data-testid={`link-campaign-${campaign.id}`}>
                        <Card className="group cursor-pointer border-stone-800 bg-stone-900/50 backdrop-blur-sm transition-all hover:-translate-y-1 hover:border-red-900/50 hover:bg-stone-800/70">
                          <CardContent className="p-4 flex items-center justify-between">
                            <div>
                              <h3 className="font-display text-stone-200 group-hover:text-amber-400 transition-colors" data-testid={`text-campaign-name-${campaign.id}`}>{campaign.name}</h3>
                              <div className="text-xs text-stone-500 mt-1 flex items-center gap-2">
                                <span>{campaign.lastPlayed}</span>
                                {isCreated && <span className="text-amber-700 border border-amber-900/30 px-1 rounded text-[10px]">GM</span>}
                              </div>
                            </div>
                            <Play className="h-4 w-4 text-stone-600 group-hover:text-white" />
                          </CardContent>
                        </Card>
                      </Link>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Main Menu Grid */}
          <div className={`grid grid-cols-1 gap-6 ${isAdmin ? 'md:grid-cols-4' : 'md:grid-cols-3'}`}>
            
            {/* My Campaigns */}
            <Link href="/my-campaigns">
              <Card className="group cursor-pointer border-stone-800 bg-stone-900/70 backdrop-blur-sm transition-all hover:-translate-y-1 hover:border-blue-600/50 hover:bg-stone-800/80">
                <CardHeader>
                  <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-blue-900/30 text-blue-500 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                    <ScrollText className="h-6 w-6 ml-1" />
                  </div>
                  <CardTitle className="font-display text-xl text-stone-200 group-hover:text-blue-400">My Campaigns</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-stone-500 group-hover:text-stone-400">Manage your created campaigns, or join new ones.</p>
                </CardContent>
              </Card>
            </Link>

            {/* World Builder */}
            <Link href="/worldbuilder">
              <Card className="group cursor-pointer border-stone-800 bg-stone-900/70 backdrop-blur-sm transition-all hover:-translate-y-1 hover:border-emerald-600/50 hover:bg-stone-800/80" data-testid="card-world-builder">
                <CardHeader>
                  <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-900/30 text-emerald-500 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                    <Globe className="h-6 w-6" />
                  </div>
                  <CardTitle className="font-display text-xl text-stone-200 group-hover:text-emerald-400">World Builder</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-stone-500 group-hover:text-stone-400">Build your world with entities, relationships, and lore.</p>
                </CardContent>
              </Card>
            </Link>

            {/* Notes */}
            <Link href="/notes">
              <Card className="group cursor-pointer border-stone-800 bg-stone-900/70 backdrop-blur-sm transition-all hover:-translate-y-1 hover:border-purple-600/50 hover:bg-stone-800/80" data-testid="card-notes">
                <CardHeader>
                  <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-purple-900/30 text-purple-500 group-hover:bg-purple-600 group-hover:text-white transition-colors">
                    <BookOpen className="h-6 w-6" />
                  </div>
                  <CardTitle className="font-display text-xl text-stone-200 group-hover:text-purple-400">Notes</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-stone-500 group-hover:text-stone-400">
                    Create notes, link references, and share with friends.
                  </p>
                </CardContent>
              </Card>
            </Link>

            {/* Admin Settings (admins) / My Library (GMs and players) */}
            <Link href={isAdmin ? "/admin" : "/admin?personal=1"}>
              <Card className="group cursor-pointer border-stone-800 bg-stone-900/70 backdrop-blur-sm transition-all hover:-translate-y-1 hover:border-amber-600/50 hover:bg-stone-800/80" data-testid="card-admin-settings">
                <CardHeader>
                  <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-amber-900/30 text-amber-500 group-hover:bg-amber-600 group-hover:text-white transition-colors">
                    <Shield className="h-6 w-6" />
                  </div>
                  <CardTitle className="font-display text-xl text-stone-200 group-hover:text-amber-400">{isAdmin ? 'Admin Settings' : 'My Library'}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-stone-500 group-hover:text-stone-400">
                    {isAdmin
                      ? 'Manage system items, spells, and global game settings.'
                      : 'Maintain your private A.A. V2 / V3 library — items, spells, species, classes, and more.'}
                  </p>
                </CardContent>
              </Card>
            </Link>
          </div>

        </motion.div>

        {/* Footer with Terms Link */}
        <div className="mt-12 flex flex-col items-center gap-2">
          <button
            onClick={() => setShowTermsView(true)}
            className="text-xs text-stone-500 hover:text-amber-400 transition-colors underline"
            data-testid="button-view-terms"
          >
            <FileText className="h-3 w-3 inline mr-1" />
            Terms and Conditions
          </button>
          <div className="text-xs text-stone-600 font-mono">v0.1 Beta • Mystereed</div>
        </div>
      </div>

      {/* Terms Acceptance Popup - Cannot be dismissed without accepting */}
      <Dialog open={showTermsPopup} onOpenChange={() => {}}>
        <DialogContent 
          className="bg-stone-900 border-stone-700 max-w-2xl max-h-[90vh]"
          onPointerDownOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle className="text-amber-400 flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Terms and Conditions Updated
            </DialogTitle>
            <DialogDescription className="text-stone-400">
              Please review and accept the updated terms and conditions to continue using the app.
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[50vh] pr-4">
            <div className="text-stone-300 whitespace-pre-wrap text-sm">
              {currentTerms?.content || "Loading terms..."}
            </div>
          </ScrollArea>
          <DialogFooter className="flex flex-col gap-2 sm:flex-row">
            <div className="text-xs text-stone-500 flex-1">
              I'm sorry but you have to accept to use the app. If you do not want to accept, please cancel your subscription if you have one.
            </div>
            <Button
              onClick={() => acceptTermsMutation.mutate()}
              disabled={acceptTermsMutation.isPending}
              className="bg-amber-600 hover:bg-amber-500 text-stone-900"
              data-testid="button-accept-terms"
            >
              {acceptTermsMutation.isPending ? "Accepting..." : "I Accept"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Terms View Dialog - Can be closed */}
      <Dialog open={showTermsView} onOpenChange={setShowTermsView}>
        <DialogContent className="bg-stone-900 border-stone-700 max-w-2xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="text-amber-400 flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Terms and Conditions
            </DialogTitle>
            {currentTerms && (
              <DialogDescription className="text-stone-500">
                Version {currentTerms.version} • Last updated: {new Date(currentTerms.createdAt).toLocaleDateString()}
              </DialogDescription>
            )}
          </DialogHeader>
          <ScrollArea className="max-h-[60vh] pr-4">
            <div className="text-stone-300 whitespace-pre-wrap text-sm">
              {currentTerms?.content || "No terms and conditions have been set yet."}
            </div>
          </ScrollArea>
          <DialogFooter>
            <Button
              onClick={() => setShowTermsView(false)}
              variant="outline"
              className="border-stone-600 text-stone-300 hover:bg-stone-800"
              data-testid="button-close-terms"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
