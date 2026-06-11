import { useQuery } from "@tanstack/react-query";
import { Toaster as SonnerToaster } from "sonner";
import { ThemeProvider } from "@cr/lib/theme";
import { AppProvider } from "@cr/lib/store";
import { MainLayout } from "@cr/components/layout/MainLayout";

/**
 * Campaign-embedded mount of the ported Canvas Realms World Builder.
 *
 * Given a host campaign id, it get-or-creates the matching CR realm (realm.id
 * === campaign.id) and renders the CR shell in non-routing "embedded" mode so it
 * never hijacks the campaign page URL. Access is authorized server-side via the
 * campaign bridge in resolveRealmRole, so campaign players who don't own the
 * realm can still open it read-only / read-write per their campaign role.
 */
async function ensureRealmForCampaign(campaignId: string): Promise<{ id: string }> {
  const res = await fetch(`/api/campaigns/${campaignId}/realm`, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
  });
  if (res.status === 403) {
    // A non-GM member opened the panel before the GM ever provisioned the realm.
    throw new Error("NOT_READY");
  }
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  return res.json();
}

export default function EmbeddedWorldBuilder({ campaignId }: { campaignId: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["cr-campaign-realm", campaignId],
    queryFn: () => ensureRealmForCampaign(campaignId),
    enabled: !!campaignId,
    staleTime: Infinity,
    retry: false,
  });

  if (!campaignId) {
    return (
      <div className="h-full w-full flex items-center justify-center p-6 text-sm text-muted-foreground" data-testid="status-worldbuilder-no-campaign">
        No campaign selected.
      </div>
    );
  }
  if (isLoading) {
    return (
      <div className="h-full w-full flex items-center justify-center p-6 text-sm text-muted-foreground" data-testid="status-worldbuilder-loading">
        Loading World Builder…
      </div>
    );
  }
  if (error || !data) {
    const notReady = error instanceof Error && error.message === "NOT_READY";
    return (
      <div className="h-full w-full flex items-center justify-center p-6 text-center text-sm text-muted-foreground" data-testid="status-worldbuilder-error">
        {notReady
          ? "The Game Master hasn't opened the World Builder for this campaign yet."
          : "Couldn't open the World Builder for this campaign."}
      </div>
    );
  }

  return (
    <ThemeProvider>
      <AppProvider>
        <SonnerToaster theme="dark" position="bottom-right" richColors closeButton />
        <MainLayout embeddedRealmId={data.id} />
      </AppProvider>
    </ThemeProvider>
  );
}
