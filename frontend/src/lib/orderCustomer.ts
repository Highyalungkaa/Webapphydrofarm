import type { Order } from '../types/index.js';

// Guest orders have no profile ID. Group their reports by contact number,
// without linking the guest to a registered account that happens to share it.
export function orderCustomerKey(order: Pick<Order, 'id' | 'customer_id' | 'contact_phone'>): string {
  if (order.customer_id) return order.customer_id;
  let phone = order.contact_phone.replace(/\D/g, '');
  if (phone.startsWith('66') && phone.length === 11) phone = `0${phone.slice(2)}`;
  return `guest:${phone || order.id}`;
}
