import type {Order, PlantingRound} from '../types/index.js';

type RoundState = Partial<Pick<PlantingRound, 'status' | 'completed_date' | 'current_step'>>;
export function isCurrentPlantingRound(round?: RoundState | null): boolean {
  return !!round && ['draft','growing','booking_open','booking_closed','harvested'].includes(round.status || '')
    && !round.completed_date && Number(round.current_step || 1) < 8;
}

export function showInManagedOrders(order: Order): boolean {
  if (['cancelled','no_show'].includes(order.status)) return false;
  if (order.status !== 'completed') return true;
  // A pooled order stays visible until every actual source round has ended.
  const sources = (order.order_items || []).map(item => item.round_items?.planting_rounds).filter(Boolean);
  return sources.length ? sources.some(isCurrentPlantingRound) : isCurrentPlantingRound(order.planting_rounds);
}
