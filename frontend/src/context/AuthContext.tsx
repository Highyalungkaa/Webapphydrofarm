import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase.js';
import { api } from '../lib/api.js';
import { sessionHasExpired, sessionExpiredEvent } from '../lib/sessionLifetime.js';
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
  const [authNotice, setAuthNotice] = useState('');

  useEffect(() => {
    let active = true;
    let deadline: string | null = null;
    let expiryTimer: ReturnType<typeof setTimeout> | undefined;
    let expiring = false;
    let verifiedToken: string | undefined;
    const clearIdentity = () => {
      profileRequest.current += 1;
      setUser(null);
      setProfile(null);
      setIsAdmin(false);
      setIsLoading(false);
    };
    const expire = () => {
      if (!active || expiring) return;
      expiring = true;
      deadline = null;
      clearTimeout(expiryTimer);
      clearIdentity();
      setAuthNotice('ครบเวลาเข้าสู่ระบบ 24 ชั่วโมงแล้ว กรุณาเข้าสู่ระบบใหม่');
      // Defer Supabase calls until the auth event callback has released its lock.
      setTimeout(() => { void supabase.auth.signOut({ scope: 'local' }); }, 0);
    };
    const checkTime = () => {
      if (deadline && sessionHasExpired(deadline)) expire();
    };
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      // Supabase also emits SIGNED_IN on tab focus. Keep the original deadline.
      if (session?.access_token && session.access_token === verifiedToken && deadline) {
        checkTime();
        return;
      }
      const request = ++profileRequest.current;
      if (!session?.user) {
        clearTimeout(expiryTimer);
        deadline = null;
        clearIdentity();
        return;
      }
      expiring = false;
      // Never grant UI access until the server has checked this session's age.
      setTimeout(async () => {
        if (!active || request !== profileRequest.current) return;
        try {
          const { data, error } = await supabase.rpc('get_current_session_deadline');
          if (!active || request !== profileRequest.current) return;
          if (error) {
            clearIdentity();
            setAuthNotice('ตรวจสอบการเข้าสู่ระบบไม่สำเร็จ กรุณารีเฟรชหน้าเว็บเพื่อลองใหม่');
            return;
          }
          deadline = typeof data === 'string' ? data : null;
          if (sessionHasExpired(deadline)) { expire(); return; }
          verifiedToken = session.access_token;
          clearTimeout(expiryTimer);
          expiryTimer = setTimeout(expire, Math.max(0, Date.parse(deadline!) - Date.now()));
          setAuthNotice('');
          setUser(session.user);
          const result = await loadProfile(session.user);
          if (!active || request !== profileRequest.current || expiring) return;
          setProfile(result.profile);
          setIsAdmin(result.isAdmin);
          setIsLoading(false);
        } catch {
          if (active && request === profileRequest.current) {
            clearIdentity();
            setAuthNotice('ตรวจสอบการเข้าสู่ระบบไม่สำเร็จ กรุณารีเฟรชหน้าเว็บเพื่อลองใหม่');
          }
        }
      }, 0);
    });
    window.addEventListener('focus', checkTime);
    document.addEventListener('visibilitychange', checkTime);
    window.addEventListener(sessionExpiredEvent, expire);
    return () => {
      active = false;
      profileRequest.current += 1;
      clearTimeout(expiryTimer);
      subscription.unsubscribe();
      window.removeEventListener('focus', checkTime);
      document.removeEventListener('visibilitychange', checkTime);
      window.removeEventListener(sessionExpiredEvent, expire);
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
      {authNotice && <div role="alert" className="bg-amber-50 px-4 py-3 text-center text-sm text-amber-900">{authNotice}</div>}
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
