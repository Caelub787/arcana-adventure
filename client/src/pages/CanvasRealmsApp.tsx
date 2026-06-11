import { Toaster as SonnerToaster } from "sonner";
import { ThemeProvider } from "@cr/lib/theme";
import { AppProvider } from "@cr/lib/store";
import { MainLayout } from "@cr/components/layout/MainLayout";

/**
 * Host mount point for the ported Canvas Realms World Builder.
 *
 * Canvas Realms drives its own routing under `/app/realm/:realmId` via
 * MainLayout, so the host registers `/app*` routes that all render this
 * component. AppProvider holds the layout/pane store; MainLayout lists the
 * caller's realms (host session auth) and renders the canvas/graph/wiki shell.
 */
export default function CanvasRealmsApp() {
  return (
    <ThemeProvider>
      <AppProvider>
        <SonnerToaster theme="dark" position="bottom-right" richColors closeButton />
        <MainLayout />
      </AppProvider>
    </ThemeProvider>
  );
}
