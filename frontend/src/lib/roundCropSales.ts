import type {Order, RoundItem} from '../types/index.js';
import {itemNetAmount} from './orderReport.js';

/** Completed, paid sales at booked prices, scoped to this round's source items. */
export function roundCropSales(orders: Order[], items: Pick<RoundItem, 'id'>[]): Map<string, number> {
  const cents = new Map(items.map(item => [item.id, 0]));
  for (const order of orders) {
    if (order.status !== 'completed' || order.payment_status !== 'paid') continue;
    for (const item of order.order_items || []) {
      if (!cents.has(item.round_item_id)) continue;
      cents.set(item.round_item_id, cents.get(item.round_item_id)! + Math.round(itemNetAmount(item)*100));
    }
  }
  return new Map([...cents].map(([id, amount]) => [id, amount/100]));
}
