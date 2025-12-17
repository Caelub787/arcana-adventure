import React, { useState } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Trash2, LogOut, Play, Plus, Crown, User, Heart, Search, Loader2 } from "lucide-react";
import bgImage from "@assets/generated_images/dark_fantasy_landscape_with_arcane_ruins.png";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/AuthContext";
import { api } from "@/lib/api";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export default function MyCampaigns() {
  const [_, setLocation] = useLocation();
  const search = useSearch();
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const params = new URLSearchParams(search);
  const defaultTab = params.get("tab") || "all";
  
  // Join Dialog State
  const [isJoinOpen, setIsJoinOpen] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [joinError, setJoinError] = useState("");
  
  // Delete Confirmation State
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [campaignToDelete, setCampaignToDelete] = useState<{ id: string, name: string } | null>(null);

  // Load campaigns from API with React Query
  const { data: campaignsData, isLoading } = useQuery<{ created: any[], joined: any[] }>({
    queryKey: ['/api/campaigns'],
    enabled: !!user,
  });

  const campaigns = campaignsData ?? { created: [], joined: [] };

  // Mutations for campaign actions
  const deleteCampaignMutation = useMutation({
    mutationFn: (campaignId: string) => api.deleteCampaign(campaignId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/campaigns'] });
      toast({ title: "Campaign deleted successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to delete campaign", variant: "destructive" });
    },
  });

  const leaveCampaignMutation = useMutation({
    mutationFn: (campaignId: string) => api.leaveCampaign(campaignId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/campaigns'] });
      toast({ title: "Left campaign successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to leave campaign", variant: "destructive" });
    },
  });

  const toggleFavoriteMutation = useMutation({
    mutationFn: (campaignId: string) => api.toggleFavorite(campaignId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/campaigns'] });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to toggle favorite", variant: "destructive" });
    },
  });

  const joinCampaignMutation = useMutation({
    mutationFn: (inviteCode: string) => api.joinCampaign(inviteCode),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/campaigns'] });
      queryClient.invalidateQueries({ predicate: (query) => 
        typeof query.queryKey[0] === 'string' && query.queryKey[0].includes('/members')
      });
      setIsJoinOpen(false);
      setJoinCode("");
      setJoinError("");
      toast({ title: "Campaign joined successfully!" });
    },
    onError: (error: any) => {
      setJoinError(error.message || "Failed to join campaign");
    },
  });

  const handleDelete = (id: string, name: string) => {
    setCampaignToDelete({ id, name });
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (campaignToDelete) {
      deleteCampaignMutation.mutate(campaignToDelete.id);
      setDeleteDialogOpen(false);
      setCampaignToDelete(null);
    }
  };

  const handleLeave = (id: string) => {
    leaveCampaignMutation.mutate(id);
  };

  const toggleFavorite = (id: string) => {
    toggleFavoriteMutation.mutate(id);
  };

  const handleJoinCampaign = () => {
    setJoinError("");
    if (!joinCode.trim()) {
      setJoinError("Please enter a code.");
      return;
    }
    joinCampaignMutation.mutate(joinCode.trim());
  };

  const renderCampaignCard = (campaign: any, type: 'created' | 'joined') => {
    const isCreated = type === 'created';
    const borderColor = isCreated ? 'hover:border-amber-900/50' : 'hover:border-blue-900/50';
    const role = isCreated ? 'gm' : 'player';
    const launchButton = isCreated 
      ? (
        <Button 
          className="w-full bg-amber-900/50 hover:bg-amber-800 text-amber-100 border border-amber-900" 
          onClick={() => setLocation(`/campaign/${campaign.id}?role=gm`)}
          data-testid={`button-launch-${campaign.id}`}
        >
          <Play className="h-4 w-4 mr-2" /> Launch
        </Button>
      ) 
      : (
        <Button 
          className="w-full bg-blue-900/30 hover:bg-blue-800/50 text-blue-100 border border-blue-900" 
          onClick={() => setLocation(`/campaign/${campaign.id}?role=player`)}
          data-testid={`button-resume-${campaign.id}`}
        >
          <Play className="h-4 w-4 mr-2" /> Resume
        </Button>
      );

    return (
      <Card key={campaign.id} className={`bg-stone-900/60 border-stone-800 backdrop-blur transition-all group ${borderColor}`} data-testid={`card-campaign-${campaign.id}`}>
        <CardHeader className="pb-2">
          <CardTitle className="flex justify-between items-start text-lg text-stone-200 font-display">
            <div className="flex items-center gap-2">
              <span data-testid={`text-campaign-name-${campaign.id}`}>{campaign.name}</span>
              {isCreated && <Crown className="h-3 w-3 text-amber-600" />}
            </div>
            <div className="flex gap-1">
              <Button 
                variant="ghost" 
                size="icon" 
                className={`h-8 w-8 ${campaign.favorite ? 'text-red-500' : 'text-stone-600 hover:text-red-400'} hover:bg-stone-800`}
                onClick={() => toggleFavorite(campaign.id)}
                data-testid={`button-favorite-${campaign.id}`}
                disabled={toggleFavoriteMutation.isPending}
              >
                <Heart className={`h-4 w-4 ${campaign.favorite ? 'fill-current' : ''}`} />
              </Button>
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-8 w-8 text-stone-600 hover:text-red-400 hover:bg-red-950/30"
                onClick={() => isCreated ? handleDelete(campaign.id, campaign.name) : handleLeave(campaign.id)}
                data-testid={`button-${isCreated ? 'delete' : 'leave'}-${campaign.id}`}
                disabled={deleteCampaignMutation.isPending || leaveCampaignMutation.isPending}
              >
                {isCreated ? <Trash2 className="h-4 w-4" /> : <LogOut className="h-4 w-4" />}
              </Button>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-stone-500 mb-4 space-y-1">
            <div className="flex justify-between">
              <span>{isCreated ? `${campaign.players || 0} Players` : `GM: ${campaign.gmUserId || 'Unknown'}`}</span>
              <span>{campaign.lastPlayed}</span>
            </div>
            {!isCreated && campaign.charName && <div className="text-blue-400">Playing as: {campaign.charName}</div>}
          </div>
          {launchButton}
        </CardContent>
      </Card>
    );
  };

  const allCampaigns = [
    ...(campaigns.created ?? []).map((c: any) => ({ ...c, type: 'created' as const })), 
    ...(campaigns.joined ?? []).map((c: any) => ({ ...c, type: 'joined' as const }))
  ];
  
  const favorites = allCampaigns.filter((c: any) => c.favorite);

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

      <div className="relative z-10 w-full p-6">
        
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

        <Tabs defaultValue={defaultTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2 bg-stone-900/80 border border-stone-800">
            <TabsTrigger value="all" className="data-[state=active]:bg-stone-800 data-[state=active]:text-stone-100">All Campaigns</TabsTrigger>
            <TabsTrigger value="favorites" className="data-[state=active]:bg-stone-800 data-[state=active]:text-stone-100 flex items-center gap-2">
              <Heart className="h-3 w-3 fill-current text-red-500" /> Favorites
            </TabsTrigger>
          </TabsList>
          
          <div className="mt-6">
            <TabsContent value="all" className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
              {isLoading ? (
                <div className="flex items-center justify-center py-12 text-stone-500">
                  <Loader2 className="h-6 w-6 animate-spin mr-2" />
                  Loading campaigns...
                </div>
              ) : (
                <>
                  {/* Created Section */}
                  <section>
                    <div className="flex items-center justify-between mb-4 border-b border-stone-800 pb-2">
                      <h2 className="text-xl font-bold text-stone-300 flex items-center gap-2">
                        <Crown className="h-5 w-5 text-amber-600" /> Created
                      </h2>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      {(campaigns.created ?? []).map((c: any) => renderCampaignCard(c, 'created'))}
                      {(campaigns.created ?? []).length === 0 && (
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
                      
                      <Dialog open={isJoinOpen} onOpenChange={setIsJoinOpen}>
                        <DialogTrigger asChild>
                          <Button size="sm" variant="outline" className="bg-stone-900 border-stone-700 hover:bg-stone-800 text-xs" data-testid="button-join-existing">
                            <Plus className="h-3 w-3 mr-1" /> Join Existing
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="bg-stone-950 border-stone-800 text-stone-100">
                          <DialogHeader>
                            <DialogTitle>Join a Campaign</DialogTitle>
                          </DialogHeader>
                          <div className="space-y-4 py-4">
                            <div className="space-y-2">
                              <Label htmlFor="code" className="text-stone-400">Invite Code</Label>
                              <Input 
                                id="code" 
                                placeholder="ARCANA-XXXX" 
                                className="bg-stone-900 border-stone-700 text-stone-100 uppercase font-mono tracking-widest"
                                value={joinCode}
                                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                                data-testid="input-join-code"
                              />
                              {joinError && <p className="text-xs text-red-500" data-testid="text-join-error">{joinError}</p>}
                            </div>
                          </div>
                          <DialogFooter>
                            <Button variant="secondary" onClick={() => setIsJoinOpen(false)}>Cancel</Button>
                            <Button 
                              onClick={handleJoinCampaign} 
                              className="bg-amber-700 hover:bg-amber-600"
                              disabled={joinCampaignMutation.isPending}
                              data-testid="button-join-submit"
                            >
                              {joinCampaignMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                              Join Adventure
                            </Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>

                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      {(campaigns.joined ?? []).map((c: any) => renderCampaignCard(c, 'joined'))}
                      {(campaigns.joined ?? []).length === 0 && (
                        <div className="col-span-2 text-center py-8 text-stone-600 italic border border-dashed border-stone-800 rounded bg-stone-950/30">
                          No joined campaigns.
                        </div>
                      )}
                    </div>
                  </section>
                </>
              )}
            </TabsContent>

            <TabsContent value="favorites" className="animate-in fade-in slide-in-from-bottom-4 duration-500">
              {isLoading ? (
                <div className="flex items-center justify-center py-12 text-stone-500">
                  <Loader2 className="h-6 w-6 animate-spin mr-2" />
                  Loading favorites...
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  {favorites.map((c: any) => renderCampaignCard(c, c.type))}
                  {favorites.length === 0 && (
                    <div className="col-span-2 text-center py-12 text-stone-500 flex flex-col items-center gap-2 border border-dashed border-stone-800 rounded bg-stone-950/30">
                      <Heart className="h-8 w-8 text-stone-700" />
                      <p>No favorites yet. Heart a campaign to see it here!</p>
                    </div>
                  )}
                </div>
              )}
            </TabsContent>
          </div>
        </Tabs>

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent className="bg-stone-950 border-stone-800 text-stone-100">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-red-500">Delete Campaign?</AlertDialogTitle>
              <AlertDialogDescription className="text-stone-400">
                Are you sure you want to delete <span className="font-bold text-stone-200">"{campaignToDelete?.name}"</span>? 
                This action cannot be undone. All scenes, characters, and messages will be permanently deleted.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="bg-stone-900 border-stone-700 text-stone-100 hover:bg-stone-800">
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction 
                onClick={confirmDelete}
                className="bg-red-700 hover:bg-red-600 text-white"
                data-testid="button-confirm-delete"
              >
                Delete Campaign
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
