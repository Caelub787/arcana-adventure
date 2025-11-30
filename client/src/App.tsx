import React from "react";
import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Home from "@/pages/Home";
import Campaign from "@/pages/Campaign";
import MyCampaigns from "@/pages/MyCampaigns";
import Login from "@/pages/Login";
import SignUp from "@/pages/SignUp";
import ForgotPassword from "@/pages/ForgotPassword";
import ResetPassword from "@/pages/ResetPassword";
import AdminSettings from "@/pages/AdminSettings";
import Join from "@/pages/Join";
import { AuthProvider, useAuth } from "./lib/AuthContext";

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
      <Route path="/join/:code">
        {() => <ProtectedRoute component={Join} />}
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
