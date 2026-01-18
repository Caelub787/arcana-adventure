import { useState, useEffect } from "react";
import { useLocation, useRoute, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

export default function ResetPassword() {
  const [, params] = useRoute("/reset-password");
  const [location, setLocation] = useLocation();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);
  const { toast } = useToast();

  const token = new URLSearchParams(window.location.search).get("token");

  useEffect(() => {
    if (!token) {
      toast({
        title: "Invalid Link",
        description: "This password reset link is invalid or expired.",
        variant: "destructive",
      });
    }
  }, [token, toast]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (newPassword !== confirmPassword) {
      toast({
        title: "Passwords Don't Match",
        description: "Please make sure your passwords match.",
        variant: "destructive",
      });
      return;
    }

    if (newPassword.length < 6) {
      toast({
        title: "Password Too Short",
        description: "Password must be at least 6 characters long.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch("/api/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword }),
      });

      const data = await response.json();

      if (response.ok) {
        setResetSuccess(true);
        toast({
          title: "Password Reset",
          description: "Your password has been successfully reset. You can now log in with your new password.",
        });
      } else {
        toast({
          title: "Reset Failed",
          description: data.error || "Failed to reset password",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Something went wrong. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-b from-stone-950 to-stone-900">
        <div className="w-full max-w-md">
          <Card className="bg-stone-900 border-stone-700">
            <CardHeader>
              <CardTitle className="text-stone-100">Invalid Reset Link</CardTitle>
              <CardDescription className="text-stone-400">
                This password reset link is invalid or has expired.
              </CardDescription>
            </CardHeader>
            <CardFooter>
              <Link href="/forgot-password" className="w-full">
                <Button className="w-full bg-amber-600 hover:bg-amber-500 text-stone-950" data-testid="button-request-new">
                  Request New Reset Link
                </Button>
              </Link>
            </CardFooter>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-b from-stone-950 to-stone-900">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-cinzel font-bold text-amber-500 mb-2">⚔️ Arcana Adventure</h1>
          <p className="text-stone-400">Reset Your Password</p>
        </div>

        <Card className="bg-stone-900 border-stone-700">
          <CardHeader>
            <CardTitle className="text-stone-100">Create New Password</CardTitle>
            <CardDescription className="text-stone-400">
              {resetSuccess 
                ? "Your password has been reset successfully"
                : "Enter your new password below"
              }
            </CardDescription>
          </CardHeader>

          {!resetSuccess ? (
            <form onSubmit={handleSubmit}>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="newPassword" className="text-stone-300">New Password</Label>
                  <Input
                    id="newPassword"
                    type="password"
                    placeholder="••••••••"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    minLength={6}
                    className="bg-stone-800 border-stone-600 text-stone-100 placeholder:text-stone-500"
                    data-testid="input-new-password"
                  />
                  <p className="text-xs text-stone-500">
                    Password must be at least 6 characters
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirmPassword" className="text-stone-300">Confirm Password</Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    placeholder="••••••••"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    minLength={6}
                    className="bg-stone-800 border-stone-600 text-stone-100 placeholder:text-stone-500"
                    data-testid="input-confirm-password"
                  />
                </div>
              </CardContent>

              <CardFooter className="flex flex-col space-y-4">
                <Button
                  type="submit"
                  className="w-full bg-amber-600 hover:bg-amber-500 text-stone-950"
                  disabled={isLoading}
                  data-testid="button-reset-password"
                >
                  {isLoading ? "Resetting..." : "Reset Password"}
                </Button>
              </CardFooter>
            </form>
          ) : (
            <CardFooter className="flex flex-col space-y-4">
              <div className="text-center space-y-2">
                <p className="text-sm text-stone-400">
                  You can now log in with your new password.
                </p>
              </div>

              <Link href="/login" className="w-full">
                <Button className="w-full bg-amber-600 hover:bg-amber-500 text-stone-950" data-testid="button-go-to-login">
                  Go to Login
                </Button>
              </Link>
            </CardFooter>
          )}
        </Card>
      </div>
    </div>
  );
}
