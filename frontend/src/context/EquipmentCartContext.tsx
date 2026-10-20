import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { EquipmentProduct } from '../types/index.js';
import { useAuth } from './AuthContext.js';

interface EquipmentCartLine { product: EquipmentProduct; quantity: number }
interface EquipmentCartValue {
  items: EquipmentCartLine[]; itemCount: number; totalAmount: number;
  add: (product: EquipmentProduct) => void; setQuantity: (productId: string, quantity: number) => void;
  remove: (productId: string) => void; clear: () => void;
}
const CartContext = createContext<EquipmentCartValue | undefined>(undefined);
const cartKey = (userId: string) => `hydrofarm_equipment_cart:${userId}`;

const readCart = (userId: string): EquipmentCartLine[] => {
  try {
    const saved = JSON.parse(localStorage.getItem(cartKey(userId)) || '[]');
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
};

export const EquipmentCartProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isLoading } = useAuth();
  const [cart, setCart] = useState<{ userId: string | null; items: EquipmentCartLine[] }>({ userId: null, items: [] });

  useEffect(() => {
    if (isLoading) return;
    setCart(user ? { userId: user.id, items: readCart(user.id) } : { userId: null, items: [] });
  }, [user?.id, isLoading]);

  useEffect(() => {
    if (cart.userId && cart.userId === user?.id) {
      localStorage.setItem(cartKey(cart.userId), JSON.stringify(cart.items));
    }
  }, [cart, user?.id]);

  const items = !isLoading && user?.id === cart.userId ? cart.items : [];
  const updateItems = (change: (current: EquipmentCartLine[]) => EquipmentCartLine[]) => {
    if (!user || isLoading) return;
    setCart((current) => ({
      userId: user.id,
      items: change(current.userId === user.id ? current.items : readCart(user.id)),
    }));
  };

  const value = useMemo<EquipmentCartValue>(() => ({
    items,
    itemCount: items.reduce((sum, row) => sum + row.quantity, 0),
    totalAmount: items.reduce((sum, row) => sum + Number(row.product.price) * row.quantity, 0),
    add: (product) => updateItems((current) => {
      const existing = current.find((row) => row.product.id === product.id);
      if (!existing) return [...current, { product, quantity: 1 }];
      return current.map((row) => row.product.id === product.id ? { ...row, product, quantity: Math.min(row.quantity + 1, product.stock_quantity) } : row);
    }),
    setQuantity: (productId, quantity) => updateItems((current) => current.map((row) => row.product.id === productId ? { ...row, quantity: Math.max(1, Math.min(quantity, row.product.stock_quantity)) } : row)),
    remove: (productId) => updateItems((current) => current.filter((row) => row.product.id !== productId)),
    clear: () => updateItems(() => []),
  }), [items, user?.id, isLoading]);
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
};

export const useEquipmentCart = () => {
  const value = useContext(CartContext);
  if (!value) throw new Error('useEquipmentCart must be used within EquipmentCartProvider');
  return value;
};
