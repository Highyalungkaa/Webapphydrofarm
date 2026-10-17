import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.js';
import { useCart } from '../../context/CartContext.js';
import { Sprout, ShoppingBag, ClipboardList, User, ShieldCheck, Wrench, PackageSearch } from 'lucide-react';
import { useEquipmentCart } from '../../context/EquipmentCartContext.js';

export const BottomNav: React.FC = () => {
  const { user, isAdmin } = useAuth();
  const { items, totalKg } = useCart();
  const equipmentCart = useEquipmentCart();

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
          to="/equipment"
          className={({ isActive }) => `flex flex-col items-center justify-center flex-1 py-1 text-[10px] font-medium transition-colors ${isActive ? 'text-emerald-700 font-semibold' : 'text-slate-500'}`}
        >
          <div className="relative"><Wrench className="mb-0.5 h-5 w-5" />{equipmentCart.itemCount > 0 && <span className="absolute -right-2 -top-1 rounded-full bg-emerald-700 px-1 text-[9px] font-bold leading-4 text-white">{equipmentCart.itemCount}</span>}</div>
          <span>อุปกรณ์</span>
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
        {isAdmin && (
          <NavLink
            to="/admin/equipment"
            className={({ isActive }) => `flex flex-col items-center justify-center flex-1 py-1 text-[9px] font-medium transition-colors ${isActive ? 'text-teal-800 font-semibold' : 'text-teal-700'}`}
          >
            <PackageSearch className="mb-0.5 h-5 w-5" />
            <span>จัดการอุปกรณ์</span>
          </NavLink>
        )}
      </div>
    </nav>
  );
};
