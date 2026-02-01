import React, { useState, useEffect, useRef } from "react";
import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import NotFound from "@/pages/not-found";
import Home from "@/pages/Home";
import Campaign from "@/pages/Campaign";
import MyCampaigns from "@/pages/MyCampaigns";
import Login from "@/pages/Login";
import SignUp from "@/pages/SignUp";
import ForgotPassword from "@/pages/ForgotPassword";
import ResetPassword from "@/pages/ResetPassword";
import AdminSettings from "@/pages/AdminSettings";
import SiteSecurity from "@/pages/SiteSecurity";
import Notes from "@/pages/Notes";
import Join from "@/pages/Join";
import { AuthProvider, useAuth } from "./lib/AuthContext";
import { BannedScreen } from "@/components/BannedScreen";

function SiteUpdateBanner() {
  const { user } = useAuth();
  const [showBanner, setShowBanner] = useState(false);
  const [message, setMessage] = useState("");
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!user) {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      return;
    }

    const connect = () => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        return;
      }

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws`;
      
      wsRef.current = new WebSocket(wsUrl);

      wsRef.current.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'site_update') {
            setMessage(data.message || "App updated, please refresh to continue using. Failure to do so may cause issues with syncing or other.");
            setShowBanner(true);
          }
        } catch (e) {
          console.error('Error parsing WebSocket message:', e);
        }
      };

      wsRef.current.onclose = () => {
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
        }
        reconnectTimeoutRef.current = setTimeout(connect, 5000);
      };

      wsRef.current.onerror = (error) => {
        console.error('SiteUpdateBanner WebSocket error:', error);
      };
    };

    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [user]);

  if (!showBanner) return null;

  return (
    <div 
      className="fixed top-0 left-0 right-0 z-[9999] bg-amber-500 text-stone-900 py-3 px-4 shadow-lg"
      data-testid="site-update-banner"
    >
      <div className="container mx-auto flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2 font-medium">
          <RefreshCw className="h-5 w-5 animate-spin" />
          <span>{message}</span>
        </div>
        <Button
          onClick={() => window.location.reload()}
          className="bg-stone-900 text-amber-400 hover:bg-stone-800 font-semibold"
          data-testid="button-refresh-now"
        >
          Refresh Now
        </Button>
      </div>
    </div>
  );
}

// Protected Route Component
function ProtectedRoute({ component: Component }: { component: React.ComponentType<any> }) {
  const [location, setLocation] = useLocation();
  const { user, loading } = useAuth();
  const [hasRedirected, setHasRedirected] = React.useState(false);

  React.useEffect(() => {
    if (!loading && !user && !hasRedirected) {
      setHasRedirected(true);
      setLocation("/login");
    }
  }, [loading, user, hasRedirected, setLocation]);

  if (loading) return null;
  if (!user) return null;

  return <Component />;
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/signup" component={SignUp} />
      <Route path="/forgot-password" component={ForgotPassword} />
      <Route path="/reset-password" component={ResetPassword} />
      <Route path="/">
        {() => <ProtectedRoute component={Home} />}
      </Route>
      <Route path="/campaign/:id">
        {() => <ProtectedRoute component={Campaign} />}
      </Route>
      <Route path="/campaign">
        {() => <ProtectedRoute component={Campaign} />}
      </Route>
      <Route path="/my-campaigns">
        {() => <ProtectedRoute component={MyCampaigns} />}
      </Route>
      <Route path="/admin">
        {() => <ProtectedRoute component={AdminSettings} />}
      </Route>
      <Route path="/admin/security">
        {() => <ProtectedRoute component={SiteSecurity} />}
      </Route>
      <Route path="/notes">
        {() => <ProtectedRoute component={Notes} />}
      </Route>
      <Route path="/notes/:id">
        {() => <ProtectedRoute component={Notes} />}
      </Route>
      <Route path="/join/:code">
        {() => <ProtectedRoute component={Join} />}
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function AppContent() {
  const { isBanned, banDetails } = useAuth();

  if (isBanned) {
    return <BannedScreen banExpiresAt={banDetails?.banExpiresAt} />;
  }

  return (
    <>
      <SiteUpdateBanner />
      <Toaster />
      <Router />
    </>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <AppContent />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
