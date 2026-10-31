const {test}=require('node:test'),assert=require('node:assert/strict');const restore=require('./load-service.cjs')('masterSnapshots').restoreCropSnapshots;
test('deleted crops retain their saved name in nested order and round history',()=>{
 const body={orders:[{order_items:[{round_items:{crop_id:null,crops:null,crop_id_snapshot:'original',crop_name_snapshot:'Oak',crop_slots_per_kg_snapshot:5}}]}]};
 restore(body);const row=body.orders[0].order_items[0].round_items;assert.equal(row.crops.name,'Oak');assert.equal(row.crops.id,'original');assert.equal(row.crops.is_active,false);
});
test('active crop values and existing API responses are preserved',()=>{const row={crops:{name:'Live name'},crop_name_snapshot:'Saved name'};restore(row);assert.equal(row.crops.name,'Live name');assert.deepEqual(restore({ok:true}),{ok:true});});

test('responses clear retired limits even when an old database row still contains them',()=>{
 const value={purchase_limit_enabled:true,order_limit_remaining:0,round_items:[{max_qty_per_order_kg:1,order_limit_remaining:0,available_qty_kg:20}]};restore(value);
 assert.equal(value.purchase_limit_enabled,false);assert.equal(value.order_limit_remaining,null);
 assert.equal(value.round_items[0].max_qty_per_order_kg,null);assert.equal(value.round_items[0].order_limit_remaining,null);assert.equal(value.round_items[0].available_qty_kg,20);
});
