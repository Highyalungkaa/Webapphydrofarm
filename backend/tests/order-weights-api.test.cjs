const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const {randomUUID}=require('node:crypto');
const round=randomUUID(),item=randomUUID(),actor=randomUUID(),order=randomUUID();
function setup(file,{rpcError=null,missing=false}={}){
  const handlers=new Map(),middleware=[],calls=[];const router={use:(...args)=>middleware.push(...args)};
  for(const verb of ['get','post','patch'])router[verb]=(url,fn)=>handlers.set(`${verb} ${url}`,fn);
  const auth=()=>{},admin=()=>{};
  const db={from(table){const q={select(){return q;},eq(){return q;},order(){return q;},maybeSingle(){return q;},then(resolve,reject){
    const data=table==='planting_rounds'?{id:round,status:'booking_open'}:table==='round_items'?[{id:item,estimated_qty_kg:100,bookable_qty_kg:100,additional_qty_kg:10,crops:{name:'Oak'}}]:table==='orders'?[{status:'confirmed',order_items:[{round_item_id:item,qty_kg:10,own_qty_kg:5,fulfillment_source:'substitute',fulfilled_qty_kg:2}]},{status:'completed',order_items:[{round_item_id:item,qty_kg:20,own_qty_kg:null}]},{status:'cancelled',order_items:[{round_item_id:item,qty_kg:50,own_qty_kg:50}]}]:[];
    return Promise.resolve({data,error:missing&&table==='round_stock_additions'?{code:'PGRST205'}:null}).then(resolve,reject);}};return q;},async rpc(name,args){calls.push({name,args});return{data:{id:order},error:rpcError};}};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.resolve(__dirname,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:{},require(name){if(name==='express')return{Router:()=>router};if(name.endsWith('/supabase.js'))return{supabaseAdmin:db};if(name.endsWith('/auth.js'))return{requireAuth:auth,requireAdmin:admin};if(name.endsWith('/audit.js'))return{recordAuditLog:async()=>{}};return require(name);}});
  return{calls,middleware,auth,admin,async request(route,body={}){const res={statusCode:200,status(code){this.statusCode=code;return this;},json(value){this.body=value;}};await handlers.get(route)({params:{id:round},body,user:{id:actor}},res);return res;}};
}
const stock=()=>({request_id:randomUUID(),round_item_id:item,previous_additional_kg:0,added_qty_kg:10,note:'Weighed surplus',reopen:false});
test('weight summary uses only recorded scale readings and exposes no estimated kilogram balance',async()=>{
  const app=setup('../src/routes/admin/stock.ts');assert.equal(app.middleware[0],app.auth);assert.equal(app.middleware[1],app.admin);
  const res=await app.request('get /:id/stock');assert.equal(res.statusCode,200);
  const i=res.body.items[0];assert.equal(i.ordered_qty_kg,30);assert.equal(i.weighed_own_qty_kg,5);assert.equal(i.available_qty_kg,null);assert.equal(i.physical_remaining_qty_kg,undefined);assert.equal(i.substitute_qty_kg,2);
});
test('old inventory-addition endpoint is retired and cannot mutate the new model',async()=>{
  const app=setup('../src/routes/admin/stock.ts');assert.equal((await app.request('post /:id/stock',stock())).statusCode,410);assert.equal(app.calls.length,0);
});
test('new order save passes allocation, payment and status to one admin-only transaction',async()=>{
  const app=setup('../src/routes/admin/orders.ts');
  const res=await app.request('patch /:id',{status:'ready',payment_status:'paid',payment_method:'cash',actor_id:randomUUID(),allocation_items:[{id:item,own_qty_kg:3,substitute_qty_kg:2,substitute_total_cost:40,discount_amount:0}]});
  assert.equal(res.statusCode,200);assert.equal(app.calls.length,1);assert.equal(app.calls[0].name,'save_admin_order_allocation');assert.equal(app.calls[0].args.p_actor_id,actor);assert.equal(app.calls[0].args.p_payload.actor_id,undefined);assert.equal(app.calls[0].args.p_payload.status,'ready');
});
test('missing migration is actionable; transaction failures never appear as a saved order',async()=>{

  const app=setup('../src/routes/admin/orders.ts',{rpcError:{message:'ผักฟาร์มคงเหลือไม่พอ'}});
  const res=await app.request('patch /:id',{allocation_items:[{id:item,own_qty_kg:5,substitute_qty_kg:0,substitute_total_cost:0,discount_amount:0}]});assert.equal(res.statusCode,400);assert.match(res.body.error,/คงเหลือไม่พอ/);
});
