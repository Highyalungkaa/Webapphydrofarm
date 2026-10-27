/** All sources are read in one database statement so stock and harvest dates agree. */
export function buildPooledCatalog(sources: any[]) {
  const sorted = [...sources].sort((a,b) => String(a.harvest_date || '9999').localeCompare(String(b.harvest_date || '9999')) || String(a.booking_opens_at).localeCompare(String(b.booking_opens_at)) || a.id.localeCompare(b.id));
  const grouped = new Map<string, any>();
  for (const source of sorted) {
    let item = grouped.get(source.crop_id);
    if (!item) {
      item = { id:source.crop_id, crop_id:source.crop_id, round_id:'catalog', crop_name:source.crop_name,
        crops:{id:source.crop_id,name:source.crop_name,image_url:source.image_url}, estimated_qty_kg:0,
        booked_qty_kg:0, available_qty_kg:0, price_per_kg:Number(source.price_per_kg), price_tiers:[],
        harvest_start_date:source.harvest_date,harvest_end_date:source.harvest_date, order_limit_remaining:null };
      grouped.set(source.crop_id,item);
    }
    item.estimated_qty_kg += Number(source.estimated_qty_kg);
    item.booked_qty_kg += Number(source.booked_qty_kg);
    const capacity = source.order_limit_remaining===0 || source.round_order_limit_remaining===0 ? 0 :
      Math.max(0,Math.min(Number(source.available_qty_kg),source.max_qty_per_order_kg==null?Infinity:Number(source.max_qty_per_order_kg)));
    // available is physical reservable stock; max is the sum each source permits per order.
    if (source.order_limit_remaining!==0 && source.round_order_limit_remaining!==0) item.available_qty_kg += Number(source.available_qty_kg);
    item.price_tiers.push({available_qty_kg:capacity,price_per_kg:Number(source.price_per_kg),round_item_id:source.id,harvest_date:source.harvest_date});
    item.harvest_end_date=source.harvest_date;
    item.has_purchase_limit ||= source.max_qty_per_order_kg!=null || source.order_limit_remaining!=null || source.round_order_limit_remaining!=null;
  }
  const items=[...grouped.values()].map(item=>{
    item.available_qty_kg=Math.round(item.available_qty_kg*100)/100;
    item.max_qty_per_order_kg=Math.round(item.price_tiers.reduce((n:number,t:any)=>n+t.available_qty_kg,0)*100)/100;
    item.is_sold_out=item.max_qty_per_order_kg<0.5;
    item.price_per_kg=item.price_tiers.find((t:any)=>t.available_qty_kg>0)?.price_per_kg ?? item.price_per_kg;
    return item;
  });
  const dates=sorted.map(s=>s.harvest_date).filter(Boolean).sort();
  return { id:'catalog',name:'ผักเปิดจอง',is_pooled:true,status:sources.length?'booking_open':'booking_closed',items,
    harvest_start_date:dates[0]||null,harvest_end_date:dates.at(-1)||null,fulfillment_date:dates.at(-1)||null,
    booking_opens_at:sorted.map(s=>s.booking_opens_at).filter(Boolean).sort()[0]||null,
    purchase_limit_enabled:items.some(i=>i.has_purchase_limit),order_limit_remaining:null,
    total_estimated_kg:items.reduce((n,i)=>n+i.estimated_qty_kg,0),
    total_available_kg:items.reduce((n,i)=>n+i.available_qty_kg,0),is_all_sold_out:items.every(i=>i.is_sold_out) };
}
