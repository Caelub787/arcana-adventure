import React, { useState, useEffect } from "react";
import { useLocation, Link } from "wouter";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Eye, EyeOff } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { useToast } from "@/hooks/use-toast";
import bgImage from "@assets/generated_images/dark_fantasy_landscape_with_arcane_ruins.png";

export default function Login() {
  const [_, setLocation] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuth();
  const { toast } = useToast();

  // Load remembered email on mount (only email is stored, not password for security)
  useEffect(() => {
    const rememberedEmail = localStorage.getItem("rememberedEmail");
    if (rememberedEmail) {
      setEmail(rememberedEmail);
      setRememberMe(true);
    }
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    
    try {
      await login(email, password);
      
      // Save or clear remembered email based on checkbox (password is never stored for security)
      if (rememberMe) {
        localStorage.setItem("rememberedEmail", email);
      } else {
        localStorage.removeItem("rememberedEmail");
      }
      
      setLocation("/");
    } catch (error: any) {
      toast({
        title: "Login failed",
        description: error.message || "Invalid credentials",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-black font-sans text-stone-100 flex items-center justify-center">
      {/* Background Layer */}
      <div className="absolute inset-0 z-0">
        <img 
          src={bgImage} 
          alt="Background" 
          className="h-full w-full object-cover opacity-40 blur-sm"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/80 via-black/50 to-black/80" />
      </div>

      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="relative z-10 w-full max-w-md p-4"
      >
        <Card className="bg-stone-950/80 border-stone-800 backdrop-blur-md shadow-2xl">
          <CardHeader className="text-center space-y-2">
            <CardTitle className="font-display text-4xl text-transparent bg-clip-text bg-gradient-to-b from-amber-100 to-amber-600">
              Arcana Adventure
            </CardTitle>
            <p className="text-stone-500 font-medieval">Enter the realm</p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email" data-testid="label-email">Email</Label>
                <Input 
                  id="email" 
                  type="email" 
                  placeholder="wizard@arcana.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="bg-stone-900/50 border-stone-700 focus:border-amber-600"
                  data-testid="input-email"
                  required
                />
              </div>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <Label htmlFor="password" data-testid="label-password">Password</Label>
                  <Link 
                    href="/forgot-password" 
                    className="text-xs text-amber-500 hover:underline"
                    data-testid="link-forgot-password"
                  >
                    Forgot password?
                  </Link>
                </div>
                <div className="relative">
                  <Input 
                    id="password" 
                    type={showPassword ? "text" : "password"} 
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="bg-stone-900/50 border-stone-700 focus:border-amber-600 pr-10"
                    data-testid="input-password"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-500 hover:text-stone-300 transition-colors"
                    data-testid="button-toggle-password"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div className="flex items-center space-x-2 mt-4">
                <Checkbox 
                  id="remember" 
                  checked={rememberMe}
                  onCheckedChange={(checked) => setRememberMe(checked === true)}
                  className="border-stone-600 data-[state=checked]:bg-amber-600 data-[state=checked]:border-amber-600"
                  data-testid="checkbox-remember"
                />
                <Label 
                  htmlFor="remember" 
                  className="text-sm text-stone-400 cursor-pointer"
                  data-testid="label-remember"
                >
                  Remember me
                </Label>
              </div>
              <Button 
                type="submit" 
                className="w-full bg-amber-700 hover:bg-amber-600 text-white font-bold mt-4"
                disabled={isLoading}
                data-testid="button-login"
              >
                {isLoading ? "Opening Portal..." : "Login"}
              </Button>
              <div className="text-center text-xs text-stone-600 mt-4">
                No account?{" "}
                <Link href="/signup" className="text-amber-500 cursor-pointer hover:underline">
                  Sign up
                </Link>
              </div>
            </form>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
