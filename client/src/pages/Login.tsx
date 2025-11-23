import React, { useState } from "react";
import { useLocation, Link } from "wouter";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import bgImage from "@assets/generated_images/dark_fantasy_landscape_with_arcane_ruins.png";

export default function Login() {
  const [_, setLocation] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    // Mock login delay
    setTimeout(() => {
      // Check if user exists in local "DB"
      const usersDb = JSON.parse(localStorage.getItem("arcana_users") || "{}");
      // Simple check: does any user match this email/username?
      // In a real app, we'd check password hash, etc.
      const user = Object.values(usersDb).find((u: any) => u.email === email || u.username === email);

      if (user) {
        localStorage.setItem("arcana_user", JSON.stringify(user));
        setIsLoading(false);
        window.location.href = "/"; 
      } else {
        setIsLoading(false);
        alert("Account not found. Please sign up first.");
      }
    }, 1000);
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
              Arcana Adventures
            </CardTitle>
            <p className="text-stone-500 font-medieval">Enter the realm</p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email / Username</Label>
                <Input 
                  id="email" 
                  type="text" 
                  placeholder="wizard@arcana.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="bg-stone-900/50 border-stone-700 focus:border-amber-600"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input 
                  id="password" 
                  type="password" 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="bg-stone-900/50 border-stone-700 focus:border-amber-600"
                  required
                />
              </div>
              <Button 
                type="submit" 
                className="w-full bg-amber-700 hover:bg-amber-600 text-white font-bold mt-4"
                disabled={isLoading}
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
