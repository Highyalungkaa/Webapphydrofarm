import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.js';
import { useCart } from '../../context/CartContext.js';
import { Sprout, ShoppingBag, ClipboardList, User, ShieldCheck } from 'lucide-react';

export const BottomNav: React.FC = () => {
  const { user, isAdmin } = useAuth();
  const { items, totalKg } = useCart();

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 pb-safe">
      <div className="flex items-center justify-around h-14 px-2">
        <NavLink
          to="/"
          className={({ isActive }) =>
            `flex flex-col items-center justify-center flex-1 py-1 text-[11px] font-medium transition-colors ${
              isActive ? 'text-farm-600 font-semibold' : 'text-slate-500'
            }`
          }
        >
          <Sprout className="w-5 h-5 mb-0.5" />
          <span>รอบจอง</span>
        </NavLink>

        <NavLink
          to="/checkout"
          className={({ isActive }) =>
            `relative flex flex-col items-center justify-center flex-1 py-1 text-[11px] font-medium transition-colors ${
              isActive ? 'text-farm-600 font-semibold' : 'text-slate-500'
            }`
          }
        >
          <div className="relative">
            <ShoppingBag className="w-5 h-5 mb-0.5" />
            {items.length > 0 && (
              <span className="absolute -top-1 -right-2 px-1.5 py-0.2 bg-farm-600 text-white text-[10px] rounded-full font-bold">
                {totalKg.toFixed(1)}
              </span>
            )}
          </div>
          <span>ตะกร้า</span>
        </NavLink>

        {user && (
          <NavLink
            to="/orders"
            className={({ isActive }) =>
              `flex flex-col items-center justify-center flex-1 py-1 text-[11px] font-medium transition-colors ${
                isActive ? 'text-farm-600 font-semibold' : 'text-slate-500'
              }`
            }
          >
            <ClipboardList className="w-5 h-5 mb-0.5" />
            <span>ออเดอร์</span>
          </NavLink>
        )}

        <NavLink
          to={user ? '/profile' : '/login'}
          className={({ isActive }) =>
            `flex flex-col items-center justify-center flex-1 py-1 text-[11px] font-medium transition-colors ${
              isActive ? 'text-farm-600 font-semibold' : 'text-slate-500'
            }`
          }
        >
          <User className="w-5 h-5 mb-0.5" />
          <span>{user ? 'โปรไฟล์' : 'เข้าสู่ระบบ'}</span>
        </NavLink>

        {isAdmin && (
          <NavLink
            to="/admin"
            className={({ isActive }) =>
              `flex flex-col items-center justify-center flex-1 py-1 text-[11px] font-medium transition-colors ${
                isActive ? 'text-emerald-700 font-semibold' : 'text-emerald-600'
              }`
            }
          >
            <ShieldCheck className="w-5 h-5 mb-0.5" />
            <span>แอดมิน</span>
          </NavLink>
        )}
      </div>
    </nav>
  );
};
