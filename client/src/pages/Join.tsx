import { useRoute, useLocation } from "wouter";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

export default function Join() {
  const [, params] = useRoute("/join/:code");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [joining, setJoining] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const joinCampaign = async () => {
      if (!params?.code) {
        setError("No invite code provided");
        setJoining(false);
        return;
      }

      try {
        const campaign = await api.joinCampaign(params.code);
        toast({
          title: "Joined Campaign",
          description: `You have joined "${campaign.name}"!`,
        });
        setLocation(`/campaign/${campaign.id}`);
      } catch (err: any) {
        setError(err.message || "Failed to join campaign");
        setJoining(false);
        toast({
          title: "Error",
          description: err.message || "Failed to join campaign",
          variant: "destructive",
        });
      }
    };

    joinCampaign();
  }, [params?.code, setLocation, toast]);

  if (joining) {
    return (
      <div className="min-h-screen bg-stone-900 flex items-center justify-center" data-testid="join-loading">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-amber-500 mx-auto mb-4" />
          <h1 className="text-2xl font-medieval text-amber-500">Joining Campaign...</h1>
          <p className="text-stone-400 mt-2">Please wait while we add you to the adventure</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-stone-900 flex items-center justify-center" data-testid="join-error">
        <div className="text-center max-w-md p-8 bg-stone-800 rounded-lg border border-red-500/30">
          <h1 className="text-2xl font-medieval text-red-500 mb-4">Join Failed</h1>
          <p className="text-stone-300 mb-6">{error}</p>
          <button 
            onClick={() => setLocation("/")}
            className="px-6 py-2 bg-amber-600 text-white rounded hover:bg-amber-700 transition-colors"
            data-testid="button-go-home"
          >
            Go Home
          </button>
        </div>
      </div>
    );
  }

  return null;
}
