// Both completion and payment must be final before moving a customer's order.
export function isCustomerOrderInHistory(order: { status: string; payment_status: string }): boolean {
  return order.status === 'completed' && order.payment_status === 'paid';
}
