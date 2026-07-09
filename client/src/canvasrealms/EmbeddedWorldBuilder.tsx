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
 *
 * In AA V3 (v3=true) the panel does NOT auto-provision a per-campaign realm.
 * Instead the GM links one of their own CR worlds in campaign settings, and this
 * panel opens that linked realm. On open, viewers (campaign players) get-or-
 * create their own private personal folder so they have a place to author.
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

async function fetchLinkedRealm(campaignId: string): Promise<{ id: string }> {
  const res = await fetch(`/api/campaigns/${campaignId}/linked-realm`, {
    credentials: "same-origin",
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  const realm = await res.json();
  if (!realm || !realm.id) {
    // No world linked yet by the GM.
    throw new Error("NOT_LINKED");
  }
  // Best-effort: ensure this viewer has a personal folder. Returns null for
  // owner/editor (no-op) and does not block rendering on failure.
  try {
    await fetch(`/api/realms/${realm.id}/my-folder`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
    });
  } catch {
    // ignore — folder creation is a convenience, not a gate
  }
  return realm;
}

export default function EmbeddedWorldBuilder({
  campaignId,
  v3 = false,
}: {
  campaignId: string;
  v3?: boolean;
}) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["cr-campaign-realm", campaignId, v3 ? "linked" : "auto"],
    queryFn: () =>
      v3 ? fetchLinkedRealm(campaignId) : ensureRealmForCampaign(campaignId),
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
        {v3 ? 'Loading World Info…' : 'Loading World Builder…'}
      </div>
    );
  }
  if (error || !data) {
    const msg = error instanceof Error ? error.message : "";
    const notReady = msg === "NOT_READY";
    const notLinked = msg === "NOT_LINKED";
    return (
      <div className="h-full w-full flex items-center justify-center p-6 text-center text-sm text-muted-foreground" data-testid="status-worldbuilder-error">
        {notLinked
          ? "The Game Master hasn't linked a world to this campaign yet."
          : notReady
            ? `The Game Master hasn't opened the ${v3 ? 'World Info' : 'World Builder'} for this campaign yet.`
            : `Couldn't open the ${v3 ? 'World Info' : 'World Builder'} for this campaign.`}
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
