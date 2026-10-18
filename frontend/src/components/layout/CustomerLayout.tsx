import React from 'react';
import { Outlet } from 'react-router-dom';
import { Navbar } from '../common/Navbar.js';
import { BottomNav } from '../common/BottomNav.js';

export const CustomerLayout: React.FC = () => {
  return (
    <div className="flex min-h-screen flex-col bg-[#f6f8f2]">
      <Navbar />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-24 pt-6 sm:px-6 md:pb-14 md:pt-8">
        <Outlet />
      </main>
      <BottomNav />
      <footer className="hidden border-t border-emerald-100 bg-white py-6 md:block">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 text-xs text-slate-500">
          <p><strong className="text-emerald-800">HydroFarm</strong> · ผักสดและอุปกรณ์ปลูก</p>
          <p>จากฟาร์มถึงมือคุณ</p>
        </div>
      </footer>
    </div>
  );
};
