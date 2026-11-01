const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const helpers={};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.resolve(__dirname,'../../frontend/src/lib/managedOrders.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:helpers});
const {isCurrentPlantingRound,showInManagedOrders}=helpers;
const open={id:'open',status:'booking_open',current_step:6};
const closed={id:'closed',status:'completed',current_step:8};
const order={status:'completed',payment_status:'paid',planting_rounds:open};

test('round filters keep current rounds including closed bookings, but omit ended rounds',()=>{
  for(const status of ['draft','growing','booking_open','booking_closed','harvested'])assert.equal(isCurrentPlantingRound({...open,status}),true);
  for(const round of [closed,{...open,status:'cancelled'},{...open,completed_date:'2026-11-02'},{...open,current_step:8},null])assert.equal(isCurrentPlantingRound(round),false);
});

test('completed paid orders remain managed until their round ends',()=>{
  assert.equal(showInManagedOrders(order),true);
  assert.equal(showInManagedOrders({...order,planting_rounds:{...open,status:'booking_closed'}}),true);
  assert.equal(showInManagedOrders({...order,planting_rounds:closed}),false);
  assert.equal(showInManagedOrders({...order,planting_rounds:{...open,completed_date:'2026-11-02'}}),false);
});

test('pooled orders remain until all actual source rounds have ended',()=>{
  const item=round=>({round_items:{planting_rounds:round}});
  assert.equal(showInManagedOrders({...order,planting_rounds:closed,order_items:[item(closed),item(open)]}),true);
  assert.equal(showInManagedOrders({...order,order_items:[item(closed),item({...closed,id:'second'})]}),false);
  assert.equal(showInManagedOrders({...order,planting_rounds:open,order_items:[item(closed)]}),false,'an outdated anchor does not keep an order alive after all actual sources end');
});

test('unfinished orders remain actionable and cancelled or no-show orders stay in history',()=>{
  for(const status of ['pending_confirmation','confirmed','ready'])assert.equal(showInManagedOrders({...order,status}),true);
  for(const status of ['cancelled','no_show'])assert.equal(showInManagedOrders({...order,status}),false);
});
