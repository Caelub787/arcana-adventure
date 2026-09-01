import { useEffect, useState } from "react";
import { Loader2, Link2, Unlink, ExternalLink } from "lucide-react";
import {
  useGetRealm,
  useGetArcanaAuthorizeUrl,
  useUnlinkArcana,
  useUpdateRealm,
  getGetRealmQueryKey,
  getListRealmsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@cr/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@cr/components/ui/select";
import { Button } from "@cr/components/ui/button";
import { ARCANA_SYSTEM_OPTIONS } from "@cr/lib/arcanaSystems";
import { toast } from "sonner";

interface Props {
  realmId: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

export function ArcanaSettingsDialog({ realmId, open, onOpenChange }: Props) {
  const queryClient = useQueryClient();
  const { data: realm, refetch } = useGetRealm(realmId, {
    query: { enabled: open, queryKey: getGetRealmQueryKey(realmId) },
  });
  // Lazy-load the authorize URL only when the dialog is open AND the realm
  // isn't already linked, so we don't ask the server for a fresh PKCE
  // verifier on every dialog open for already-linked realms.
  const needsAuth = open && realm && !realm.arcanaLinked;
  const authUrlQuery = useGetArcanaAuthorizeUrl(realmId, {
    query: { enabled: !!needsAuth, queryKey: ["arcana-authorize", realmId] },
  });
  const unlink = useUnlinkArcana();
  const updateRealm = useUpdateRealm();

  const [linking, setLinking] = useState(false);

  const handleSystemChange = (next: string) => {
    if (!realm || next === (realm.arcanaSystem || "aa-v2")) return;
    updateRealm.mutate(
      { realmId, data: { arcanaSystem: next } },
      {
        onSuccess: () => {
          void refetch();
          queryClient.invalidateQueries({ queryKey: getListRealmsQueryKey() });
          toast.success("System updated");
        },
        onError: () => toast.error("Couldn't update system. Try again."),
      },
    );
  };

  // Listen for the postMessage from the OAuth popup so we can close it and
  // refresh state without forcing a full reload.
  useEffect(() => {
    if (!open) return;
    const onMsg = (e: MessageEvent) => {
      if (e.data && e.data.type === "arcana-linked" && e.data.realmId === realmId) {
        setLinking(false);
        void refetch();
        queryClient.invalidateQueries({ queryKey: getListRealmsQueryKey() });
        toast.success("Arcana Adventure linked");
      }
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [open, realmId, queryClient, refetch]);

  const handleConnect = () => {
    const url = authUrlQuery.data?.authorizeUrl;
    if (!url) {
      toast.error("Couldn't start Arcana login", {
        description: "Try again in a moment.",
      });
      return;
    }
    setLinking(true);
    const popup = window.open(url, "arcana-oauth", "width=560,height=720");
    if (!popup) {
      // Fallback: top-level navigation if the popup was blocked.
      setLinking(false);
      window.location.href = url;
    }
  };

  const handleDisconnect = () => {
    unlink.mutate(
      { realmId },
      {
        onSuccess: () => {
          void refetch();
          queryClient.invalidateQueries({ queryKey: getListRealmsQueryKey() });
          toast.success("Arcana Adventure unlinked");
        },
        onError: () => toast.error("Couldn't unlink. Try again."),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="w-4 h-4" /> Arcana Adventure sync
          </DialogTitle>
          <DialogDescription>
            Link this realm to an Arcana Adventure account. Items, spells, characters and other
            game stats will sync both ways in real time.
          </DialogDescription>
        </DialogHeader>

        {realm?.arcanaLinked ? (
          <div className="space-y-2 text-sm">
            <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-2">
              <div className="text-emerald-300/90 text-xs uppercase tracking-wider mb-1">
                Linked
              </div>
              <div className="text-foreground">
                {realm.arcanaUserDisplay || "Arcana account"}
              </div>
              {realm.arcanaHost && (
                <a
                  href={realm.arcanaHost}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mt-0.5"
                >
                  {realm.arcanaHost} <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">
            You'll be redirected to Arcana Adventure to grant CanvasRealms permission to read and
            write your library and manage webhook subscriptions for this realm.
          </div>
        )}

        <div className="space-y-1.5 pt-1">
          <label className="text-xs font-medium text-muted-foreground">
            Game system
          </label>
          <Select
            value={realm?.arcanaSystem || "aa-v2"}
            onValueChange={handleSystemChange}
            disabled={!realm || updateRealm.isPending}
          >
            <SelectTrigger data-testid="select-realm-system-settings">
              <SelectValue placeholder="Select a system" />
            </SelectTrigger>
            <SelectContent>
              {ARCANA_SYSTEM_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-[11px] text-muted-foreground">
            Determines which stat sheets characters, items, and other game
            objects use in this realm.
          </p>
        </div>

        <DialogFooter>
          {realm?.arcanaLinked ? (
            <Button
              variant="outline"
              onClick={handleDisconnect}
              disabled={unlink.isPending}
              className="gap-2"
            >
              {unlink.isPending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Unlink className="w-3.5 h-3.5" />
              )}
              Disconnect
            </Button>
          ) : (
            <Button
              onClick={handleConnect}
              disabled={linking || authUrlQuery.isLoading || !authUrlQuery.data}
              className="gap-2"
            >
              {linking || authUrlQuery.isLoading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Link2 className="w-3.5 h-3.5" />
              )}
              Connect Arcana Adventure
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
