import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
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

async function loadProfile(user: User): Promise<{ profile: CustomerProfile; isAdmin: boolean }> {
  try {
    const profile = await api.get<CustomerProfile>('/profile');
    return { profile, isAdmin: !!profile.is_admin };
  } catch (err) {
    console.warn('Backend /profile fetch note:', err);
    let isAdmin = false;
    try {
      const { data } = await supabase.rpc('is_admin');
      isAdmin = !!data;
    } catch (rpcError) {
      console.error(rpcError);
    }
    return {
      profile: {
        id: user.id,
        email: user.email || '',
        full_name: user.user_metadata?.full_name || user.email?.split('@')[0] || '',
        no_show_count: 0,
        is_admin: isAdmin,
      },
      isAdmin,
    };
  }
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const profileRequest = useRef(0);

  useEffect(() => {
    let active = true;
    let lastUserId: string | null = null;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'TOKEN_REFRESHED') return;
      if (event === 'SIGNED_IN' && session?.user.id === lastUserId) return;
      lastUserId = session?.user.id ?? null;
      const request = ++profileRequest.current;
      setUser(session?.user ?? null);
      if (session?.user) {
        setIsLoading(true);
        // Supabase auth callbacks must finish before another Supabase call starts.
        setTimeout(() => {
          if (!active || request !== profileRequest.current) return;
          loadProfile(session.user).then((result) => {
            if (!active || request !== profileRequest.current) return;
            setProfile(result.profile);
            setIsAdmin(result.isAdmin);
          }).finally(() => {
            if (active && request === profileRequest.current) setIsLoading(false);
          });
        }, 0);
      } else {
        setProfile(null);
        setIsAdmin(false);
        setIsLoading(false);
      }
    });

    return () => {
      active = false;
      profileRequest.current += 1;
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
      const request = ++profileRequest.current;
      const result = await loadProfile(user);
      if (request === profileRequest.current) {
        setProfile(result.profile);
        setIsAdmin(result.isAdmin);
        setIsLoading(false);
      }
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
