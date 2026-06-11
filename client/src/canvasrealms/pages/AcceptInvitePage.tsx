import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useAcceptInvite } from "@workspace/api-client-react";
import { Button } from "@cr/components/ui/button";
import { Loader2 } from "lucide-react";

export function AcceptInvitePage({ token }: { token: string }) {
  const [, setLocation] = useLocation();
  const accept = useAcceptInvite();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    accept.mutate(
      { data: { token } },
      {
        onSuccess: (res) => {
          if (cancelled) return;
          setLocation(`/app/realm/${res.realmId}`);
        },
        onError: (err) => {
          if (cancelled) return;
          setError(err instanceof Error ? err.message : "Failed to accept invite");
        },
      },
    );
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return (
    <div className="min-h-[100dvh] bg-background text-foreground flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center space-y-4">
        {error ? (
          <>
            <h1 className="text-xl font-semibold">Invite failed</h1>
            <p className="text-sm text-muted-foreground">{error}</p>
            <Button onClick={() => setLocation("/app")}>Go to workspace</Button>
          </>
        ) : (
          <>
            <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" />
            <h1 className="text-xl font-semibold">Joining realm…</h1>
            <p className="text-sm text-muted-foreground">
              Hang tight while we add you to this realm.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
