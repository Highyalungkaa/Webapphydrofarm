import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { EquipmentProduct } from '../types/index.js';
import { useAuth } from './AuthContext.js';

interface EquipmentCartLine { product: EquipmentProduct; quantity: number }
interface EquipmentCartValue {
  items: EquipmentCartLine[]; itemCount: number; totalAmount: number;
  add: (product: EquipmentProduct) => void; setQuantity: (productId: string, quantity: number) => void;
  remove: (productId: string) => void; clear: () => void;
}
const CartContext = createContext<EquipmentCartValue | undefined>(undefined);

export const EquipmentCartProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isLoading } = useAuth();
  const previousUserId = useRef<string | null>(null);
  const [items, setItems] = useState<EquipmentCartLine[]>(() => {
    try { return JSON.parse(localStorage.getItem('hydrofarm_equipment_cart') || '[]'); } catch { return []; }
  });
  useEffect(() => localStorage.setItem('hydrofarm_equipment_cart', JSON.stringify(items)), [items]);
  useEffect(() => {
    if (isLoading) return;
    if (previousUserId.current && previousUserId.current !== user?.id) {
      setItems([]);
      localStorage.removeItem('hydrofarm_equipment_cart');
    }
    previousUserId.current = user?.id ?? null;
  }, [user?.id, isLoading]);
  const value = useMemo<EquipmentCartValue>(() => ({
    items,
    itemCount: items.reduce((sum, row) => sum + row.quantity, 0),
    totalAmount: items.reduce((sum, row) => sum + Number(row.product.price) * row.quantity, 0),
    add: (product) => setItems((current) => {
      const existing = current.find((row) => row.product.id === product.id);
      if (!existing) return [...current, { product, quantity: 1 }];
      return current.map((row) => row.product.id === product.id ? { ...row, product, quantity: Math.min(row.quantity + 1, product.stock_quantity) } : row);
    }),
    setQuantity: (productId, quantity) => setItems((current) => current.map((row) => row.product.id === productId ? { ...row, quantity: Math.max(1, Math.min(quantity, row.product.stock_quantity)) } : row)),
    remove: (productId) => setItems((current) => current.filter((row) => row.product.id !== productId)),
    clear: () => setItems([]),
  }), [items]);
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
};

export const useEquipmentCart = () => {
  const value = useContext(CartContext);
  if (!value) throw new Error('useEquipmentCart must be used within EquipmentCartProvider');
  return value;
};
