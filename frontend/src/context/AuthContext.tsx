import React, { createContext, useContext, useEffect, useState } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase.js';
import { api } from '../lib/api.js';
import { CustomerProfile } from '../types/index.js';

interface AuthContextType {
  user: User | null;
  profile: CustomerProfile | null;
  isAdmin: boolean;
  isLoading: boolean;
  signInWithGoogle: (redirectToUrl?: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const fetchProfile = async () => {
    try {
      // 1. Check admin status directly via Supabase RPC (reliable and immediate)
      const { data: rpcAdmin } = await supabase.rpc('is_admin');
      if (rpcAdmin) {
        setIsAdmin(true);
      }

      // 2. Fetch full profile from backend
      const data = await api.get<CustomerProfile>('/profile');
      setProfile(data);
      setIsAdmin(!!data.is_admin || !!rpcAdmin);
    } catch (err) {
      console.warn('Backend /profile fetch note:', err);
      // Fallback if backend is restarting or service key not yet updated
      try {
        const { data: rpcAdmin } = await supabase.rpc('is_admin');
        setIsAdmin(!!rpcAdmin);
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          setProfile({
            id: session.user.id,
            email: session.user.email || '',
            full_name: session.user.user_metadata?.full_name || session.user.email?.split('@')[0] || '',
            no_show_count: 0,
            is_admin: !!rpcAdmin,
          });
        }
      } catch (e) {
        console.error(e);
      }
    }
  };

  useEffect(() => {
    // 1. Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile().finally(() => setIsLoading(false));
      } else {
        setIsLoading(false);
      }
    });

    // 2. Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        await fetchProfile();
      } else {
        setProfile(null);
        setIsAdmin(false);
      }
      setIsLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const signInWithGoogle = async (redirectToUrl?: string) => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: redirectToUrl || window.location.origin,
      },
    });
    if (error) throw error;
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
    setIsAdmin(false);
  };

  const refreshProfile = async () => {
    if (user) {
      await fetchProfile();
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        isAdmin,
        isLoading,
        signInWithGoogle,
        signOut,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
