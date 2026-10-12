// Mounts Agnostic for a scope: live store + sheet windows. Non-blocking, so a
// campaign page renders immediately and Agnostic pieces appear when ready.
import React from "react";
import type { AgScope } from "@shared/agnostic/types";
import { AgScopeProvider } from "./hooks";
import { AgWindowsProvider, AgWindowStack, useAgWindows } from "./AgWindows";

function Inner({ scope, children }: { scope: AgScope; children: React.ReactNode }) {
  const win = useAgWindows();
  return (
    <AgScopeProvider scope={scope} onOpenNote={win?.open} blocking={false}>
      {children}
      <AgWindowStack />
    </AgScopeProvider>
  );
}

export function AgRoot({ scope, enabled = true, children }: { scope: AgScope | null; enabled?: boolean; children: React.ReactNode }) {
  if (!enabled || !scope) return <>{children}</>;
  return (
    <AgWindowsProvider>
      <Inner scope={scope}>{children}</Inner>
    </AgWindowsProvider>
  );
}
