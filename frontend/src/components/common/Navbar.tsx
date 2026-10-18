import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.js';
import { useCart } from '../../context/CartContext.js';
import { Sprout, ShoppingBag, User, ShieldCheck, LogIn, LogOut, PackageSearch } from 'lucide-react';
import { useEquipmentCart } from '../../context/EquipmentCartContext.js';

export const Navbar: React.FC = () => {
  const { user, profile, isAdmin, signOut } = useAuth();
  const { totalKg, items } = useCart();
  const equipmentCart = useEquipmentCart();
  const location = useLocation();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  return (
    <header className="sticky top-0 z-40 border-b border-emerald-100/80 bg-white/95 shadow-[0_6px_24px_-18px_rgba(12,69,48,.45)] backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        {/* Brand */}
        <Link to="/" aria-label="HydroFarm กลับหน้ารอบเปิดจอง" className="group inline-flex shrink-0 items-center gap-2.5 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 sm:gap-3">
          <span className="relative grid h-10 w-10 shrink-0 place-items-center rounded-[14px] bg-emerald-950 shadow-lg shadow-emerald-900/15 transition-transform duration-200 group-hover:-rotate-6 sm:h-11 sm:w-11">
            <span className="absolute inset-[5px] rounded-[10px] border border-white/15" />
            <Sprout className="relative h-5 w-5 text-lime-300 sm:h-6 sm:w-6" strokeWidth={2.2} />
            <span className="absolute -bottom-1 -right-1 grid h-4 w-4 place-items-center rounded-full border-2 border-white bg-lime-300"><span className="h-1 w-1 rounded-full bg-emerald-900" /></span>
          </span>
          <span className="flex min-w-0 flex-col justify-center leading-none">
            <span className="whitespace-nowrap text-[18px] font-black tracking-[-.055em] sm:text-[21px]"><span className="text-slate-950">Hydro</span><span className="text-emerald-700">Farm</span></span>
            <span className="mt-1 whitespace-nowrap text-[9px] font-bold tracking-[.04em] text-emerald-800/75 sm:text-[10px]">ผักสดและอุปกรณ์ปลูก</span>
          </span>
        </Link>

        {/* Desktop Navigation */}
        <nav className="hidden items-center gap-3 text-xs font-medium lg:flex xl:gap-4 xl:text-sm">
          <Link
            to="/"
            className={`transition-colors ${location.pathname === '/' ? 'text-farm-600 font-semibold' : 'text-slate-600 hover:text-slate-900'
              }`}
          >
            รอบเปิดจอง
          </Link>
          <Link
            to="/equipment"
            className={`flex items-center gap-1.5 transition-colors ${location.pathname.startsWith('/equipment') ? 'font-semibold text-emerald-700' : 'text-slate-600 hover:text-slate-900'}`}
          >
            ซื้ออุปกรณ์ปลูก
          </Link>
          {user && (
            <Link
              to="/orders"
              className={`transition-colors ${location.pathname.startsWith('/orders') ? 'text-farm-600 font-semibold' : 'text-slate-600 hover:text-slate-900'
                }`}
            >
              ประวัติการสั่งจอง/ซื้อ
            </Link>
          )}
          {isAdmin && (
            <div className="flex items-center gap-1.5 border-l border-slate-200 pl-3">
              <Link
                to="/admin"
                className="flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-[11px] font-bold text-emerald-800 transition-colors hover:bg-emerald-100 xl:text-xs"
              >
                <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-600" />
                จัดการผัก&รอบปลูก
              </Link>
              <Link
                to="/admin/equipment"
                className={`flex items-center gap-1.5 whitespace-nowrap rounded-lg border px-2.5 py-1.5 text-[11px] font-bold transition-colors xl:text-xs ${location.pathname.startsWith('/admin/equipment') ? 'border-teal-300 bg-teal-100 text-teal-900' : 'border-teal-200 bg-teal-50 text-teal-800 hover:bg-teal-100'}`}
              >
                <PackageSearch className="h-4 w-4 shrink-0 text-teal-700" />
                จัดการอุปกรณ์
              </Link>
            </div>
          )}
        </nav>

        {/* Right side actions */}
        <div className="flex items-center gap-3">
          <Link
            to="/equipment/checkout"
            title="ตะกร้าอุปกรณ์ปลูก"
            className="relative rounded-full border border-emerald-200 bg-emerald-50 p-2 text-emerald-800 transition hover:bg-emerald-100"
          >
            <ShoppingBag className="h-4 w-4" />
            {equipmentCart.itemCount > 0 && <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-emerald-700 px-1 text-center text-[9px] font-black leading-4 text-white">{equipmentCart.itemCount}</span>}
          </Link>
          {items.length > 0 && (
            <Link
              to="/booking-review"
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
