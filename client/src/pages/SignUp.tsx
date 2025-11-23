import React, { useState } from "react";
import { Link, useLocation } from "wouter";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import bgImage from "@assets/generated_images/dark_fantasy_landscape_with_arcane_ruins.png";

export default function SignUp() {
  const [_, setLocation] = useLocation();
  const [formData, setFormData] = useState({
    name: "",
    username: "",
    email: "",
    password: "",
    tosAccepted: false
  });
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.tosAccepted) {
      alert("You must accept the Terms of Service to continue.");
      return;
    }
    
    setIsLoading(true);
    // Mock registration delay
    setTimeout(() => {
      // Save user to local "DB"
      const usersDb = JSON.parse(localStorage.getItem("arcana_users") || "{}");
      const newUser = {
        name: formData.name,
        username: formData.username,
        email: formData.email,
        password: formData.password // Mock only!
      };
      
      // Use email as key for simplicity
      usersDb[formData.email] = newUser;
      localStorage.setItem("arcana_users", JSON.stringify(usersDb));

      // Auto-login
      localStorage.setItem("arcana_user", JSON.stringify(newUser));
      
      setIsLoading(false);
      window.location.href = "/"; // Force reload to pick up auth state
    }, 1500);
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
            <CardTitle className="font-display text-3xl text-transparent bg-clip-text bg-gradient-to-b from-amber-100 to-amber-600">
              Join the Adventure
            </CardTitle>
            <p className="text-stone-500 font-medieval">Create your legend</p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              
              <div className="space-y-2">
                <Label htmlFor="name">Full Name</Label>
                <Input 
                  id="name" 
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  className="bg-stone-900/50 border-stone-700 focus:border-amber-600"
                  placeholder="E.g. Gandalf the Grey"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="username">Username (Unique ID)</Label>
                <Input 
                  id="username" 
                  value={formData.username}
                  onChange={(e) => setFormData({...formData, username: e.target.value})}
                  className="bg-stone-900/50 border-stone-700 focus:border-amber-600"
                  placeholder="wizard_of_oz"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input 
                  id="email" 
                  type="email" 
                  value={formData.email}
                  onChange={(e) => setFormData({...formData, email: e.target.value})}
                  className="bg-stone-900/50 border-stone-700 focus:border-amber-600"
                  placeholder="you@example.com"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input 
                  id="password" 
                  type="password" 
                  value={formData.password}
                  onChange={(e) => setFormData({...formData, password: e.target.value})}
                  className="bg-stone-900/50 border-stone-700 focus:border-amber-600"
                  required
                />
              </div>

              <div className="flex items-center space-x-2 py-2">
                <Checkbox 
                  id="tos" 
                  checked={formData.tosAccepted}
                  onCheckedChange={(checked) => setFormData({...formData, tosAccepted: checked as boolean})}
                  className="border-stone-600 data-[state=checked]:bg-amber-600 data-[state=checked]:border-amber-600"
                />
                <Label htmlFor="tos" className="text-sm text-stone-400 font-normal">
                  I accept the{" "}
                  <Dialog>
                    <DialogTrigger asChild>
                      <span className="text-amber-500 hover:underline cursor-pointer">Terms of Service</span>
                    </DialogTrigger>
                    <DialogContent className="bg-stone-900 border-stone-800 text-stone-200 max-h-[80vh] overflow-y-auto">
                      <DialogHeader>
                        <DialogTitle>Terms of Service</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4 text-sm text-stone-400">
                        <p>Welcome to Arcana Adventures.</p>
                        <p>1. By creating an account, you agree to be respectful to all fellow adventurers.</p>
                        <p>2. Do not use arcane magic for illegal activities.</p>
                        <p>3. The Game Master's word is final (mostly).</p>
                        <p>[Placeholder for full legal text]</p>
                      </div>
                    </DialogContent>
                  </Dialog>
                </Label>
              </div>

              <Button 
                type="submit" 
                className="w-full bg-amber-700 hover:bg-amber-600 text-white font-bold mt-2"
                disabled={isLoading}
              >
                {isLoading ? "Creating Account..." : "Sign Up"}
              </Button>

              <div className="text-center text-xs text-stone-600 mt-4">
                Already have an account?{" "}
                <Link href="/login" className="text-amber-500 cursor-pointer hover:underline">
                  Login
                </Link>
              </div>
            </form>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
