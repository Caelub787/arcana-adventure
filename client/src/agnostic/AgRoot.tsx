// Mounts Agnostic for a scope: live store + sheet windows. Non-blocking, so a
// campaign page renders immediately and Agnostic pieces appear when ready.
import React from "react";
import type { AgScope } from "@shared/agnostic/types";
import { AgScopeProvider } from "./hooks";
import { AgWindowsProvider, AgWindowStack, useAgWindows } from "./AgWindows";
import { AgGuideHost } from "./AgGuide";
import { AgConfirmHost } from "./float";
import { AgCraftHost } from "./craft/CraftHost";

function Inner({ scope, system, children }: { scope: AgScope; system?: string | null; children: React.ReactNode }) {
  const win = useAgWindows();
  return (
    <AgScopeProvider scope={scope} system={system} onOpenNote={win?.open} blocking={false}>
      {children}
      <AgWindowStack />
      <AgGuideHost />
      <AgConfirmHost />
      <AgCraftHost />
    </AgScopeProvider>
  );
}

export function AgRoot({ scope, system, enabled = true, children }: { scope: AgScope | null; system?: string | null; enabled?: boolean; children: React.ReactNode }) {
  if (!enabled || !scope) return <>{children}</>;
  return (
    <AgWindowsProvider>
      <Inner scope={scope} system={system}>{children}</Inner>
    </AgWindowsProvider>
  );
}
