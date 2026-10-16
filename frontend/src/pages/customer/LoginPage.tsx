import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext.js';
import { Sprout, AlertCircle, ArrowLeft, LogIn } from 'lucide-react';
import { Link, Navigate, useLocation } from 'react-router-dom';

export const LoginPage: React.FC = () => {
  const { user, signInWithGoogle, isLoading } = useAuth();
  const location = useLocation();
  const returnTo = (location.state as any)?.returnTo || '/';
  const [error, setError] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  if (!isLoading && user) {
    return <Navigate to={returnTo} replace />;
  }

  const handleGoogleLogin = async () => {
    try {
      setError(null);
      setIsLoggingIn(true);
      const redirectUrl = new URL(returnTo, window.location.origin).toString();
      await signInWithGoogle(redirectUrl);
    } catch (err: any) {
      setError(err.message || 'ไม่สามารถเข้าสู่ระบบด้วย Google ได้');
      setIsLoggingIn(false);
    }
  };

  return (
    <div className="min-h-[75vh] flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-3xl p-8 border border-slate-200/90 shadow-xl shadow-slate-200/50 space-y-6 text-center">
        {/* Brand Logo */}
        <div className="w-16 h-16 rounded-3xl bg-gradient-to-tr from-farm-600 to-farm-400 text-white flex items-center justify-center mx-auto shadow-md shadow-farm-500/30">
          <Sprout className="w-9 h-9" />
        </div>

        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">เข้าสู่ระบบ HydroFarm</h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            ระบบจองผักไฮโดรโปนิกส์สดล่วงหน้าก่อนเก็บเกี่ยว
          </p>
        </div>

        {returnTo !== '/' && !error && (
          <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs flex items-center gap-2 text-left font-medium">
            <LogIn className="w-4 h-4 text-amber-600 flex-shrink-0" />
            <span>กรุณาเข้าสู่ระบบก่อนทำการสั่งจองผัก เพื่อบันทึกคำสั่งซื้อของคุณ</span>
          </div>
        )}

        {error && (
          <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2 text-left">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="space-y-4 pt-2">
          {/* Single Google Sign In Button */}
          <button
            onClick={handleGoogleLogin}
            disabled={isLoggingIn}
            className="w-full py-3.5 px-4 rounded-2xl border border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-800 text-sm font-semibold transition-all shadow-sm flex items-center justify-center gap-3 active:scale-98"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
            <span>{isLoggingIn ? 'กำลังเชื่อมต่อ Google...' : 'เข้าสู่ระบบด้วย Google'}</span>
          </button>

          <p className="text-[11px] text-slate-400">
            ระบบรองรับการเข้าสู่ระบบด้วยบัญชี Google อย่างปลอดภัย ไม่ต้องจำรหัสผ่าน
          </p>
        </div>

        <div className="pt-2">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>กลับสู่หน้าหลัก</span>
          </Link>
        </div>
      </div>
    </div>
  );
};
