import React, { useState } from 'react';
import { NavLink, Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.js';
import {
  LayoutDashboard,
  CalendarDays,
  ShoppingBag,
  Leaf,
  MapPin,
  Users,
  Settings,
  ShieldAlert,
  History,
  ArrowLeft,
  Menu,
  X,
  LogOut,
  LayoutGrid,
  Sprout,
  BookmarkCheck,
  BarChart3,
} from 'lucide-react';

export const AdminLayout: React.FC = () => {
  const { user, profile, isAdmin, isLoading, signOut } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const isNavActive = (to: string, isActive: boolean) =>
    isActive && !(to === '/admin/rounds' && location.pathname.startsWith('/admin/rounds/history'));

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <div className="max-w-md w-full bg-white rounded-2xl p-6 text-center shadow-lg border border-slate-200">
          <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 mx-auto flex items-center justify-center mb-4">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 mb-2">ไม่มีสิทธิ์เข้าถึงส่วนผู้ดูแลระบบ</h2>
          <p className="text-sm text-slate-600 mb-6">
            บัญชีของคุณ ({user?.email || 'ยังไม่ได้เข้าสู่ระบบ'}) ไม่ได้อยู่ในรายชื่อผู้ดูแลระบบ กรุณาเข้าสู่ระบบด้วยบัญชีแอดมิน
          </p>
          <div className="flex gap-3 justify-center">
            <Link
              to="/"
              className="px-4 py-2 text-sm font-medium rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200"
            >
              กลับหน้าหลัก
            </Link>
            <Link
              to="/login"
              className="px-4 py-2 text-sm font-medium rounded-lg bg-emerald-600 text-white hover:bg-emerald-700"
            >
              สลับบัญชีล็อกอิน
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const navItems = [
    { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
    { to: '/admin/rounds', label: 'สร้างรอบการปลูก', icon: CalendarDays, dividerBefore: true },
    { to: '/admin/bookings', label: 'เปิดสั่งจองล่วงหน้า', icon: BookmarkCheck },
    { to: '/admin/orders', label: 'คำสั่งจอง', icon: ShoppingBag },
    { to: '/admin/rounds/history', label: 'ประวัติต่างๆ', icon: History },
    { to: '/admin/crops', label: 'แคตตาล็อกผัก', icon: Leaf, dividerBefore: true },
    { to: '/admin/plots', label: 'จัดการแปลงปลูก', icon: LayoutGrid },
    { to: '/admin/farm', label: 'ตั้งค่าความจุฟาร์ม', icon: Sprout },
    { to: '/admin/customers', label: 'รายชื่อลูกค้า', icon: Users, dividerBefore: true },
    { to: '/admin/admins', label: 'ผู้ดูแลระบบ', icon: ShieldAlert },
    { to: '/admin/settings', label: 'ตั้งค่าระบบ', icon: Settings, dividerBefore: true },
    { to: '/admin/audit', label: 'บันทึกการแก้ไข', icon: History },
    { to: '/admin/reports', label: 'รายงาน', icon: BarChart3, dividerBefore: true },
  ];

  return (
    <div className="min-h-screen flex bg-slate-100">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex flex-col w-64 bg-slate-900 text-slate-300 border-r border-slate-800">
        <div className="p-5 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center text-slate-950 font-bold">
              HF
            </div>
            <div>
              <h1 className="font-bold text-white text-sm tracking-tight leading-none">HydroFarm Admin</h1>
              <span className="text-[10px] text-emerald-400 font-medium">ระบบบริหารหลังบ้าน</span>
            </div>
          </div>
        </div>

        {/* Navigation list */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <React.Fragment key={item.to}>
                {item.dividerBefore && <div className="my-3 border-t border-slate-800" />}
                <NavLink
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${isNavActive(item.to, isActive)
                      ? 'bg-emerald-600 text-white font-semibold shadow-sm'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                    }`
                  }
                >
                  <Icon className="w-4 h-4" />
                  <span>{item.label}</span>
                </NavLink>
              </React.Fragment>
            );
          })}
        </nav>

        {/* User profile & Switch back */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/40">
          <div className="flex items-center justify-between mb-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-white truncate">{profile?.full_name || 'Admin'}</p>
              <p className="text-[11px] text-slate-500 truncate">{user?.email}</p>
            </div>
            <button
              onClick={() => {
                signOut();
                navigate('/');
              }}
              title="ออกจากระบบ"
              className="text-slate-400 hover:text-rose-400 p-1 rounded transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
          <Link
            to="/"
            className="flex items-center justify-center gap-1.5 w-full py-2 text-xs font-medium rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>กลับสู่หน้าร้าน</span>
          </Link>
        </div>
      </aside>

      {/* Mobile Top Header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-40 bg-slate-900 text-white px-4 h-14 flex items-center justify-between border-b border-slate-800">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-1.5 rounded-lg bg-slate-800 text-slate-300 hover:text-white"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
          <span className="font-bold text-sm">HydroFarm Admin</span>
        </div>
        <Link to="/" className="text-xs text-emerald-400 flex items-center gap-1 font-medium">
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>หน้าร้าน</span>
        </Link>
      </div>

      {/* Mobile Drawer Menu */}
      {mobileMenuOpen && (
        <div className="lg:hidden fixed inset-0 z-30 bg-black/60 pt-14" onClick={() => setMobileMenuOpen(false)}>
          <div
            className="w-64 h-full bg-slate-900 text-slate-300 p-3 space-y-1 overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <React.Fragment key={item.to}>
                  {item.dividerBefore && <div className="my-3 border-t border-slate-800" />}
                  <NavLink
                    to={item.to}
                    end={item.end}
                    onClick={() => setMobileMenuOpen(false)}
                    className={({ isActive }) =>
                      `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium ${isNavActive(item.to, isActive) ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:bg-slate-800'
                      }`
                    }
                  >
                    <Icon className="w-4 h-4" />
                    <span>{item.label}</span>
                  </NavLink>
                </React.Fragment>
              );
            })}
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 pt-14 lg:pt-0">
        <div className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          <Outlet />
        </div>
      </div>
    </div>
  );
};
