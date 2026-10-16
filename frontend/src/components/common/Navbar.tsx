import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.js';
import { useCart } from '../../context/CartContext.js';
import { Sprout, ShoppingBag, User, ShieldCheck, LogIn, LogOut } from 'lucide-react';

export const Navbar: React.FC = () => {
  const { user, profile, isAdmin, signOut } = useAuth();
  const { totalKg, items } = useCart();
  const location = useLocation();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        {/* Brand */}
        <Link to="/" className="flex items-center gap-2.5 group">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-farm-600 to-farm-400 flex items-center justify-center text-white shadow-sm shadow-farm-500/20 group-hover:scale-105 transition-transform">
            <Sprout className="w-5 h-5" />
          </div>
          <div>
            <span className="font-bold text-lg text-slate-900 tracking-tight flex items-center gap-1.5">
              HydroFarm
              <span className="text-[10px] uppercase font-semibold tracking-wider px-1.5 py-0.5 rounded bg-farm-100 text-farm-800">
                Pre-order
              </span>
            </span>
            <span className="text-xs text-slate-500 block -mt-1 hidden sm:block">ฟาร์มผักไฮโดรโปนิกส์สด</span>
          </div>
        </Link>

        {/* Desktop Navigation */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium">
          <Link
            to="/"
            className={`transition-colors ${
              location.pathname === '/' ? 'text-farm-600 font-semibold' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            รอบเปิดจอง
          </Link>
          {user && (
            <Link
              to="/orders"
              className={`transition-colors ${
                location.pathname.startsWith('/orders') ? 'text-farm-600 font-semibold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              ประวัติการสั่งจอง
            </Link>
          )}
          {isAdmin && (
            <Link
              to="/admin"
              className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100 transition-colors"
            >
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              จัดการหลังบ้าน
            </Link>
          )}
        </nav>

        {/* Right side actions */}
        <div className="flex items-center gap-3">
          {items.length > 0 && (
            <Link
              to="/checkout"
              className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-farm-600 text-white text-xs sm:text-sm font-medium hover:bg-farm-700 shadow-sm shadow-farm-600/30 transition-all hover:scale-102"
            >
              <ShoppingBag className="w-4 h-4" />
              <span>{totalKg.toFixed(1)} กก.</span>
            </Link>
          )}

          {user ? (
            <div className="flex items-center gap-2">
              <Link
                to="/profile"
                className="flex items-center gap-2 p-1.5 rounded-full hover:bg-slate-100 transition-colors text-slate-700"
                title="ข้อมูลส่วนตัว"
              >
                <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 text-xs font-semibold overflow-hidden border border-slate-300">
                  {profile?.full_name ? profile.full_name[0].toUpperCase() : <User className="w-4 h-4" />}
                </div>
                <span className="text-xs font-medium max-w-[100px] truncate hidden sm:inline">
                  {profile?.full_name || user.email?.split('@')[0]}
                </span>
              </Link>
              <button
                onClick={handleSignOut}
                className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition-colors"
                title="ออกจากระบบ"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <Link
              to="/login"
              className="flex items-center gap-1.5 text-xs sm:text-sm font-medium px-3.5 py-1.5 rounded-lg bg-slate-900 text-white hover:bg-slate-800 transition-colors"
            >
              <LogIn className="w-4 h-4" />
              <span>เข้าสู่ระบบ</span>
            </Link>
          )}
        </div>
      </div>
    </header>
  );
};
