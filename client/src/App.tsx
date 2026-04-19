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
import WorldBuilder from "@/pages/WorldBuilder";
import SharedWorldView from "@/pages/SharedWorldView";
import Spectate from "@/pages/Spectate";
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
          if (data.type === 'admin_data_changed') {
            const entityQueryMap: Record<string, string[][]> = {
              'system-items': [['system-items-summary'], ['system-items'], ['admin-archived-items']],
              'system-spells': [['system-spells'], ['admin-archived-spells']],
              'system-species': [['system-species'], ['species']],
              'feat-templates': [['feat-templates']],
              'feat-trees': [['feat-trees']],
              'feats': [['feat-trees']],
              'feat-connections': [['feat-trees']],
              'skills': [['system-skills']],
              'character-templates': [['character-templates'], ['admin-character-templates']],
              'character-template-folders': [['character-template-folders']],
              'system-traits': [['system-traits'], ['public-traits']],
              'token-effects': [['token-effects']],
              'spell-effects': [['system-spells'], ['token-effects']],
              'item-effects': [['system-items'], ['system-items-summary'], ['token-effects']],
            };
            const keys = entityQueryMap[data.entity];
            if (keys) {
              keys.forEach(key => queryClient.invalidateQueries({ queryKey: key }));
            }
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
      <Route path="/worldbuilder">
        {() => <ProtectedRoute component={WorldBuilder} />}
      </Route>
      <Route path="/spectate/:token" component={Spectate} />
      <Route path="/world/:token" component={SharedWorldView} />
      <Route path="/shared/:token" component={SharedWorldView} />
      <Route component={NotFound} />
    </Switch>
  );
}

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-black text-white flex items-center justify-center p-8">
          <div className="max-w-lg text-center space-y-4">
            <h1 className="text-2xl font-bold text-red-400">Something went wrong</h1>
            <p className="text-stone-400">{this.state.error?.message}</p>
            <pre className="text-xs text-stone-500 text-left overflow-auto max-h-40 bg-stone-900 p-3 rounded">
              {this.state.error?.stack}
            </pre>
            <Button
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.reload();
              }}
              className="bg-amber-600 hover:bg-amber-700"
            >
              Reload Page
            </Button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
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
      <ErrorBoundary>
        <Router />
      </ErrorBoundary>
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
