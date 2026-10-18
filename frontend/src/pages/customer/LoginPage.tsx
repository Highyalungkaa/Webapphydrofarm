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
    <div className="min-h-[75vh] flex items-center justify-center py-6 sm:py-12">
      <div className="grid w-full max-w-4xl overflow-hidden rounded-[2rem] border border-emerald-100 bg-white shadow-xl shadow-emerald-950/10 md:grid-cols-[0.9fr_1fr]">
        <div className="relative flex flex-col justify-between overflow-hidden bg-[#103e31] p-8 text-white sm:p-10">
          <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full border border-white/10" />
          <div className="pointer-events-none absolute -bottom-24 left-0 h-72 w-72 rounded-full bg-lime-300/10 blur-3xl" />
          <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-lime-300 text-emerald-950"><Sprout className="h-8 w-8" /></div>
          <div className="relative mt-16 space-y-4 md:mt-0">
            <span className="inline-flex rounded-full border border-white/20 px-3 py-1 text-xs font-bold text-lime-200">HYDROFARM</span>
            <h1 className="text-3xl font-black leading-tight sm:text-4xl">ผักสดและอุปกรณ์ปลูก<br />ในที่เดียว</h1>
            <p className="max-w-xs text-sm leading-7 text-emerald-50/80">เข้าสู่ระบบเพื่อจองผัก เลือกซื้ออุปกรณ์ และติดตามคำสั่งซื้อของคุณ</p>
          </div>
        </div>
        <div className="space-y-6 p-7 text-center sm:p-10">
        {/* Brand Logo */}
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-800 md:hidden">
          <Sprout className="h-8 w-8" />
        </div>

        <div>
          <h2 className="text-2xl font-black tracking-tight text-emerald-950">ยินดีต้อนรับกลับมา</h2>
          <p className="mt-2 text-sm text-slate-500">
            เข้าสู่ระบบเพื่อจัดการคำสั่งจองและคำสั่งซื้อ
          </p>
        </div>

        {returnTo !== '/' && !error && (
          <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs flex items-center gap-2 text-left font-medium">
            <LogIn className="w-4 h-4 text-amber-600 flex-shrink-0" />
            <span>กรุณาเข้าสู่ระบบเพื่อดำเนินการต่อและบันทึกคำสั่งซื้อของคุณ</span>
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
            className="flex w-full items-center justify-center gap-3 rounded-2xl border border-emerald-200 bg-white px-4 py-4 text-sm font-bold text-emerald-950 shadow-sm transition-all hover:border-emerald-400 hover:bg-emerald-50 disabled:opacity-60"
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

          <p className="text-xs text-slate-500">
            ใช้บัญชี Google ของคุณเพื่อเข้าสู่ระบบ
          </p>
        </div>

        <div className="pt-2">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-700 transition-colors hover:text-emerald-900"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>กลับสู่หน้าหลัก</span>
          </Link>
        </div>
        </div>
      </div>
    </div>
  );
};
