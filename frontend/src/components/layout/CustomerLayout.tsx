import React, { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Phone } from 'lucide-react';
import { api } from '../../lib/api.js';
import {useLiveRefresh} from '../../lib/useLiveRefresh.js';
import { Navbar } from '../common/Navbar.js';
import { BottomNav } from '../common/BottomNav.js';

export const CustomerLayout: React.FC = () => {
  const isHome = useLocation().pathname === '/';
  const [contactPhone, setContactPhone] = useState<string | null>(null);
  useLiveRefresh(async()=>{const data=await api.get<{phone:string|null}>('/settings/contact');setContactPhone(data.phone);},{enabled:isHome,intervalMs:30000,protectDraft:false});
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
          {isHome && contactPhone && <p className="inline-flex flex-wrap items-center gap-2 text-sm text-slate-600">
            <Phone className="h-4 w-4 shrink-0 text-emerald-700" aria-hidden="true" />
            <span>ติดต่อฟาร์ม:</span><span className="font-semibold tabular-nums text-emerald-800">{contactPhone}</span>
          </p>}
          <p>จากฟาร์มถึงมือคุณ</p>
        </div>
      </footer>
    </div>
  );
};
