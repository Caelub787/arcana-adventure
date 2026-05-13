import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { ArrowLeft, Trash2, Plug, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface ConnectedApp {
  clientId: string;
  clientName: string;
  scopes: string[];
  lastUsedAt: string | null;
  createdAt: string;
  tokenCount: number;
}

export default function Account() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery<{ apps: ConnectedApp[] }>({
    queryKey: ["/api/account/connected-apps"],
  });

  const revokeMutation = useMutation({
    mutationFn: async (clientId: string) => {
      const res = await apiRequest("POST", `/api/account/connected-apps/${encodeURIComponent(clientId)}/revoke`, {});
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/account/connected-apps"] });
      toast({ title: "Access revoked", description: "All tokens for that app have been invalidated." });
    },
    onError: (err: any) => toast({ title: "Failed to revoke", description: err?.message || "Try again", variant: "destructive" }),
  });

  const apps = data?.apps || [];

  return (
    <div className="min-h-screen bg-stone-950 text-stone-200 p-6" data-testid="page-account">
      <div className="max-w-3xl mx-auto">
        <Button variant="ghost" onClick={() => setLocation("/")} className="mb-4 text-stone-400 hover:text-amber-500" data-testid="button-back">
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to Home
        </Button>

        <h1 className="text-3xl font-bold text-amber-500 mb-2 flex items-center gap-2">
          <Plug className="h-7 w-7" /> Connected Apps
        </h1>
        <p className="text-stone-400 mb-6">
          Third-party apps you've authorized to read and write your Arcana
          Adventure library on your behalf.
        </p>

        <Card className="bg-stone-900 border-stone-800">
          <CardHeader>
            <CardTitle className="text-amber-500 text-lg flex items-center gap-2">
              <KeyRound className="h-5 w-5" /> Authorized Applications
            </CardTitle>
            <CardDescription className="text-stone-400">
              Revoking an app immediately disables all of its access tokens.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-stone-500 py-8 text-center">Loading…</div>
            ) : apps.length === 0 ? (
              <div className="text-stone-500 py-8 text-center" data-testid="text-no-apps">
                No connected apps yet. Apps that integrate with Arcana
                Adventure will appear here after you authorize them.
              </div>
            ) : (
              <div className="space-y-3">
                {apps.map((a) => (
                  <div key={a.clientId} className="flex items-start justify-between gap-4 bg-stone-950 border border-stone-800 rounded-md p-4" data-testid={`row-app-${a.clientId}`}>
                    <div className="flex-1 min-w-0">
                      <div className="text-stone-100 font-semibold" data-testid={`text-app-name-${a.clientId}`}>{a.clientName}</div>
                      <div className="text-xs text-stone-500 mt-1">
                        Authorized {new Date(a.createdAt).toLocaleString()}
                        {a.lastUsedAt ? ` · last used ${new Date(a.lastUsedAt).toLocaleString()}` : " · never used"}
                        {` · ${a.tokenCount} active token${a.tokenCount === 1 ? "" : "s"}`}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {a.scopes.map((s) => (
                          <Badge key={s} variant="outline" className="border-stone-700 text-stone-300 text-[10px]">{s}</Badge>
                        ))}
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => revokeMutation.mutate(a.clientId)}
                      disabled={revokeMutation.isPending}
                      className="border-red-900 text-red-400 hover:bg-red-950/40 hover:text-red-300"
                      data-testid={`button-revoke-${a.clientId}`}
                    >
                      <Trash2 className="h-4 w-4 mr-1" /> Revoke
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
