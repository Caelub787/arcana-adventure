import { useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const response = await fetch("/api/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (response.ok) {
        setEmailSent(true);
        toast({
          title: "Email Sent",
          description: data.message,
        });
      } else {
        toast({
          title: "Error",
          description: data.error || "Failed to send reset email",
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

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-b from-stone-950 to-stone-900">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-cinzel font-bold text-amber-500 mb-2">⚔️ Arcana Adventure</h1>
          <p className="text-stone-400">Password Recovery</p>
        </div>

        <Card className="bg-stone-900 border-stone-700">
          <CardHeader>
            <CardTitle className="text-stone-100">Forgot Password</CardTitle>
            <CardDescription className="text-stone-400">
              {emailSent 
                ? "Check your email for a password reset link"
                : "Enter your email address and we'll send you a link to reset your password"
              }
            </CardDescription>
          </CardHeader>

          {!emailSent ? (
            <form onSubmit={handleSubmit}>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-stone-300">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="your@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="bg-stone-800 border-stone-600 text-stone-100 placeholder:text-stone-500"
                    data-testid="input-email"
                  />
                </div>
              </CardContent>

              <CardFooter className="flex flex-col space-y-4">
                <Button
                  type="submit"
                  className="w-full bg-amber-600 hover:bg-amber-500 text-stone-950"
                  disabled={isLoading}
                  data-testid="button-send-reset"
                >
                  {isLoading ? "Sending..." : "Send Reset Link"}
                </Button>

                <div className="text-center text-sm">
                  <Link href="/login" className="text-amber-500 hover:text-amber-400 hover:underline" data-testid="link-back-to-login">
                    Back to Login
                  </Link>
                </div>
              </CardFooter>
            </form>
          ) : (
            <CardFooter className="flex flex-col space-y-4">
              <div className="text-center space-y-2">
                <p className="text-sm text-stone-400">
                  If an account exists with that email, you'll receive a password reset link shortly.
                </p>
                <p className="text-sm text-stone-400">
                  The link will expire in 1 hour.
                </p>
              </div>

              <Button
                onClick={() => {
                  setEmailSent(false);
                  setEmail("");
                }}
                variant="outline"
                className="w-full border-stone-600 text-stone-300 hover:bg-stone-800"
                data-testid="button-send-another"
              >
                Send Another Email
              </Button>

              <div className="text-center text-sm">
                <Link href="/login" className="text-amber-500 hover:text-amber-400 hover:underline" data-testid="link-login">
                  Back to Login
                </Link>
              </div>
            </CardFooter>
          )}
        </Card>
      </div>
    </div>
  );
}
