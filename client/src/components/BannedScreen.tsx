import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/AuthContext';
import { Ban, Mail, LogOut } from 'lucide-react';

interface BannedScreenProps {
  banExpiresAt?: string | null;
}

function formatTimeRemaining(ms: number): string {
  if (ms <= 0) return 'Expired';
  
  const seconds = Math.floor((ms / 1000) % 60);
  const minutes = Math.floor((ms / (1000 * 60)) % 60);
  const hours = Math.floor((ms / (1000 * 60 * 60)) % 24);
  const days = Math.floor(ms / (1000 * 60 * 60 * 24));
  
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (seconds > 0 || parts.length === 0) parts.push(`${seconds}s`);
  
  return parts.join(' ');
}

export function BannedScreen({ banExpiresAt }: BannedScreenProps) {
  const { logout } = useAuth();
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  useEffect(() => {
    if (!banExpiresAt) return;

    const calculateTimeRemaining = () => {
      const expiresAt = new Date(banExpiresAt).getTime();
      const now = Date.now();
      return Math.max(0, expiresAt - now);
    };

    setTimeRemaining(calculateTimeRemaining());

    const interval = setInterval(() => {
      const remaining = calculateTimeRemaining();
      setTimeRemaining(remaining);
      
      if (remaining <= 0) {
        clearInterval(interval);
        window.location.reload();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [banExpiresAt]);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await logout();
      window.location.href = '/login';
    } catch (error) {
      setIsLoggingOut(false);
    }
  };

  return (
    <div 
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-stone-950"
      data-testid="banned-screen"
    >
      <div className="absolute inset-0 bg-gradient-to-b from-red-950/20 via-stone-950 to-stone-950" />
      
      <div className="relative z-10 max-w-lg mx-auto px-6 text-center">
        <div className="mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-red-950/50 border-2 border-red-800/50 mb-6">
            <Ban className="w-10 h-10 text-red-500" />
          </div>
          
          <h1 
            className="text-2xl font-bold text-stone-100 mb-4"
            data-testid="text-ban-title"
          >
            Account Terminated
          </h1>
          
          <p 
            className="text-stone-400 leading-relaxed"
            data-testid="text-ban-message"
          >
            We are sorry to inform you but due to recent account activity we have decided to terminate your account with us. If you think this was a mistake, please email us at{' '}
            <a 
              href="mailto:support@arcanaadventure.com"
              className="text-amber-500 hover:text-amber-400 underline underline-offset-2"
              data-testid="link-support-email"
            >
              support@arcanaadventure.com
            </a>
          </p>
        </div>

        {banExpiresAt && timeRemaining !== null && timeRemaining > 0 && (
          <div 
            className="mb-8 p-4 rounded-lg bg-stone-900/80 border border-stone-800"
            data-testid="ban-countdown-container"
          >
            <p className="text-stone-500 text-sm mb-2">This ban expires in:</p>
            <p 
              className="text-2xl font-mono font-bold text-amber-500"
              data-testid="text-ban-countdown"
            >
              {formatTimeRemaining(timeRemaining)}
            </p>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button
            variant="outline"
            className="border-stone-700 text-stone-300 hover:bg-stone-800 hover:text-stone-100"
            asChild
          >
            <a 
              href="mailto:support@arcanaadventure.com"
              data-testid="button-contact-support"
            >
              <Mail className="w-4 h-4 mr-2" />
              Contact Support
            </a>
          </Button>
          
          <Button
            variant="ghost"
            className="text-stone-500 hover:text-stone-300 hover:bg-stone-900"
            onClick={handleLogout}
            disabled={isLoggingOut}
            data-testid="button-logout"
          >
            <LogOut className="w-4 h-4 mr-2" />
            {isLoggingOut ? 'Logging out...' : 'Log Out'}
          </Button>
        </div>
      </div>
    </div>
  );
}
