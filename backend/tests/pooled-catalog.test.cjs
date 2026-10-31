const {test}=require('node:test'),assert=require('node:assert/strict');
const {buildPooledCatalog}=require('./load-service.cjs')('pooledCatalog');
const {scopeRoundOrders,roundOrderFilter}=require('./load-service.cjs')('roundOrders');
const source=(extra={})=>({id:'a',round_id:'r1',crop_id:'oak',crop_name:'Oak',price_per_kg:50,estimated_qty_kg:10,booked_qty_kg:2,available_qty_kg:8,harvest_date:'2026-11-01',booking_opens_at:'2026-10-01',order_limit_remaining:null,round_order_limit_remaining:null,...extra});
test('same crop merges stock and harvest dates; price tiers retain FIFO source order',()=>{
 const c=buildPooledCatalog([source({id:'b',round_id:'r2',harvest_date:'2026-11-08',price_per_kg:60}),source()]);
 assert.equal(c.items.length,1);assert.equal(c.items[0].available_qty_kg,16);assert.equal(c.items[0].estimated_qty_kg,20);
 assert.equal(c.harvest_start_date,'2026-11-01');assert.equal(c.harvest_end_date,'2026-11-08');assert.equal(c.items[0].price_tiers[0].round_item_id,'a');
 const next=buildPooledCatalog([source({round_id:'r2',harvest_date:'2026-11-08',available_qty_kg:3})]);
 assert.equal(next.items[0].available_qty_kg,3);assert.equal(next.harvest_start_date,'2026-11-08');
});
test('retired quotas and caps do not reduce physical stock offered to customers',()=>{
 const c=buildPooledCatalog([source({order_limit_remaining:0}),source({id:'b',max_qty_per_order_kg:2}),source({id:'c',max_qty_per_order_kg:1})]);
 assert.equal(c.items[0].available_qty_kg,24);assert.equal(c.items[0].max_qty_per_order_kg,null);
 assert.equal(c.items[0].price_tiers[0].available_qty_kg,8);assert.equal(c.purchase_limit_enabled,false);
 assert.equal(buildPooledCatalog([source({available_qty_kg:0.3})]).is_all_sold_out,true);
});
test('round revenue and quantities contain only that round source lines, with discount retained',()=>{
 const all=[{id:'o',total_amount:800,order_items:[{round_item_id:'a',qty_kg:10,price_per_kg:50,discount_amount:5},{round_item_id:'b',qty_kg:5,price_per_kg:60}]}];
 const first=scopeRoundOrders(all,['a'])[0],second=scopeRoundOrders(all,['b'])[0];
 assert.equal(first.total_amount,495);assert.equal(second.total_amount,300);assert.equal(second.order_items.length,1);
 assert.equal(all[0].order_items.length,2);
});
test('source round filters validate UUIDs before producing a PostgREST expression',async()=>{
 await assert.rejects(roundOrderFilter({},'x),status.eq.confirmed'),/รหัสรอบ/);
 assert.match(await roundOrderFilter({},'11111111-1111-4111-8111-111111111111'),/source_round_ids.cs/);
});
