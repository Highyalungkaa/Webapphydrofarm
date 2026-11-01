const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript'),{randomUUID}=require('node:crypto');
function setup(rpcError=null){
 const routes=new Map(),calls=[],middleware=[],actor=randomUUID(),round=randomUUID(),item=randomUUID();
 const auth=()=>{},admin=()=>{},router={use:(...handlers)=>middleware.push(...handlers)};
 for(const method of ['get','post'])router[method]=(url,...handlers)=>routes.set(method+' '+url,handlers.at(-1));
 const db={rpc:async(name,args)=>{calls.push({name,args});return{data:{id:'saved'},error:rpcError};},from:table=>{
  const result=()=>({error:null,data:table==='planting_rounds'?{id:round,status:'booking_open'}:table==='round_items'?[{id:item,plant_count:100,planting_plants_per_kg:2,additional_qty_kg:5,price_per_kg:130,crops:{name:'Oak',slots_per_kg:2}}]:table==='orders'?[{status:'confirmed',order_items:[{round_item_id:item,qty_kg:50}]},{status:'cancelled',order_items:[{round_item_id:item,qty_kg:7}]}]:[{id:'history',round_item_id:item,added_qty_kg:5}]});
  const q={select(){return q;},eq(){return q;},or(){return q;},order(){return q;},limit(){return q;},maybeSingle:async()=>result(),then:(resolve,reject)=>Promise.resolve(result()).then(resolve,reject)};return q;
 }};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.resolve(__dirname,'../src/routes/admin/stock.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:{},console,require:name=>{
  if(name==='express')return{Router:()=>router};if(name.endsWith('/supabase.js'))return{supabaseAdmin:db};if(name.endsWith('/auth.js'))return{requireAuth:auth,requireAdmin:admin};if(name.endsWith('/roundOrders.js'))return require('./load-service.cjs')('roundOrders');return require(name);
 }});
 return{actor,round,item,calls,middleware,auth,admin,body:()=>({request_id:randomUUID(),round_item_id:item,previous_additional_kg:0,added_qty_kg:5,note:'Extra harvest',reopen:false}),async request(method,body){
  const res={statusCode:200,status(c){this.statusCode=c;return this;},json(value){this.body=value;}};
  await routes.get(method+' /:id/stock')({params:{id:round},body,user:{id:actor}},res);return res;
 }};
}

test('adding surplus requires admin middleware and derives actor identity from session',async()=>{
 const app=setup();assert.equal(app.middleware[0],app.auth);assert.equal(app.middleware[1],app.admin);
 const res=await app.request('post',{...app.body(),p_actor_id:randomUUID()});assert.equal(res.statusCode,201);
 assert.equal(app.calls[0].name,'add_round_weighed_stock');assert.equal(app.calls[0].args.p_actor_id,app.actor);assert.equal(app.calls[0].args.p_added_qty_kg,5);
});

test('invalid and over-precision quantities never reach the save RPC',async()=>{
 for(const extra of [{added_qty_kg:0},{added_qty_kg:-1},{added_qty_kg:0.001},{note:''},{request_id:'bad'},{round_item_id:'bad'}]){
  const app=setup();assert.equal((await app.request('post',{...app.body(),...extra})).statusCode,400);assert.equal(app.calls.length,0);
 }
});

test('migration, stock conflicts and closed-round errors are returned as failures',async()=>{
 for(const [error,status]of [[{code:'PGRST202',message:'function missing'},503],[{code:'P0001',message:'ปริมาณถูกเพิ่มจากผู้ใช้อื่นแล้ว กรุณาโหลดข้อมูลล่าสุด'},409],[{code:'P0001',message:'รอบสิ้นสุดแล้ว'},400]]){
  const app=setup(error),res=await app.request('post',app.body());assert.equal(res.statusCode,status);assert.ok(res.body.error);assert.equal(res.body.addition,undefined);
 }
});

test('stock dialog reads available kilos including surplus and its recorded history',async()=>{
 const app=setup(),res=await app.request('get');assert.equal(res.statusCode,200);
 assert.equal(res.body.items[0].available_qty_kg,5);assert.equal(res.body.items[0].additional_qty_kg,5);assert.equal(res.body.items[0].ordered_qty_kg,50);
 assert.equal(res.body.additions.length,1);
});
