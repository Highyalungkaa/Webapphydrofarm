import React from 'react';
import { Outlet } from 'react-router-dom';
import { Navbar } from '../common/Navbar.js';
import { BottomNav } from '../common/BottomNav.js';

export const CustomerLayout: React.FC = () => {
  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <Navbar />
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-6 pb-24 md:pb-12">
        <Outlet />
      </main>
      <BottomNav />
      <footer className="hidden md:block border-t border-slate-200 bg-white py-6 text-center text-xs text-slate-500">
        <p>© 2026 HydroFarm Pre-order System. ผักไฮโดรโปนิกส์สด สะอาด ปลอดสารพิษ 100%</p>
      </footer>
    </div>
  );
};
