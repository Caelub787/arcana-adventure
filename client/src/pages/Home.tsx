import React, { useState, useEffect } from "react";
import { LoadingLogo } from "@/components/LoadingLogo";
import { motion } from "framer-motion";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Play, Users, BookOpen, ScrollText, Plus, Heart, Shield, FileText, Download, Smartphone, Map as MapIcon } from "lucide-react";
import bgImage from "@assets/home_background.webp";
import { useAuth } from "@/lib/AuthContext";
import { api, getTerms, getTermsStatus, acceptTerms, type TermsAndConditions } from "@/lib/api";
import { getSystemLabel, formatCreatedDate, formatLastOpened } from "@/lib/campaignDisplay";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import ProfileDropdown from "@/components/ProfileDropdown";
import NotificationsBell from "@/components/NotificationsBell";
import { usePwaInstall } from "@/hooks/usePwaInstall";
import { useToast } from "@/hooks/use-toast";

export default function Home() {
  const [location, setLocation] = useLocation();
  const { user, isAdmin, logout } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { canInstall, isInstalled, isIOS, promptInstall } = usePwaInstall();
  const [showInstallGuide, setShowInstallGuide] = useState(false);
  const [showTermsPopup, setShowTermsPopup] = useState(false);
  const [showTermsView, setShowTermsView] = useState(false);

  const handleInstallClick = async () => {
    if (canInstall) {
      const accepted = await promptInstall();
      if (accepted) {
        toast({ title: "Installing Arcana Adventure…" });
      }
    } else {
      setShowInstallGuide(true);
    }
  };
  
  // Load campaigns from API with React Query
  const { data: campaignsData, isLoading } = useQuery<{ created: any[], joined: any[] }>({
    queryKey: ['/api/campaigns'],
    enabled: !!user,
    refetchInterval: 15000, // keep the online-count stat reasonably fresh
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
          <h1 className="font-display text-4xl sm:text-5xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-b from-amber-100 to-amber-600 drop-shadow-[0_4px_4px_rgba(0,0,0,0.8)] filter">
            ArcanaVTT
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
                          <CardContent className="p-4 flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <h3 className="font-display text-stone-200 group-hover:text-amber-400 transition-colors truncate" data-testid={`text-campaign-name-${campaign.id}`}>{campaign.name}</h3>
                                {isCreated && <span className="shrink-0 text-amber-700 border border-amber-900/30 px-1 rounded text-[10px]">GM</span>}
                              </div>
                              <div className="text-xs text-stone-500 mt-1 flex items-center gap-2 flex-wrap">
                                <span>{getSystemLabel(campaign.system)}</span>
                                <span>&middot;</span>
                                <span className="flex items-center gap-1">
                                  <Users className={`h-3 w-3 ${campaign.onlineCount > 0 ? 'text-green-500' : 'text-stone-600'}`} />
                                  {campaign.onlineCount || 0}
                                </span>
                                <span>&middot;</span>
                                <span title={`Created ${formatCreatedDate(campaign.createdAt)}`}>Opened {formatLastOpened(campaign.lastPlayed)}</span>
                              </div>
                            </div>
                            <Play className="h-4 w-4 text-stone-600 group-hover:text-white shrink-0" />
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
          <div className={`grid grid-cols-1 gap-6 ${isAdmin ? 'md:grid-cols-5' : 'md:grid-cols-4'}`}>
            
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

            {/* Maps */}
            <Link href="/maps">
              <Card className="group cursor-pointer border-stone-800 bg-stone-900/70 backdrop-blur-sm transition-all hover:-translate-y-1 hover:border-teal-600/50 hover:bg-stone-800/80" data-testid="card-maps">
                <CardHeader>
                  <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-teal-900/30 text-teal-500 group-hover:bg-teal-600 group-hover:text-white transition-colors">
                    <MapIcon className="h-6 w-6" />
                  </div>
                  <CardTitle className="font-display text-xl text-stone-200 group-hover:text-teal-400">Maps</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-stone-500 group-hover:text-stone-400">Paint terrain, place stamps, and import maps as campaign scenes.</p>
                </CardContent>
              </Card>
            </Link>

            {/* Notes */}
            <Link href="/notes">
              <Card className="group cursor-pointer border-stone-800 bg-stone-900/70 backdrop-blur-sm transition-all hover:-translate-y-1 hover:border-amber-600/50 hover:bg-stone-800/80" data-testid="card-notes">
                <CardHeader>
                  <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-amber-900/30 text-amber-500 group-hover:bg-amber-600 group-hover:text-white transition-colors">
                    <BookOpen className="h-6 w-6" />
                  </div>
                  <CardTitle className="font-display text-xl text-stone-200 group-hover:text-amber-400">Notes</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-stone-500 group-hover:text-stone-400">
                    Create notes, link references, and share with friends.
                  </p>
                </CardContent>
              </Card>
            </Link>

            {/* My Library — everyone, including admins */}
            <Link href="/library">
              <Card className="group cursor-pointer border-stone-800 bg-stone-900/70 backdrop-blur-sm transition-all hover:-translate-y-1 hover:border-amber-600/50 hover:bg-stone-800/80" data-testid="card-my-library">
                <CardHeader>
                  <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-amber-900/30 text-amber-500 group-hover:bg-amber-600 group-hover:text-white transition-colors">
                    <BookOpen className="h-6 w-6" />
                  </div>
                  <CardTitle className="font-display text-xl text-stone-200 group-hover:text-amber-400">My Library</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-stone-500 group-hover:text-stone-400">
                    Maintain your private A.A. V2 / V3 library: items, spells, species, classes, and more.
                  </p>
                </CardContent>
              </Card>
            </Link>

            {/* Admin Settings (admins only) */}
            {isAdmin && (
            <Link href="/admin">
              <Card className="group cursor-pointer border-stone-800 bg-stone-900/70 backdrop-blur-sm transition-all hover:-translate-y-1 hover:border-amber-600/50 hover:bg-stone-800/80" data-testid="card-admin-settings">
                <CardHeader>
                  <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-amber-900/30 text-amber-500 group-hover:bg-amber-600 group-hover:text-white transition-colors">
                    <Shield className="h-6 w-6" />
                  </div>
                  <CardTitle className="font-display text-xl text-stone-200 group-hover:text-amber-400">Admin Settings</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-stone-500 group-hover:text-stone-400">
                    Manage system items, spells, and global game settings.
                  </p>
                </CardContent>
              </Card>
            </Link>
            )}
          </div>

        </motion.div>

        {/* Install App Banner */}
        {!isInstalled && (canInstall || isIOS) && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.5 }}
            className="mt-8 w-full max-w-full px-4"
          >
            <div className="flex items-center justify-between gap-4 rounded-lg border border-amber-800/40 bg-amber-950/30 px-4 py-3 backdrop-blur-sm">
              <div className="flex items-center gap-3 min-w-0">
                <Smartphone className="h-5 w-5 shrink-0 text-amber-500" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-amber-300">Install Arcana Adventure</p>
                  <p className="text-xs text-stone-400 truncate">
                    {isIOS ? "Add to your home screen for the best experience" : "Install as an app for quick access"}
                  </p>
                </div>
              </div>
              <Button
                size="sm"
                onClick={handleInstallClick}
                className="shrink-0 bg-amber-600 text-stone-950 hover:bg-amber-500 gap-1.5"
                data-testid="button-install-app-banner"
              >
                <Download className="h-3.5 w-3.5" />
                Install
              </Button>
            </div>
          </motion.div>
        )}

        {/* Footer with Terms Link */}
        <div className="mt-8 flex flex-col items-center gap-2">
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

      {/* Install Guide Dialog (iOS / fallback) */}
      <Dialog open={showInstallGuide} onOpenChange={setShowInstallGuide}>
        <DialogContent
          className="border-stone-800 bg-stone-950 text-stone-200 sm:max-w-md"
          data-testid="dialog-install-guide"
        >
          <DialogHeader>
            <DialogTitle className="text-amber-500">Install Arcana Adventure</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm text-stone-300">
            {isIOS ? (
              <>
                <p>Add Arcana Adventure to your home screen so it opens like a regular app:</p>
                <ol className="list-decimal space-y-2 pl-5 text-stone-400">
                  <li>Tap the <span className="text-amber-400">Share</span> button at the bottom of Safari.</li>
                  <li>Scroll down and tap <span className="text-amber-400">Add to Home Screen</span>.</li>
                  <li>Tap <span className="text-amber-400">Add</span> in the top-right corner.</li>
                </ol>
              </>
            ) : (
              <>
                <p>You can install Arcana Adventure as an app on this device:</p>
                <ul className="list-disc space-y-2 pl-5 text-stone-400">
                  <li>
                    On a computer, click the <span className="text-amber-400">Install</span> icon in your
                    browser's address bar (Chrome or Edge), or open the browser menu and choose{" "}
                    <span className="text-amber-400">Install Arcana Adventure</span>.
                  </li>
                  <li>
                    On Android, open the browser menu and tap{" "}
                    <span className="text-amber-400">Add to Home screen</span> /{" "}
                    <span className="text-amber-400">Install app</span>.
                  </li>
                </ul>
                <p className="text-xs text-stone-500">
                  The install option appears once you're on the published site. Once installed, it opens in its own window.
                </p>
              </>
            )}
          </div>
          <DialogFooter>
            <Button
              onClick={() => setShowInstallGuide(false)}
              className="bg-amber-600 text-stone-950 hover:bg-amber-500"
              data-testid="button-install-guide-close"
            >
              Got it
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
