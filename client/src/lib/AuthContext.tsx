import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { api, globalWs, type User, type BanDetails } from './api';
import { queryClient } from './queryClient';
import { applyTheme, isAppTheme } from './theme';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  isAdmin: boolean;
  isBanned: boolean;
  banDetails: BanDetails | null;
  login: (email: string, password: string, rememberMe?: boolean) => Promise<void>;
  register: (email: string, password: string, username: string, name: string) => Promise<void>;
  logout: () => Promise<void>;
  refetchUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [banDetails, setBanDetails] = useState<BanDetails | null>(null);

  useEffect(() => {
    api.setBanCallback((details) => {
      setBanDetails(details);
    });
    
    checkAuth();
    
    return () => {
      api.setBanCallback(null);
    };
  }, []);

  // Sync the account-saved theme to this device whenever the user loads.
  // Local storage is only a fallback for logged-out/unsynced states.
  useEffect(() => {
    if (user && isAppTheme(user.theme)) {
      applyTheme(user.theme);
    }
  }, [user?.theme]);

  useEffect(() => {
    if (user) {
      globalWs.connect();
    } else {
      globalWs.disconnect();
    }
    return () => { globalWs.disconnect(); };
  }, [user]);

  const checkAuth = async () => {
    try {
      const { user } = await api.getMe();
      setUser(user);
    } catch (error) {
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  const login = async (email: string, password: string, rememberMe?: boolean) => {
    const { user } = await api.login(email, password, rememberMe);
    setUser(user);
  };

  const register = async (email: string, password: string, username: string, name: string) => {
    const { user } = await api.register(email, password, username, name);
    setUser(user);
  };

  const logout = async () => {
    await api.logout();
    setUser(null);
    setBanDetails(null);
    queryClient.clear();
  };

  const isBanned = banDetails?.isBanned ?? false;
  const isAdmin = user?.isAdmin ?? false;

  const refetchUser = async () => {
    await checkAuth();
  };

  return (
    <AuthContext.Provider value={{ user, loading, isAdmin, isBanned, banDetails, login, register, logout, refetchUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
