import React, { useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.js';
import { ArrowLeft, BarChart3, Boxes, History, LayoutDashboard, LogOut, Menu, PackageSearch, Settings2, ShieldAlert, Truck, X } from 'lucide-react';

export const EquipmentAdminLayout: React.FC = () => {
  const { user, profile, isAdmin, isLoading, signOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = useNavigate();
  const navItems = [
    { to: '/admin/equipment', label: 'ภาพรวมร้านอุปกรณ์', icon: LayoutDashboard, end: true },
    { to: '/admin/equipment/products', label: 'สินค้าและสต็อก', icon: PackageSearch },
    { to: '/admin/equipment/orders', label: 'คำสั่งซื้ออุปกรณ์', icon: Truck, end: true },
    { to: '/admin/equipment/orders/history', label: 'ประวัติการสั่งซื้อ', icon: History },
    { to: '/admin/equipment/reports', label: 'รายงานอุปกรณ์', icon: BarChart3 },
    { to: '/admin/equipment/settings/shipping', label: 'ค่าส่ง / การชำระเงิน', icon: Settings2 },
  ];

  if (isLoading) return <div className="grid min-h-screen place-items-center bg-teal-50"><div className="h-8 w-8 animate-spin rounded-full border-b-2 border-teal-700" /></div>;
  if (!isAdmin) return <div className="grid min-h-screen place-items-center bg-slate-50 p-4"><div className="max-w-md rounded-3xl border border-slate-200 bg-white p-7 text-center shadow-lg"><ShieldAlert className="mx-auto h-10 w-10 text-rose-600" /><h1 className="mt-3 text-xl font-black text-slate-900">ไม่มีสิทธิ์เข้าถึงส่วนจัดการอุปกรณ์</h1><p className="mt-2 text-sm text-slate-600">กรุณาเข้าสู่ระบบด้วยบัญชีผู้ดูแลระบบ</p><Link to="/" className="mt-5 inline-flex rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-bold text-white">กลับหน้าร้าน</Link></div></div>;

  const signOutAndReturn = async () => { await signOut(); navigate('/'); };
  const navigation = (mobile = false) => <nav className="space-y-1 font-sans">{navItems.map(({ to, label, icon: Icon, end }) => <NavLink key={to} to={to} end={end} onClick={() => mobile && setMenuOpen(false)} className={({ isActive }) => `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${isActive ? 'bg-teal-600 font-semibold text-white shadow-sm' : 'text-teal-100/75 hover:bg-teal-900 hover:text-white'}`}><Icon className="h-4 w-4" /><span>{label}</span></NavLink>)}</nav>;

  return <div className="min-h-screen bg-slate-100 lg:flex">
    <aside className="hidden w-64 shrink-0 flex-col bg-teal-950 text-teal-100 lg:sticky lg:top-0 lg:flex lg:h-screen lg:self-start">
      <div className="border-b border-teal-900 p-5 font-sans"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-teal-500 text-teal-950"><Boxes className="h-5 w-5" /></span><div><p className="text-[10px] font-medium uppercase tracking-[.18em] text-teal-300">HydroFarm</p><h1 className="text-sm font-bold text-white">ร้านอุปกรณ์ปลูก</h1></div></div></div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-5 font-sans"><p className="mb-3 px-3 text-[10px] font-medium uppercase tracking-widest text-teal-500">จัดการร้านอุปกรณ์</p>{navigation()}</div>
      <div className="border-t border-teal-900 bg-teal-950/70 p-4 font-sans"><div className="mb-3 flex items-center justify-between"><div className="min-w-0"><p className="truncate text-xs font-semibold text-white">{profile?.full_name || 'ผู้ดูแลระบบ'}</p><p className="truncate text-[11px] text-teal-400">{user?.email}</p></div><button onClick={() => void signOutAndReturn()} title="ออกจากระบบ" aria-label="ออกจากระบบ" className="rounded p-1 text-teal-400 transition-colors hover:text-rose-400"><LogOut className="h-4 w-4" /></button></div><Link to="/" className="flex items-center justify-center gap-2 rounded-xl bg-teal-900 px-3 py-2.5 text-xs font-medium text-teal-100 hover:bg-teal-800"><ArrowLeft className="h-4 w-4" />กลับสู่หน้าร้าน</Link></div>
    </aside>

    <div className="min-w-0 flex-1">
      <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-teal-900 bg-teal-950 px-4 font-sans text-white lg:hidden"><div className="flex items-center gap-2"><button onClick={() => setMenuOpen((value) => !value)} className="rounded-lg bg-teal-900 p-2 text-teal-100">{menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}</button><span className="text-sm font-bold">จัดการร้านอุปกรณ์ปลูก</span></div><Link to="/" className="inline-flex items-center gap-1 text-xs font-medium text-teal-300"><ArrowLeft className="h-3.5 w-3.5" />หน้าร้าน</Link></header>
      {menuOpen && <div className="fixed inset-0 z-30 bg-slate-950/50 pt-14 lg:hidden" onClick={() => setMenuOpen(false)}><div className="flex h-full w-72 flex-col bg-teal-950 p-3" onClick={(event) => event.stopPropagation()}><div className="flex-1">{navigation(true)}</div><div className="border-t border-teal-900 pt-3"><div className="mb-3 flex items-center justify-between"><div className="min-w-0"><p className="truncate text-xs font-semibold text-white">{profile?.full_name || 'ผู้ดูแลระบบ'}</p><p className="truncate text-[11px] text-teal-400">{user?.email}</p></div><button onClick={() => void signOutAndReturn()} title="ออกจากระบบ" aria-label="ออกจากระบบ" className="rounded p-1 text-teal-400 transition-colors hover:text-rose-400"><LogOut className="h-4 w-4" /></button></div><Link to="/" onClick={() => setMenuOpen(false)} className="flex items-center justify-center gap-2 rounded-xl bg-teal-900 px-3 py-2.5 text-xs font-medium text-teal-100 hover:bg-teal-800"><ArrowLeft className="h-4 w-4" />กลับสู่หน้าร้าน</Link></div></div></div>}
      <main className="mx-auto w-full max-w-7xl p-4 sm:p-6 lg:p-8"><Outlet /></main>
    </div>
  </div>;
};
