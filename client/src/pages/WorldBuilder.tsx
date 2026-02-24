import React, { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/AuthContext";
import { WorldbuilderPanel } from "@/components/worldbuilding/WorldbuilderPanel";
import { EntitySidePanel } from "@/components/worldbuilding/EntitySidePanel";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Globe, Loader2 } from "lucide-react";
import ProfileDropdown from "@/components/ProfileDropdown";

export default function WorldBuilder() {
  const [, setLocation] = useLocation();
  const { user, logout } = useAuth();
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>("");
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);

  const { data: campaignsData, isLoading: campaignsLoading } = useQuery<{ created: any[], joined: any[] }>({
    queryKey: ['/api/campaigns'],
    enabled: !!user,
  });

  const gmCampaigns = [
    ...(campaignsData?.created || []),
    ...(campaignsData?.joined || []).filter((c: any) => c.role === 'gm' || c.role === 'assistant_gm'),
  ];

  const uniqueGmCampaigns = gmCampaigns.filter((c, i, arr) => arr.findIndex(x => x.id === c.id) === i);

  useEffect(() => {
    if (uniqueGmCampaigns.length > 0 && !selectedCampaignId) {
      setSelectedCampaignId(uniqueGmCampaigns[0].id);
    }
  }, [uniqueGmCampaigns, selectedCampaignId]);

  const { data: characters = [] } = useQuery<any[]>({
    queryKey: ['/api/campaigns', selectedCampaignId, 'characters'],
    queryFn: async () => {
      const res = await fetch(`/api/campaigns/${selectedCampaignId}/characters`, { credentials: 'include' });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!selectedCampaignId,
  });

  const handleLogout = async () => {
    await logout();
    setLocation("/login");
  };

  return (
    <div className="min-h-screen bg-stone-950 text-stone-100">
      <header className="border-b border-stone-800 bg-stone-900/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <Link href="/">
              <Button variant="ghost" size="icon" className="text-stone-400 hover:text-stone-200" data-testid="button-back-home">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div className="flex items-center gap-2">
              <Globe className="h-5 w-5 text-amber-400" />
              <h1 className="text-lg font-semibold text-stone-200">World Builder</h1>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {uniqueGmCampaigns.length > 0 && (
              <Select value={selectedCampaignId} onValueChange={(val) => { setSelectedCampaignId(val); setSelectedEntityId(null); }}>
                <SelectTrigger className="w-[220px] bg-stone-800 border-stone-700 text-stone-200" data-testid="select-campaign">
                  <SelectValue placeholder="Select Campaign" />
                </SelectTrigger>
                <SelectContent className="bg-stone-800 border-stone-700">
                  {uniqueGmCampaigns.map((c: any) => (
                    <SelectItem key={c.id} value={c.id} className="text-stone-200 focus:bg-stone-700 focus:text-stone-100">
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <ProfileDropdown onLogout={handleLogout} />
          </div>
        </div>
      </header>

      <div className="flex h-[calc(100vh-57px)]">
        <div className="w-80 border-r border-stone-800 bg-stone-900/50 flex-shrink-0">
          {campaignsLoading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-6 w-6 animate-spin text-stone-500" />
            </div>
          ) : uniqueGmCampaigns.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full p-6 text-center">
              <Globe className="h-12 w-12 text-stone-700 mb-4" />
              <p className="text-stone-500 text-sm">You need to be a GM of at least one campaign to use the World Builder.</p>
              <Link href="/my-campaigns">
                <Button variant="ghost" className="mt-4 text-amber-400 hover:text-amber-300" data-testid="button-go-campaigns">
                  Go to My Campaigns
                </Button>
              </Link>
            </div>
          ) : selectedCampaignId ? (
            <WorldbuilderPanel
              campaignId={selectedCampaignId}
              isGM={true}
              characters={characters}
              onOpenEntity={(entityId) => setSelectedEntityId(entityId)}
            />
          ) : null}
        </div>

        <div className="flex-1 bg-stone-950 flex items-center justify-center relative">
          {!selectedEntityId && (
            <div className="text-center p-8">
              <Globe className="h-16 w-16 text-stone-800 mx-auto mb-4" />
              <h2 className="text-xl font-semibold text-stone-600 mb-2">Select an entity</h2>
              <p className="text-stone-600 text-sm max-w-md">Choose an entity from the sidebar to view its details, relationships, and linked data.</p>
            </div>
          )}
        </div>
      </div>

      {selectedEntityId && selectedCampaignId && (
        <EntitySidePanel
          campaignId={selectedCampaignId}
          entityId={selectedEntityId}
          onClose={() => setSelectedEntityId(null)}
          onNavigateToEntity={(id) => setSelectedEntityId(id)}
          isGM={true}
        />
      )}
    </div>
  );
}
