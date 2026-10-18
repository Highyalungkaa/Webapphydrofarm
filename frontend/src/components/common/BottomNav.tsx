import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.js';
import { useCart } from '../../context/CartContext.js';
import { useEquipmentCart } from '../../context/EquipmentCartContext.js';
import { ClipboardList, Package, PackageSearch, ShieldCheck, ShoppingBag, Sprout, User } from 'lucide-react';

export const BottomNav: React.FC = () => {
  const { user, isAdmin } = useAuth();
  const { items, totalKg } = useCart();
  const equipmentCart = useEquipmentCart();
  const navClass = (active: boolean) => `relative flex min-w-[64px] flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1.5 text-[10px] font-bold transition-colors ${active ? 'bg-emerald-50 text-emerald-800' : 'text-slate-500 hover:bg-slate-50 hover:text-emerald-800'}`;

  return <nav aria-label="เมนูลูกค้า" className="fixed bottom-0 left-0 right-0 z-40 border-t border-emerald-100 bg-white/95 px-2 pb-safe pt-1.5 shadow-[0_-8px_28px_-18px_rgba(12,69,48,.25)] backdrop-blur-md md:hidden">
    <div className="mx-auto flex h-14 max-w-xl items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <NavLink to="/" end className={({ isActive }) => navClass(isActive)}><Sprout className="h-5 w-5" /><span>รอบจอง</span></NavLink>
      <NavLink to="/equipment" className={({ isActive }) => navClass(isActive)}><span className="relative"><Package className="h-5 w-5" />{equipmentCart.itemCount > 0 && <span className="absolute -right-2 -top-1.5 min-w-4 rounded-full bg-emerald-700 px-1 text-center text-[9px] leading-4 text-white">{equipmentCart.itemCount}</span>}</span><span>อุปกรณ์</span></NavLink>
      <NavLink to="/booking-review" className={({ isActive }) => navClass(isActive)}><span className="relative"><ShoppingBag className="h-5 w-5" />{items.length > 0 && <span className="absolute -right-2 -top-1.5 rounded-full bg-emerald-700 px-1 text-[9px] leading-4 text-white">{totalKg.toFixed(1)}</span>}</span><span>ตะกร้าผัก</span></NavLink>
      {user && <NavLink to="/orders" className={({ isActive }) => navClass(isActive)}><ClipboardList className="h-5 w-5" /><span>ประวัติ</span></NavLink>}
      <NavLink to={user ? '/profile' : '/login'} className={({ isActive }) => navClass(isActive)}><User className="h-5 w-5" /><span>{user ? 'โปรไฟล์' : 'เข้าสู่ระบบ'}</span></NavLink>
      {isAdmin && <NavLink to="/admin" end className={({ isActive }) => navClass(isActive)}><ShieldCheck className="h-5 w-5" /><span>จัดการผัก</span></NavLink>}
      {isAdmin && <NavLink to="/admin/equipment" className={({ isActive }) => navClass(isActive)}><PackageSearch className="h-5 w-5" /><span>จัดการร้าน</span></NavLink>}
    </div>
  </nav>;
};
