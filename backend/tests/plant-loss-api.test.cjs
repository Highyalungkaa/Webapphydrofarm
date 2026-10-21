const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { randomUUID } = require('node:crypto');
const ids = { round: randomUUID(), item: randomUUID(), crop: randomUUID(), plot: randomUUID(), admin: randomUUID() };
function loadHelper(relative) {
  const exports = {};
  const file = path.resolve(__dirname,relative);
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{
    exports,require(name){return name.endsWith('/plotCrops.js')?loadHelper('../src/services/plotCrops.ts'):require(name);},
  });
  return exports;
}
function setup({ publicRoute=false, missing=false, rpcError=null, legacy=false, conflict=false,limited=false }={}) {
  const routes=new Map(), calls=[], middleware=[];
  const router={ use: (...handlers)=>middleware.push(...handlers) };
  for(const method of ['get','post','put','patch','delete']) router[method]=(url,...handlers)=>routes.set(`${method} ${url}`,handlers.at(-1));
  const auth=()=>{}, admin=()=>{};
  const round={ id:ids.round,purchase_limit_enabled:limited, status:'booking_open', current_step:5, notes:JSON.stringify(legacy?{note:'legacy',cropGrowingDays:{[ids.crop]:30},bookingCreated:true}:{cropPlotIds:{[ids.crop]:[ids.plot]}}) };
  const items=[{id:ids.item,crop_id:ids.crop,plant_count:500,loss_baseline_plant_count:500,loss_plants_per_kg:5,
    lost_plant_count:50,estimated_qty_kg:100,remaining_estimated_qty_kg:90,bookable_qty_kg:100,max_qty_per_order_kg:2.5,crops:{name:'Green Oak',slots_per_kg:99}}];
  round.round_items=items;
  const noteUpdates=[];
  const db={
    from(table) {
      let single=false,update;
      const result=()=>({data:table==='planting_rounds'?(single?(update&&conflict?null:round):[round]):table==='round_items'?items:table==='plots'?[{id:ids.plot,name:'Plot 4',slot_capacity:1000,crop_ids:[ids.crop]}]:table==='orders'?[{order_items:[{round_item_id:ids.item,qty_kg:95}]}]:table==='order_items'?[{round_item_id:ids.item,qty_kg:95}]:[],
        error:missing&&table==='plant_losses'?{code:'PGRST205',message:'table not found'}:null});
      const q={ select(){return q;},eq(){return q;},is(){return q;},neq(){return q;},in(){return q;},lte(){return q;},order(){return q;},update(payload){update=payload;noteUpdates.push(payload);return q;},maybeSingle:async()=>{single=true;return result();},then:(resolve,reject)=>Promise.resolve(result()).then(resolve,reject) };return q;
    },
    async rpc(name,payload){calls.push({name,payload});return {data:{id:'new-loss'},error:rpcError};},
    storage:{from(){return {createSignedUrl:async()=>({data:{signedUrl:'https://example.com/image'}})};}},
  };
  const file=path.resolve(__dirname,publicRoute?'../src/routes/rounds.ts':'../src/routes/admin/plantLosses.ts');
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{
    exports:{},console,
    require(name){
      if(name==='express')return {Router:()=>router};
      if(name.endsWith('/supabase.js'))return {supabaseAdmin:db};
      if(name.endsWith('/auth.js'))return {requireAuth:auth,requireAdmin:admin};
      if(name.endsWith('/equipmentPayments.js'))return {};
      if(name.endsWith('/plotPlantingAllocations.js'))return loadHelper('../src/services/plotPlantingAllocations.ts');
      if(name.endsWith('/audit.js'))return {recordAuditLog:async()=>{}};
      return require(name);
    },
  });
  return {calls,middleware,auth,admin,noteUpdates,async request(route,body={}){
    const res={statusCode:200,status(code){this.statusCode=code;return this;},json(body){this.body=body;}};
    await routes.get(route)({params:{id:ids.round,lossId:randomUUID()},body,user:{id:ids.admin}},res);return res;
  }};
}
const valid=()=>({request_id:randomUUID(),round_item_id:ids.item,plot_id:ids.plot,loss_date:'2026-10-21',plant_count:50,reason:'รากเน่า'});
test('loss endpoints require auth and admin; actor always comes from verified session',async()=>{
  const app=setup();assert.equal(app.middleware[0],app.auth);assert.equal(app.middleware[1],app.admin);
  const res=await app.request('post /:id/losses',{...valid(),actor_id:randomUUID()});
  assert.equal(res.statusCode,201);assert.equal(app.calls[0].payload.p_actor_id,ids.admin);
  assert.equal(app.calls[0].payload.p_plant_count,50);
});
test('loss API rejects zero, fractional counts and missing reasons before RPC',async()=>{
  for(const override of [{plant_count:0},{plant_count:1.5},{reason:'  '},{request_id:'invalid'}]){
    const app=setup();assert.equal((await app.request('post /:id/losses',{...valid(),...override})).statusCode,400);assert.equal(app.calls.length,0);
  }
});
test('plant loss summary keeps plant counts and does not calculate weight or shortage',async()=>{
  const app=setup();const res=await app.request('get /:id/losses');assert.equal(res.statusCode,200);
  const item=res.body.items[0];assert.equal(item.remaining_plant_count,450);assert.equal(item.lost_estimated_kg,null);
  assert.equal(item.remaining_estimated_kg,null);assert.equal(item.shortage_kg,0);assert.equal(item.plants_per_kg,null);
  assert.equal(item.plots[0].id,ids.plot);assert.equal(app.calls.length,0);
});
test('missing database migration gives an actionable error instead of empty history',async()=>{
  const res=await setup({missing:true}).request('get /:id/losses');assert.equal(res.statusCode,503);assert.match(res.body.error,/migration 031/);
});
test('RPC validation failures are shown as failures, and reversal requires a reason',async()=>{
  const app=setup({rpcError:{message:'จำนวนเสียหายเกินคงเหลือ'}});
  const res=await app.request('post /:id/losses',valid());assert.equal(res.statusCode,400);assert.match(res.body.error,/เกินคงเหลือ/);
  assert.equal((await app.request('post /:id/losses/:lossId/void',{round_item_id:ids.item,reason:''})).statusCode,400);
});
test('plant losses do not invent a kilogram stock limit or mark booking sold out',async()=>{
  const res=await setup({publicRoute:true}).request('get /open');
  assert.equal(res.statusCode,200);assert.equal(res.body[0].items[0].available_qty_kg,null);
  assert.equal(res.body[0].items[0].max_qty_per_order_kg,null);assert.equal(res.body[0].total_available_kg,null);
  assert.equal(res.body[0].is_all_sold_out,false);
});
test('legacy rounds expose occupied plots and restore only the missing crop assignment before recording',async()=>{
  const app=setup({legacy:true});
  const summary=await app.request('get /:id/losses');
  assert.equal(summary.body.items[0].plots[0].id,ids.plot);
  const result=await app.request('post /:id/losses',valid());assert.equal(result.statusCode,201);
  const notes=JSON.parse(app.noteUpdates[0].notes);
  assert.deepEqual(notes.cropPlotIds[ids.crop],[ids.plot]);assert.equal(notes.note,'legacy');
  assert.equal(notes.bookingCreated,true);assert.equal(notes.cropGrowingDays[ids.crop],30);
});
test('unoccupied plots are rejected server-side and concurrent note edits are not overwritten',async()=>{
  const app=setup();
  assert.equal((await app.request('post /:id/losses',{...valid(),plot_id:randomUUID()})).statusCode,400);
  assert.equal(app.calls.length,0);assert.equal(app.noteUpdates.length,0);
  const conflicting=setup({legacy:true,conflict:true});
  assert.equal((await conflicting.request('post /:id/losses',valid())).statusCode,409);
  assert.equal(conflicting.calls.length,0);
});

test('customer sees per-crop limits only when explicitly enabled on the round',async()=>{
 const res=await setup({publicRoute:true,limited:true}).request('get /open');assert.equal(res.statusCode,200);assert.equal(res.body[0].purchase_limit_enabled,true);assert.equal(res.body[0].items[0].max_qty_per_order_kg,2.5);assert.equal(res.body[0].items[0].available_qty_kg,null);
});

test('direct customer round detail also allows ordering without a projected kilogram balance',async()=>{
 for(const limited of [false,true]){const res=await setup({publicRoute:true,limited}).request('get /:id');assert.equal(res.statusCode,200);assert.equal(res.body.is_all_sold_out,false);assert.equal(res.body.total_available_kg,null);assert.equal(res.body.items[0].available_qty_kg,null);assert.equal(res.body.items[0].max_qty_per_order_kg,limited?2.5:null);}
});
