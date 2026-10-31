import React, { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Phone } from 'lucide-react';
import { api } from '../../lib/api.js';
import { Navbar } from '../common/Navbar.js';
import { BottomNav } from '../common/BottomNav.js';

export const CustomerLayout: React.FC = () => {
  const isHome = useLocation().pathname === '/';
  const [contactPhone, setContactPhone] = useState<string | null>(null);
  useEffect(() => {
    if (!isHome) return;
    let active = true;
    void api.get<{phone: string | null}>('/settings/contact')
      .then(contact => { if (active) setContactPhone(contact.phone); })
      .catch(() => { if (active) setContactPhone(null); });
    return () => { active = false; };
  }, [isHome]);
  return (
    <div className="flex min-h-screen flex-col bg-[#f6f8f2]">
      <Navbar />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-24 pt-6 sm:px-6 md:pb-14 md:pt-8">
        <Outlet />
      </main>
      <BottomNav />
      <footer className={`${isHome ? 'block pb-28 pt-6 md:pb-6' : 'hidden py-6 md:block'} border-t border-emerald-100 bg-white`}>
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-5 px-6 text-xs text-slate-500 sm:flex-row sm:items-center">
          <p><strong className="text-emerald-800">HydroFarm</strong> · ผักสดและอุปกรณ์ปลูก</p>
          {isHome && contactPhone && <a href={`tel:${contactPhone.replace(/[^\d+]/g, '')}`} className="inline-flex w-full items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-emerald-900 transition hover:bg-emerald-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 sm:w-auto">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-emerald-700 text-white"><Phone className="h-5 w-5" aria-hidden="true" /></span>
            <span><span className="block text-sm font-bold">ติดต่อฟาร์ม</span><span className="mt-0.5 block text-2xl font-extrabold tabular-nums">{contactPhone}</span></span>
          </a>}
          <p>จากฟาร์มถึงมือคุณ</p>
        </div>
      </footer>
    </div>
  );
};
