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
import { useEffect, useState } from "react";

// Protected Route Component
function ProtectedRoute({ component: Component }: { component: React.ComponentType<any> }) {
  const [location, setLocation] = useLocation();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const user = localStorage.getItem("arcana_user");
    if (user) {
      setIsAuthenticated(true);
    } else {
      setLocation("/login");
    }
    setIsLoading(false);
  }, [setLocation]);

  if (isLoading) return null;

  return isAuthenticated ? <Component /> : null;
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/signup" component={SignUp} />
      <Route path="/">
        {() => <ProtectedRoute component={Home} />}
      </Route>
      <Route path="/campaign">
        {() => <ProtectedRoute component={Campaign} />}
      </Route>
      <Route path="/my-campaigns">
        {() => <ProtectedRoute component={MyCampaigns} />}
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
