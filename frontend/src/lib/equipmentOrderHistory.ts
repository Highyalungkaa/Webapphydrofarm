import type { EquipmentOrder } from '../types/index.js';

export const isEquipmentOrderInHistory = (order: Pick<EquipmentOrder, 'status' | 'payment_status'>) =>
  order.status === 'completed' && order.payment_status === 'paid';
