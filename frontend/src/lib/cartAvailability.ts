import type {CartItem,PlantingRound} from '../types/index.js';
export function syncVegetableAvailability(items:CartItem[],catalog:PlantingRound):CartItem[]{
  return items.map(item=>{
    const current=catalog.items?.find(row=>row.id===item.round_item_id);
    return current?{...item,price_per_kg:Number(current.price_per_kg),price_tiers:current.price_tiers,available_qty_kg:current.available_qty_kg??0}
      :{...item,available_qty_kg:0};
  });
}
