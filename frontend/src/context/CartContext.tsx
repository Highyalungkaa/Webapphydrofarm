import React, { createContext, useContext, useState, useEffect } from 'react';
import { CartItem } from '../types/index.js';
import { cartLineTotal } from '../lib/pooledBooking.js';

interface CartContextType {
  roundId: string | null;
  items: CartItem[];
  setRound: (roundId: string) => void;
  setItemQty: (item: Omit<CartItem, 'qty_kg'>, qty: number) => { success: boolean; message?: string };
  removeItem: (roundItemId: string) => void;
  clearCart: () => void;
  totalKg: number;
  totalAmount: number;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export const CartProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [roundId, setRoundId] = useState<string | null>(() => {
    return sessionStorage.getItem('hydrofarm_cart_round_id') || null;
  });

  const [items, setItems] = useState<CartItem[]>(() => {
    try {
      const saved = sessionStorage.getItem('hydrofarm_cart_items');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    if (roundId) {
      sessionStorage.setItem('hydrofarm_cart_round_id', roundId);
    } else {
      sessionStorage.removeItem('hydrofarm_cart_round_id');
    }
  }, [roundId]);

  useEffect(() => {
    sessionStorage.setItem('hydrofarm_cart_items', JSON.stringify(items));
  }, [items]);

  const setRound = (newRoundId: string) => {
    if (roundId && roundId !== newRoundId && items.length > 0) {
      if (confirm('คุณกำลังเปลี่ยนรอบการสั่งจอง ระบบจะล้างรายการผักในตะกร้าเดิม ดำเนินการต่อหรือไม่?')) {
        setItems([]);
        setRoundId(newRoundId);
      }
    } else {
      setRoundId(newRoundId);
    }
  };

  const setItemQty = (
    itemData: Omit<CartItem, 'qty_kg'>,
    qty: number
  ): { success: boolean; message?: string } => {
    // If qty <= 0, remove
    if (qty <= 0) {
      setItems((prev) => prev.filter((i) => i.round_item_id !== itemData.round_item_id));
      return { success: true };
    }

    // Minimum check
    if (qty < 0.5) {
      return { success: false, message: 'จำนวนสั่งขั้นต่ำคือ 0.5 กก.' };
    }

    // Max per order check
    if (itemData.available_qty_kg != null && qty > itemData.available_qty_kg) {
      return { success:false,message:`ผัก ${itemData.crop_name} คงเหลือ ${itemData.available_qty_kg} กก. กรุณาลดจำนวน` };
    }
    if (itemData.max_qty_per_order_kg != null && qty > itemData.max_qty_per_order_kg) {
      return {
        success: false,
        message: `ผัก ${itemData.crop_name} จำกัดการจองสูงสุดไม่เกิน ${itemData.max_qty_per_order_kg} กก. ต่อออเดอร์`,
      };
    }

    setItems((prev) => {
      const index = prev.findIndex((i) => i.round_item_id === itemData.round_item_id);
      if (index >= 0) {
        const updated = [...prev];
        updated[index] = { ...itemData, qty_kg: qty };
        return updated;
      }
      return [...prev, { ...itemData, qty_kg: qty }];
    });

    return { success: true };
  };

  const removeItem = (roundItemId: string) => {
    setItems((prev) => prev.filter((i) => i.round_item_id !== roundItemId));
  };

  const clearCart = () => {
    setItems([]);
    setRoundId(null);
    sessionStorage.removeItem('hydrofarm_cart_items');
    sessionStorage.removeItem('hydrofarm_cart_round_id');
  };

  const totalKg = items.reduce((sum, i) => sum + i.qty_kg, 0);
  const totalAmount = items.reduce((sum, i) => sum + Math.round(cartLineTotal(i)*100), 0)/100;

  return (
    <CartContext.Provider
      value={{
        roundId,
        items,
        setRound,
        setItemQty,
        removeItem,
        clearCart,
        totalKg,
        totalAmount,
      }}
    >
      {children}
    </CartContext.Provider>
  );
};

export const useCart = () => {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
};
