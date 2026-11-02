import type { Order, PlantingRound } from '../types/index.js';

// A pooled order can belong to several source rounds. Count it once per round.
export function archivedOrderRoundIds(order: Order): string[] {
  const ids = new Set<string>();
  for (const item of order.order_items || []) {
    const id = item.round_items?.round_id || item.round_items?.planting_rounds?.id;
    if (id) ids.add(id);
  }
  if (!ids.size && order.round_id) ids.add(order.round_id);
  return [...ids];
}

export function archivedOrderRoundOptions(orders: Order[], rounds: PlantingRound[]) {
  const names = new Map(rounds.map(round => [round.id, round.name]));
  const counts = new Map<string, number>();
  for (const order of orders) {
    for (const item of order.order_items || []) {
      const round = item.round_items?.planting_rounds;
      if (round?.id && round.name && !names.has(round.id)) names.set(round.id, round.name);
    }
    if (order.planting_rounds?.name && !names.has(order.round_id)) names.set(order.round_id, order.planting_rounds.name);
    for (const id of archivedOrderRoundIds(order)) counts.set(id, (counts.get(id) || 0) + 1);
  }
  const ids = new Set([...rounds.map(round => round.id), ...counts.keys()]);
  return [...ids].filter(id => counts.has(id)).map(id => ({id, name: names.get(id) || `รอบการปลูก #${id.slice(0,8)}`, count: counts.get(id)!}));
}
