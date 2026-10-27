import { z } from 'zod';

/** Retain the anchor fallback for older orders, while finding every contributing source. */
export async function roundOrderFilter(db:any,roundId:string):Promise<string> {
  if(!z.string().uuid().safeParse(roundId).success)throw new Error('รหัสรอบไม่ถูกต้อง');
  return `round_id.eq.${roundId},source_round_ids.cs.{${roundId}}`;
}

export function scopeRoundOrders(orders:any[],itemIds:string[]) {
  const ids=new Set(itemIds);
  return orders.map(order=>{
    const items=(order.order_items||[]).filter((item:any)=>ids.has(item.round_item_id));
    return {...order,order_items:items,total_amount:items.reduce((n:number,item:any)=>n+Math.round((Number(item.qty_kg)*Number(item.price_per_kg)-Number(item.discount_amount||0))*100),0)/100};
  });
}
