import type { CartItem, Order, PriceTier } from '../types/index.js';
import { formatDateDMY } from './dateFormat.js';

export function harvestRange(start?: string | null,end?: string | null) {
  if(!start) return end?formatDateDMY(end):'รอฟาร์มแจ้งกำหนด';
  return !end||start===end?formatDateDMY(start):`${formatDateDMY(start)} – ${formatDateDMY(end)}`;
}
export function cartLineTotal(item:Pick<CartItem,'qty_kg'|'price_per_kg'|'price_tiers'>):number {
  if(!item.price_tiers) return Math.round(item.qty_kg*item.price_per_kg*100)/100;
  let remaining=item.qty_kg,cents=0;
  for(const tier of item.price_tiers){const qty=Math.min(remaining,Number(tier.available_qty_kg));cents+=Math.round(qty*Number(tier.price_per_kg)*100);remaining=Math.max(0,Math.round((remaining-qty)*100)/100);if(!remaining)break;}
  return cents/100;
}
export function priceLabel(price:number,tiers?:PriceTier[]) {
  const prices=tiers?.filter(t=>t.available_qty_kg>0).map(t=>Number(t.price_per_kg))||[];
  const min=prices.length?Math.min(...prices):Number(price),max=prices.length?Math.max(...prices):Number(price);
  const fmt=(n:number)=>n.toLocaleString('th-TH',{maximumFractionDigits:2});
  return min===max?`฿${fmt(min)}`:`฿${fmt(min)}–${fmt(max)}`;
}
export function scopeOrderToRound<T extends Order>(order:T,roundId:string):T|null {
  const items=(order.order_items||[]).filter(i=>i.round_items?.round_id===roundId||(!i.round_items?.round_id&&order.round_id===roundId));
  if(!items.length)return null;
  return {...order,order_items:items,total_amount:items.reduce((n,i)=>n+Math.round((Number(i.qty_kg)*Number(i.price_per_kg)-Number(i.discount_amount||0))*100),0)/100};
}

export function customerCropLines(order:Order) {
  const groups=new Map<string,{id:string;name:string;qty:number;gross:number;discount:number}>();
  for(const item of order.order_items||[]){
    const crop=item.round_items?.crops,id=crop?.id||item.round_item_id||item.id;
    const row=groups.get(id)||{id,name:crop?.name||'ผัก',qty:0,gross:0,discount:0};
    row.qty+=Number(item.qty_kg);row.gross+=Math.round(Number(item.qty_kg)*Number(item.price_per_kg)*100)/100;row.discount+=Number(item.discount_amount||0);groups.set(id,row);
  }
  return [...groups.values()];
}
